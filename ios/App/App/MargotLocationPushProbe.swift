import CoreLocation
import Foundation
import OSLog

final class MargotLocationPushProbe {
  static let shared = MargotLocationPushProbe()

  private let manager = CLLocationManager()
  private let logger = Logger(
    subsystem: "com.margot.app", category: "LocationPushProbe"
  )
  private var serviceSession: AnyObject?
  private var registering = false

  private init() {}

  func start() {
    #if DEBUG
    guard ProcessInfo.processInfo.arguments.contains("--margot-location-push-probe") else {
      return
    }
    guard !registering else { return }
    guard manager.authorizationStatus == .authorizedAlways else {
      logger.error("PROBE_STOP: este teste exige a autorização Sempre já concedida.")
      return
    }

    if #available(iOS 18.0, *) {
      serviceSession = CLServiceSession(authorization: .always)
    }

    registering = true
    manager.startMonitoringLocationPushes { [weak self] token, error in
      DispatchQueue.main.async {
        guard let self = self else { return }
        self.registering = false

        if let error = error as NSError? {
          self.logger.error("PROBE_REGISTRATION_ERROR: domain=\(error.domain, privacy: .public) code=\(error.code)")
          return
        }
        guard let token = token, !token.isEmpty else {
          self.logger.error("PROBE_REGISTRATION_ERROR: token ausente.")
          return
        }

        let hex = token.map { String(format: "%02x", $0) }.joined()
        // Token específico deste teste de localização; não é o token de alertas.
        self.logger.notice("PROBE_LOCATION_TOKEN=\(hex, privacy: .public)")
      }
    }
    #endif
  }
}