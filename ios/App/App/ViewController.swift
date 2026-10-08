import AudioToolbox
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
    bridge?.registerPluginInstance(MargotSharePlugin())
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

    bottomConstraint = webView.bottomAnchor.constraint(
      equalTo: container.bottomAnchor
    )

    keyboardConstraint = webView.bottomAnchor.constraint(
      equalTo: container.keyboardLayoutGuide.topAnchor
    )

    if #available(iOS 17.0, *) {
      container.keyboardLayoutGuide.usesBottomSafeArea = false
    }

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
      // Desativa primeiro a regra anterior: ao sair com o teclado aberto,
      // as duas âncoras têm alturas diferentes e não podem coexistir.
      if enabled {
        bottomConstraint?.isActive = false
        keyboardConstraint?.isActive = true
      } else {
        keyboardConstraint?.isActive = false
        bottomConstraint?.isActive = true
      }

      view.layoutIfNeeded()
    }
  }

  private func configurarGestosNavegacao() {
    guard let webView = webView else { return }

    webView.allowsLinkPreview = false
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

@objc(MargotSharePlugin)
public final class MargotSharePlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "MargotSharePlugin"
  public let jsName = "MargotShare"

  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise)
  ]

  private var presentingShare = false

  @objc public func share(_ call: CAPPluginCall) {
    guard let raw = call.getString("url"),
      let url = URL(string: raw), url.scheme == "https",
      url.host == "go.margot-app.com", url.user == nil, url.password == nil,
      url.port == nil, url.query == nil, url.fragment == nil,
      url.path.range(
        of: "^/invite/[a-f0-9]{16}$",
        options: .regularExpression
      ) != nil
    else {
      call.reject("Convite inválido.")
      return
    }

    DispatchQueue.main.async { [self] in
      guard !self.presentingShare,
        let presenter = self.bridge?.viewController,
        presenter.viewIfLoaded?.window != nil,
        presenter.presentedViewController == nil
      else {
        call.reject("Não foi possível abrir a partilha agora.")
        return
      }

      self.presentingShare = true

      let sheet = UIActivityViewController(
        activityItems: [url],
        applicationActivities: nil
      )

      if let popover = sheet.popoverPresentationController {
        popover.sourceView = presenter.view

        popover.sourceRect = CGRect(
          x: presenter.view.bounds.midX,
          y: presenter.view.bounds.midY,
          width: 1,
          height: 1
        )

        popover.permittedArrowDirections = []
      }

      sheet.completionWithItemsHandler = { [weak self] _, completed, _, error in
        self?.presentingShare = false

        if error != nil {
          call.reject("Não foi possível partilhar o convite.")
        } else {
          call.resolve(["cancelled": !completed])
        }
      }

      presenter.present(sheet, animated: true)
    }
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
    let profile = call.getString("profile")

    DispatchQueue.main.async {
      MargotHapticFeedback.shared.play(type, profile: profile)
      call.resolve()
    }
  }
}

// Perfis do registo; as restantes ações mantêm os seus toques atuais.
final class MargotHapticFeedback {
  static let shared = MargotHapticFeedback()

  private let impact = UIImpactFeedbackGenerator(style: .light)
  private let selection = UIImpactFeedbackGenerator(style: .medium)
  private let navigation = UIImpactFeedbackGenerator(style: .heavy)
  private let sentHey = UIImpactFeedbackGenerator(style: .medium)

  private init() {
    impact.prepare()
    selection.prepare()
    navigation.prepare()
    sentHey.prepare()
  }

  func play(_ type: String, profile: String? = nil) {
    guard UIApplication.shared.applicationState == .active else { return }

    guard ["interaction", "shutter", "heySent", "heyReceived", "messageReceived"].contains(type) else {
      return
    }

    if profile == "selection" && type == "interaction" {
      selection.impactOccurred(intensity: 0.66)
      selection.prepare()
      return
    }

    if profile == "navigation" && type == "heySent" {
      navigation.impactOccurred(intensity: 1.0)
      navigation.prepare()
      return
    }

    if type == "heyReceived" || type == "messageReceived" {
      // A mesma vibração de alerta para Heys e mensagens recebidos.
      AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
      return
    }

    if type == "heySent" {
      sentHey.impactOccurred(intensity: 1.0)
      sentHey.prepare()
      return
    }

    impact.impactOccurred(
      intensity: type == "shutter" ? 0.54 : 0.66
    )

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
      if #available(iOS 17.0, *),
        let controller = self.bridge?.viewController as? ViewController
      {
        controller.followKeyboard(call.getBool("enabled") ?? false)
        call.resolve(["nativeLayout": true])
      } else {
        call.resolve(["nativeLayout": false])
      }
    }
  }
}