import AVFoundation
import Capacitor
import UIKit
import PhotosUI

@objc(ChatCameraPlugin)
public final class ChatCameraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ChatCameraPlugin"
    public let jsName = "ChatCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    private var opening = false

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

                    guard let host = self.bridge?.viewController,
                          host.presentedViewController == nil else {
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
                            case .success(let value):
                                call.resolve(value)
                            case .failure(let error):
                                call.reject(error.localizedDescription)
                            }
                        }
                    }

                    host.present(camera, animated: true)
                }
            }
        }
    }
}

private final class ChatCameraController: UIViewController,
    AVCapturePhotoCaptureDelegate, PHPickerViewControllerDelegate {

    var completed: ((Result<[String: Any], Error>) -> Void)?

    private let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
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

        button(closeButton, symbol: "xmark", label: "Fechar", action: #selector(cancel))
        button(gallery, symbol: "photo.on.rectangle", label: "Galeria", action: #selector(leftAction))
        button(
            flip,
            symbol: "arrow.triangle.2.circlepath.camera",
            label: "Trocar câmara",
            action: #selector(switchCamera)
        )
        button(shutter, symbol: "circle.fill", label: "Tirar fotografia", action: #selector(capture))

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

        let focusTap = UITapGestureRecognizer(target: self, action: #selector(focus(_:)))
        focusTap.cancelsTouchesInView = false
        view.addGestureRecognizer(focusTap)

        observer = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.cancel()
        }

        sessionObserver = NotificationCenter.default.addObserver(
            forName: AVCaptureSession.runtimeErrorNotification,
            object: session,
            queue: .main
        ) { [weak self] _ in
            self?.fail("A câmara foi interrompida. Fecha e tenta novamente.")
        }

        queue.async {
            do {
                self.session.beginConfiguration()
                self.session.sessionPreset = .photo
                try self.setCamera(.back)

                guard self.session.canAddOutput(self.output) else {
                    throw self.cameraError("A captura não está disponível.")
                }

                self.session.addOutput(self.output)
                self.output.maxPhotoQualityPrioritization = .quality
                self.output.isHighResolutionCaptureEnabled = true
                self.session.commitConfiguration()
                self.session.startRunning()

                DispatchQueue.main.async {
                    self.preview.connection?.videoOrientation = .portrait
                    self.shutter.isEnabled = true
                    self.hint.text = "Toca na imagem para focar"
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
            x: 0,
            y: safe.top + 54,
            width: width,
            height: max(1, bottom - safe.top - 70)
        )

        picture.frame = preview.frame
        closeButton.frame = CGRect(x: 16, y: safe.top + 4, width: 44, height: 44)
        shutter.frame = CGRect(x: (width - 76) / 2, y: bottom, width: 76, height: 76)
        shutter.layer.cornerRadius = 38
        gallery.frame = CGRect(x: 30, y: bottom + 14, width: 48, height: 48)
        flip.frame = CGRect(x: width - 78, y: bottom + 14, width: 48, height: 48)
        hint.frame = CGRect(x: 20, y: bottom - 30, width: width - 40, height: 24)
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
        guard let device = AVCaptureDevice.default(
            .builtInWideAngleCamera,
            for: .video,
            position: position
        ) else {
            throw cameraError("Esta câmara não está disponível.")
        }

        let next = try AVCaptureDeviceInput(device: device)
        let previous = input

        if let previous {
            session.removeInput(previous)
        }

        guard session.canAddInput(next) else {
            if let previous {
                session.addInput(previous)
            }
            throw cameraError("Não foi possível trocar de câmara.")
        }

        session.addInput(next)
        input = next

        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }

        if device.isFocusModeSupported(.continuousAutoFocus) {
            device.focusMode = .continuousAutoFocus
        }

        if device.isExposureModeSupported(.continuousAutoExposure) {
            device.exposureMode = .continuousAutoExposure
        }

        if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
            device.whiteBalanceMode = .continuousAutoWhiteBalance
        }
    }

    @objc private func switchCamera() {
        guard photoData == nil, shutter.isEnabled else { return }

        shutter.isEnabled = false

        queue.async {
            self.session.beginConfiguration()

            do {
                try self.setCamera(self.input?.device.position == .back ? .front : .back)
                self.session.commitConfiguration()

                DispatchQueue.main.async {
                    self.preview.connection?.videoOrientation = .portrait
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

        guard photoData == nil, preview.frame.contains(point) else { return }

        let localPoint = CGPoint(
            x: point.x - preview.frame.minX,
            y: point.y - preview.frame.minY
        )
        let target = preview.captureDevicePointConverted(fromLayerPoint: localPoint)

        queue.async {
            guard let device = self.input?.device else { return }

            do {
                try device.lockForConfiguration()
                defer { device.unlockForConfiguration() }

                if device.isFocusPointOfInterestSupported,
                   device.isFocusModeSupported(.autoFocus) {
                    device.focusPointOfInterest = target
                    device.focusMode = .autoFocus
                }

                if device.isExposurePointOfInterestSupported,
                   device.isExposureModeSupported(.continuousAutoExposure) {
                    device.exposurePointOfInterest = target
                    device.exposureMode = .continuousAutoExposure
                }
            } catch {
                DispatchQueue.main.async {
                    self.hint.text = "Não foi possível ajustar o foco."
                }
            }
        }
    }

    @objc private func capture() {
        if let photoData {
            finish(.success([
                "base64": photoData.base64EncodedString(),
                "mimeType": "image/jpeg"
            ]))
            return
        }

        shutter.isEnabled = false
        flip.isEnabled = false
        gallery.isEnabled = false
        hint.text = "A captar fotografia…"

        queue.async {
            let settings = AVCapturePhotoSettings(format: [
                AVVideoCodecKey: AVVideoCodecType.jpeg
            ])
            settings.photoQualityPrioritization = .quality
            settings.isHighResolutionPhotoEnabled = true

            self.output.connection(with: .video)?.videoOrientation = .portrait
            self.output.capturePhoto(with: settings, delegate: self)
        }
    }

    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        guard error == nil,
              let data = photo.fileDataRepresentation(),
              let image = UIImage(data: data) else {
            DispatchQueue.main.async {
                self.fail("Não foi possível captar a fotografia.")
            }
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
            DispatchQueue.main.async {
                self.fail("Não foi possível preparar a fotografia.")
            }
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
            self.hint.text = "Repetir ou usar fotografia"
        }
    }

    @objc private func leftAction() {
        guard photoData != nil else {
            var configuration = PHPickerConfiguration()
            configuration.filter = .images
            configuration.selectionLimit = 1

            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self
            present(picker, animated: true)
            return
        }

        photoData = nil
        picture.image = nil
        picture.isHidden = true
        shutter.isEnabled = false

        shutter.setImage(UIImage(systemName: "circle.fill"), for: .normal)
        shutter.accessibilityLabel = "Tirar fotografia"
        gallery.setImage(UIImage(systemName: "photo.on.rectangle"), for: .normal)
        gallery.accessibilityLabel = "Galeria"

        flip.isHidden = false
        flip.isEnabled = true
        hint.text = "Toca na imagem para focar"

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

            provider.loadObject(ofClass: UIImage.self) { object, error in
                guard error == nil, let image = object as? UIImage else {
                    DispatchQueue.main.async {
                        self.fail("Não foi possível abrir a fotografia.")
                    }
                    return
                }

                self.preparePhoto(image)
            }
        }
    }

    @objc private func cancel() {
        finish(.success(["cancelled": true]))
    }

    private func cameraError(_ message: String) -> NSError {
        NSError(
            domain: "MargotCamera",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }

    private func fail(_ message: String) {
        finish(.failure(cameraError(message)))
    }

    private func finish(_ result: Result<[String: Any], Error>) {
        guard !finished else { return }

        finished = true

        if let observer {
            NotificationCenter.default.removeObserver(observer)
        }

        if let sessionObserver {
            NotificationCenter.default.removeObserver(sessionObserver)
        }

        queue.async { self.session.stopRunning() }

        let callback = completed
        completed = nil
        callback?(result)
    }
}