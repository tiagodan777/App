import Capacitor
import CoreLocation
import Foundation
import Security
import UIKit

@objc(BackgroundLocationPlugin)
public final class BackgroundLocationPlugin:
    CAPPlugin,
    CAPBridgedPlugin,
    CLLocationManagerDelegate
{
    public let identifier =
        "BackgroundLocationPlugin"

    public let jsName = "BackgroundLocation"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(
            name: "start",
            returnType: CAPPluginReturnPromise
        ),
        CAPPluginMethod(
            name: "stop",
            returnType: CAPPluginReturnPromise
        ),
        CAPPluginMethod(
            name: "status",
            returnType: CAPPluginReturnPromise
        ),
        CAPPluginMethod(
            name: "openSettings",
            returnType: CAPPluginReturnPromise
        )
    ]

    private let endpoint = URL(
        string:
            "https://margot-app.com/background-location-update/"
    )!

    private let keychainService =
        "com.margot.background-location"

    private let keychainAccount =
        "background-token"

    private let minimumSendInterval:
        TimeInterval = 120

    private let minimumMovement:
        CLLocationDistance = 75

    private var manager: CLLocationManager!
    private var monitoring = false
    private var sending = false

    private var pendingLocation:
        CLLocation?

    private var lastSentAt =
        Date.distantPast

    private var lastSentLocation:
        CLLocation?

    private lazy var session: URLSession = {
        let configuration =
            URLSessionConfiguration.ephemeral

        configuration.timeoutIntervalForRequest =
            15

        configuration.timeoutIntervalForResource =
            20

        configuration.waitsForConnectivity =
            true

        return URLSession(
            configuration: configuration
        )
    }()

    override public func load() {
        manager = CLLocationManager()
        manager.delegate = self

        manager.desiredAccuracy =
            kCLLocationAccuracyHundredMeters

        manager.distanceFilter =
            minimumMovement

        manager.activityType = .other

        manager.pausesLocationUpdatesAutomatically =
            true

        manager.showsBackgroundLocationIndicator =
            false

        manager.allowsBackgroundLocationUpdates =
            false

        configureMonitoring()
    }

    @objc public func start(
        _ call: CAPPluginCall
    ) {
        guard let token = validToken(
            call.getString("token")
        ) else {
            call.reject(
                "O token da localização é inválido."
            )

            return
        }

        guard saveToken(token) else {
            call.reject(
                "Não foi possível guardar a autorização da localização."
            )

            return
        }

        guard
            CLLocationManager
                .locationServicesEnabled()
        else {
            call.resolve(statusData())
            return
        }

        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestAlwaysAuthorization()

        case .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()
            requestCurrentLocationIfPossible()

        default:
            configureMonitoring()
        }

        call.resolve(statusData())
    }

    @objc public func stop(
        _ call: CAPPluginCall
    ) {
        if let token = readToken() {
            send(
                payload: [
                    "active": false,
                    "visible": false
                ],
                token: token
            )
        }

        stopMonitoring(removeToken: true)

        call.resolve(statusData())
    }

    @objc public func status(
        _ call: CAPPluginCall
    ) {
        call.resolve(statusData())
    }

    @objc public func openSettings(
        _ call: CAPPluginCall
    ) {
        guard let url = URL(
            string:
                UIApplication
                    .openSettingsURLString
        ) else {
            call.reject(
                "Não foi possível abrir as definições."
            )

            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.open(url) {
                opened in

                call.resolve([
                    "opened": opened
                ])
            }
        }
    }

    public func locationManagerDidChangeAuthorization(
        _ manager: CLLocationManager
    ) {
        configureMonitoring()

        notifyListeners(
            "backgroundLocationAuthorizationChanged",
            data: statusData()
        )
    }

    public func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations:
            [CLLocation]
    ) {
        guard
            let location = locations.last,
            location.horizontalAccuracy >= 0,
            location.horizontalAccuracy <= 1_000,
            abs(
                location.timestamp
                    .timeIntervalSinceNow
            ) <= 120
        else {
            return
        }

        considerSending(location)
    }

    public func locationManager(
        _ manager: CLLocationManager,
        didVisit visit: CLVisit
    ) {
        let date =
            visit.departureDate == .distantFuture
            ? visit.arrivalDate
            : visit.departureDate

        let location = CLLocation(
            coordinate: visit.coordinate,
            altitude: 0,
            horizontalAccuracy:
                visit.horizontalAccuracy,
            verticalAccuracy: -1,
            timestamp: date
        )

        considerSending(location)
    }

    public func locationManager(
        _ manager: CLLocationManager,
        didFailWithError error: Error
    ) {
        if (
            error as? CLError
        )?.code == .denied {
            stopMonitoring(
                removeToken: false
            )
        }

        notifyListeners(
            "backgroundLocationError",
            data: [
                "message":
                    error.localizedDescription
            ]
        )
    }

    private func configureMonitoring() {
        guard
            manager != nil,
            readToken() != nil,
            CLLocationManager
                .locationServicesEnabled(),
            manager.authorizationStatus ==
                .authorizedAlways
        else {
            stopMonitoring(
                removeToken: false
            )

            return
        }

        if CLLocationManager
            .significantLocationChangeMonitoringAvailable()
        {
            manager
                .startMonitoringSignificantLocationChanges()
        }

        manager.startMonitoringVisits()

        monitoring = true

        requestCurrentLocationIfPossible()
    }

    private func requestCurrentLocationIfPossible() {
        guard
            UIApplication.shared
                .applicationState == .active
        else {
            return
        }

        switch manager.authorizationStatus {
        case .authorizedAlways,
             .authorizedWhenInUse:
            manager.requestLocation()

        default:
            break
        }
    }

    private func stopMonitoring(
        removeToken: Bool
    ) {
        guard manager != nil else {
            if removeToken {
                deleteToken()
            }

            return
        }

        manager.stopUpdatingLocation()

        manager
            .stopMonitoringSignificantLocationChanges()

        manager.stopMonitoringVisits()

        manager.allowsBackgroundLocationUpdates =
            false

        monitoring = false
        sending = false
        pendingLocation = nil

        if removeToken {
            deleteToken()
        }
    }

    private func considerSending(
        _ location: CLLocation
    ) {
        guard readToken() != nil else {
            stopMonitoring(
                removeToken: false
            )

            return
        }

        if sending {
            pendingLocation = location
            return
        }

        let elapsed =
            Date().timeIntervalSince(
                lastSentAt
            )

        let distance =
            lastSentLocation?
                .distance(from: location)
            ?? minimumMovement

        guard
            lastSentLocation == nil ||
            elapsed >= minimumSendInterval ||
            distance >= minimumMovement
        else {
            return
        }

        sendLocation(location)
    }

    private func sendLocation(
        _ location: CLLocation
    ) {
        guard let token = readToken() else {
            return
        }

        sending = true

        send(
            payload: [
                "latitude":
                    location.coordinate.latitude,

                "longitude":
                    location.coordinate.longitude,

                "accuracy":
                    location.horizontalAccuracy,

                "timestamp":
                    ISO8601DateFormatter()
                        .string(
                            from:
                                location.timestamp
                        )
            ],
            token: token
        ) {
            [weak self]
            statusCode,
            error in

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
            stopMonitoring(
                removeToken: true
            )

            notifyListeners(
                "backgroundLocationTokenExpired",
                data: [
                    "expired": true
                ]
            )

            return
        }

        if let statusCode,
           (200...299).contains(statusCode)
        {
            lastSentAt = Date()
            lastSentLocation = location
        } else if let error {
            notifyListeners(
                "backgroundLocationError",
                data: [
                    "message":
                        error.localizedDescription
                ]
            )
        }

        if let pendingLocation {
            self.pendingLocation = nil
            considerSending(pendingLocation)
        }
    }

    private func send(
        payload: [String: Any],
        token: String,
        completion:
            ((Int?, Error?) -> Void)? = nil
    ) {
        guard let body = try?
            JSONSerialization.data(
                withJSONObject: payload
            )
        else {
            completion?(nil, nil)
            return
        }

        var request =
            URLRequest(url: endpoint)

        request.httpMethod = "POST"
        request.httpBody = body

        request.setValue(
            "application/json",
            forHTTPHeaderField:
                "Content-Type"
        )

        request.setValue(
            "application/json",
            forHTTPHeaderField:
                "Accept"
        )

        request.setValue(
            "Bearer \(token)",
            forHTTPHeaderField:
                "Authorization"
        )

        session.dataTask(
            with: request
        ) {
            _,
            response,
            error in

            completion?(
                (
                    response as?
                        HTTPURLResponse
                )?.statusCode,
                error
            )
        }.resume()
    }

    private func statusData()
        -> [String: Any]
    {
        let authorization =
            manager?.authorizationStatus
            ?? .notDetermined

        return [
            "success": true,
            "active": monitoring,

            "permission":
                authorizationName(
                    authorization
                ),

            "background_enabled":
                monitoring &&
                authorization ==
                    .authorizedAlways,

            "token_stored":
                readToken() != nil,

            "requires_settings":
                authorization ==
                    .authorizedWhenInUse ||
                authorization == .denied ||
                authorization == .restricted
        ]
    }

    private func authorizationName(
        _ status: CLAuthorizationStatus
    ) -> String {
        switch status {
        case .notDetermined:
            return "not_determined"

        case .restricted:
            return "restricted"

        case .denied:
            return "denied"

        case .authorizedWhenInUse:
            return "when_in_use"

        case .authorizedAlways:
            return "always"

        @unknown default:
            return "unknown"
        }
    }

    private func validToken(
        _ value: String?
    ) -> String? {
        let token =
            value?
                .trimmingCharacters(
                    in:
                        .whitespacesAndNewlines
                )
            ?? ""

        return token.range(
            of: "^[A-Fa-f0-9]{64}$",
            options: .regularExpression
        ) == nil
            ? nil
            : token
    }

    private func keychainQuery()
        -> [String: Any]
    {
        return [
            kSecClass as String:
                kSecClassGenericPassword,

            kSecAttrService as String:
                keychainService,

            kSecAttrAccount as String:
                keychainAccount
        ]
    }

    private func saveToken(
        _ token: String
    ) -> Bool {
        var query = keychainQuery()

        SecItemDelete(
            query as CFDictionary
        )

        query[
            kSecValueData as String
        ] = Data(token.utf8)

        query[
            kSecAttrAccessible as String
        ] =
            kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        return SecItemAdd(
            query as CFDictionary,
            nil
        ) == errSecSuccess
    }

    private func readToken() -> String? {
        var query = keychainQuery()

        query[
            kSecReturnData as String
        ] = true

        query[
            kSecMatchLimit as String
        ] = kSecMatchLimitOne

        var result: CFTypeRef?

        guard
            SecItemCopyMatching(
                query as CFDictionary,
                &result
            ) == errSecSuccess,
            let data = result as? Data
        else {
            return nil
        }

        return String(
            data: data,
            encoding: .utf8
        )
    }

    private func deleteToken() {
        SecItemDelete(
            keychainQuery()
                as CFDictionary
        )
    }
}