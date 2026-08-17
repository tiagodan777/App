import UIKit
import WebKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(capacitorApareceu),
            name: .capacitorViewDidAppear,
            object: nil
        )

        return true
    }

    @objc private func capacitorApareceu() {
        configurarGestos()
    }

    private func configurarGestos() {
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene else { continue }

            for window in windowScene.windows {
                guard
                    let bridge = encontrarBridge(window.rootViewController),
                    let webView = bridge.webView
                else {
                    continue
                }

                webView.allowsBackForwardNavigationGestures = false

                adicionarGesto(
                    ao: webView,
                    margem: .left
                )

                adicionarGesto(
                    ao: webView,
                    margem: .right
                )
            }
        }
    }

    private func adicionarGesto(
        ao webView: WKWebView,
        margem: UIRectEdge
    ) {
        let jaExiste = webView.gestureRecognizers?.contains(where: { recognizer in
            guard let edge = recognizer as? UIScreenEdgePanGestureRecognizer else {
                return false
            }

            return edge.edges == margem
        }) ?? false

        if jaExiste { return }

        let gesto = UIScreenEdgePanGestureRecognizer(
            target: self,
            action: #selector(tratarSwipe(_:))
        )

        gesto.edges = margem
        gesto.cancelsTouchesInView = true

        webView.addGestureRecognizer(gesto)
    }

    @objc private func tratarSwipe(
        _ gesto: UIScreenEdgePanGestureRecognizer
    ) {
        guard
            gesto.state == .ended,
            let webView = gesto.view as? WKWebView
        else {
            return
        }

        let deslocamento = gesto.translation(in: webView)
        let velocidade = gesto.velocity(in: webView)
        let esquerda = gesto.edges == .left

        let distanciaValida = esquerda
            ? deslocamento.x > 65
            : deslocamento.x < -65

        let velocidadeValida = esquerda
            ? velocidade.x > 500
            : velocidade.x < -500

        guard distanciaValida || velocidadeValida else {
            return
        }

        let comando = esquerda
            ? "history.back();"
            : "history.forward();"

        let javascript =
            "if (!document.body.classList.contains('margot-mini-menu-aberto') && " +
            "!document.body.classList.contains('heys-abertos') && " +
            "!document.querySelector('dialog[open], [aria-modal=\"true\"]:not([hidden])')) {" +
            comando +
            "}"

        webView.evaluateJavaScript(
            javascript,
            completionHandler: nil
        )
    }

    private func encontrarBridge(
        _ controller: UIViewController?
    ) -> CAPBridgeViewController? {
        guard let controller = controller else {
            return nil
        }

        if let bridge = controller as? CAPBridgeViewController {
            return bridge
        }

        if let navigation = controller as? UINavigationController {
            for child in navigation.viewControllers {
                if let bridge = encontrarBridge(child) {
                    return bridge
                }
            }
        }

        if let tabs = controller as? UITabBarController {
            for child in tabs.viewControllers ?? [] {
                if let bridge = encontrarBridge(child) {
                    return bridge
                }
            }
        }

        if let presented = controller.presentedViewController,
           let bridge = encontrarBridge(presented) {
            return bridge
        }

        for child in controller.children {
            if let bridge = encontrarBridge(child) {
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