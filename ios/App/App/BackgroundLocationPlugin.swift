import Capacitor
import CoreLocation
import Foundation
import Network
import Security
import UIKit

@objc(BackgroundLocationPlugin)
public final class BackgroundLocationPlugin: CAPPlugin, CAPBridgedPlugin,
    CLLocationManagerDelegate {

    public let identifier = "BackgroundLocationPlugin"
    public let jsName = "BackgroundLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    private let endpoint = URL(
        string: "https://margot-app.com/background-location-update/"
    )!

    private let keychainService = "com.margot.background-location"
    private let keychainAccount = "background-token"
    private let pendingLocationKey = "margot.background-location.pending"

    /*
     * startUpdatingLocation é necessário para deslocações curtas. O iOS
     * decide a cadência do GPS; a Margot só envia no máximo a cada minuto
     * ou depois de 20 m. Isto não cria uma Live Activity/Dynamic Island.
     */
    private let minimumSendInterval: TimeInterval = 60
    private let minimumMovement: CLLocationDistance = 20
    private let retryDelays: [TimeInterval] = [5, 15, 30, 60, 120]

    private var manager: CLLocationManager!
    private var monitoring = false
    private var sending = false
    private var pendingLocation: CLLocation?
    private var retryLocation: CLLocation?
    private var retryAttempt = 0
    private var retryWorkItem: DispatchWorkItem?
    private var lastSentAt = Date.distantPast
    private var lastSentLocation: CLLocation?

    private let networkMonitor = NWPathMonitor()
    private let networkQueue = DispatchQueue(
        label: "com.margot.background-location.network"
    )

    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 30
        configuration.waitsForConnectivity = true
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: configuration)
    }()

    override public func load() {
        manager = CLLocationManager()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = minimumMovement
        manager.activityType = .fitness
        manager.pausesLocationUpdatesAutomatically = false
        manager.showsBackgroundLocationIndicator = false
        manager.allowsBackgroundLocationUpdates = false

        networkMonitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }

            DispatchQueue.main.async {
                self?.retryWhenConnectivityReturns()
            }
        }
        networkMonitor.start(queue: networkQueue)

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )

        retryLocation = readPendingLocation()
        configureMonitoring()

        if let retryLocation = retryLocation {
            sendLocation(retryLocation)
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        networkMonitor.cancel()
        retryWorkItem?.cancel()
        session.invalidateAndCancel()
    }

    @objc public func start(_ call: CAPPluginCall) {
        guard let token = validToken(call.getString("token")) else {
            call.reject("O token da localização é inválido.")
            return
        }

        guard saveToken(token) else {
            call.reject("Não foi possível guardar a autorização da localização.")
            return
        }

        guard CLLocationManager.locationServicesEnabled() else {
            call.resolve(statusData())
            return
        }

        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestAlwaysAuthorization()
        case .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()
            startForegroundLocationIfPossible()
        case .authorizedAlways:
            configureMonitoring()
        case .denied, .restricted:
            stopMonitoring(removeToken: false)
        @unknown default:
            stopMonitoring(removeToken: false)
        }

        requestPreciseLocationIfNeeded()

        call.resolve(statusData())
    }

    @objc public func stop(_ call: CAPPluginCall) {
        if let token = readToken() {
            send(
                payload: ["active": false, "visible": false],
                token: token
            )
        }

        stopMonitoring(removeToken: true)
        call.resolve(statusData())
    }

    @objc public func status(_ call: CAPPluginCall) {
        call.resolve(statusData())
    }

    @objc public func openSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.reject("Não foi possível abrir as definições.")
            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.open(url) { opened in
                call.resolve(["opened": opened])
            }
        }
    }

    @objc private func applicationDidBecomeActive() {
        configureMonitoring()

        if let retryLocation, !sending {
            sendLocation(retryLocation)
        } else {
            requestCurrentLocationIfPossible()
        }
    }

    public func locationManagerDidChangeAuthorization(
        _ manager: CLLocationManager
    ) {
        configureMonitoring()

        if manager.authorizationStatus == .authorizedWhenInUse {
            startForegroundLocationIfPossible()
        }

        notifyListeners(
            "backgroundLocationAuthorizationChanged",
            data: statusData()
        )
    }

    public func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        let validLocations = locations.filter {
            $0.horizontalAccuracy >= 0 &&
                $0.horizontalAccuracy <= 500 &&
                abs($0.timestamp.timeIntervalSinceNow) <= 180
        }

        guard let location = validLocations.last else { return }
        considerSending(location)
    }

    public func locationManager(
        _ manager: CLLocationManager,
        didVisit visit: CLVisit
    ) {
        let date = visit.departureDate == .distantFuture
            ? visit.arrivalDate
            : visit.departureDate

        let location = CLLocation(
            coordinate: visit.coordinate,
            altitude: 0,
            horizontalAccuracy: visit.horizontalAccuracy,
            verticalAccuracy: -1,
            timestamp: date
        )

        considerSending(location)
    }

    public func locationManager(
        _ manager: CLLocationManager,
        didFailWithError error: Error
    ) {
        let locationError = error as? CLError

        if locationError?.code == .denied {
            stopMonitoring(removeToken: false)
        }

        /* kCLErrorLocationUnknown é transitório e o iOS volta a tentar. */
        if locationError?.code != .locationUnknown {
            notifyListeners(
                "backgroundLocationError",
                data: ["message": error.localizedDescription]
            )
        }
    }

    private func configureMonitoring() {
        guard manager != nil,
              readToken() != nil,
              CLLocationManager.locationServicesEnabled() else {
            stopMonitoring(removeToken: false)
            return
        }

        switch manager.authorizationStatus {
        case .authorizedAlways:
            manager.allowsBackgroundLocationUpdates = true
            manager.startUpdatingLocation()

            if CLLocationManager.significantLocationChangeMonitoringAvailable() {
                manager.startMonitoringSignificantLocationChanges()
            }

            manager.startMonitoringVisits()
            monitoring = true
        case .authorizedWhenInUse:
            startForegroundLocationIfPossible()
        default:
            stopMonitoring(removeToken: false)
        }
    }

    private func requestPreciseLocationIfNeeded() {
        guard manager.accuracyAuthorization == .reducedAccuracy,
              manager.authorizationStatus == .authorizedAlways
                || manager.authorizationStatus == .authorizedWhenInUse else {
            return
        }

        manager.requestTemporaryFullAccuracyAuthorization(
            withPurposeKey: "MargotNearby"
        ) { [weak self] _ in
            DispatchQueue.main.async {
                self?.configureMonitoring()
                self?.requestCurrentLocationIfPossible()
            }
        }
    }

    private func startForegroundLocationIfPossible() {
        guard UIApplication.shared.applicationState == .active,
              manager.authorizationStatus == .authorizedWhenInUse,
              readToken() != nil else {
            return
        }

        manager.allowsBackgroundLocationUpdates = false
        manager.startUpdatingLocation()
        monitoring = false
    }

    private func requestCurrentLocationIfPossible() {
        guard UIApplication.shared.applicationState == .active else { return }

        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.requestLocation()
        default:
            break
        }
    }

    private func stopMonitoring(removeToken: Bool) {
        guard manager != nil else {
            if removeToken {
                deleteToken()
                deletePendingLocation()
            }
            return
        }

        manager.stopUpdatingLocation()
        manager.stopMonitoringSignificantLocationChanges()
        manager.stopMonitoringVisits()
        manager.allowsBackgroundLocationUpdates = false

        monitoring = false
        sending = false
        pendingLocation = nil
        retryLocation = nil
        retryAttempt = 0
        retryWorkItem?.cancel()
        retryWorkItem = nil

        if removeToken {
            deleteToken()
            deletePendingLocation()
        }
    }

    private func considerSending(_ location: CLLocation) {
        guard readToken() != nil else {
            stopMonitoring(removeToken: false)
            return
        }

        if sending {
            pendingLocation = newest(location, pendingLocation)
            savePendingLocation(pendingLocation ?? location)
            return
        }

        let elapsed = Date().timeIntervalSince(lastSentAt)
        let distance = lastSentLocation?.distance(from: location)
            ?? minimumMovement

        guard lastSentLocation == nil
                || elapsed >= minimumSendInterval
                || distance >= minimumMovement else {
            return
        }

        sendLocation(location)
    }

    private func sendLocation(_ location: CLLocation) {
        guard let token = readToken(), !sending else { return }

        savePendingLocation(location)
        retryWorkItem?.cancel()
        retryWorkItem = nil
        sending = true

        send(
            payload: locationPayload(location),
            token: token
        ) { [weak self] statusCode, error in
            DispatchQueue.main.async {
                self?.finishSending(
                    location,
                    statusCode: statusCode,
                    error: error
                )
            }
        }
    }

    private func finishSending(
        _ location: CLLocation,
        statusCode: Int?,
        error: Error?
    ) {
        sending = false

        if statusCode == 401 {
            stopMonitoring(removeToken: true)
            notifyListeners(
                "backgroundLocationTokenExpired",
                data: ["expired": true]
            )
            return
        }

        if let statusCode, (200...299).contains(statusCode) {
            lastSentAt = Date()
            lastSentLocation = location
            retryLocation = nil
            retryAttempt = 0
            deletePendingLocation()
            notifyListeners(
                "backgroundLocationUpdated",
                data: locationPayload(location)
            )
        } else {
            retryLocation = newest(location, retryLocation)
            scheduleRetry()

            if let statusCode = statusCode {
                notifyListeners(
                    "backgroundLocationError",
                    data: [
                        "message": "O servidor recusou a localização.",
                        "status_code": statusCode
                    ]
                )
            } else if let error = error {
                notifyListeners(
                    "backgroundLocationError",
                    data: ["message": error.localizedDescription]
                )
            }
        }

        if let pendingLocation = pendingLocation {
            self.pendingLocation = nil

            if retryLocation == nil {
                considerSending(pendingLocation)
            } else {
                retryLocation = newest(pendingLocation, retryLocation)
            }
        }
    }

    private func scheduleRetry() {
        guard retryLocation != nil, retryWorkItem == nil else { return }

        let delayIndex = min(retryAttempt, retryDelays.count - 1)
        let delay = retryDelays[delayIndex]
        retryAttempt = min(retryAttempt + 1, retryDelays.count)

        let workItem = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            self.retryWorkItem = nil

            if let location = self.retryLocation, !self.sending {
                self.sendLocation(location)
            }
        }

        retryWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
    }

    private func retryWhenConnectivityReturns() {
        guard let location = retryLocation, !sending else { return }
        retryWorkItem?.cancel()
        retryWorkItem = nil
        sendLocation(location)
    }

    private func newest(
        _ first: CLLocation,
        _ second: CLLocation?
    ) -> CLLocation {
        guard let second = second else { return first }
        return first.timestamp >= second.timestamp ? first : second
    }

    private func locationPayload(_ location: CLLocation) -> [String: Any] {
        return [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "timestamp": ISO8601DateFormatter().string(from: location.timestamp)
        ]
    }

    private func savePendingLocation(_ location: CLLocation) {
        let payload: [String: Any] = [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "timestamp": location.timestamp.timeIntervalSince1970
        ]

        UserDefaults.standard.set(payload, forKey: pendingLocationKey)
    }

    private func readPendingLocation() -> CLLocation? {
        guard let payload = UserDefaults.standard.dictionary(
            forKey: pendingLocationKey
        ),
        let latitude = payload["latitude"] as? Double,
        let longitude = payload["longitude"] as? Double,
        let accuracy = payload["accuracy"] as? Double,
        let timestamp = payload["timestamp"] as? Double,
        abs(Date(timeIntervalSince1970: timestamp).timeIntervalSinceNow) <= 900 else {
            deletePendingLocation()
            return nil
        }

        return CLLocation(
            coordinate: CLLocationCoordinate2D(
                latitude: latitude,
                longitude: longitude
            ),
            altitude: 0,
            horizontalAccuracy: accuracy,
            verticalAccuracy: -1,
            timestamp: Date(timeIntervalSince1970: timestamp)
        )
    }

    private func deletePendingLocation() {
        UserDefaults.standard.removeObject(forKey: pendingLocationKey)
    }

    private func send(
        payload: [String: Any],
        token: String,
        completion: ((Int?, Error?) -> Void)? = nil
    ) {
        var authenticatedPayload = payload
        authenticatedPayload["token"] = token

        guard let body = try? JSONSerialization.data(
            withJSONObject: authenticatedPayload
        ) else {
            completion?(nil, nil)
            return
        }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        session.dataTask(with: request) { _, response, error in
            completion?((response as? HTTPURLResponse)?.statusCode, error)
        }.resume()
    }

    private func statusData() -> [String: Any] {
        let authorization = manager?.authorizationStatus ?? .notDetermined

        return [
            "success": true,
            "active": monitoring,
            "permission": authorizationName(authorization),
            "background_enabled": monitoring && authorization == .authorizedAlways,
            "precise": manager?.accuracyAuthorization == .fullAccuracy,
            "token_stored": readToken() != nil,
            "requires_settings": authorization == .authorizedWhenInUse
                || authorization == .denied
                || authorization == .restricted
        ]
    }

    private func authorizationName(_ status: CLAuthorizationStatus) -> String {
        switch status {
        case .notDetermined: return "not_determined"
        case .restricted: return "restricted"
        case .denied: return "denied"
        case .authorizedWhenInUse: return "when_in_use"
        case .authorizedAlways: return "always"
        @unknown default: return "unknown"
        }
    }

    private func validToken(_ value: String?) -> String? {
        let token = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        return token.range(
            of: "^[A-Fa-f0-9]{64}$",
            options: .regularExpression
        ) == nil ? nil : token
    }

    private func keychainQuery() -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount
        ]
    }

    private func saveToken(_ token: String) -> Bool {
        var query = keychainQuery()
        SecItemDelete(query as CFDictionary)
        query[kSecValueData as String] = Data(token.utf8)
        query[kSecAttrAccessible as String] =
            kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    private func readToken() -> String? {
        var query = keychainQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?

        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else {
            return nil
        }

        return String(data: data, encoding: .utf8)
    }

    private func deleteToken() {
        SecItemDelete(keychainQuery() as CFDictionary)
    }
}