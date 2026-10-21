import CoreLocation
import Foundation
import OSLog
import Security
import UIKit

// Conserva o nome para manter as ligações já existentes no AppDelegate e no plugin.
final class MargotLocationPushProbe: NSObject, CLLocationManagerDelegate, URLSessionTaskDelegate {
  static let shared = MargotLocationPushProbe()
  private let manager = CLLocationManager()
  private let logger = Logger(subsystem: "com.margot.app", category: "LocationRecovery")
  private var serviceSession: AnyObject?
  private var session: URLSession?
  private var credential: String?
  private var pushToken: String?
  private var registering = false
  private var generation = 0
  private var nextRegistration = Date.distantPast
  private var probeUntil: TimeInterval?

  private override init() {
    super.init()
    manager.delegate = self
    NotificationCenter.default.addObserver(self, selector: #selector(refresh),
      name: UIApplication.didBecomeActiveNotification, object: nil)
  }

  func start() {
    #if DEBUG
    if ProcessInfo.processInfo.arguments.contains("--margot-location-push-probe") {
      probeUntil = Date().timeIntervalSince1970 + 3600
    }
    #endif
    refresh()
  }

  @objc private func refresh() {
    let collecting = UserDefaults.standard.object(forKey: "margot.background-location.visible") as? Bool ?? false
    sync(visible: collecting, token: appToken())
  }

  // Neste contrato nativo, visible permite a recolha. A presença pública fica no servidor.
  func sync(visible: Bool, token: String?) {
    guard visible, let token = token, LocationPushAccess.validToken(token),
      manager.authorizationStatus == .authorizedAlways,
      manager.accuracyAuthorization == .fullAccuracy else {
      disable()
      return
    }
    if credential != token {
      disable(revoke: (try? LocationPushAccess.grant())?.token != token)
      credential = token
    }
    guard !registering, Date() >= nextRegistration else { return }
    if let pushToken = pushToken {
      registerOnServer(pushToken, credential: token)
      return
    }
    if #available(iOS 18.0, *) { serviceSession = CLServiceSession(authorization: .always) }
    registering = true
    nextRegistration = Date().addingTimeInterval(60)
    let attempt = generation
    manager.startMonitoringLocationPushes { [weak self] data, error in
      DispatchQueue.main.async {
        guard let self = self, attempt == self.generation else { return }
        self.registering = false
        guard error == nil, let data = data, !data.isEmpty else {
          self.logger.error("LOCATION_RECOVERY_REGISTRATION_ERROR")
          return
        }
        let hex = data.map { String(format: "%02x", $0) }.joined()
        self.pushToken = hex
        self.registerOnServer(hex, credential: token)
      }
    }
  }

  private func registerOnServer(_ pushToken: String, credential: String) {
    guard !registering else { return }
    #if DEBUG
    let defaultEnvironment = "sandbox"
    #else
    let defaultEnvironment = "production"
    #endif
    let environment = Bundle.main.object(forInfoDictionaryKey: "MargotLocationPushEnvironment") as? String
      ?? defaultEnvironment
    guard ["sandbox", "production"].contains(environment) else { return }
    let payload: [String: Any] = ["action": "register", "token": credential,
      "apns_token": pushToken, "environment": environment,
      "recovery_version": LocationPushAccess.recoveryVersion]
    guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return }
    var request = URLRequest(url: URL(string: "https://margot-app.com/location-recovery/")!)
    request.httpMethod = "POST"
    request.httpBody = body
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(credential)", forHTTPHeaderField: "Authorization")
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 8
    configuration.timeoutIntervalForResource = 8
    configuration.waitsForConnectivity = false
    configuration.httpShouldSetCookies = false
    configuration.urlCache = nil
    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    self.session = session
    registering = true
    nextRegistration = Date().addingTimeInterval(60)
    let attempt = generation
    session.dataTask(with: request) { [weak self] data, response, error in
      DispatchQueue.main.async {
        session.finishTasksAndInvalidate()
        guard let self = self, attempt == self.generation, self.credential == credential else { return }
        self.session = nil
        self.registering = false
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
        guard error == nil, status == 200, json?["success"] as? Bool == true,
          let id = json?["registration_id"] as? String, id.count == 32, id.allSatisfy({ $0.isHexDigit }),
          let ttl = json?["expires_in"] as? Double, ttl > 0, ttl <= 2592000 else {
          if status == 401 { try? LocationPushAccess.revoke() }
          self.logger.notice("LOCATION_RECOVERY_REGISTRY_UNAVAILABLE http=\(status)")
          return
        }
        do {
          try LocationPushAccess.allow(token: credential, id: id,
            until: Date().timeIntervalSince1970 + ttl, probeUntil: self.probeUntil)
          self.nextRegistration = Date().addingTimeInterval(min(3600, max(60, ttl - 60)))
          self.logger.notice("LOCATION_RECOVERY_REGISTERED")
          #if DEBUG
          if (self.probeUntil ?? 0) > Date().timeIntervalSince1970 {
            self.logger.notice("PROBE_LOCATION_TOKEN=\(pushToken, privacy: .public)")
            self.logger.notice("PROBE_UPLOAD_ARMED: teste manual válido até uma hora após Run.")
          }
          #endif
        } catch {
          self.logger.error("LOCATION_RECOVERY_ACCESS_ERROR")
          self.disable()
        }
      }
    }.resume()
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) { refresh() }

  func urlSession(_ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }

  private func disable(revoke: Bool = true) {
    generation += 1
    session?.invalidateAndCancel()
    session = nil
    if revoke { try? LocationPushAccess.revoke() }
    manager.stopMonitoringLocationPushes()
    registering = false
    credential = nil
    pushToken = nil
    nextRegistration = .distantPast
    if #available(iOS 18.0, *), let session = serviceSession as? CLServiceSession { session.invalidate() }
    serviceSession = nil
  }

  private func appToken() -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "com.margot.background-location",
      kSecAttrAccount as String: "background-token",
      kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }
}