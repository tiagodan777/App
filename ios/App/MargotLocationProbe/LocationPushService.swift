import CoreLocation
import Foundation
import OSLog

final class LocationPushService: NSObject, CLLocationPushServiceExtension,
  CLLocationManagerDelegate, URLSessionTaskDelegate {
  private let logger = Logger(subsystem: "com.margot.app", category: "LocationPushProbe")
  private var manager: CLLocationManager?
  private var serviceSession: AnyObject?
  private var completion: (() -> Void)?
  private var deadline: DispatchWorkItem?
  private var session: URLSession?
  private var grant: LocationPushAccess.Grant?
  private var startedAt = Date.distantPast
  private var probeID = ""
  private var runID = UUID()

  func didReceiveLocationPushPayload(
    _ payload: [String: Any], completion: @escaping () -> Void
  ) {
    #if DEBUG
    DispatchQueue.main.async { self.begin(payload, completion: completion) }
    #else
    completion()
    #endif
  }

  private func begin(_ payload: [String: Any], completion: @escaping () -> Void) {
    guard self.completion == nil,
      payload["margot_probe"] as? String == "v1",
      let id = payload["probe_id"] as? String, UUID(uuidString: id) != nil,
      let sentAt = payload["sent_at"] as? NSNumber,
      CFGetTypeID(sentAt) != CFBooleanGetTypeID(), sentAt.doubleValue.isFinite else {
      completion(); return
    }
    let age = Date().timeIntervalSince1970 - sentAt.doubleValue
    guard age >= -5, age <= 180 else { completion(); return }
    guard !ProcessInfo.processInfo.isLowPowerModeEnabled,
      ProcessInfo.processInfo.thermalState.rawValue < ProcessInfo.ThermalState.serious.rawValue else {
      logger.notice("PROBE_SKIP_ENERGY id=\(id, privacy: .public)")
      completion(); return
    }
    guard let access = try? LocationPushAccess.grant() else {
      logger.notice("PROBE_SKIP_ACCESS id=\(id, privacy: .public)")
      completion(); return
    }
    let manager = CLLocationManager()
    guard manager.authorizationStatus == .authorizedAlways,
      manager.accuracyAuthorization == .fullAccuracy else {
      logger.notice("PROBE_SKIP_PERMISSION id=\(id, privacy: .public)")
      completion(); return
    }
    do { try LocationPushAccess.reserveAttempt() }
    catch {
      logger.notice("PROBE_SKIP_BUDGET_OR_STORAGE id=\(id, privacy: .public)")
      completion(); return
    }

    self.completion = completion
    self.grant = access
    self.manager = manager
    self.probeID = id
    self.runID = UUID()
    startedAt = Date()
    logger.notice("PROBE_AWAKE id=\(id, privacy: .public)")
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    if #available(iOS 18.0, *) {
      serviceSession = CLServiceSession(authorization: .always)
    }
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
        && $0.horizontalAccuracy.isFinite && $0.horizontalAccuracy > 0
        && $0.horizontalAccuracy <= 100 && age >= -2 && age <= 30
        && $0.timestamp >= startedAt.addingTimeInterval(-2)
    }.max { $0.timestamp < $1.timestamp }
    stopGPS()
    guard let location = location else {
      logger.notice("PROBE_NO_FRESH_FIX id=\(self.probeID, privacy: .public)")
      finish(); return
    }
    upload(location)
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    guard completion != nil, manager === self.manager else { return }
    logger.error("PROBE_LOCATION_ERROR id=\(self.probeID, privacy: .public) code=\((error as NSError).code)")
    finish()
  }

  private func upload(_ location: CLLocation) {
    guard let grant = grant, LocationPushAccess.stillAllowed(grant),
      !ProcessInfo.processInfo.isLowPowerModeEnabled,
      ProcessInfo.processInfo.thermalState.rawValue < ProcessInfo.ThermalState.serious.rawValue else {
      logger.notice("PROBE_CANCELLED id=\(self.probeID, privacy: .public)")
      finish(); return
    }
    let payload: [String: Any] = [
      "latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude,
      "accuracy": location.horizontalAccuracy, "timestamp": location.timestamp.timeIntervalSince1970 * 1000,
      "location_policy_version": 1, "location_push_probe": 1,
      "active": true, "visible": true, "token": grant.token
    ]
    guard let body = try? JSONSerialization.data(withJSONObject: payload) else { finish(); return }
    var request = URLRequest(url: URL(string: "https://margot-app.com/background-location-update/")!)
    request.httpMethod = "POST"
    request.httpBody = body
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("Bearer \(grant.token)", forHTTPHeaderField: "Authorization")
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 8
    configuration.timeoutIntervalForResource = 8
    configuration.waitsForConnectivity = false
    configuration.httpShouldSetCookies = false
    configuration.urlCache = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    self.session = session
    let run = runID
    let capturedAt = ISO8601DateFormatter().string(from: location.timestamp)
    let accuracy = location.horizontalAccuracy
    setDeadline(seconds: min(9, max(0, 20 - Date().timeIntervalSince(startedAt))))
    session.dataTask(with: request) { [weak self] data, response, error in
      DispatchQueue.main.async {
        guard let self = self, self.completion != nil, self.runID == run else { return }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
        if error == nil, status == 200, json?["success"] as? Bool == true,
          json?["accepted"] as? Bool == true, json?["location_push_probe"] as? Int == 1 {
          self.logger.notice("PROBE_UPLOAD_OK id=\(self.probeID, privacy: .public) captured_at=\(capturedAt, privacy: .public) accuracy_m=\(accuracy, privacy: .public)")
        } else {
          self.logger.notice("PROBE_UPLOAD_NOT_ACCEPTED id=\(self.probeID, privacy: .public) http=\(status) network=\((error as NSError?)?.code ?? 0)")
          if status == 401, LocationPushAccess.stillAllowed(grant) { try? LocationPushAccess.revoke() }
        }
        self.finish()
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
      self.logger.notice("PROBE_TIMEOUT id=\(self.probeID, privacy: .public)")
      self.finish()
    }
    deadline = work
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
  }

  private func stopGPS() {
    manager?.delegate = nil
    manager?.stopUpdatingLocation()
    manager = nil
    if #available(iOS 18.0, *), let session = serviceSession as? CLServiceSession {
      session.invalidate()
    }
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