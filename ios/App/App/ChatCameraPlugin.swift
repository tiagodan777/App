import AVFoundation
import AVKit
import Capacitor
import PhotosUI
import UIKit
import UniformTypeIdentifiers

@objc(ChatCameraPlugin)
public final class ChatCameraPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "ChatCameraPlugin"
  public let jsName = "ChatCamera"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "readChunk", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "release", returnType: CAPPluginReturnPromise),
  ]
  private var opening = false
  private var clips: [String: URL] = [:]
  private let files = DispatchQueue(label: "com.margot.camera.files")

  @objc public func readChunk(_ call: CAPPluginCall) {
    let id = call.getString("id") ?? ""
    let offset = call.getInt("offset") ?? -1
    files.async {
      guard let url = self.clips[id], offset >= 0 else {
        call.reject("O vídeo já não está disponível.")
        return
      }
      do {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(offset))
        let data = try handle.read(upToCount: 512 * 1024) ?? Data()
        call.resolve(["base64": data.base64EncodedString()])
      } catch { call.reject("Não foi possível ler o vídeo.") }
    }
  }

  @objc public func release(_ call: CAPPluginCall) {
    let id = call.getString("id") ?? ""
    files.async {
      if let url = self.clips.removeValue(forKey: id) {
        try? FileManager.default.removeItem(at: url)
      }
      call.resolve()
    }
  }

  @objc public func open(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      guard !self.opening else {
        call.reject("A câmara já está aberta.")
        return
      }
      self.opening = true
      AVCaptureDevice.requestAccess(for: .video) { allowed in
        DispatchQueue.main.async {
          guard allowed else {
            self.opening = false
            call.reject("Permite o acesso à câmara nas definições do iPhone.")
            return
          }
          guard let host = self.bridge?.viewController, host.presentedViewController == nil else {
            self.opening = false
            call.reject("Não foi possível abrir a câmara neste momento.")
            return
          }
          let camera = ChatCameraController()
          camera.modalPresentationStyle = .fullScreen
          camera.completed = { result in
            camera.dismiss(animated: true) {
              self.opening = false
              switch result {
              case .success(var value):
                if let path = value.removeValue(forKey: "fileURL") as? String {
                  let id = UUID().uuidString
                  let url = URL(fileURLWithPath: path)
                  self.files.async {
                    self.clips[id] = url
                    let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                    call.resolve(["id": id, "size": size, "mimeType": "video/mp4"])
                  }
                } else {
                  call.resolve(value)
                }
              case .failure(let error): call.reject(error.localizedDescription)
              }
            }
          }
          host.present(camera, animated: true)
        }
      }
    }
  }
}

