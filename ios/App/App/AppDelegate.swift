import UIKit
import WebKit
import Capacitor

class ViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        // Mantém o plugin de localização exatamente como estava.
        bridge?.registerPluginInstance(BackgroundLocationPlugin())

        configurarGestosNavegacao()
    }

    private func configurarGestosNavegacao() {
        guard let webView = webView else { return }

        // Não usamos o gesto automático do WKWebView.
        webView.allowsBackForwardNavigationGestures = false

        let voltar = UIScreenEdgePanGestureRecognizer(
            target: self,
            action: #selector(tratarSwipe(_:))
        )
        voltar.edges = .left
        voltar.cancelsTouchesInView = true

        let avancar = UIScreenEdgePanGestureRecognizer(
            target: self,
            action: #selector(tratarSwipe(_:))
        )
        avancar.edges = .right
        avancar.cancelsTouchesInView = true

        webView.addGestureRecognizer(voltar)
        webView.addGestureRecognizer(avancar)

        /*
         * O scroll do WKWebView não pode roubar
         * um gesto que começou mesmo na margem.
         */
        webView.scrollView.panGestureRecognizer.require(toFail: voltar)
        webView.scrollView.panGestureRecognizer.require(toFail: avancar)
    }

    @objc private func tratarSwipe(
        _ gesto: UIScreenEdgePanGestureRecognizer
    ) {
        guard let webView = webView else { return }
        guard gesto.state == .ended else { return }

        let deslocamento = gesto.translation(in: webView)
        let velocidade = gesto.velocity(in: webView)
        let voltar = gesto.edges == .left

        let distanciaValida = voltar
            ? deslocamento.x > 55
            : deslocamento.x < -55

        let velocidadeValida = voltar
            ? velocidade.x > 400
            : velocidade.x < -400

        guard distanciaValida || velocidadeValida else {
            return
        }

        let comando = voltar
            ? "history.back();"
            : "history.forward();"

        let javascript = """
        (function () {
            if (document.body.classList.contains('margot-mini-menu-aberto')) return;
            if (document.body.classList.contains('heys-abertos')) return;
            if (document.querySelector('dialog[open]')) return;

            \(comando)
        })();
        """

        webView.evaluateJavaScript(
            javascript,
            completionHandler: nil
        )
    }
}