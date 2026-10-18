import CoreLocation
import Foundation
import OSLog
import Security

final class MargotLocationPushProbe: NSObject, CLLocationManagerDelegate {
  static let shared = MargotLocationPushProbe()
  private let manager = CLLocationManager()
  private let logger = Logger(subsystem: "com.margot.app", category: "LocationPushProbe")
  private var serviceSession: AnyObject?
  private var expiresAt: TimeInterval = 0
  private var registering = false
  private var registered = false
  private var generation = 0

  private override init() {
    super.init()
    manager.delegate = self
  }

  func start() {
    #if DEBUG
    if ProcessInfo.processInfo.arguments.contains("--margot-location-push-probe") {
      expiresAt = Date().timeIntervalSince1970 + 3600
    }
    #endif
    refresh()
  }

  private func refresh() {
    let visible = UserDefaults.standard.object(
      forKey: "margot.background-location.visible"
    ) as? Bool ?? false
    sync(visible: visible, token: appToken())
  }

  func sync(visible: Bool, token: String?) {
    guard expiresAt > Date().timeIntervalSince1970, visible,
      let token = token, LocationPushAccess.validToken(token),
      manager.authorizationStatus == .authorizedAlways else {
      disable()
      return
    }
    do {
      try LocationPushAccess.allow(token: token, until: expiresAt)
    } catch {
      logger.error("PROBE_ACCESS_ERROR: verificar Keychain Sharing e Info.plist.")
      disable()
      return
    }
    guard !registered, !registering else { return }
    if #available(iOS 18.0, *) {
      serviceSession = CLServiceSession(authorization: .always)
    }
    registering = true
    let attempt = generation
    manager.startMonitoringLocationPushes { [weak self] token, error in
      DispatchQueue.main.async {
        guard let self = self, attempt == self.generation else { return }
        self.registering = false
        guard error == nil, let token = token, !token.isEmpty else {
          self.logger.error("PROBE_REGISTRATION_ERROR")
          self.disable()
          return
        }
        self.registered = true
        let hex = token.map { String(format: "%02x", $0) }.joined()
        self.logger.notice("PROBE_LOCATION_TOKEN=\(hex, privacy: .public)")
        self.logger.notice("PROBE_UPLOAD_ARMED: autorização de teste válida até uma hora após Run.")
      }
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    refresh()
  }

  private func disable() {
    generation += 1
    do { try LocationPushAccess.revoke() }
    catch { logger.error("PROBE_ACCESS_ERROR: não foi possível limpar a autorização partilhada.") }
    manager.stopMonitoringLocationPushes()
    registered = false
    registering = false
    if #available(iOS 18.0, *), let session = serviceSession as? CLServiceSession {
      session.invalidate()
    }
    serviceSession = nil
  }

  private func appToken() -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "com.margot.background-location",
      kSecAttrAccount as String: "background-token",
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }
}