import CoreLocation
import Foundation
import OSLog

final class LocationPushService: NSObject, CLLocationPushServiceExtension,
  CLLocationManagerDelegate {
  private let logger = Logger(
    subsystem: "com.margot.app", category: "LocationPushProbe"
  )
  private var manager: CLLocationManager?
  private var serviceSession: AnyObject?
  private var completion: (() -> Void)?
  private var timeout: DispatchWorkItem?
  private var retry: DispatchWorkItem?
  private var startedAt = Date.distantPast
  private var probeID = ""

  func didReceiveLocationPushPayload(
    _ payload: [String: Any], completion: @escaping () -> Void
  ) {
    #if DEBUG
    DispatchQueue.main.async {
      self.begin(payload, completion: completion)
    }
    #else
    completion()
    #endif
  }

  private func begin(_ payload: [String: Any], completion: @escaping () -> Void) {
    guard payload["margot_probe"] as? String == "v1",
      let id = payload["probe_id"] as? String,
      UUID(uuidString: id) != nil,
      let sentAt = payload["sent_at"] as? NSNumber
    else {
      completion()
      return
    }
    let age = Date().timeIntervalSince1970 - sentAt.doubleValue
    guard age >= -5, age <= 180 else {
      completion()
      return
    }

    finish()
    self.completion = completion
    probeID = id
    startedAt = Date()
    logger.notice("PROBE_AWAKE id=\(id, privacy: .public)")

    let manager = CLLocationManager()
    self.manager = manager
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters

    guard manager.authorizationStatus == .authorizedAlways else {
      logger.error("PROBE_NO_ALWAYS id=\(id, privacy: .public)")
      finish()
      return
    }
    if #available(iOS 18.0, *) {
      serviceSession = CLServiceSession(authorization: .always)
    }

    let timeout = DispatchWorkItem { [weak self] in
      guard let self = self, self.completion != nil else { return }
      self.logger.error("PROBE_TIMEOUT id=\(self.probeID, privacy: .public)")
      self.finish()
    }
    self.timeout = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: timeout)
    manager.requestLocation()
  }

  func locationManager(
    _ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]
  ) {
    guard completion != nil, manager === self.manager else { return }
    let now = Date()
    let location = locations.filter {
      let age = now.timeIntervalSince($0.timestamp)
      return CLLocationCoordinate2DIsValid($0.coordinate)
        && $0.horizontalAccuracy.isFinite
        && $0.horizontalAccuracy > 0 && $0.horizontalAccuracy <= 100
        && $0.timestamp >= startedAt.addingTimeInterval(-2)
        && age >= -2 && age <= 30
    }.max { $0.timestamp < $1.timestamp }

    guard let location = location else {
      requestAgain()
      return
    }
    let capturedAt = ISO8601DateFormatter().string(from: location.timestamp)
    let accuracy = location.horizontalAccuracy
    logger.notice("PROBE_OK id=\(self.probeID, privacy: .public) captured_at=\(capturedAt, privacy: .public) accuracy_m=\(accuracy, privacy: .public)")
    // Diagnóstico local: não envia coordenadas nem altera a presença no servidor.
    finish()
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    guard completion != nil, manager === self.manager else { return }
    if (error as? CLError)?.code == .locationUnknown {
      requestAgain()
      return
    }
    let nsError = error as NSError
    logger.error("PROBE_LOCATION_ERROR id=\(self.probeID, privacy: .public) domain=\(nsError.domain, privacy: .public) code=\(nsError.code)")
    finish()
  }

  private func requestAgain() {
    retry?.cancel()
    let retry = DispatchWorkItem { [weak self] in
      guard let self = self, self.completion != nil else { return }
      self.manager?.requestLocation()
    }
    self.retry = retry
    DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: retry)
  }

  func serviceExtensionWillTerminate() {
    if Thread.isMainThread {
      finish()
    } else {
      DispatchQueue.main.sync { self.finish() }
    }
  }

  private func finish() {
    timeout?.cancel()
    retry?.cancel()
    timeout = nil
    retry = nil
    manager?.delegate = nil
    manager?.stopUpdatingLocation()
    manager = nil
    if #available(iOS 18.0, *), let session = serviceSession as? CLServiceSession {
      session.invalidate()
    }
    serviceSession = nil
    let callback = completion
    completion = nil
    callback?()
  }
}