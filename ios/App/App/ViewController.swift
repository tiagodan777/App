import UIKit
import WebKit
import Capacitor

class ViewController: CAPBridgeViewController {

    private var gestoVoltar: UIScreenEdgePanGestureRecognizer?
    private var gestoAvancar: UIScreenEdgePanGestureRecognizer?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        bridge?.registerPluginInstance(BackgroundLocationPlugin())
        bridge?.registerPluginInstance(MargotHapticsPlugin())
        configurarGestosNavegacao()
    }

    private func configurarGestosNavegacao() {
        guard let webView = webView else { return }

        webView.allowsBackForwardNavigationGestures = false

        if gestoVoltar == nil {
            let gesto = UIScreenEdgePanGestureRecognizer(
                target: self,
                action: #selector(tratarSwipe(_:))
            )

            gesto.edges = .left
            gesto.minimumNumberOfTouches = 1
            gesto.maximumNumberOfTouches = 1
            gesto.cancelsTouchesInView = true

            view.addGestureRecognizer(gesto)
            webView.scrollView.panGestureRecognizer.require(toFail: gesto)

            gestoVoltar = gesto
        }

        if gestoAvancar == nil {
            let gesto = UIScreenEdgePanGestureRecognizer(
                target: self,
                action: #selector(tratarSwipe(_:))
            )

            gesto.edges = .right
            gesto.minimumNumberOfTouches = 1
            gesto.maximumNumberOfTouches = 1
            gesto.cancelsTouchesInView = true

            view.addGestureRecognizer(gesto)
            webView.scrollView.panGestureRecognizer.require(toFail: gesto)

            gestoAvancar = gesto
        }
    }

    @objc private func tratarSwipe(_ gesto: UIScreenEdgePanGestureRecognizer) {
        guard gesto.state == .ended, let webView = webView else { return }

        let distancia = gesto.translation(in: view)
        let velocidade = gesto.velocity(in: view)
        let voltar = gesto.edges == .left

        let distanciaOK = voltar
            ? distancia.x > 45
            : distancia.x < -45

        let velocidadeOK = voltar
            ? velocidade.x > 300
            : velocidade.x < -300

        guard distanciaOK || velocidadeOK else { return }

        let comando = voltar ? "history.back();" : "history.forward();"

        let javascript = """
        (function () {
            if (document.body.classList.contains('margot-mini-menu-aberto')) return false;
            if (document.body.classList.contains('heys-abertos')) return false;
            if (document.querySelector('dialog[open]')) return false;

            \(comando)
            return true;
        })();
        """

        webView.evaluateJavaScript(javascript, completionHandler: nil)
    }
}

@objc(MargotHapticsPlugin)
public final class MargotHapticsPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "MargotHapticsPlugin"
    public let jsName = "MargotHaptics"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise)
    ]

    @objc public func play(_ call: CAPPluginCall) {
        let type = call.getString("type") ?? "messageReceived"

        DispatchQueue.main.async { [weak self] in
            self?.playPattern(type)
            call.resolve()
        }
    }

    private func playPattern(_ type: String) {
        switch type {
        case "heySent":
            impact(.light, intensity: 0.65)

        case "heyReceived":
            impact(.rigid, intensity: 0.9)

            after(0.10) { [weak self] in
                self?.impact(.medium, intensity: 0.78)
            }

        case "connection":
            let generator = UINotificationFeedbackGenerator()

            generator.prepare()
            generator.notificationOccurred(.success)

            after(0.14) { [weak self] in
                self?.impact(.heavy, intensity: 0.82)
            }

        default:
            impact(.medium, intensity: 0.72)
        }
    }

    private func impact(
        _ style: UIImpactFeedbackGenerator.FeedbackStyle,
        intensity: CGFloat
    ) {
        let generator = UIImpactFeedbackGenerator(style: style)

        generator.prepare()

        if #available(iOS 13.0, *) {
            generator.impactOccurred(intensity: intensity)
        } else {
            generator.impactOccurred()
        }
    }

    private func after(
        _ delay: TimeInterval,
        action: @escaping () -> Void
    ) {
        DispatchQueue.main.asyncAfter(
            deadline: .now() + delay,
            execute: action
        )
    }
}