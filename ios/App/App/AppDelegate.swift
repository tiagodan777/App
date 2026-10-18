import Capacitor
import OSLog
import UIKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  private var locationRelaunchCoordinator: LocationRelaunchCoordinator?
  private var locationBootstrapAttempted = false
  private let locationLogger = Logger(
    subsystem: "com.margot.app", category: "LocationRecovery"
  )

  func application(
    _ application: UIApplication,
    willFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    prepararRecuperacaoDeLocalizacao()
    return true
  }

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    prepararRecuperacaoDeLocalizacao()
    return true
  }

  private func prepararRecuperacaoDeLocalizacao() {
    // Com UIScene, launchOptions pode ser nil num relançamento por localização.
    // Recuperamos o serviço nativo no arranque, sem esperar pela página web.
    // O coordenador verifica Sempre, visibilidade, localização e credencial.
    guard !locationBootstrapAttempted else { return }
    locationBootstrapAttempted = true

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(locationPluginReady),
      name: Notification.Name("MargotLocationPluginOwnsMonitoring"),
      object: nil
    )

    locationLogger.notice("scene-recovery-1: native bootstrap requested")
    let coordinator = LocationRelaunchCoordinator()
    locationRelaunchCoordinator = coordinator
    coordinator.start()
  }

  @objc private func locationPluginReady() {
    guard let coordinator = locationRelaunchCoordinator else { return }

    // O plugin já aplicou o estado atual. Não desligamos os serviços de
    // monitorização que ele acabou de configurar para toda a aplicação.
    coordinator.stop(preserveWakeMonitoring: true)
    locationRelaunchCoordinator = nil
    locationLogger.notice("scene-recovery-1: ownership transferred to plugin")
  }

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    NotificationCenter.default.post(
      name: .capacitorDidRegisterForRemoteNotifications,
      object: deviceToken
    )
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    NotificationCenter.default.post(
      name: .capacitorDidFailToRegisterForRemoteNotifications,
      object: error
    )
  }

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role
    )
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }
}