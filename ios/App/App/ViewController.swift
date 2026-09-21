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
    configurarTeclado()
    bridge?.registerPluginInstance(MargotKeyboardPlugin())
    configurarGestosNavegacao()
  }

  private var keyboardConstraint: NSLayoutConstraint?
  private var bottomConstraint: NSLayoutConstraint?

  private func configurarTeclado() {
    guard let webView else { return }
    let container = UIView(frame: webView.frame)
    container.backgroundColor = .systemBackground
    view = container
    webView.translatesAutoresizingMaskIntoConstraints = false
    container.addSubview(webView)
    bottomConstraint = webView.bottomAnchor.constraint(equalTo: container.bottomAnchor)
    keyboardConstraint = webView.bottomAnchor.constraint(
      equalTo: container.keyboardLayoutGuide.topAnchor)
    if #available(iOS 17.0, *) { container.keyboardLayoutGuide.usesBottomSafeArea = false }
    NSLayoutConstraint.activate([
      webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
      webView.topAnchor.constraint(equalTo: container.topAnchor),
      bottomConstraint!,
    ])
  }

  func followKeyboard(_ enabled: Bool) {
    // O iOS 17 permite seguir o teclado até ao fundo, sem criar uma faixa de safe area.
    if #available(iOS 17.0, *) {
      bottomConstraint?.isActive = !enabled
      keyboardConstraint?.isActive = enabled
      view.layoutIfNeeded()
    }
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
      let gesto = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(tratarSwipe(_:)))
      gesto.edges = .left
      gesto.minimumNumberOfTouches = 1
      gesto.maximumNumberOfTouches = 1
      gesto.cancelsTouchesInView = true
      view.addGestureRecognizer(gesto)
      webView.scrollView.panGestureRecognizer.require(toFail: gesto)
      gestoVoltar = gesto
    }
    if gestoAvancar == nil {
      let gesto = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(tratarSwipe(_:)))
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

// Toques breves para ações explícitas. Heys usam o mesmo clique, com mais intensidade.
final class MargotHapticFeedback {
  static let shared = MargotHapticFeedback()
  private let impact = UIImpactFeedbackGenerator(style: .light)

  private init() { impact.prepare() }

  func play(_ type: String) {
    guard UIApplication.shared.applicationState == .active else { return }
    guard ["interaction", "shutter", "heySent", "heyReceived"].contains(type) else { return }
    let isHey = type == "heySent" || type == "heyReceived"
    impact.impactOccurred(intensity: isHey ? 1.0 : (type == "shutter" ? 0.45 : 0.55))
    impact.prepare()
  }
}

@objc(MargotKeyboardPlugin)
public final class MargotKeyboardPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "MargotKeyboardPlugin"
  public let jsName = "MargotKeyboard"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise)
  ]

  @objc public func configure(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      if #available(iOS 17.0, *), let controller = self.bridge?.viewController as? ViewController {
        controller.followKeyboard(call.getBool("enabled") ?? false)
        call.resolve(["nativeLayout": true])
      } else {
        call.resolve(["nativeLayout": false])
      }
    }
  }
}