import Capacitor
import CoreLocation
import Foundation
import Security
import UIKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  /*
   * Este coordenador só existe quando o próprio iOS relança
   * a Margot em segundo plano por causa de um evento de localização.
   *
   * Num arranque normal continua tudo a ser gerido pelo
   * BackgroundLocationPlugin já existente.
   */
  private var locationRelaunchCoordinator: LocationRelaunchCoordinator?

  func application(
    _ application: UIApplication, willFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    prepararRelaunchDeLocalizacao(launchOptions)
    return true
  }

  func application(
    _ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    /*
     * Também verificamos aqui.
     *
     * O guard interno impede que sejam criados dois
     * coordenadores caso willFinish e didFinish recebam
     * ambos UIApplicationLaunchOptionsLocationKey.
     */
  prepararRelaunchDeLocalizacao(launchOptions)
    return true
  }

  func applicationDidBecomeActive(_ application: UIApplication) {
    guard let coordinator = locationRelaunchCoordinator else { return }
    /*
     * Se o utilizador abriu entretanto a aplicação,
     * damos alguns segundos ao plugin Capacitor normal
     * para assumir novamente o controlo.
     *
     * Depois destruímos este gestor temporário para
     * não ficarmos com dois CLLocationManager a enviar
     * a mesma posição.
     */
  DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self, weak coordinator] in
      guard let self = self, let coordinator = coordinator, self.locationRelaunchCoordinator === coordinator else {
        return
      }
      coordinator.stop()
      self.locationRelaunchCoordinator = nil
    }
  }

  private func prepararRelaunchDeLocalizacao(_ launchOptions: [UIApplication.LaunchOptionsKey: Any]?) {
    guard launchOptions?[.location] != nil, locationRelaunchCoordinator == nil else { return }
    /*
     * O iOS lançou a aplicação porque recebeu um novo
     * evento do serviço de localização.
     *
     * Não esperamos que o WebView/Capacitor/ViewController
     * carreguem para voltar a ligar Core Location.
     */
  let coordinator = LocationRelaunchCoordinator()
    locationRelaunchCoordinator = coordinator
    coordinator.start()
  }

  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
  }

  func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
  }

  func application(
    _ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }
}
