import Foundation
import Capacitor
import CoreLocation
import Security
import UIKit

@objc(BackgroundLocationPlugin)
public final class BackgroundLocationPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "BackgroundLocationPlugin"
    public let jsName = "BackgroundLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVisibility", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    private let endpoint = URL(string: "https://margot-app.com/background-location-update/")!
    private let keychainService = "com.margot.background-location"
    private let keychainAccount = "background-token"
    private let visibilityDefaultsKey = "margot-background-location-visible"
    private let sendInterval: TimeInterval = 60
    private let movementThreshold: CLLocationDistance = 50

    private var locationManager: CLLocationManager!
    private var lastSentAt = Date.distantPast
    private var lastSentLocation: CLLocation?
    private var pendingLocation: CLLocation?
    private var isSending = false
    private var updatesActive = false
    private var isVisible = true

    private lazy var urlSession: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 20
        configuration.waitsForConnectivity = true
        return URLSession(configuration: configuration)
    }()

    override public func load() {
        if UserDefaults.standard.object(
            forKey: visibilityDefaultsKey
        ) != nil {
            isVisible = UserDefaults.standard.bool(
                forKey: visibilityDefaultsKey
            )
        } else {
            /*
             * O Keychain pode sobreviver à desinstalação. Sem preferências da
             * instalação atual, um token antigo nunca deve voltar a arrancar.
             */
            deleteToken()
        }

        locationManager = CLLocationManager()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        locationManager.distanceFilter = kCLDistanceFilterNone
        locationManager.activityType = .other
        locationManager.pausesLocationUpdatesAutomatically = false
        locationManager.showsBackgroundLocationIndicator = true

        if readToken() != nil {
            applyAuthorizationState()
        }
    }

    @objc public func start(_ call: CAPPluginCall) {
        guard let suppliedToken = call.getString("token") else {
            call.reject("O token da localização não foi recebido.")
            return
        }

        let token = suppliedToken.trimmingCharacters(in: .whitespacesAndNewlines)

        guard token.range(
            of: "^[A-Fa-f0-9]{64}$",
            options: .regularExpression
        ) != nil else {
            call.reject("O token da localização é inválido.")
            return
        }

        guard saveToken(token) else {
            call.reject("Não foi possível guardar a autorização da localização.")
            return
        }

        isVisible = call.getBool("visible") ?? isVisible
        saveVisibility()

        if !isVisible {
            sendPresence(
                active: true,
                visible: false,
                token: token
            )

            stopLocationUpdates(removeToken: false)
            call.resolve(statusData())
            return
        }

        guard CLLocationManager.locationServicesEnabled() else {
            call.resolve([
                "success": false,
                "active": false,
                "permission": "disabled",
                "background_enabled": false,
                "requires_settings": true
            ])
            return
        }

        let authorization = locationManager.authorizationStatus

        switch authorization {
        case .notDetermined:
            locationManager.requestAlwaysAuthorization()
        case .authorizedWhenInUse:
            locationManager.requestAlwaysAuthorization()
            applyAuthorizationState()
        case .authorizedAlways:
            applyAuthorizationState()
        case .denied, .restricted:
            stopLocationUpdates(removeToken: false)
        @unknown default:
            stopLocationUpdates(removeToken: false)
        }

        call.resolve(statusData())
    }

    @objc public func stop(_ call: CAPPluginCall) {
        if let token = readToken() {
            sendPresence(
                active: false,
                visible: false,
                token: token
            )
        }

        isVisible = false
        saveVisibility()
        stopLocationUpdates(removeToken: true)

        call.resolve([
            "success": true,
            "active": false,
            "background_enabled": false,
            "token_stored": false
        ])
    }

    @objc public func status(_ call: CAPPluginCall) {
        call.resolve(statusData())
    }

    @objc public func setVisibility(_ call: CAPPluginCall) {
        guard let visible = call.getBool("visible") else {
            call.reject("Não foi indicado o estado de visibilidade.")
            return
        }

        isVisible = visible
        saveVisibility()

        if visible {
            applyAuthorizationState()

            if updatesActive {
                locationManager.requestLocation()
            }
        } else {
            stopLocationUpdates(removeToken: false)

            if let token = readToken() {
                sendPresence(
                    active: true,
                    visible: false,
                    token: token
                )
            }
        }

        call.resolve(statusData())
    }

    @objc public func openSettings(_ call: CAPPluginCall) {
        guard let settingsURL = URL(
            string: UIApplication.openSettingsURLString
        ) else {
            call.reject("Não foi possível abrir as definições.")
            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.open(
                settingsURL,
                options: [:]
            ) { opened in
                call.resolve(["opened": opened])
            }
        }
    }

    public func locationManagerDidChangeAuthorization(
        _ manager: CLLocationManager
    ) {
        applyAuthorizationState()

        notifyListeners(
            "backgroundLocationAuthorizationChanged",
            data: statusData()
        )
    }

    public func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        guard readToken() != nil else {
            stopLocationUpdates(removeToken: false)
            return
        }

        guard isVisible else {
            return
        }

        guard let location = locations.last else {
            return
        }

        guard location.horizontalAccuracy >= 0,
              location.horizontalAccuracy <= 1000,
              abs(location.timestamp.timeIntervalSinceNow) <= 120 else {
            return
        }

        considerSending(location)
    }

    public func locationManager(
        _ manager: CLLocationManager,
        didFailWithError error: Error
    ) {
        let coreLocationError = error as? CLError

        if coreLocationError?.code == .denied {
            stopLocationUpdates(removeToken: false)
        }

        notifyListeners(
            "backgroundLocationError",
            data: [
                "message": error.localizedDescription,
                "code": coreLocationError?.code.rawValue ?? -1
            ]
        )
    }

    private func applyAuthorizationState() {
        guard locationManager != nil else {
            return
        }

        guard CLLocationManager.locationServicesEnabled(),
              readToken() != nil,
              isVisible else {
            stopLocationUpdates(removeToken: false)
            return
        }

        switch locationManager.authorizationStatus {
        case .authorizedAlways:
            locationManager.allowsBackgroundLocationUpdates = true
            locationManager.startUpdatingLocation()

            if CLLocationManager.significantLocationChangeMonitoringAvailable() {
                locationManager.startMonitoringSignificantLocationChanges()
            }

            updatesActive = true

        case .authorizedWhenInUse:
            locationManager.allowsBackgroundLocationUpdates = false
            locationManager.startUpdatingLocation()
            locationManager.stopMonitoringSignificantLocationChanges()
            updatesActive = true

        default:
            stopLocationUpdates(removeToken: false)
        }
    }

    private func stopLocationUpdates(removeToken: Bool) {
        guard locationManager != nil else {
            if removeToken {
                deleteToken()
            }

            return
        }

        locationManager.stopUpdatingLocation()
        locationManager.stopMonitoringSignificantLocationChanges()
        locationManager.allowsBackgroundLocationUpdates = false

        updatesActive = false
        pendingLocation = nil
        isSending = false

        if removeToken {
            deleteToken()
        }
    }

    private func considerSending(_ location: CLLocation) {
        if isSending {
            pendingLocation = location
            return
        }

        let elapsed = Date().timeIntervalSince(lastSentAt)
        let distance = lastSentLocation?.distance(from: location)
            ?? movementThreshold

        guard lastSentLocation == nil
                || elapsed >= sendInterval
                || distance >= movementThreshold else {
            return
        }

        sendLocation(location)
    }

    private func sendLocation(_ location: CLLocation) {
        guard let token = readToken() else {
            stopLocationUpdates(removeToken: false)
            return
        }

        guard isVisible else {
            return
        }

        let payload: [String: Any] = [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "active": true,
            "visible": true,
            "timestamp": ISO8601DateFormatter().string(
                from: location.timestamp
            )
        ]

        guard let body = try? JSONSerialization.data(
            withJSONObject: payload
        ) else {
            return
        }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.httpBody = body
        request.timeoutInterval = 15
        request.setValue(
            "application/json",
            forHTTPHeaderField: "Content-Type"
        )
        request.setValue(
            "application/json",
            forHTTPHeaderField: "Accept"
        )
        request.setValue(
            "Bearer \(token)",
            forHTTPHeaderField: "Authorization"
        )

        isSending = true

        urlSession.dataTask(with: request) {
            [weak self] _,
            response,
            error in

            let statusCode = (
                response as? HTTPURLResponse
            )?.statusCode

            DispatchQueue.main.async {
                self?.finishSending(
                    location: location,
                    statusCode: statusCode,
                    error: error
                )
            }
        }.resume()
    }

    private func finishSending(
        location: CLLocation,
        statusCode: Int?,
        error: Error?
    ) {
        isSending = false

        if statusCode == 401 {
            stopLocationUpdates(removeToken: true)

            notifyListeners(
                "backgroundLocationAuthorizationExpired",
                data: ["expired": true]
            )

            return
        }

        if let statusCode,
           (200...299).contains(statusCode) {
            lastSentAt = Date()
            lastSentLocation = location

            notifyListeners(
                "backgroundLocationUpdated",
                data: [
                    "latitude": location.coordinate.latitude,
                    "longitude": location.coordinate.longitude,
                    "accuracy": location.horizontalAccuracy,
                    "status": statusCode
                ]
            )
        } else if let error {
            notifyListeners(
                "backgroundLocationError",
                data: [
                    "message": error.localizedDescription,
                    "status": statusCode ?? 0
                ]
            )
        }

        if let pendingLocation {
            self.pendingLocation = nil
            considerSending(pendingLocation)
        }

        if !isVisible, let token = readToken() {
            sendPresence(
                active: true,
                visible: false,
                token: token
            )
        }
    }

    private func sendPresence(
        active: Bool,
        visible: Bool,
        token: String
    ) {
        let payload: [String: Any] = [
            "active": active,
            "visible": visible,
            "timestamp": ISO8601DateFormatter().string(from: Date())
        ]

        guard let body = try? JSONSerialization.data(
            withJSONObject: payload
        ) else {
            return
        }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.httpBody = body
        request.timeoutInterval = 15
        request.setValue(
            "application/json",
            forHTTPHeaderField: "Content-Type"
        )
        request.setValue(
            "application/json",
            forHTTPHeaderField: "Accept"
        )
        request.setValue(
            "Bearer \(token)",
            forHTTPHeaderField: "Authorization"
        )

        urlSession.dataTask(with: request) {
            [weak self] _, response, error in

            let statusCode = (
                response as? HTTPURLResponse
            )?.statusCode

            DispatchQueue.main.async {
                guard let self else {
                    return
                }

                if statusCode == 401 {
                    self.stopLocationUpdates(removeToken: true)
                    self.notifyListeners(
                        "backgroundLocationAuthorizationExpired",
                        data: ["expired": true]
                    )
                } else if let error {
                    self.notifyListeners(
                        "backgroundLocationError",
                        data: [
                            "message": error.localizedDescription,
                            "status": statusCode ?? 0
                        ]
                    )
                }
            }
        }.resume()
    }

    private func statusData() -> [String: Any] {
        let authorization = locationManager?.authorizationStatus
            ?? .notDetermined

        return [
            "success": true,
            "active": updatesActive,
            "permission": authorizationName(authorization),
            "background_enabled":
                updatesActive && authorization == .authorizedAlways,
            "token_stored": readToken() != nil,
            "visible": isVisible,
            "requires_settings":
                authorization != .authorizedAlways
        ]
    }

    private func saveVisibility() {
        UserDefaults.standard.set(
            isVisible,
            forKey: visibilityDefaultsKey
        )
    }

    private func authorizationName(
        _ authorization: CLAuthorizationStatus
    ) -> String {
        switch authorization {
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

    private func keychainQuery() -> [String: Any] {
        return [
            kSecClass as String:
                kSecClassGenericPassword,
            kSecAttrService as String:
                keychainService,
            kSecAttrAccount as String:
                keychainAccount
        ]
    }

    private func saveToken(_ token: String) -> Bool {
        var query = keychainQuery()

        SecItemDelete(query as CFDictionary)

        query[kSecValueData as String] = Data(token.utf8)
        query[kSecAttrAccessible as String] =
            kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        return SecItemAdd(
            query as CFDictionary,
            nil
        ) == errSecSuccess
    }

    private func readToken() -> String? {
        var query = keychainQuery()

        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] =
            kSecMatchLimitOne

        var result: CFTypeRef?

        guard SecItemCopyMatching(
            query as CFDictionary,
            &result
        ) == errSecSuccess,
              let data = result as? Data,
              let token = String(
                data: data,
                encoding: .utf8
              ) else {
            return nil
        }

        return token
    }

    private func deleteToken() {
        SecItemDelete(
            keychainQuery() as CFDictionary
        )
    }
}