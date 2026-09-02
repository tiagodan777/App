import UIKit
import WebKit
import Capacitor

class ViewController: CAPBridgeViewController {

    private var gestoVoltar: UIScreenEdgePanGestureRecognizer?
    private var gestoAvancar: UIScreenEdgePanGestureRecognizer?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        bridge?.registerPluginInstance(BackgroundLocationPlugin())

        configurarScrollNativo()
        configurarGestosNavegacao()
    }

    private func configurarScrollNativo() {
        guard let webView = webView else { return }

        let scrollView = webView.scrollView

        /*
         Permite o rubber banding nativo do iOS.
         */

        scrollView.bounces = true

        /*
         Faz com que exista bounce vertical mesmo quando,
         por alguma razão, a página não ultrapassa muito
         a altura visível do ecrã.
         */

        scrollView.alwaysBounceVertical = true

        /*
         Não queremos rubber banding horizontal no WebView,
         porque a Margot já tem os seus próprios swipes.
         */

        scrollView.alwaysBounceHorizontal = false

        /*
         Ajuda o iOS a distinguir movimentos principalmente
         verticais dos horizontais.
         */

        scrollView.isDirectionalLockEnabled = true
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

            webView.scrollView.panGestureRecognizer.require(
                toFail: gesto
            )

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

            webView.scrollView.panGestureRecognizer.require(
                toFail: gesto
            )

            gestoAvancar = gesto
        }
    }

    @objc private func tratarSwipe(
        _ gesto: UIScreenEdgePanGestureRecognizer
    ) {
        guard
            gesto.state == .ended,
            let webView = webView
        else {
            return
        }

        let distancia = gesto.translation(in: view)
        let velocidade = gesto.velocity(in: view)

        let voltar = gesto.edges == .left

        let distanciaOK = voltar
            ? distancia.x > 45
            : distancia.x < -45

        let velocidadeOK = voltar
            ? velocidade.x > 300
            : velocidade.x < -300

        guard distanciaOK || velocidadeOK else {
            return
        }

        let comando = voltar
            ? "history.back();"
            : "history.forward();"

        let javascript = """
        (function () {
            if (
                document.body.classList.contains(
                    'margot-mini-menu-aberto'
                )
            ) return false;

            if (
                document.body.classList.contains(
                    'heys-abertos'
                )
            ) return false;

            if (
                document.querySelector(
                    'dialog[open]'
                )
            ) return false;

            \(comando)

            return true;
        })();
        """

        webView.evaluateJavaScript(
            javascript,
            completionHandler: nil
        )
    }
}