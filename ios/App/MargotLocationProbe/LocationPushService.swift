import CoreLocation
import Foundation
import OSLog

final class LocationPushService: NSObject, CLLocationPushServiceExtension,
  CLLocationManagerDelegate, URLSessionTaskDelegate {
  private let logger = Logger(subsystem: "com.margot.app", category: "LocationRecovery")
  private var manager: CLLocationManager?
  private var serviceSession: AnyObject?
  private var completion: (() -> Void)?
  private var deadline: DispatchWorkItem?
  private var session: URLSession?
  private var grant: LocationPushAccess.Grant?
  private var startedAt = Date.distantPast
  private var gpsStartedAt = Date.distantPast
  private var requestID = ""
  private var manual = false
  private var runID = UUID()

  func didReceiveLocationPushPayload(_ payload: [String: Any], completion: @escaping () -> Void) {
    DispatchQueue.main.async { self.begin(payload, completion: completion) }
  }

  private var energyAllowsCapture: Bool {
    !ProcessInfo.processInfo.isLowPowerModeEnabled &&
      ProcessInfo.processInfo.thermalState.rawValue < ProcessInfo.ThermalState.serious.rawValue
  }

  private func begin(_ payload: [String: Any], completion: @escaping () -> Void) {
    var isManual = false
    #if DEBUG
    isManual = payload["margot_probe"] as? String == "v1"
    #endif
    guard self.completion == nil,
      isManual || payload["margot_location"] as? String == "v1",
      let id = payload[isManual ? "probe_id" : "request_id"] as? String,
      (isManual ? UUID(uuidString: id) != nil : id.count == 32 && id.allSatisfy({ $0.isHexDigit })),
      let sentAt = payload["sent_at"] as? NSNumber,
      CFGetTypeID(sentAt) != CFBooleanGetTypeID(), sentAt.doubleValue.isFinite else {
      completion(); return
    }
    let now = Date().timeIntervalSince1970
    guard now - sentAt.doubleValue >= -5, now - sentAt.doubleValue <= 180,
      energyAllowsCapture, let access = try? LocationPushAccess.grant(),
      isManual ? (access.probeUntil ?? 0) > now : payload["registration_id"] as? String == access.id else {
      completion(); return
    }
    let manager = CLLocationManager()
    guard manager.authorizationStatus == .authorizedAlways,
      manager.accuracyAuthorization == .fullAccuracy else { completion(); return }
    do { try LocationPushAccess.reserveAttempt(manual: isManual) }
    catch {
      logger.notice("LOCATION_RECOVERY_SKIP_BUDGET_OR_STORAGE id=\(id, privacy: .public)")
      completion(); return
    }
    self.completion = completion
    self.grant = access
    self.manager = manager
    self.requestID = id
    self.manual = isManual
    self.runID = UUID()
    self.startedAt = Date()
    logger.notice("PROBE_AWAKE id=\(id, privacy: .public)")
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 8
    configuration.timeoutIntervalForResource = 8
    configuration.waitsForConnectivity = false
    configuration.httpShouldSetCookies = false
    configuration.urlCache = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    setDeadline(seconds: 9)
    if isManual {
      requestLocation()
    } else {
      send(["action": "check"]) { [weak self] json, _ in
        guard let self = self else { return }
        guard json?["capture"] as? Bool == true else { self.finish(); return }
        self.requestLocation()
      }
    }
  }

  private func requestLocation() {
    guard let manager = manager, let grant = grant, LocationPushAccess.stillAllowed(grant),
      energyAllowsCapture, manager.authorizationStatus == .authorizedAlways,
      manager.accuracyAuthorization == .fullAccuracy else { finish(); return }
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    if #available(iOS 18.0, *) { serviceSession = CLServiceSession(authorization: .always) }
    gpsStartedAt = Date()
    setDeadline(seconds: 10)
    manager.requestLocation()
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard completion != nil, manager === self.manager else { return }
    guard manager.authorizationStatus == .authorizedAlways,
      manager.accuracyAuthorization == .fullAccuracy else { finish(); return }
    let now = Date()
    let location = locations.filter {
      let age = now.timeIntervalSince($0.timestamp)
      return CLLocationCoordinate2DIsValid($0.coordinate)
        && $0.horizontalAccuracy.isFinite && $0.horizontalAccuracy > 0 && $0.horizontalAccuracy <= 100
        && age >= -2 && age <= 30 && $0.timestamp >= gpsStartedAt.addingTimeInterval(-2)
    }.max { $0.timestamp < $1.timestamp }
    stopGPS()
    guard let location = location else {
      logger.notice("LOCATION_RECOVERY_NO_FRESH_FIX id=\(self.requestID, privacy: .public)")
      finish(); return
    }
    upload(location)
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    guard completion != nil, manager === self.manager else { return }
    logger.error("LOCATION_RECOVERY_LOCATION_ERROR id=\(self.requestID, privacy: .public)")
    finish()
  }

  private func upload(_ location: CLLocation) {
    guard let grant = grant, LocationPushAccess.stillAllowed(grant), energyAllowsCapture else {
      finish(); return
    }
    var payload: [String: Any] = [
      "action": "upload", "latitude": location.coordinate.latitude,
      "longitude": location.coordinate.longitude, "accuracy": location.horizontalAccuracy,
      "timestamp": location.timestamp.timeIntervalSince1970 * 1000, "location_policy_version": 1
    ]
    if manual {
      payload["location_push_probe"] = 1
      payload["active"] = true
      payload["visible"] = true
    }
    let capturedAt = ISO8601DateFormatter().string(from: location.timestamp)
    setDeadline(seconds: min(9, max(0, 25 - Date().timeIntervalSince(startedAt))))
    send(payload) { [weak self] json, status in
      guard let self = self else { return }
      if json?["accepted"] as? Bool == true {
        self.logger.notice("PROBE_UPLOAD_OK id=\(self.requestID, privacy: .public) captured_at=\(capturedAt, privacy: .public) accuracy_m=\(location.horizontalAccuracy, privacy: .public)")
      } else {
        self.logger.notice("LOCATION_RECOVERY_UPLOAD_NOT_ACCEPTED id=\(self.requestID, privacy: .public) http=\(status)")
      }
      self.finish()
    }
  }

  private func send(_ values: [String: Any], result: @escaping ([String: Any]?, Int) -> Void) {
    guard let grant = grant, LocationPushAccess.stillAllowed(grant), let session = session else {
      finish(); return
    }
    var payload = values
    payload["token"] = grant.token
    payload["registration_id"] = grant.id
    payload["request_id"] = requestID
    guard let body = try? JSONSerialization.data(withJSONObject: payload) else { finish(); return }
    let path = manual ? "background-location-update" : "location-recovery"
    var request = URLRequest(url: URL(string: "https://margot-app.com/\(path)/")!)
    request.httpMethod = "POST"
    request.httpBody = body
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("Bearer \(grant.token)", forHTTPHeaderField: "Authorization")
    let run = runID
    session.dataTask(with: request) { [weak self] data, response, error in
      DispatchQueue.main.async {
        guard let self = self, self.completion != nil, self.runID == run else { return }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
        if status == 401, LocationPushAccess.stillAllowed(grant) { try? LocationPushAccess.revoke() }
        result(error == nil && status == 200 && json?["success"] as? Bool == true ? json : nil, status)
      }
    }.resume()
  }

  func urlSession(_ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }

  private func setDeadline(seconds: TimeInterval) {
    deadline?.cancel()
    let run = runID
    let work = DispatchWorkItem { [weak self] in
      guard let self = self, self.completion != nil, self.runID == run else { return }
      self.logger.notice("LOCATION_RECOVERY_TIMEOUT id=\(self.requestID, privacy: .public)")
      self.finish()
    }
    deadline = work
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
  }

  private func stopGPS() {
    manager?.delegate = nil
    manager?.stopUpdatingLocation()
    manager = nil
    if #available(iOS 18.0, *), let session = serviceSession as? CLServiceSession { session.invalidate() }
    serviceSession = nil
  }

  func serviceExtensionWillTerminate() {
    if Thread.isMainThread { finish() }
    else { DispatchQueue.main.sync { self.finish() } }
  }

  private func finish() {
    deadline?.cancel()
    deadline = nil
    stopGPS()
    session?.invalidateAndCancel()
    session = nil
    grant = nil
    let callback = completion
    completion = nil
    callback?()
  }
}