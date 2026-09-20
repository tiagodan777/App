import Capacitor
import UIKit
import WebKit

class ViewController: CAPBridgeViewController {
  private var gestoVoltar: UIScreenEdgePanGestureRecognizer?
  private var gestoAvancar: UIScreenEdgePanGestureRecognizer?

  override func capacitorDidLoad() {
    super.capacitorDidLoad()
    bridge?.registerPluginInstance(BackgroundLocationPlugin())
    bridge?.registerPluginInstance(MargotHapticsPlugin())
    bridge?.registerPluginInstance(ChatCameraPlugin())
    configurarGestosNavegacao()
  }

  private func configurarGestosNavegacao() {
    guard let webView = webView else { return }

    webView.allowsBackForwardNavigationGestures = false
    webView.scrollView.contentInsetAdjustmentBehavior = .never

    if #available(iOS 26.0, *) {
      webView.scrollView.topEdgeEffect.isHidden = true
      webView.scrollView.bottomEdgeEffect.isHidden = true
    }

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
    let distanciaOK = voltar ? distancia.x > 45 : distancia.x < -45
    let velocidadeOK = voltar ? velocidade.x > 300 : velocidade.x < -300

    guard distanciaOK || velocidadeOK else { return }

    let comando = voltar ? "history.back();" : "history.forward();"
    let javascript = """
      (function () {
          if (document.body.classList.contains('margot-mini-menu-aberto')) return false;
          if (document.body.classList.contains('heys-abertos')) return false;
          if (document.querySelector('dialog[open]')) return false;
          if (document.body.classList.contains('perfil-modal-aberta')) return false;
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

    DispatchQueue.main.async {
      MargotHapticFeedback.shared.play(type)
      call.resolve()
    }
  }
}

// Toques breves para ações explícitas.
// Notificações em primeiro plano ficam silenciosas.
final class MargotHapticFeedback {
  static let shared = MargotHapticFeedback()
  private let impact = UIImpactFeedbackGenerator(style: .light)

  private init() {
    impact.prepare()
  }

  func play(_ type: String) {
    guard UIApplication.shared.applicationState == .active else { return }
    guard ["interaction", "shutter", "heySent"].contains(type) else { return }

    impact.impactOccurred(intensity: type == "shutter" ? 0.45 : 0.55)
    impact.prepare()
  }
}