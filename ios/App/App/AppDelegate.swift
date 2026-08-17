import UIKit
import WebKit
import Capacitor

@UIApplicationMain
class AppDelegate: Deixei-o mais compacto:

```swift
import UIKit
import WebKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
 UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        NotificationCenter.default.addObserver(
            forName: .capacitorViewDidAppear,
            object: nil,
            queue: .main
        ) {    ) -> Bool {
        NotificationCenter.default.addObserver(
            forName: .capacitorViewDidAppear,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.configurarGestosDeNavegacao()
        }

        return true
    }

    private func configurarGestosDeNavegacao [weak self] _ in
            self?.configurarGestosDeNavegacao()
        }

        return true
    }

    private func configurarGestosDeNavegacao() {
        for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
            for window in scene.windows {
                guard let bridge = encontrarBridgeViewController(window.rootViewController),
                      let webView =() {
        for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
            for window in scene.windows {
                guard let bridge = encontrarBridgeViewController(window.rootViewController),
                      let webView = bridge.webView else {
                    continue
                }

                // Não usamos o histórico bridge.webView else {
                    continue
                }

                // Não usamos o histórico visual automático do WKWebView.
                web visual automático do WKWebView.
                webView.allowsBackForwardNavigationGestures = false

                adicionarGesto(
                    ao: webView,
                    nome: "View.allowsBackForwardNavigationGestures = false

                adicionarGesto(
                    ao: webView,
                    nome: "margot-edge-back",
                    margem: .left
                )

                adicionarGesto(
                    ao: webView,
                    nome: "margotmargot-edge-back",
                    margem: .left
                )

                adicionarGesto(
                    ao: webView,
                    nome: "margot-edge-forward",
                    margem: .right
                )
            }
        }
    }

    private func adicionarGesto(
        ao webView: WKWebView,
        nome: String,
        margem-edge-forward",
                    margem: .right
                )
            }
        }
    }

    private func adicionarGesto(
        ao webView: WKWebView,
        nome: String,
        margem: UIRectEdge
    ) {
        let jaExiste = webView.gestureRecognizers?.contains {
            $0: UIRectEdge
    ) {
        let jaExiste = webView.gestureRecognizers?.contains {
            $0.name == nome
        } ?? false

        if jaExiste { return }

        let gesto = UIScreenEdgePanGestureRecognizer(
            target: self,
            action:.name == nome
        } ?? false

        if jaExiste { return }

        let gesto = UIScreenEdgePanGestureRecognizer(
            target: self,
            action: #selector(tratarSwipeMargem(_:))
        )

        gesto.name = nome
        gesto.edges = margem
        gesto.minimumNumberOfTouches = 1
        gesto.maximumNumberOfTouches = 1

        // Quando #selector(tratarSwipeMargem(_:))
        )

        gesto.name = nome
        gesto.edges = margem
        gesto.minimumNumberOfTouches = 1
        gesto.maximumNumberOfTouches = 1

        // Quando o edge swipe é reconhecido,
        // cancela o toque enviado à página.
        gesto.cancels o edge swipe é reconhecido,
        // cancela o toque enviado à página.
        gesto.cancelsTouchesInView = true

        webView.addGestureRecognizer(gesto)

        // O swipe da margem tem prioridade sobre
       TouchesInView = true

        webView.addGestureRecognizer(gesto)

        // O swipe da margem tem prioridade sobre
        // o scroll horizontal/vertical da webview.
        webView.scrollView.panGestureRecognizer.require(
            toFail: gesto
        )
    // o scroll horizontal/vertical da webview.
        webView.scrollView.panGestureRecognizer.require(
            toFail: gesto
        )
    }

    @objc
    private func tratarSwipeMargem(
        _ gesto: UIScreenEdgePanGestureRecognizer
    ) {
        guard gesto.state == .ended,
              let }

    @objc
    private func tratarSwipeMargem(
        _ gesto: UIScreenEdgePanGestureRecognizer
    ) {
        guard gesto.state == .ended,
              let webView = gesto.view as? WKWebView else {
            return
        }

        let deslocament = gesto.translation(in: webView)
        let velocidade = webView = gesto.view as? WKWebView else {
            return
        }

        let deslocamento = gesto.translation(in: webView)
        let velocidade = gesto.velocity(in: webView)
        let esquerda = gesto.edges.contains(.left)

        let distanciaOK = esquerda
            ? deslocamento.x > 65 gesto.velocity(in: webView)
        let esquerda = gesto.edges.contains(.left)

        let distanciaOK = esquerda
            ? deslocamento.x > 65
            : deslocamento.x < -65

        let velocidadeOK = esquerda
            ? velocidade.x > 500
            : velocidade.x < -500

        guard distanciaOK || velocidadeOK
            : deslocamento.x < -65

        let velocidadeOK = esquerda
            ? velocidade.x > 500
            : velocidade.x < -500

        guard distanciaOK || velocidadeOK else {
            return
        }

        let navegacao = esquerda
            ? "history.back();"
            : else {
            return
        }

        let navegacao = esquerda
            ? "history.back();"
            : "history.forward();"

        let javascript = """
        (function () {
            if (
                document.body.classList.contains('margot-mini-menu-aberto') ||
 "history.forward();"

        let javascript = """
        (function () {
            if (
                document.body.classList.contains('margot-mini-menu-aberto') ||
                document.body.classList.contains('heys-abertos') ||
                document.querySelector('dialog[open], [aria-modal="true"]:not([hidden])')
            ) {
                return false;
                document.body.classList.contains('heys-abertos') ||
                document.querySelector('dialog[open], [aria-modal="true"]:not([hidden])')
            ) {
                return false;
            }

            \(navegacao)
            return true;
        })();
        """

        webView.evaluateJava            }

            \(navegacao)
            return true;
        })();
        """

        webView.evaluateJavaScript(javascript)
    }

    private func encontrarBridgeViewController(
        _ viewController: UIViewController?
    ) -> CAPBridgeViewController? {
        guard let viewController else { return nil }

Script(javascript)
    }

    private func encontrarBridgeViewController(
        _ viewController: UIViewController?
    ) -> CAPBridgeViewController? {
        guard let viewController else { return nil }

        if let bridge = viewController as? CAPBridgeViewController {
            return bridge
        }

        if let navigation = viewController as? UINavigationController {
            for controller in navigation.viewControllers        if let bridge = viewController as? CAPBridgeViewController {
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
            for controller {
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
 in tabs.viewControllers ?? [] {
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
    ) -> UIScene        )
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
        return configurationConfiguration {
        let configuration = UISceneConfiguration(
            name: "Default Configuration",
            sessionRole: connectingSceneSession.role
        )

        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}