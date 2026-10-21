import CoreLocation
import Foundation
import OSLog

final class LocationPushService: NSObject, CLLocationPushServiceExtension,
  CLLocationManagerDelegate, URLSessionTaskDelegate {
  private let logger = Logger(subsystem: "com.margot.app", category: "LocationRecovery")
  private var manager: CLLocationManager?
  private var completion: (() -> Void)?
  private var deadline: DispatchWorkItem?
  private var session: URLSession?
  private var grant: LocationPushAccess.Grant?
  private var startedAt = Date.distantPast
  private var gpsStartedAt = Date.distantPast
  private var requestID = ""
  private var manual = false
  private var runID = UUID()
  private var stage = "idle"

  func didReceiveLocationPushPayload(
    _ payload: [String: Any],
    completion: @escaping () -> Void
  ) {
    logger.notice("LOCATION_RECOVERY_RECEIVED diagnostic=3")
    DispatchQueue.main.async {
      self.begin(payload, completion: completion)
    }
  }

  private var energyAllowsCapture: Bool {
    !ProcessInfo.processInfo.isLowPowerModeEnabled &&
      ProcessInfo.processInfo.thermalState.rawValue <
      ProcessInfo.ThermalState.serious.rawValue
  }

  private func begin(
    _ payload: [String: Any],
    completion: @escaping () -> Void
  ) {
    var isManual = false

    #if DEBUG
    isManual = payload["margot_probe"] as? String == "v1"
    #endif

    guard self.completion == nil else {
      reject("busy", completion: completion)
      return
    }

    guard isManual || payload["margot_location"] as? String == "v1",
      let id = payload[isManual ? "probe_id" : "request_id"] as? String,
      (
        isManual
          ? UUID(uuidString: id) != nil
          : id.count == 32 && id.allSatisfy({ $0.isHexDigit })
      )
    else {
      reject("invalid_type_or_id", completion: completion)
      return
    }

    logger.notice("LOCATION_RECOVERY_BEGIN id=\(id, privacy: .public) manual=\(isManual)")

    guard let sentAt = payload["sent_at"] as? NSNumber,
      CFGetTypeID(sentAt) != CFBooleanGetTypeID(),
      sentAt.doubleValue.isFinite
    else {
      reject("invalid_sent_at", id: id, completion: completion)
      return
    }

    let now = Date().timeIntervalSince1970
    let payloadAge = now - sentAt.doubleValue

    guard payloadAge >= -5, payloadAge <= 180 else {
      logger.notice("LOCATION_RECOVERY_PAYLOAD_AGE id=\(id, privacy: .public) seconds=\(payloadAge)")
      reject("payload_time_window", id: id, completion: completion)
      return
    }

    let access: LocationPushAccess.Grant

    do {
      guard let value = try LocationPushAccess.grant() else {
        endServiceSession(reason: "access_missing_invalid_or_expired")
        reject(
          "access_missing_invalid_or_expired",
          id: id,
          completion: completion
        )
        return
      }

      access = value
    } catch {
      if error is DecodingError {
        endServiceSession(reason: "invalid_stored_access")
      }

      reject(
        "access_" + accessError(error),
        id: id,
        completion: completion
      )
      return
    }

    guard isManual
      ? (access.probeUntil ?? 0) > now
      : payload["registration_id"] as? String == access.id
    else {
      reject(
        isManual ? "probe_expired" : "registration_mismatch",
        id: id,
        completion: completion
      )
      return
    }

    let manager = CLLocationManager()

    guard manager.authorizationStatus == .authorizedAlways else {
      logPermission(manager, id: id)
      reject("permission", id: id, completion: completion)
      return
    }

    // Retoma cedo a intenção de autorização, antes da rede ou da recolha GPS.
    holdServiceSession(access)

    guard manager.accuracyAuthorization == .fullAccuracy else {
      logPermission(manager, id: id)
      reject("permission", id: id, completion: completion)
      return
    }

    guard energyAllowsCapture else {
      reject(energyReason, id: id, completion: completion)
      return
    }

    do {
      try LocationPushAccess.reserveAttempt(manual: isManual)
    } catch {
      reject(
        "attempt_" + accessError(error),
        id: id,
        completion: completion
      )
      return
    }

    self.completion = completion
    self.grant = access
    self.manager = manager
    self.requestID = id
    self.manual = isManual
    self.runID = UUID()
    self.startedAt = Date()
    self.stage = "starting"

    logger.notice("PROBE_AWAKE id=\(id, privacy: .public)")

    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 8
    configuration.timeoutIntervalForResource = 8
    configuration.waitsForConnectivity = false
    configuration.httpShouldSetCookies = false
    configuration.urlCache = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData

    session = URLSession(
      configuration: configuration,
      delegate: self,
      delegateQueue: nil
    )

    setDeadline(seconds: 9)

    if isManual {
      requestLocation()
    } else {
      send(["action": "check"]) { [weak self] json, status in
        guard let self = self else {
          return
        }

        let decision = (json?["capture"] as? Bool).map {
          $0 ? "yes" : "no"
        } ?? "missing"

        self.logger.notice("LOCATION_RECOVERY_CHECK id=\(self.requestID, privacy: .public) http=\(status) capture=\(decision, privacy: .public)")

        guard json?["capture"] as? Bool == true else {
          self.finish()
          return
        }

        self.requestLocation()
      }
    }
  }

  private func requestLocation() {
    guard let manager = manager, let grant = grant else {
      stop("missing_state")
      return
    }

    guard accessStillAllowed(grant) else {
      stop("access_changed_or_unavailable")
      return
    }

    guard energyAllowsCapture else {
      stop(energyReason)
      return
    }

    guard manager.authorizationStatus == .authorizedAlways,
      manager.accuracyAuthorization == .fullAccuracy
    else {
      logPermission(manager, id: requestID)
      stop("permission")
      return
    }

    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    gpsStartedAt = Date()
    stage = "gps"

    logger.notice("LOCATION_RECOVERY_GPS_START id=\(self.requestID, privacy: .public)")

    setDeadline(seconds: 10)
    manager.startUpdatingLocation()
  }

  func locationManager(
    _ manager: CLLocationManager,
    didUpdateLocations locations: [CLLocation]
  ) {
    guard completion != nil, manager === self.manager else {
      return
    }

    guard manager.authorizationStatus == .authorizedAlways,
      manager.accuracyAuthorization == .fullAccuracy
    else {
      logPermission(manager, id: requestID)
      stop("permission")
      return
    }

    guard let grant = grant, accessStillAllowed(grant) else {
      stop("access_changed_or_unavailable")
      return
    }

    guard energyAllowsCapture else {
      stop(energyReason)
      return
    }

    let now = Date()

    let location = locations.filter {
      let age = now.timeIntervalSince($0.timestamp)

      return CLLocationCoordinate2DIsValid($0.coordinate)
        && $0.horizontalAccuracy.isFinite
        && $0.horizontalAccuracy > 0
        && $0.horizontalAccuracy <= 100
        && age >= -2
        && age <= 30
        && $0.timestamp >= gpsStartedAt.addingTimeInterval(-2)
    }.max {
      $0.timestamp < $1.timestamp
    }

    guard let location = location else {
      let latest = locations.max {
        $0.timestamp < $1.timestamp
      }

      let age = latest.map {
        now.timeIntervalSince($0.timestamp)
      } ?? -1

      let accuracy = latest?.horizontalAccuracy ?? -1

      logger.notice("LOCATION_RECOVERY_WAITING_FIX id=\(self.requestID, privacy: .public) age_seconds=\(age) accuracy_m=\(accuracy)")

      // Amostras rejeitadas não prolongam o prazo original de dez segundos.
      return
    }

    stopGPS()
    upload(location)
  }

  func locationManager(
    _ manager: CLLocationManager,
    didFailWithError error: Error
  ) {
    guard completion != nil, manager === self.manager else {
      return
    }

    let failure = error as NSError

    if failure.domain == kCLErrorDomain,
      failure.code == CLError.locationUnknown.rawValue
    {
      logger.notice("LOCATION_RECOVERY_WAITING_FIX id=\(self.requestID, privacy: .public) reason=location_unknown")
      return
    }

    logger.error("LOCATION_RECOVERY_LOCATION_ERROR id=\(self.requestID, privacy: .public) code=\(failure.code)")
    finish()
  }

  private func upload(_ location: CLLocation) {
    guard let grant = grant, accessStillAllowed(grant) else {
      stop("access_changed_or_unavailable")
      return
    }

    guard energyAllowsCapture else {
      stop(energyReason)
      return
    }

    var payload: [String: Any] = [
      "action": "upload",
      "latitude": location.coordinate.latitude,
      "longitude": location.coordinate.longitude,
      "accuracy": location.horizontalAccuracy,
      "timestamp": location.timestamp.timeIntervalSince1970 * 1000,
      "location_policy_version": 1
    ]

    if manual {
      payload["location_push_probe"] = 1
      payload["active"] = true
      payload["visible"] = true
    }

    let capturedAt = ISO8601DateFormatter().string(
      from: location.timestamp
    )

    setDeadline(
      seconds: min(
        9,
        max(0, 25 - Date().timeIntervalSince(startedAt))
      )
    )

    send(payload) { [weak self] json, status in
      guard let self = self else {
        return
      }

      if json?["accepted"] as? Bool == true {
        self.logger.notice("LOCATION_RECOVERY_UPLOAD_OK id=\(self.requestID, privacy: .public)")
        self.logger.notice("PROBE_UPLOAD_OK id=\(self.requestID, privacy: .public) captured_at=\(capturedAt, privacy: .public) accuracy_m=\(location.horizontalAccuracy, privacy: .public)")
      } else {
        self.logger.notice("LOCATION_RECOVERY_UPLOAD_NOT_ACCEPTED id=\(self.requestID, privacy: .public) http=\(status)")
      }

      self.finish()
    }
  }

  private func send(
    _ values: [String: Any],
    result: @escaping ([String: Any]?, Int) -> Void
  ) {
    guard let grant = grant,
      accessStillAllowed(grant),
      let session = session
    else {
      stop("access_or_session_unavailable")
      return
    }

    let action = values["action"] as? String ?? "unknown"
    stage = action

    var payload = values
    payload["token"] = grant.token
    payload["registration_id"] = grant.id
    payload["request_id"] = requestID

    guard let body = try? JSONSerialization.data(
      withJSONObject: payload
    ) else {
      stop("json_encoding")
      return
    }

    let path = manual
      ? "background-location-update"
      : "location-recovery"

    var request = URLRequest(
      url: URL(string: "https://margot-app.com/\(path)/")!
    )

    request.httpMethod = "POST"
    request.httpBody = body
    request.setValue(
      "application/json",
      forHTTPHeaderField: "Content-Type"
    )
    request.setValue(
      "application/json",
      forHTTPHeaderField: "Accept"
    )
    request.setValue(
      "Bearer \(grant.token)",
      forHTTPHeaderField: "Authorization"
    )

    let run = runID

    logger.notice("LOCATION_RECOVERY_HTTP_START id=\(self.requestID, privacy: .public) action=\(action, privacy: .public)")

    session.dataTask(with: request) { [weak self] data, response, error in
      DispatchQueue.main.async {
        guard let self = self,
          self.completion != nil,
          self.runID == run
        else {
          return
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        let json = data.flatMap {
          try? JSONSerialization.jsonObject(with: $0)
        } as? [String: Any]

        let errorCode = error.map {
          ($0 as NSError).code
        } ?? 0

        let success = json?["success"] as? Bool == true

        self.logger.notice("LOCATION_RECOVERY_HTTP id=\(self.requestID, privacy: .public) action=\(action, privacy: .public) http=\(status) success=\(success) error_code=\(errorCode)")

        if status == 401, self.accessStillAllowed(grant) {
          do {
            try LocationPushAccess.revoke()
          } catch {
            self.logger.error("LOCATION_RECOVERY_ACCESS_REVOKE_FAILED")
          }

          self.endServiceSession(
            reason: "credential_rejected",
            matching: grant
          )
        }

        result(
          error == nil
            && status == 200
            && json?["success"] as? Bool == true
            ? json
            : nil,
          status
        )
      }
    }.resume()
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

  private func setDeadline(seconds: TimeInterval) {
    deadline?.cancel()

    let run = runID

    let work = DispatchWorkItem { [weak self] in
      guard let self = self,
        self.completion != nil,
        self.runID == run
      else {
        return
      }

      self.logger.notice("LOCATION_RECOVERY_TIMEOUT id=\(self.requestID, privacy: .public) stage=\(self.stage, privacy: .public)")
      self.finish()
    }

    deadline = work

    DispatchQueue.main.asyncAfter(
      deadline: .now() + seconds,
      execute: work
    )
  }

  private func stopGPS() {
    manager?.delegate = nil
    manager?.stopUpdatingLocation()
    manager = nil
  }

  func serviceExtensionWillTerminate() {
    logger.notice("LOCATION_RECOVERY_SYSTEM_TERMINATE diagnostic=3")

    if Thread.isMainThread {
      finish()
    } else {
      DispatchQueue.main.sync {
        self.finish()
      }
    }
  }

  private func finish() {
    if completion != nil {
      let elapsed = Date().timeIntervalSince(startedAt)
      logger.notice("LOCATION_RECOVERY_FINISH id=\(self.requestID, privacy: .public) stage=\(self.stage, privacy: .public) seconds=\(elapsed)")
    }

    deadline?.cancel()
    deadline = nil

    stopGPS()

    session?.invalidateAndCancel()
    session = nil

    if let grant = grant {
      _ = accessStillAllowed(grant)
    }

    grant = nil

    let callback = completion
    completion = nil
    stage = "idle"

    callback?()
  }

  private var energyReason: String {
    ProcessInfo.processInfo.isLowPowerModeEnabled
      ? "low_power_mode"
      : "thermal_state"
  }

  private func reject(
    _ reason: String,
    id: String = "unvalidated",
    completion: () -> Void
  ) {
    logger.notice("LOCATION_RECOVERY_SKIP id=\(id, privacy: .public) reason=\(reason, privacy: .public)")
    completion()
  }

  private func stop(_ reason: String) {
    logger.notice("LOCATION_RECOVERY_STOP id=\(self.requestID, privacy: .public) stage=\(self.stage, privacy: .public) reason=\(reason, privacy: .public)")
    finish()
  }

  private func logPermission(
    _ manager: CLLocationManager,
    id: String
  ) {
    switch manager.authorizationStatus {
    case .denied, .restricted, .authorizedWhenInUse:
      endServiceSession(reason: "always_authorization_unavailable")

    default:
      break
    }

    let authorization = manager.authorizationStatus.rawValue
    let precise = manager.accuracyAuthorization == .fullAccuracy

    logger.notice("LOCATION_RECOVERY_PERMISSION id=\(id, privacy: .public) authorization=\(authorization) precise=\(precise)")
  }

  private func holdServiceSession(
    _ access: LocationPushAccess.Grant
  ) {
    LocationPushAuthorizationSession.hold(access)
  }

  private func endServiceSession(
    reason: String,
    matching access: LocationPushAccess.Grant? = nil
  ) {
    LocationPushAuthorizationSession.end(
      reason: reason,
      matching: access
    )
  }

  private func accessStillAllowed(
    _ original: LocationPushAccess.Grant
  ) -> Bool {
    do {
      guard let current = try LocationPushAccess.grant() else {
        endServiceSession(
          reason: "access_missing_invalid_or_expired",
          matching: original
        )
        return false
      }

      guard current.id == original.id,
        current.token == original.token
      else {
        endServiceSession(
          reason: "access_changed",
          matching: original
        )
        return false
      }

      return true
    } catch {
      // Falhar fechado para esta captura não exige cancelar a autorização duradoura.
      if error is DecodingError {
        endServiceSession(
          reason: "invalid_stored_access",
          matching: original
        )
      }

      logger.notice("LOCATION_RECOVERY_ACCESS_UNAVAILABLE reason=\(self.accessError(error), privacy: .public)")
      return false
    }
  }

  private func accessError(_ error: Error) -> String {
    guard let failure = error as? LocationPushAccess.Failure else {
      return error is DecodingError
        ? "invalid_stored_data"
        : "storage_error"
    }

    switch failure {
    case .configuration:
      return "keychain_configuration"

    case .keychain(let status):
      return "keychain_status_\(status)"

    case .budget:
      return "budget"
    }
  }
}

// Esta intenção pertence ao processo da extensão, não a uma instância ou a um push.
// As chamadas que alteram o estado são feitas na main queue.
private enum LocationPushAuthorizationSession {
  private static let logger = Logger(
    subsystem: "com.margot.app",
    category: "LocationRecovery"
  )

  private static var session: AnyObject?
  private static var diagnosticsTask: Task<Void, Never>?
  private static var access: LocationPushAccess.Grant?

  static func hold(_ current: LocationPushAccess.Grant) {
    if let previous = access,
      previous.id != current.id || previous.token != current.token
    {
      end(
        reason: "registration_changed",
        matching: previous
      )
    }

    guard #available(iOS 18.0, *), session == nil else {
      return
    }

    let value = CLServiceSession(authorization: .always)
    access = current
    session = value

    logger.notice("LOCATION_RECOVERY_SERVICE_SESSION_STARTED")

    diagnosticsTask = Task {
      do {
        for try await diagnostic in value.diagnostics {
          guard !Task.isCancelled else {
            return
          }

          logger.notice("LOCATION_RECOVERY_SERVICE_DIAGNOSTIC denied=\(diagnostic.authorizationDenied) global_denied=\(diagnostic.authorizationDeniedGlobally) restricted=\(diagnostic.authorizationRestricted) always_denied=\(diagnostic.alwaysAuthorizationDenied) precise_denied=\(diagnostic.fullAccuracyDenied) insufficiently_in_use=\(diagnostic.insufficientlyInUse) session_required=\(diagnostic.serviceSessionRequired) requesting=\(diagnostic.authorizationRequestInProgress)")
        }
      } catch {
        guard !Task.isCancelled else {
          return
        }

        logger.error("LOCATION_RECOVERY_SERVICE_DIAGNOSTICS_FAILED")
      }
    }
  }

  static func end(
    reason: String,
    matching expected: LocationPushAccess.Grant? = nil
  ) {
    if let expected = expected {
      guard let current = access,
        current.id == expected.id,
        current.token == expected.token
      else {
        return
      }
    }

    diagnosticsTask?.cancel()
    diagnosticsTask = nil

    if #available(iOS 18.0, *),
      let value = session as? CLServiceSession
    {
      value.invalidate()
    }

    session = nil
    access = nil

    logger.notice("LOCATION_RECOVERY_SERVICE_SESSION_ENDED reason=\(reason, privacy: .public)")
  }
}