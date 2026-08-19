import Capacitor
import CoreLocation
import Foundation
import Network
import Security
import UIKit

@objc(BackgroundLocationPlugin)
public final class BackgroundLocationPlugin: CAPPlugin, CAPBridgedPlugin,
    CLLocationManagerDelegate {

    public let identifier = "BackgroundLocationPlugin"
    public let jsName = "BackgroundLocation"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVisibility", returnType: CAPPluginReturnPromise)
    ]

    private let endpoint = URL(
        string: "https://margot-app.com/background-location-update/"
    )!

    private let keychainService = "com.margot.background-location"
    private let keychainAccount = "background-token"

    private let pendingLocationKey =
        "margot.background-location.pending"

    private let visibilityKey =
        "margot.background-location.visible"

    /*
     * O Core Location fica livre para entregar atualizações mesmo
     * quando o utilizador está parado.
     *
     * A Margot continua a limitar os envios ao servidor a:
     * - no máximo 1 por minuto;
     * - ou depois de movimento relevante;
     * - ou quando a rede regressa;
     * - ou quando a visibilidade muda.
     */
    private let minimumSendInterval: TimeInterval = 60
    private let minimumMovement: CLLocationDistance = 20

    private let retryDelays: [TimeInterval] = [
        5,
        15,
        30,
        60,
        120
    ]

    private var manager: CLLocationManager!

    private var monitoring = false
    private var sending = false
    private var presenceVisible = true

    private var latestLocation: CLLocation?
    private var pendingLocation: CLLocation?
    private var retryLocation: CLLocation?

    private var hiddenSyncPending = false
    private var retryHidden = false

    private var retryAttempt = 0
    private var retryWorkItem: DispatchWorkItem?

    private var lastSentAt =
        Date.distantPast

    private var lastSentLocation:
        CLLocation?

    private var pendingStartCall:
        CAPPluginCall?

    private let networkMonitor =
        NWPathMonitor()

    private let networkQueue =
        DispatchQueue(
            label:
                "com.margot.background-location.network"
        )

    private lazy var session: URLSession = {
        let configuration =
            URLSessionConfiguration.default

        configuration.timeoutIntervalForRequest =
            20

        configuration.timeoutIntervalForResource =
            30

        /*
         * Não deixamos o pedido preso indefinidamente sem rede.
         *
         * Queremos que falhe, fique guardado como pendente
         * e seja reenviado quando a conectividade regressar.
         */
        configuration.waitsForConnectivity =
            false

        configuration.requestCachePolicy =
            .reloadIgnoringLocalCacheData

        return URLSession(
            configuration:
                configuration
        )
    }()

    override public func load() {
        manager =
            CLLocationManager()

        manager.delegate =
            self

        manager.desiredAccuracy =
            kCLLocationAccuracyNearestTenMeters

        /*
         * Antes eram 20 metros.
         *
         * Se o utilizador estivesse parado, o iPhone podia não
         * fornecer novos callbacks e, portanto, não havia nada
         * que voltasse a enviar a presença depois de a rede regressar.
         */
        manager.distanceFilter =
            kCLDistanceFilterNone

        manager.activityType =
            .fitness

        manager.pausesLocationUpdatesAutomatically =
            false

        manager.showsBackgroundLocationIndicator =
            false

        manager.allowsBackgroundLocationUpdates =
            false

        presenceVisible =
            readVisibility()

        networkMonitor.pathUpdateHandler = {
            [weak self] path in

            guard
                path.status ==
                    .satisfied
            else {
                return
            }

            DispatchQueue.main.async {
                self?
                    .retryWhenConnectivityReturns()
            }
        }

        networkMonitor.start(
            queue:
                networkQueue
        )

        NotificationCenter.default
            .addObserver(
                self,
                selector:
                    #selector(
                        applicationDidBecomeActive
                    ),
                name:
                    UIApplication
                        .didBecomeActiveNotification,
                object:
                    nil
            )

        retryLocation =
            readPendingLocation()

        latestLocation =
            retryLocation ??
            manager.location

        configureMonitoring()

        if !presenceVisible {
            queueHiddenPresence()
        } else if
            let retryLocation =
                retryLocation
        {
            queueLocation(
                retryLocation,
                force:
                    true
            )
        }
    }

    deinit {
        NotificationCenter.default
            .removeObserver(
                self
            )

        networkMonitor
            .cancel()

        retryWorkItem?
            .cancel()

        session
            .invalidateAndCancel()
    }

    @objc public func start(
        _ call:
            CAPPluginCall
    ) {
        guard
            let token =
                validToken(
                    call.getString(
                        "token"
                    )
                )
        else {
            call.reject(
                "O token da localização é inválido."
            )

            return
        }

        guard
            saveToken(
                token
            )
        else {
            call.reject(
                "Não foi possível guardar a autorização da localização."
            )

            return
        }

        let visible =
            call.getBool(
                "visible"
            ) ??
            true

        setPresenceVisible(
            visible
        )

        guard
            CLLocationManager
                .locationServicesEnabled()
        else {
            if !presenceVisible {
                queueHiddenPresence()
            }

            call.resolve(
                statusData()
            )

            return
        }

        switch
            manager
                .authorizationStatus
        {
        case .notDetermined:
            pendingStartCall?
                .reject(
                    "Foi iniciado um novo pedido de localização."
                )

            pendingStartCall =
                call

            manager
                .requestWhenInUseAuthorization()

            return

        case .authorizedWhenInUse:
            startForegroundLocationIfPossible()

            manager
                .requestAlwaysAuthorization()

        case .authorizedAlways:
            configureMonitoring()

        case .denied,
             .restricted:
            stopMonitoring(
                removeToken:
                    false
            )

        @unknown default:
            stopMonitoring(
                removeToken:
                    false
            )
        }

        requestPreciseLocationIfNeeded()

        if presenceVisible {
            sendBestAvailableLocationOrRequest(
                allowBackground:
                    false
            )
        } else {
            queueHiddenPresence()
        }

        call.resolve(
            statusData()
        )
    }

    @objc public func stop(
        _ call:
            CAPPluginCall
    ) {
        setPresenceVisible(
            false
        )

        if
            readToken() !=
                nil
        {
            queueHiddenPresence()
        }

        stopMonitoring(
            removeToken:
                true
        )

        call.resolve(
            statusData()
        )
    }

    @objc public func status(
        _ call:
            CAPPluginCall
    ) {
        call.resolve(
            statusData()
        )
    }

    /*
     * Este método faltava no plugin iOS.
     *
     * O JS já chamava BackgroundLocation.setVisibility(),
     * mas o Swift não o expunha.
     */
    @objc public func setVisibility(
        _ call:
            CAPPluginCall
    ) {
        let visible =
            call.getBool(
                "visible"
            ) ??
            true

        setPresenceVisible(
            visible
        )

        guard
            readToken() !=
                nil
        else {
            call.resolve(
                statusData()
            )

            return
        }

        if visible {
            retryHidden =
                false

            hiddenSyncPending =
                false

            retryWorkItem?
                .cancel()

            retryWorkItem =
                nil

            configureMonitoring()

            /*
             * Ao voltar a ficar visível não esperamos pelo próximo
             * intervalo de 60 segundos.
             */
            sendBestAvailableLocationOrRequest(
                allowBackground:
                    false
            )
        } else {
            pendingLocation =
                nil

            retryLocation =
                nil

            retryHidden =
                true

            deletePendingLocation()

            /*
             * Esconde imediatamente a localização no servidor.
             */
            queueHiddenPresence()
        }

        call.resolve(
            statusData()
        )
    }

    @objc public func openSettings(
        _ call:
            CAPPluginCall
    ) {
        guard
            let url =
                URL(
                    string:
                        UIApplication
                            .openSettingsURLString
                )
        else {
            call.reject(
                "Não foi possível abrir as definições."
            )

            return
        }

        DispatchQueue.main.async {
            UIApplication.shared
                .open(
                    url
                ) {
                    opened in

                    call.resolve([
                        "opened":
                            opened
                    ])
                }
        }
    }

    @objc private func applicationDidBecomeActive() {
        configureMonitoring()

        if !presenceVisible {
            queueHiddenPresence()

            return
        }

        /*
         * Ao voltar à app força uma atualização.
         */
        sendBestAvailableLocationOrRequest(
            allowBackground:
                false
        )
    }

    public func locationManagerDidChangeAuthorization(
        _ manager:
            CLLocationManager
    ) {
        let shouldRequestAlways =
            manager.authorizationStatus ==
                .authorizedWhenInUse &&
            pendingStartCall !=
                nil

        configureMonitoring()

        if
            manager.authorizationStatus ==
                .authorizedWhenInUse
        {
            startForegroundLocationIfPossible()
        }

        if
            manager.authorizationStatus !=
                .notDetermined,
            let startCall =
                pendingStartCall
        {
            pendingStartCall =
                nil

            if presenceVisible {
                sendBestAvailableLocationOrRequest(
                    allowBackground:
                        false
                )
            } else {
                queueHiddenPresence()
            }

            startCall.resolve(
                statusData()
            )
        }

        notifyListeners(
            "backgroundLocationAuthorizationChanged",
            data:
                statusData()
        )

        if shouldRequestAlways {
            /*
             * Primeiro "Enquanto utiliza" e depois "Sempre".
             */
            DispatchQueue.main
                .asyncAfter(
                    deadline:
                        .now() +
                        0.6
                ) {
                    [weak self] in

                    guard
                        let self =
                            self,
                        self.manager
                            .authorizationStatus ==
                            .authorizedWhenInUse
                    else {
                        return
                    }

                    self.manager
                        .requestAlwaysAuthorization()
                }
        }
    }

    public func locationManager(
        _ manager:
            CLLocationManager,
        didUpdateLocations locations:
            [CLLocation]
    ) {
        let validLocations =
            locations.filter {
                self.isUsableLocation(
                    $0,
                    maxAge:
                        180
                )
            }

        guard
            let location =
                validLocations.last
        else {
            return
        }

        latestLocation =
            location

        /*
         * Continuamos a receber localização localmente em modo
         * invisível, mas nunca a publicamos.
         */
        if !presenceVisible {
            return
        }

        /*
         * Se havia um envio que falhou por falta de rede,
         * o primeiro callback seguinte força logo o retry.
         */
        if
            retryLocation !=
                nil,
            !sending
        {
            retryLocation =
                newest(
                    location,
                    retryLocation
                )

            if
                let retryLocation =
                    retryLocation
            {
                queueLocation(
                    retryLocation,
                    force:
                        true
                )
            }

            return
        }

        considerSending(
            location
        )
    }

    public func locationManager(
        _ manager:
            CLLocationManager,
        didVisit visit:
            CLVisit
    ) {
        let date =
            visit.departureDate ==
                .distantFuture
            ? visit.arrivalDate
            : visit.departureDate

        let location =
            CLLocation(
                coordinate:
                    visit.coordinate,
                altitude:
                    0,
                horizontalAccuracy:
                    visit.horizontalAccuracy,
                verticalAccuracy:
                    -1,
                timestamp:
                    date
            )

        guard
            isUsableLocation(
                location,
                maxAge:
                    900
            )
        else {
            return
        }

        latestLocation =
            location

        if presenceVisible {
            queueLocation(
                location,
                force:
                    true
            )
        }
    }

    public func locationManager(
        _ manager:
            CLLocationManager,
        didFailWithError error:
            Error
    ) {
        let locationError =
            error as?
                CLError

        if
            locationError?
                .code ==
                .denied
        {
            stopMonitoring(
                removeToken:
                    false
            )
        }

        /*
         * locationUnknown é transitório.
         */
        if
            locationError?
                .code !=
                .locationUnknown
        {
            notifyListeners(
                "backgroundLocationError",
                data: [
                    "message":
                        error
                            .localizedDescription
                ]
            )
        }
    }

    private func configureMonitoring() {
        guard
            manager !=
                nil,
            readToken() !=
                nil,
            CLLocationManager
                .locationServicesEnabled()
        else {
            stopMonitoring(
                removeToken:
                    false
            )

            return
        }

        switch
            manager
                .authorizationStatus
        {
        case .authorizedAlways:
            manager
                .allowsBackgroundLocationUpdates =
                true

            manager
                .startUpdatingLocation()

            if
                CLLocationManager
                    .significantLocationChangeMonitoringAvailable()
            {
                manager
                    .startMonitoringSignificantLocationChanges()
            }

            manager
                .startMonitoringVisits()

            monitoring =
                true

        case .authorizedWhenInUse:
            startForegroundLocationIfPossible()

        default:
            stopMonitoring(
                removeToken:
                    false
            )
        }
    }

    private func requestPreciseLocationIfNeeded() {
        guard
            manager
                .accuracyAuthorization ==
                .reducedAccuracy,
            manager
                .authorizationStatus ==
                .authorizedAlways ||
            manager
                .authorizationStatus ==
                .authorizedWhenInUse
        else {
            return
        }

        manager
            .requestTemporaryFullAccuracyAuthorization(
                withPurposeKey:
                    "MargotNearby"
            ) {
                [weak self] _ in

                DispatchQueue.main.async {
                    self?
                        .configureMonitoring()

                    self?
                        .sendBestAvailableLocationOrRequest(
                            allowBackground:
                                false
                        )
                }
            }
    }

    private func startForegroundLocationIfPossible() {
        guard
            UIApplication.shared
                .applicationState ==
                .active,
            manager
                .authorizationStatus ==
                .authorizedWhenInUse,
            readToken() !=
                nil
        else {
            return
        }

        manager
            .allowsBackgroundLocationUpdates =
            false

        manager
            .startUpdatingLocation()

        monitoring =
            false
    }

    private func requestCurrentLocationIfPossible(
        allowBackground:
            Bool
    ) {
        guard
            readToken() !=
                nil
        else {
            return
        }

        let state =
            UIApplication.shared
                .applicationState

        switch
            manager
                .authorizationStatus
        {
        case .authorizedAlways:
            if
                state ==
                    .active ||
                allowBackground
            {
                manager
                    .requestLocation()
            }

        case .authorizedWhenInUse:
            if
                state ==
                    .active
            {
                manager
                    .requestLocation()
            }

        default:
            break
        }
    }

    private func sendBestAvailableLocationOrRequest(
        allowBackground:
            Bool
    ) {
        guard
            presenceVisible,
            readToken() !=
                nil
        else {
            return
        }

        if
            let retryLocation =
                retryLocation
        {
            queueLocation(
                retryLocation,
                force:
                    true
            )

            return
        }

        if
            let latestLocation =
                latestLocation,
            isUsableLocation(
                latestLocation,
                maxAge:
                    900
            )
        {
            queueLocation(
                latestLocation,
                force:
                    true
            )

            return
        }

        if
            let managerLocation =
                manager.location,
            isUsableLocation(
                managerLocation,
                maxAge:
                    900
            )
        {
            latestLocation =
                managerLocation

            queueLocation(
                managerLocation,
                force:
                    true
            )

            return
        }

        requestCurrentLocationIfPossible(
            allowBackground:
                allowBackground
        )
    }

    private func stopMonitoring(
        removeToken:
            Bool
    ) {
        guard
            manager !=
                nil
        else {
            if removeToken {
                deleteToken()
                deletePendingLocation()
            }

            return
        }

        manager
            .stopUpdatingLocation()

        manager
            .stopMonitoringSignificantLocationChanges()

        manager
            .stopMonitoringVisits()

        manager
            .allowsBackgroundLocationUpdates =
            false

        monitoring =
            false

        sending =
            false

        pendingLocation =
            nil

        retryLocation =
            nil

        hiddenSyncPending =
            false

        retryHidden =
            false

        retryAttempt =
            0

        retryWorkItem?
            .cancel()

        retryWorkItem =
            nil

        if removeToken {
            deleteToken()
            deletePendingLocation()
        }
    }

    private func considerSending(
        _ location:
            CLLocation
    ) {
        guard
            readToken() !=
                nil
        else {
            stopMonitoring(
                removeToken:
                    false
            )

            return
        }

        guard
            presenceVisible
        else {
            return
        }

        let elapsed =
            Date()
                .timeIntervalSince(
                    lastSentAt
                )

        let distance =
            lastSentLocation?
                .distance(
                    from:
                        location
                ) ??
            minimumMovement

        guard
            lastSentLocation ==
                nil ||
            elapsed >=
                minimumSendInterval ||
            distance >=
                minimumMovement
        else {
            return
        }

        queueLocation(
            location,
            force:
                true
        )
    }

    private func queueLocation(
        _ location:
            CLLocation,
        force:
            Bool
    ) {
        guard
            presenceVisible,
            readToken() !=
                nil,
            isUsableLocation(
                location,
                maxAge:
                    900
            )
        else {
            return
        }

        latestLocation =
            location

        if !force {
            let elapsed =
                Date()
                    .timeIntervalSince(
                        lastSentAt
                    )

            let distance =
                lastSentLocation?
                    .distance(
                        from:
                            location
                    ) ??
                minimumMovement

            guard
                lastSentLocation ==
                    nil ||
                elapsed >=
                    minimumSendInterval ||
                distance >=
                    minimumMovement
            else {
                return
            }
        }

        if sending {
            pendingLocation =
                newest(
                    location,
                    pendingLocation
                )

            savePendingLocation(
                pendingLocation ??
                location
            )

            return
        }

        performLocationSend(
            location
        )
    }

    private func performLocationSend(
        _ location:
            CLLocation
    ) {
        guard
            let token =
                readToken(),
            presenceVisible,
            !sending
        else {
            return
        }

        savePendingLocation(
            location
        )

        retryWorkItem?
            .cancel()

        retryWorkItem =
            nil

        sending =
            true

        send(
            payload:
                locationPayload(
                    location
                ),
            token:
                token
        ) {
            [weak self]
            statusCode,
            error in

            DispatchQueue.main.async {
                self?
                    .finishLocationSending(
                        location,
                        statusCode:
                            statusCode,
                        error:
                            error
                    )
            }
        }
    }

    private func queueHiddenPresence() {
        guard
            readToken() !=
                nil
        else {
            return
        }

        pendingLocation =
            nil

        retryLocation =
            nil

        deletePendingLocation()

        /*
         * Se um update visível ainda está em voo, o hide é enviado
         * apenas depois desse pedido terminar.
         *
         * Assim não há possibilidade de um pedido antigo voltar
         * a tornar o utilizador visível depois do modo invisível.
         */
        if sending {
            hiddenSyncPending =
                true

            return
        }

        performHiddenSend()
    }

    private func performHiddenSend() {
        guard
            let token =
                readToken(),
            !sending
        else {
            return
        }

        retryWorkItem?
            .cancel()

        retryWorkItem =
            nil

        sending =
            true

        send(
            payload: [
                "active":
                    true,
                "visible":
                    false
            ],
            token:
                token
        ) {
            [weak self]
            statusCode,
            error in

            DispatchQueue.main.async {
                self?
                    .finishHiddenSending(
                        statusCode:
                            statusCode,
                        error:
                            error
                    )
            }
        }
    }

    private func finishLocationSending(
        _ location:
            CLLocation,
        statusCode:
            Int?,
        error:
            Error?
    ) {
        sending =
            false

        if
            handleUnauthorized(
                statusCode
            )
        {
            return
        }

        if
            let statusCode,
            (200...299)
                .contains(
                    statusCode
                )
        {
            lastSentAt =
                Date()

            lastSentLocation =
                location

            latestLocation =
                location

            retryLocation =
                nil

            retryAttempt =
                0

            deletePendingLocation()

            notifyListeners(
                "backgroundLocationUpdated",
                data:
                    locationPayload(
                        location
                    )
            )
        } else if presenceVisible {
            retryLocation =
                newest(
                    location,
                    retryLocation
                )

            savePendingLocation(
                retryLocation ??
                location
            )

            scheduleRetry()

            notifySendError(
                statusCode:
                    statusCode,
                error:
                    error
            )
        }

        processPendingAfterSend()
    }

    private func finishHiddenSending(
        statusCode:
            Int?,
        error:
            Error?
    ) {
        sending =
            false

        if
            handleUnauthorized(
                statusCode
            )
        {
            return
        }

        if
            let statusCode,
            (200...299)
                .contains(
                    statusCode
                )
        {
            retryHidden =
                false

            retryAttempt =
                0
        } else if !presenceVisible {
            retryHidden =
                true

            scheduleRetry()

            notifySendError(
                statusCode:
                    statusCode,
                error:
                    error
            )
        }

        processPendingAfterSend()
    }

    private func processPendingAfterSend() {
        if hiddenSyncPending {
            hiddenSyncPending =
                false

            if !presenceVisible {
                queueHiddenPresence()

                return
            }
        }

        guard
            presenceVisible
        else {
            pendingLocation =
                nil

            retryLocation =
                nil

            deletePendingLocation()

            return
        }

        if
            let pendingLocation =
                pendingLocation
        {
            self.pendingLocation =
                nil

            if retryLocation ==
                nil
            {
                considerSending(
                    pendingLocation
                )
            } else {
                retryLocation =
                    newest(
                        pendingLocation,
                        retryLocation
                    )
            }
        }
    }

    private func handleUnauthorized(
        _ statusCode:
            Int?
    ) -> Bool {
        guard
            statusCode ==
                401
        else {
            return false
        }

        stopMonitoring(
            removeToken:
                true
        )

        notifyListeners(
            "backgroundLocationTokenExpired",
            data: [
                "expired":
                    true
            ]
        )

        return true
    }

    private func notifySendError(
        statusCode:
            Int?,
        error:
            Error?
    ) {
        if
            let statusCode =
                statusCode
        {
            notifyListeners(
                "backgroundLocationError",
                data: [
                    "message":
                        "O servidor recusou a localização.",
                    "status_code":
                        statusCode
                ]
            )
        } else if
            let error =
                error
        {
            notifyListeners(
                "backgroundLocationError",
                data: [
                    "message":
                        error
                            .localizedDescription
                ]
            )
        }
    }

    private func scheduleRetry() {
        guard
            (
                retryHidden ||
                retryLocation !=
                    nil
            ),
            retryWorkItem ==
                nil
        else {
            return
        }

        let delayIndex =
            min(
                retryAttempt,
                retryDelays.count -
                1
            )

        let delay =
            retryDelays[
                delayIndex
            ]

        retryAttempt =
            min(
                retryAttempt +
                1,
                retryDelays.count
            )

        let workItem =
            DispatchWorkItem {
                [weak self] in

                guard
                    let self =
                        self
                else {
                    return
                }

                self.retryWorkItem =
                    nil

                if self.sending {
                    self.scheduleRetry()

                    return
                }

                if !self.presenceVisible {
                    if
                        self.retryHidden ||
                        self.readToken() !=
                            nil
                    {
                        self.performHiddenSend()
                    }

                    return
                }

                self.retryHidden =
                    false

                if
                    let location =
                        self.retryLocation
                {
                    self.performLocationSend(
                        location
                    )
                } else {
                    self
                        .sendBestAvailableLocationOrRequest(
                            allowBackground:
                                true
                        )
                }
            }

        retryWorkItem =
            workItem

        DispatchQueue.main
            .asyncAfter(
                deadline:
                    .now() +
                    delay,
                execute:
                    workItem
            )
    }

    /*
     * É este caminho que resolve especificamente o teste:
     *
     * app em background
     * -> Wi-Fi OFF
     * -> utilizador expira no mapa
     * -> Wi-Fi ON
     * -> reenviar presença imediatamente.
     */
    private func retryWhenConnectivityReturns() {
        guard
            readToken() !=
                nil
        else {
            return
        }

        retryWorkItem?
            .cancel()

        retryWorkItem =
            nil

        retryAttempt =
            0

        if sending {
            if !presenceVisible {
                hiddenSyncPending =
                    true
            }

            return
        }

        if !presenceVisible {
            retryHidden =
                true

            performHiddenSend()

            return
        }

        retryHidden =
            false

        if
            let retryLocation =
                retryLocation
        {
            performLocationSend(
                retryLocation
            )

            return
        }

        /*
         * Mesmo que nenhum pedido tivesse chegado a falhar,
         * tenta publicar imediatamente a última localização conhecida.
         */
        sendBestAvailableLocationOrRequest(
            allowBackground:
                true
        )
    }

    private func newest(
        _ first:
            CLLocation,
        _ second:
            CLLocation?
    ) -> CLLocation {
        guard
            let second =
                second
        else {
            return first
        }

        return first.timestamp >=
            second.timestamp
            ? first
            : second
    }

    private func isUsableLocation(
        _ location:
            CLLocation,
        maxAge:
            TimeInterval
    ) -> Bool {
        return
            location.horizontalAccuracy >=
                0 &&
            location.horizontalAccuracy <=
                500 &&
            abs(
                location.timestamp
                    .timeIntervalSinceNow
            ) <=
                maxAge
    }

    private func locationPayload(
        _ location:
            CLLocation
    ) -> [String: Any] {
        return [
            "latitude":
                location
                    .coordinate
                    .latitude,

            "longitude":
                location
                    .coordinate
                    .longitude,

            "accuracy":
                location
                    .horizontalAccuracy,

            "timestamp":
                ISO8601DateFormatter()
                    .string(
                        from:
                            location.timestamp
                    ),

            "active":
                true,

            "visible":
                true
        ]
    }

    private func savePendingLocation(
        _ location:
            CLLocation
    ) {
        let payload:
            [String: Any] =
            [
                "latitude":
                    location
                        .coordinate
                        .latitude,

                "longitude":
                    location
                        .coordinate
                        .longitude,

                "accuracy":
                    location
                        .horizontalAccuracy,

                "timestamp":
                    location
                        .timestamp
                        .timeIntervalSince1970
            ]

        UserDefaults.standard
            .set(
                payload,
                forKey:
                    pendingLocationKey
            )
    }

    private func readPendingLocation()
        -> CLLocation?
    {
        guard
            let payload =
                UserDefaults.standard
                    .dictionary(
                        forKey:
                            pendingLocationKey
                    ),

            let latitude =
                payload["latitude"]
                    as?
                    Double,

            let longitude =
                payload["longitude"]
                    as?
                    Double,

            let accuracy =
                payload["accuracy"]
                    as?
                    Double,

            let timestamp =
                payload["timestamp"]
                    as?
                    Double,

            abs(
                Date(
                    timeIntervalSince1970:
                        timestamp
                )
                .timeIntervalSinceNow
            ) <=
                900
        else {
            deletePendingLocation()

            return nil
        }

        return CLLocation(
            coordinate:
                CLLocationCoordinate2D(
                    latitude:
                        latitude,
                    longitude:
                        longitude
                ),

            altitude:
                0,

            horizontalAccuracy:
                accuracy,

            verticalAccuracy:
                -1,

            timestamp:
                Date(
                    timeIntervalSince1970:
                        timestamp
                )
        )
    }

    private func deletePendingLocation() {
        UserDefaults.standard
            .removeObject(
                forKey:
                    pendingLocationKey
            )
    }

    private func setPresenceVisible(
        _ visible:
            Bool
    ) {
        presenceVisible =
            visible

        UserDefaults.standard
            .set(
                visible,
                forKey:
                    visibilityKey
            )
    }

    private func readVisibility()
        -> Bool
    {
        guard
            UserDefaults.standard
                .object(
                    forKey:
                        visibilityKey
                ) !=
                nil
        else {
            return true
        }

        return UserDefaults.standard
            .bool(
                forKey:
                    visibilityKey
            )
    }

    private func send(
        payload:
            [String: Any],
        token:
            String,
        completion:
            ((Int?, Error?) -> Void)? =
            nil
    ) {
        var authenticatedPayload =
            payload

        authenticatedPayload[
            "token"
        ] =
            token

        guard
            let body =
                try?
                    JSONSerialization
                    .data(
                        withJSONObject:
                            authenticatedPayload
                    )
        else {
            completion?(
                nil,
                nil
            )

            return
        }

        var request =
            URLRequest(
                url:
                    endpoint
            )

        request.httpMethod =
            "POST"

        request.httpBody =
            body

        request.setValue(
            "application/json",
            forHTTPHeaderField:
                "Content-Type"
        )

        request.setValue(
            "application/json",
            forHTTPHeaderField:
                "Accept"
        )

        request.setValue(
            "Bearer \(token)",
            forHTTPHeaderField:
                "Authorization"
        )

        session
            .dataTask(
                with:
                    request
            ) {
                _,
                response,
                error in

                completion?(
                    (
                        response
                            as?
                            HTTPURLResponse
                    )?
                    .statusCode,
                    error
                )
            }
            .resume()
    }

    private func statusData()
        -> [String: Any]
    {
        let authorization =
            manager?
                .authorizationStatus ??
            .notDetermined

        return [
            "success":
                true,

            "active":
                monitoring,

            "visible":
                presenceVisible,

            "permission":
                authorizationName(
                    authorization
                ),

            "background_enabled":
                monitoring &&
                authorization ==
                    .authorizedAlways,

            "precise":
                manager?
                    .accuracyAuthorization ==
                    .fullAccuracy,

            "token_stored":
                readToken() !=
                nil,

            "requires_settings":
                authorization ==
                    .authorizedWhenInUse ||
                authorization ==
                    .denied ||
                authorization ==
                    .restricted
        ]
    }

    private func authorizationName(
        _ status:
            CLAuthorizationStatus
    ) -> String {
        switch status {
        case .notDetermined:
            return "not_determined"

        case .restricted:
            return "restricted"

        case .denied:
            return "denied"

        case .authorizedWhenInUse:
            return "when_in_use"

        case .authorizedAlways:
            return "always"

        @unknown default:
            return "unknown"
        }
    }

    private func validToken(
        _ value:
            String?
    ) -> String? {
        let token =
            value?
                .trimmingCharacters(
                    in:
                        .whitespacesAndNewlines
                ) ??
            ""

        return token.range(
            of:
                "^[A-Fa-f0-9]{64}$",
            options:
                .regularExpression
        ) ==
            nil
            ? nil
            : token
    }

    private func keychainQuery()
        -> [String: Any]
    {
        return [
            kSecClass as String:
                kSecClassGenericPassword,

            kSecAttrService as String:
                keychainService,

            kSecAttrAccount as String:
                keychainAccount
        ]
    }

    private func saveToken(
        _ token:
            String
    ) -> Bool {
        var query =
            keychainQuery()

        SecItemDelete(
            query
                as
                CFDictionary
        )

        query[
            kSecValueData as String
        ] =
            Data(
                token.utf8
            )

        query[
            kSecAttrAccessible as String
        ] =
            kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        return SecItemAdd(
            query
                as
                CFDictionary,
            nil
        ) ==
            errSecSuccess
    }

    private func readToken()
        -> String?
    {
        var query =
            keychainQuery()

        query[
            kSecReturnData as String
        ] =
            true

        query[
            kSecMatchLimit as String
        ] =
            kSecMatchLimitOne

        var result:
            CFTypeRef?

        guard
            SecItemCopyMatching(
                query
                    as
                    CFDictionary,
                &result
            ) ==
                errSecSuccess,

            let data =
                result
                    as?
                    Data
        else {
            return nil
        }

        return String(
            data:
                data,
            encoding:
                .utf8
        )
    }

    private func deleteToken() {
        SecItemDelete(
            keychainQuery()
                as
                CFDictionary
        )
    }
}