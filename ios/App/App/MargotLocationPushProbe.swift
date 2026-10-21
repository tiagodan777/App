import CoreLocation
import Foundation
import OSLog
import Security
import UIKit

// Conserva o nome para manter as ligações existentes no AppDelegate e no plugin.
final class MargotLocationPushProbe: NSObject, CLLocationManagerDelegate, URLSessionTaskDelegate {
  static let shared = MargotLocationPushProbe()

  private enum TokenRead {
    case value(String), missing, invalid, unavailable(OSStatus)
  }

  private let manager = CLLocationManager()
  private let logger = Logger(subsystem: "com.margot.app", category: "LocationRecovery")
  private var serviceSession: AnyObject?
  private var diagnosticsTask: Task<Void, Never>?
  private var session: URLSession?
  private var credential: String?
  private var registering = false
  private var refreshPending = false
  private var generation = 0
  private var nextRegistration = Date.distantPast
  private var registrationDeadline: DispatchWorkItem?
  private var probeUntil: TimeInterval?

  private override init() {
    super.init()
    manager.delegate = self

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(refresh),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(refresh),
      name: UIApplication.protectedDataDidBecomeAvailableNotification,
      object: nil
    )
  }

  func start() {
    if !Thread.isMainThread {
      DispatchQueue.main.async { self.start() }
      return
    }

    #if DEBUG
    if ProcessInfo.processInfo.arguments.contains("--margot-location-push-probe") {
      probeUntil = Date().timeIntervalSince1970 + 3600
    }
    #endif

    refresh()
  }

  @objc private func refresh() {
    if !Thread.isMainThread {
      DispatchQueue.main.async { self.refresh() }
      return
    }

    let collecting = UserDefaults.standard.object(
      forKey: "margot.background-location.visible"
    ) as? Bool ?? false

    reconcile(
      visible: collecting,
      token: readAppToken(),
      forceRegistration: true
    )
  }

  // visible autoriza a recolha; a presença pública continua a ser decidida pelo servidor.
  func sync(visible: Bool, token: String?) {
    if !Thread.isMainThread {
      DispatchQueue.main.async { self.sync(visible: visible, token: token) }
      return
    }

    let value: TokenRead

    if let token = token {
      value = LocationPushAccess.validToken(token) ? .value(token) : .invalid
    } else {
      // Os chamadores antigos devolvem nil tanto para logout como para erro de Keychain.
      value = readAppToken()
    }

    reconcile(
      visible: visible,
      token: value,
      forceRegistration: false
    )
  }

  private func reconcile(
    visible: Bool,
    token: TokenRead,
    forceRegistration: Bool
  ) {
    guard visible else {
      disable(reason: "collection_disabled")
      return
    }

    let value: String

    switch token {
    case .value(let token):
      value = token

    case .missing:
      disable(reason: "credential_missing")
      return

    case .invalid:
      disable(reason: "credential_invalid")
      return

    case .unavailable(let status):
      // Cancelar resultados pendentes evita repor uma credencial cuja identidade
      // não conseguimos confirmar. O canal e o grant existente ficam intactos.
      cancelRegistration()
      logger.notice("LOCATION_RECOVERY_DEFER reason=credential_unavailable status=\(status)")
      return
    }

    if let existing = credential, existing != value {
      disable(reason: "account_changed")
    }

    if credential != value {
      do {
        let previous = try LocationPushAccess.grant()

        if let previous = previous, previous.token != value {
          disable(reason: "account_changed")

          // Uma falha de revogação não equivale a revogação confirmada.
          try LocationPushAccess.revoke()
        } else {
          cancelRegistration()
        }
      } catch {
        logger.error("LOCATION_RECOVERY_DEFER reason=shared_access_unavailable")
        return
      }

      credential = value
    }

    switch manager.authorizationStatus {
    case .denied, .restricted, .authorizedWhenInUse:
      disable(reason: "always_authorization_unavailable")
      return

    case .notDetermined:
      logger.notice("LOCATION_RECOVERY_DEFER reason=authorization_not_determined")
      return

    case .authorizedAlways:
      break

    @unknown default:
      logger.notice("LOCATION_RECOVERY_DEFER reason=authorization_unknown")
      return
    }

    holdServiceSession()

    guard manager.accuracyAuthorization == .fullAccuracy else {
      // A captura continua proibida; não retiramos o registo só por faltar precisão.
      logger.notice("LOCATION_RECOVERY_DEFER reason=precise_location_unavailable")
      return
    }

    if registering {
      refreshPending = refreshPending || forceRegistration
      return
    }

    guard forceRegistration || Date() >= nextRegistration else {
      return
    }

    registerWithApple(credential: value)
  }

  private func registerWithApple(credential: String) {
    registering = true
    nextRegistration = Date().addingTimeInterval(60)

    let attempt = generation
    let timeout = DispatchWorkItem { [weak self] in
      guard let self = self,
        self.generation == attempt,
        self.registering
      else {
        return
      }

      self.cancelRegistration()
      self.nextRegistration = Date().addingTimeInterval(60)
      self.logger.notice("LOCATION_RECOVERY_REGISTRATION_TIMEOUT")
    }

    registrationDeadline = timeout
    DispatchQueue.main.asyncAfter(
      deadline: .now() + 15,
      execute: timeout
    )

    // Renovar o token não exige parar primeiro um canal que já estava ativo.
    manager.startMonitoringLocationPushes { [weak self] data, error in
      DispatchQueue.main.async {
        guard let self = self,
          attempt == self.generation,
          self.credential == credential
        else {
          return
        }

        self.registrationDeadline?.cancel()
        self.registrationDeadline = nil
        self.registering = false

        guard self.stillCurrentCredential(credential) else {
          return
        }

        guard error == nil, let data = data, !data.isEmpty else {
          let code = (error as NSError?)?.code ?? 0
          self.logger.error("LOCATION_RECOVERY_REGISTRATION_ERROR code=\(code)")
          self.finishPendingRefresh()
          return
        }

        let hex = data.map {
          String(format: "%02x", $0)
        }.joined()

        self.registerOnServer(hex, credential: credential)
      }
    }
  }

  private func registerOnServer(
    _ pushToken: String,
    credential: String
  ) {
    guard !registering else {
      return
    }

    #if DEBUG
    let defaultEnvironment = "sandbox"
    #else
    let defaultEnvironment = "production"
    #endif

    let environment = Bundle.main.object(
      forInfoDictionaryKey: "MargotLocationPushEnvironment"
    ) as? String ?? defaultEnvironment

    guard ["sandbox", "production"].contains(environment) else {
      logger.error("LOCATION_RECOVERY_REGISTRY_INVALID_ENVIRONMENT")
      finishPendingRefresh()
      return
    }

    let payload: [String: Any] = [
      "action": "register",
      "token": credential,
      "apns_token": pushToken,
      "environment": environment,
      "recovery_version": LocationPushAccess.recoveryVersion
    ]

    guard let body = try? JSONSerialization.data(
      withJSONObject: payload
    ) else {
      finishPendingRefresh()
      return
    }

    var request = URLRequest(
      url: URL(string: "https://margot-app.com/location-recovery/")!
    )

    request.httpMethod = "POST"
    request.httpBody = body
    request.setValue(
      "application/json",
      forHTTPHeaderField: "Content-Type"
    )
    request.setValue(
      "Bearer \(credential)",
      forHTTPHeaderField: "Authorization"
    )

    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 8
    configuration.timeoutIntervalForResource = 8
    configuration.waitsForConnectivity = false
    configuration.httpShouldSetCookies = false
    configuration.urlCache = nil

    let session = URLSession(
      configuration: configuration,
      delegate: self,
      delegateQueue: nil
    )

    self.session = session
    registering = true
    nextRegistration = Date().addingTimeInterval(60)

    let attempt = generation

    session.dataTask(with: request) { [weak self] data, response, error in
      DispatchQueue.main.async {
        session.finishTasksAndInvalidate()

        guard let self = self,
          attempt == self.generation,
          self.credential == credential
        else {
          return
        }

        self.session = nil
        self.registering = false

        guard self.stillCurrentCredential(credential) else {
          return
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = data.flatMap {
          try? JSONSerialization.jsonObject(with: $0)
        } as? [String: Any]

        guard error == nil,
          status == 200,
          json?["success"] as? Bool == true,
          let id = json?["registration_id"] as? String,
          id.count == 32,
          id.allSatisfy({ $0.isHexDigit }),
          let ttl = json?["expires_in"] as? Double,
          ttl.isFinite,
          ttl > 0,
          ttl <= 2592000
        else {
          if status == 401 {
            self.disable(reason: "credential_rejected")
          } else {
            self.logger.notice("LOCATION_RECOVERY_REGISTRY_UNAVAILABLE http=\(status)")
            self.finishPendingRefresh()
          }

          return
        }

        do {
          try LocationPushAccess.allow(
            token: credential,
            id: id,
            until: Date().timeIntervalSince1970 + ttl,
            probeUntil: self.probeUntil
          )

          self.nextRegistration = Date().addingTimeInterval(
            min(3600, max(60, ttl - 60))
          )

          self.logger.notice("LOCATION_RECOVERY_REGISTERED")
        } catch {
          // Um erro temporário de armazenamento não cancela um canal já registado.
          self.logger.error("LOCATION_RECOVERY_ACCESS_WRITE_FAILED")
        }

        self.finishPendingRefresh()
      }
    }.resume()
  }

  private func stillCurrentCredential(_ expected: String) -> Bool {
    let collecting = UserDefaults.standard.object(
      forKey: "margot.background-location.visible"
    ) as? Bool ?? false

    guard collecting else {
      disable(reason: "collection_disabled")
      return false
    }

    let current = readAppToken()

    if case .value(let value) = current, value == expected {
      return true
    }

    reconcile(
      visible: true,
      token: current,
      forceRegistration: true
    )

    return false
  }

  private func finishPendingRefresh() {
    guard refreshPending else {
      return
    }

    refreshPending = false

    DispatchQueue.main.async { [weak self] in
      self?.refresh()
    }
  }

  func locationManagerDidChangeAuthorization(
    _ manager: CLLocationManager
  ) {
    if !Thread.isMainThread {
      DispatchQueue.main.async {
        self.locationManagerDidChangeAuthorization(manager)
      }
      return
    }

    let collecting = UserDefaults.standard.object(
      forKey: "margot.background-location.visible"
    ) as? Bool ?? false

    reconcile(
      visible: collecting,
      token: readAppToken(),
      forceRegistration: false
    )
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }

  private func holdServiceSession() {
    guard #available(iOS 18.0, *), serviceSession == nil else {
      return
    }

    let value = CLServiceSession(authorization: .always)
    serviceSession = value

    logger.notice("LOCATION_RECOVERY_SERVICE_SESSION_STARTED")

    diagnosticsTask = Task { [weak self] in
      do {
        for try await diagnostic in value.diagnostics {
          guard !Task.isCancelled else {
            return
          }

          self?.logger.notice("LOCATION_RECOVERY_SERVICE_DIAGNOSTIC denied=\(diagnostic.authorizationDenied) global_denied=\(diagnostic.authorizationDeniedGlobally) restricted=\(diagnostic.authorizationRestricted) always_denied=\(diagnostic.alwaysAuthorizationDenied) precise_denied=\(diagnostic.fullAccuracyDenied) insufficiently_in_use=\(diagnostic.insufficientlyInUse) session_required=\(diagnostic.serviceSessionRequired) requesting=\(diagnostic.authorizationRequestInProgress)")
        }
      } catch {
        guard !Task.isCancelled else {
          return
        }

        self?.logger.error("LOCATION_RECOVERY_SERVICE_DIAGNOSTICS_FAILED")
      }
    }
  }

  private func cancelRegistration() {
    generation += 1
    registrationDeadline?.cancel()
    registrationDeadline = nil

    session?.invalidateAndCancel()
    session = nil

    registering = false
    refreshPending = false
    nextRegistration = .distantPast
  }

  private func disable(reason: String) {
    cancelRegistration()

    do {
      try LocationPushAccess.revoke()
    } catch {
      logger.error("LOCATION_RECOVERY_ACCESS_REVOKE_FAILED")
    }

    manager.stopMonitoringLocationPushes()
    credential = nil

    diagnosticsTask?.cancel()
    diagnosticsTask = nil

    if #available(iOS 18.0, *),
      let value = serviceSession as? CLServiceSession
    {
      value.invalidate()
    }

    serviceSession = nil
    logger.notice("LOCATION_RECOVERY_DISABLED reason=\(reason, privacy: .public)")
  }

  private func readAppToken() -> TokenRead {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "com.margot.background-location",
      kSecAttrAccount as String: "background-token",
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]

    var result: CFTypeRef?
    let status = SecItemCopyMatching(
      query as CFDictionary,
      &result
    )

    if status == errSecItemNotFound {
      return .missing
    }

    guard status == errSecSuccess else {
      return .unavailable(status)
    }

    guard let data = result as? Data,
      let value = String(data: data, encoding: .utf8),
      LocationPushAccess.validToken(value)
    else {
      return .invalid
    }

    return .value(value)
  }
}