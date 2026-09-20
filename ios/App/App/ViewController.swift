import Capacitor
import CoreHaptics
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

// Motor partilhado pelo JavaScript e pela câmara nativa. Usar na fila principal.
final class MargotHapticFeedback {
  static let shared = MargotHapticFeedback()
  private var engine: CHHapticEngine?
  private var player: CHHapticPatternPlayer?

  private init() {}

  func play(_ type: String) {
    guard UIApplication.shared.applicationState == .active else { return }

    guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else {
      fallback()
      return
    }

    do {
      if engine == nil {
        let created = try CHHapticEngine()
        created.playsHapticsOnly = true
        created.isAutoShutdownEnabled = true
        engine = created
      }

      guard let engine else { return }
      try engine.start()
      try? player?.stop(atTime: CHHapticTimeImmediate)

      let pattern = try CHHapticPattern(events: events(for: type), parameters: [])
      let next = try engine.makePlayer(with: pattern)
      player = next
      try next.start(atTime: CHHapticTimeImmediate)
    } catch {
      player = nil
      engine = nil
      fallback()
    }
  }

  private func events(for type: String) -> [CHHapticEvent] {
    let pulses: [(time: Double, duration: Double)]

    switch type {
    case "interaction": pulses = [(0, 0.10)]
    case "shutter": pulses = [(0, 0.14)]
    case "heySent": pulses = [(0, 0.12), (0.20, 0.12)]
    case "heyReceived": pulses = [(0, 0.14), (0.24, 0.24)]
    case "connection": pulses = [(0, 0.12), (0.22, 0.12), (0.44, 0.28)]
    default: pulses = [(0, 0.16), (0.26, 0.18)]
    }

    let parameters = [
      CHHapticEventParameter(parameterID: .hapticIntensity, value: 1),
      CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.8),
    ]

    return pulses.map { pulse in
      CHHapticEvent(
        eventType: .hapticContinuous,
        parameters: parameters,
        relativeTime: pulse.time,
        duration: pulse.duration
      )
    }
  }

  private func fallback() {
    UIImpactFeedbackGenerator(style: .heavy).impactOccurred(intensity: 1)
  }
}