private final class ChatCameraController: UIViewController, AVCapturePhotoCaptureDelegate,
  PHPickerViewControllerDelegate, AVCaptureFileOutputRecordingDelegate
{
  var completed: ((Result<[String: Any], Error>) -> Void)?
  private let session = AVCaptureSession()
  private let output = AVCapturePhotoOutput()
  private let movie = AVCaptureMovieFileOutput()
  private var holding = false
  private var recording = false
  private var preparing = false
  private var pressY: CGFloat = 0
  private var pressZoom: CGFloat = 1
  private var videoURL: URL?
  private var exporter: AVAssetExportSession?
  private let player = AVPlayerViewController()
  private var timer: Timer?
  private var recordingStarted = Date()
  private let queue = DispatchQueue(label: "com.margot.camera", qos: .userInitiated)
  private var input: AVCaptureDeviceInput?
  private var finished = false
  private var photoData: Data?
  private var preview: AVCaptureVideoPreviewLayer!
  private let picture = UIImageView()
  private let shutter = UIButton(type: .system)
  private let flip = UIButton(type: .system)
  private let gallery = UIButton(type: .system)
  private let closeButton = UIButton(type: .system)
  private let hint = UILabel()
  private let photoMode = UISegmentedControl(items: ["Manter", "Ver uma vez"])
  private var observer: NSObjectProtocol?
  private var sessionObserver: NSObjectProtocol?

  override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
  override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    preview = AVCaptureVideoPreviewLayer(session: session)
    preview.videoGravity = .resizeAspect
    view.layer.addSublayer(preview)
    picture.contentMode = .scaleAspectFit
    picture.isHidden = true
    view.addSubview(picture)
    addChild(player)
    view.addSubview(player.view)
    player.didMove(toParent: self)
    player.view.isHidden = true
    player.videoGravity = .resizeAspect
    button(closeButton, symbol: "xmark", label: "Fechar", action: #selector(cancel))
    button(gallery, symbol: "photo.on.rectangle", label: "Galeria", action: #selector(leftAction))
    button(
      flip, symbol: "arrow.triangle.2.circlepath.camera", label: "Trocar câmara",
      action: #selector(switchCamera))
    button(shutter, symbol: "circle.fill", label: "Tirar fotografia", action: #selector(capture))
    let hold = UILongPressGestureRecognizer(target: self, action: #selector(holdShutter(_:)))
    hold.minimumPressDuration = 0.25
    hold.allowableMovement = .greatestFiniteMagnitude
    shutter.addGestureRecognizer(hold)
    shutter.accessibilityHint =
      "Toca para fotografar. Mantém premido para vídeo e desliza para ajustar o zoom."
    shutter.accessibilityCustomActions = [
      UIAccessibilityCustomAction(
        name: "Gravar vídeo", target: self, selector: #selector(accessibleVideo))
    ]
    shutter.backgroundColor = .white
    shutter.tintColor = .black
    shutter.layer.borderColor = UIColor.gray.cgColor
    shutter.layer.borderWidth = 4
    shutter.isEnabled = false
    hint.text = "A abrir câmara…"
    hint.textColor = .white
    hint.font = .systemFont(ofSize: 13, weight: .medium)
    hint.textAlignment = .center
    view.addSubview(hint)
    photoMode.selectedSegmentIndex = 0
    photoMode.isHidden = true
    photoMode.backgroundColor = UIColor(white: 0.15, alpha: 1)
    photoMode.selectedSegmentTintColor = .white
    photoMode.setTitleTextAttributes([.foregroundColor: UIColor.white], for: .normal)
    photoMode.setTitleTextAttributes([.foregroundColor: UIColor.black], for: .selected)
    photoMode.accessibilityLabel = "Disponibilidade da fotografia"
    view.addSubview(photoMode)
    let focusTap = UITapGestureRecognizer(target: self, action: #selector(focus(_:)))
    focusTap.cancelsTouchesInView = false
    view.addGestureRecognizer(focusTap)
    observer = NotificationCenter.default.addObserver(
      forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
    ) { [weak self] _ in
      self?.cancel()
    }
    sessionObserver = NotificationCenter.default.addObserver(
      forName: AVCaptureSession.runtimeErrorNotification, object: session, queue: .main
    ) { [weak self] _ in
      self?.fail("A câmara foi interrompida. Fecha e tenta novamente.")
    }
    queue.async {
      do {
        self.session.beginConfiguration()
        self.session.sessionPreset = .high
        try self.setCamera(.back)
        guard self.session.canAddOutput(self.output) else {
          throw self.cameraError("A captura não está disponível.")
        }
        self.session.addOutput(self.output)
        guard self.session.canAddOutput(self.movie) else {
          throw self.cameraError("O vídeo não está disponível.")
        }
        self.session.addOutput(self.movie)
        self.movie.maxRecordedDuration = CMTime(seconds: 60, preferredTimescale: 600)
        self.movie.maxRecordedFileSize = 95 * 1024 * 1024
        if let connection = self.movie.connection(with: .video),
          self.movie.availableVideoCodecTypes.contains(.h264)
        {
          self.movie.setOutputSettings([AVVideoCodecKey: AVVideoCodecType.h264], for: connection)
        }
        self.output.maxPhotoQualityPrioritization = .quality
        self.output.isHighResolutionCaptureEnabled = true
        self.session.commitConfiguration()
        self.session.startRunning()
        DispatchQueue.main.async {
          self.orientConnections()
          self.shutter.isEnabled = true
          self.hint.text = "Toque: foto · Manter: vídeo · Deslizar: zoom"
        }
      } catch {
        self.session.commitConfiguration()
        DispatchQueue.main.async { self.finish(.failure(error)) }
      }
    }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    let safe = view.safeAreaInsets
    let width = view.bounds.width
    let bottom = view.bounds.height - safe.bottom - 96
    preview.frame = CGRect(
      x: 0, y: safe.top + 54, width: width, height: max(1, bottom - safe.top - 70))
    picture.frame = preview.frame
    player.view.frame = preview.frame
    closeButton.frame = CGRect(x: 16, y: safe.top + 4, width: 44, height: 44)
    shutter.frame = CGRect(x: (width - 76) / 2, y: bottom, width: 76, height: 76)
    shutter.layer.cornerRadius = 38
    gallery.frame = CGRect(x: 30, y: bottom + 14, width: 48, height: 48)
    flip.frame = CGRect(x: width - 78, y: bottom + 14, width: 48, height: 48)
    hint.frame = CGRect(x: 20, y: bottom - 30, width: width - 40, height: 24)
    let modeWidth = min(width - 48, 320)
    photoMode.frame = CGRect(
      x: (width - modeWidth) / 2, y: bottom - 48, width: modeWidth, height: 36)
  }

  private func button(_ button: UIButton, symbol: String, label: String, action: Selector) {
    button.setImage(UIImage(systemName: symbol), for: .normal)
    button.tintColor = .white
    button.backgroundColor = UIColor(white: 0.15, alpha: 1)
    button.layer.cornerRadius = 24
    button.accessibilityLabel = label
    button.addTarget(self, action: action, for: .touchUpInside)
    view.addSubview(button)
  }

  // Apenas esta fila configura a sessão e o dispositivo.
  private func setCamera(_ position: AVCaptureDevice.Position) throws {
    guard
      let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)
    else {
      throw cameraError("Esta câmara não está disponível.")
    }
    let next = try AVCaptureDeviceInput(device: device)
    let previous = input
    if let previous { session.removeInput(previous) }
    guard session.canAddInput(next) else {
      if let previous { session.addInput(previous) }
      throw cameraError("Não foi possível trocar de câmara.")
    }
    session.addInput(next)
    input = next
    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }
    if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
    if device.isExposureModeSupported(.continuousAutoExposure) {
      device.exposureMode = .continuousAutoExposure
    }
    if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
      device.whiteBalanceMode = .continuousAutoWhiteBalance
    }
  }

  private func orientConnections() {
    for connection in [
      preview.connection, output.connection(with: .video), movie.connection(with: .video),
    ] {
      connection?.videoOrientation = .portrait
      if connection?.isVideoMirroringSupported == true {
        connection?.automaticallyAdjustsVideoMirroring = false
        connection?.isVideoMirrored = input?.device.position == .front
      }
    }
  }

  @objc private func switchCamera() {
    guard photoData == nil, videoURL == nil, !recording, !preparing, shutter.isEnabled else {
      return
    }
    shutter.isEnabled = false
    queue.async {
      self.session.beginConfiguration()
      do {
        try self.setCamera(self.input?.device.position == .back ? .front : .back)
        self.session.commitConfiguration()
        DispatchQueue.main.async {
          self.orientConnections()
          self.shutter.isEnabled = true
        }
      } catch {
        self.session.commitConfiguration()
        DispatchQueue.main.async { self.finish(.failure(error)) }
      }
    }
  }

  @objc private func focus(_ gesture: UITapGestureRecognizer) {
    let point = gesture.location(in: view)
    guard photoData == nil, videoURL == nil, !preparing, preview.frame.contains(point) else {
      return
    }
    let localPoint = CGPoint(x: point.x - preview.frame.minX, y: point.y - preview.frame.minY)
    let target = preview.captureDevicePointConverted(fromLayerPoint: localPoint)
    queue.async {
      guard let device = self.input?.device else { return }
      do {
        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }
        if device.isFocusPointOfInterestSupported, device.isFocusModeSupported(.autoFocus) {
          device.focusPointOfInterest = target
          device.focusMode = .autoFocus
        }
        if device.isExposurePointOfInterestSupported,
          device.isExposureModeSupported(.continuousAutoExposure)
        {
          device.exposurePointOfInterest = target
          device.exposureMode = .continuousAutoExposure
        }
      } catch {
        DispatchQueue.main.async { self.hint.text = "Não foi possível ajustar o foco." }
      }
    }
  }

  @objc private func capture() {
    if recording {
      stopVideo()
      return
    }
    if let videoURL {
      player.player?.pause()
      self.videoURL = nil
      finish(.success(["fileURL": videoURL.path, "mimeType": "video/mp4"]))
      return
    }
    guard !preparing else { return }
    if let photoData {
      finish(
        .success([
          "base64": photoData.base64EncodedString(), "mimeType": "image/jpeg",
          "viewOnce": photoMode.selectedSegmentIndex == 1,
        ]))
      return
    }
    MargotHapticFeedback.shared.play("shutter")
    shutter.isEnabled = false
    flip.isEnabled = false
    gallery.isEnabled = false
    hint.text = "A captar fotografia…"
    queue.async {
      let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
      settings.photoQualityPrioritization = .quality
      settings.isHighResolutionPhotoEnabled = true
      self.output.connection(with: .video)?.videoOrientation = .portrait
      self.output.capturePhoto(with: settings, delegate: self)
    }
  }

  @objc private func holdShutter(_ gesture: UILongPressGestureRecognizer) {
    switch gesture.state {
    case .began:
      guard photoData == nil, videoURL == nil, !preparing, !recording else { return }
      holding = true
      pressY = gesture.location(in: view).y
      pressZoom = input?.device.videoZoomFactor ?? 1
      beginVideo()
    case .changed:
      guard holding else { return }
      let delta = (pressY - gesture.location(in: view).y) / 120
      let target = pressZoom * pow(2, delta)
      queue.async {
        guard let device = self.input?.device else { return }
        do {
          try device.lockForConfiguration()
          defer { device.unlockForConfiguration() }
          device.ramp(
            toVideoZoomFactor: min(max(target, 1), min(6, device.maxAvailableVideoZoomFactor)),
            withRate: 8)
        } catch {}
      }
    case .ended, .cancelled, .failed:
      holding = false
      stopVideo()
    default: break
    }
  }

  @objc private func accessibleVideo() -> Bool {
    guard photoData == nil, videoURL == nil, !preparing else { return false }
    if recording {
      holding = false
      stopVideo()
    } else {
      holding = true
      beginVideo()
    }
    return true
  }

  private func beginVideo() {
    preparing = true
    hint.text = "A preparar vídeo…"
    AVCaptureDevice.requestAccess(for: .audio) { allowed in
      DispatchQueue.main.async {
        guard !self.finished else { return }
        guard allowed, self.holding else {
          self.preparing = false
          self.hint.text =
            allowed
            ? "Mantém premido para gravar" : "Permite o microfone nas Definições para gravar vídeo."
          return
        }
        self.gallery.isEnabled = false
        self.flip.isEnabled = false
        self.queue.async {
          do {
            if !self.session.inputs.contains(where: {
              ($0 as? AVCaptureDeviceInput)?.device.hasMediaType(.audio) == true
            }) {
              guard let microphone = AVCaptureDevice.default(for: .audio) else {
                throw self.cameraError("Microfone indisponível.")
              }
              let audio = try AVCaptureDeviceInput(device: microphone)
              self.session.beginConfiguration()
              let allowed = self.session.canAddInput(audio)
              if allowed { self.session.addInput(audio) }
              self.session.commitConfiguration()
              guard allowed else { throw self.cameraError("Não foi possível ligar o microfone.") }
            }
            DispatchQueue.main.async {
              self.preparing = false
              guard !self.finished, self.holding else {
                self.queue.async { self.removeMicrophone() }
                self.gallery.isEnabled = true
                self.flip.isEnabled = true
                self.hint.text = "Mantém premido para gravar"
                return
              }
              self.orientConnections()
              self.recording = true
              self.shutter.tintColor = .systemRed
              self.shutter.accessibilityLabel = "Parar vídeo"
              let url = self.temporaryURL("mov")
              self.queue.async { self.movie.startRecording(to: url, recordingDelegate: self) }
            }
          } catch {
            DispatchQueue.main.async { self.fail(error.localizedDescription) }
          }
        }
      }
    }
  }

  private func stopVideo() {
    holding = false
    guard recording else { return }
    hint.text = "A preparar vídeo…"
    shutter.isEnabled = false
    queue.async { if self.movie.isRecording { self.movie.stopRecording() } }
  }

  func fileOutput(
    _ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL,
    from connections: [AVCaptureConnection]
  ) {
    DispatchQueue.main.async {
      guard !self.finished else {
        self.queue.async { self.movie.stopRecording() }
        return
      }
      self.recordingStarted = Date()
      self.hint.text = "● 0:00 · Desliza para ajustar o zoom"
      self.timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) {
        [weak self = self] _ in
        guard let self else { return }
        let seconds = Int(Date().timeIntervalSince(self.recordingStarted))
        self.hint.text = String(
          format: "● %d:%02d · Desliza para ajustar o zoom", seconds / 60, seconds % 60)
      }
      if !self.holding { self.stopVideo() }
    }
  }

  func fileOutput(
    _ output: AVCaptureFileOutput, didFinishRecordingTo fileURL: URL,
    from connections: [AVCaptureConnection], error: Error?
  ) {
    DispatchQueue.main.async {
      self.timer?.invalidate()
      self.timer = nil
      self.recording = false
      self.holding = false
      self.shutter.tintColor = .black
      if self.finished {
        try? FileManager.default.removeItem(at: fileURL)
        return
      }
      let saved =
        (error as NSError?)?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool ?? false
      if error != nil && !saved {
        try? FileManager.default.removeItem(at: fileURL)
        self.fail("Não foi possível gravar o vídeo.")
        return
      }
      self.prepareVideo(fileURL)
    }
  }

  private func temporaryURL(_ ext: String) -> URL {
    FileManager.default.temporaryDirectory.appendingPathComponent("margot-" + UUID().uuidString)
      .appendingPathExtension(ext)
  }

  private func removeMicrophone() {
    session.beginConfiguration()
    for input in session.inputs
    where (input as? AVCaptureDeviceInput)?.device.hasMediaType(.audio) == true {
      session.removeInput(input)
    }
    session.commitConfiguration()
  }

  private func prepareVideo(_ source: URL) {
    preparing = true
    shutter.isEnabled = false
    gallery.isEnabled = false
    flip.isEnabled = false
    hint.text = "A preparar vídeo…"
    queue.async {
      self.session.stopRunning()
      self.removeMicrophone()
    }
    let destination = temporaryURL("mp4")
    guard
      let export = AVAssetExportSession(
        asset: AVURLAsset(url: source), presetName: AVAssetExportPreset1280x720)
    else {
      try? FileManager.default.removeItem(at: source)
      fail("Não foi possível preparar o vídeo.")
      return
    }
    exporter = export
    export.outputURL = destination
    export.outputFileType = .mp4
    export.shouldOptimizeForNetworkUse = true
    export.exportAsynchronously {
      try? FileManager.default.removeItem(at: source)
      DispatchQueue.main.async {
        self.exporter = nil
        self.preparing = false
        guard !self.finished, export.status == .completed else {
          try? FileManager.default.removeItem(at: destination)
          if !self.finished { self.fail("Não foi possível preparar o vídeo.") }
          return
        }
        self.videoURL = destination
        self.player.player = AVPlayer(url: destination)
        self.player.view.isHidden = false
        self.player.player?.play()
        self.photoMode.isHidden = true
        self.hint.isHidden = true
        self.showConfirmation()
      }
    }
  }

  private func showConfirmation() {
    shutter.setImage(UIImage(systemName: "checkmark"), for: .normal)
    shutter.accessibilityLabel = videoURL == nil ? "Usar fotografia" : "Usar vídeo"
    shutter.isEnabled = true
    gallery.setImage(UIImage(systemName: "arrow.counterclockwise"), for: .normal)
    gallery.accessibilityLabel = "Repetir"
    gallery.isEnabled = true
    flip.isHidden = true
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?
  ) {
    guard error == nil, let data = photo.fileDataRepresentation(), let image = UIImage(data: data)
    else {
      DispatchQueue.main.async { self.fail("Não foi possível captar a fotografia.") }
      return
    }
    preparePhoto(image)
  }

  private func preparePhoto(_ image: UIImage) {
    // Normaliza orientação e tamanho depois do processamento fotográfico do iOS.
    let scale = min(1, 2400 / max(image.size.width, image.size.height))
    let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: size))
    }
    guard let jpeg = resized.jpegData(compressionQuality: 0.9) else {
      DispatchQueue.main.async { self.fail("Não foi possível preparar a fotografia.") }
      return
    }
    queue.async { self.session.stopRunning() }
    DispatchQueue.main.async {
      guard !self.finished else { return }
      self.photoData = jpeg
      self.picture.image = resized
      self.picture.isHidden = false
      self.shutter.setImage(UIImage(systemName: "checkmark"), for: .normal)
      self.shutter.accessibilityLabel = "Usar fotografia"
      self.shutter.isEnabled = true
      self.gallery.setImage(UIImage(systemName: "arrow.counterclockwise"), for: .normal)
      self.gallery.accessibilityLabel = "Repetir fotografia"
      self.gallery.isEnabled = true
      self.flip.isHidden = true
      self.hint.isHidden = true
      self.photoMode.selectedSegmentIndex = 0
      self.photoMode.isHidden = false
    }
  }

  @objc private func leftAction() {
    guard photoData != nil || videoURL != nil else {
      var configuration = PHPickerConfiguration()
      configuration.filter = .any(of: [.images, .videos])
      configuration.selectionLimit = 1
      let picker = PHPickerViewController(configuration: configuration)
      picker.delegate = self
      present(picker, animated: true)
      return
    }
    player.player?.pause()
    player.player = nil
    player.view.isHidden = true
    if let videoURL { try? FileManager.default.removeItem(at: videoURL) }
    videoURL = nil
    photoData = nil
    photoMode.isHidden = true
    hint.isHidden = false
    picture.image = nil
    picture.isHidden = true
    shutter.isEnabled = false
    shutter.setImage(UIImage(systemName: "circle.fill"), for: .normal)
    shutter.accessibilityLabel = "Tirar fotografia"
    gallery.setImage(UIImage(systemName: "photo.on.rectangle"), for: .normal)
    gallery.accessibilityLabel = "Galeria"
    flip.isHidden = false
    flip.isEnabled = true
    hint.text = "Toque: foto · Manter: vídeo · Deslizar: zoom"
    queue.async {
      self.session.startRunning()
      DispatchQueue.main.async { self.shutter.isEnabled = true }
    }
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true) {
      guard let provider = results.first?.itemProvider else { return }
      self.shutter.isEnabled = false
      self.gallery.isEnabled = false
      self.flip.isEnabled = false
      if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
        self.hint.text = "A abrir vídeo…"
        provider.loadFileRepresentation(forTypeIdentifier: UTType.movie.identifier) { url, error in
          guard let url, error == nil else {
            DispatchQueue.main.async { self.fail("Não foi possível abrir o vídeo.") }
            return
          }
          let copy = self.temporaryURL(url.pathExtension)
          do {
            try FileManager.default.copyItem(at: url, to: copy)
            DispatchQueue.main.async {
              if self.finished {
                try? FileManager.default.removeItem(at: copy)
              } else {
                self.prepareVideo(copy)
              }
            }
          } catch {
            DispatchQueue.main.async { self.fail("Não foi possível abrir o vídeo.") }
          }
        }
        return
      }
      provider.loadObject(ofClass: UIImage.self) { object, error in
        guard error == nil, let image = object as? UIImage else {
          DispatchQueue.main.async { self.fail("Não foi possível abrir a fotografia.") }
          return
        }
        self.preparePhoto(image)
      }
    }
  }

  @objc private func cancel() { finish(.success(["cancelled": true])) }

  private func cameraError(_ message: String) -> NSError {
    NSError(domain: "MargotCamera", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }

  private func fail(_ message: String) { finish(.failure(cameraError(message))) }

  private func finish(_ result: Result<[String: Any], Error>) {
    guard !finished else { return }
    finished = true
    holding = false
    timer?.invalidate()
    timer = nil
    exporter?.cancelExport()
    player.player?.pause()
    if let videoURL { try? FileManager.default.removeItem(at: videoURL) }
    queue.async { if self.movie.isRecording { self.movie.stopRecording() } }
    if let observer { NotificationCenter.default.removeObserver(observer) }
    if let sessionObserver { NotificationCenter.default.removeObserver(sessionObserver) }
    queue.async { self.session.stopRunning() }
    let callback = completed
    completed = nil
    callback?(result)
  }
}