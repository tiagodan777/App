import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {

        NotificationCenter.default.addObserver(
            forName: .capacitorViewDidAppear,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.ativarGestosDeNavegacao()
        }

        return true
    }

    private func ativarGestosDeNavegacao() {
        for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
            for window in scene.windows {
                guard let bridge = encontrarBridgeViewController(window.rootViewController) else {
                    continue
                }

                bridge.webView?.allowsBackForwardNavigationGestures = true
            }
        }
    }

    private func encontrarBridgeViewController(
        _ viewController: UIViewController?
    ) -> CAPBridgeViewController? {

        guard let viewController else {
            return nil
        }

        if let bridge = viewController as? CAPBridgeViewController {
            return bridge
        }

        if let navigation = viewController as? UINavigationController {
            for controller in navigation.viewControllers {
                if let bridge = encontrarBridgeViewController(controller) {
                    return bridge
                }
            }
        }

        if let tabs = viewController as? UITabBarController {
            for controller in tabs.viewControllers ?? [] {
                if let bridge = encontrarBridgeViewController(controller) {
                    return bridge
                }
            }
        }

        if let presented = viewController.presentedViewController,
           let bridge = encontrarBridgeViewController(presented) {
            return bridge
        }

        for child in viewController.children {
            if let bridge = encontrarBridgeViewController(child) {
                return bridge
            }
        }

        return nil
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