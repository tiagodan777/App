import UIKit
import Capacitor
import CoreLocation
import Foundation
import Security

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    /*
     * Este coordenador só existe quando o próprio iOS relança
     * a Margot em segundo plano por causa de um evento de localização.
     *
     * Num arranque normal continua tudo a ser gerido pelo
     * BackgroundLocationPlugin já existente.
     */
    private var locationRelaunchCoordinator:
        LocationRelaunchCoordinator?

    func application(
        _ application: UIApplication,
        willFinishLaunchingWithOptions launchOptions:
            [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        prepararRelaunchDeLocalizacao(
            launchOptions
        )

        return true
    }

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions:
            [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        /*
         * Também verificamos aqui.
         *
         * O guard interno impede que sejam criados dois
         * coordenadores caso willFinish e didFinish recebam
         * ambos UIApplicationLaunchOptionsLocationKey.
         */
        prepararRelaunchDeLocalizacao(
            launchOptions
        )

        return true
    }

    func applicationDidBecomeActive(
        _ application: UIApplication
    ) {
        guard
            let coordinator =
                locationRelaunchCoordinator
        else {
            return
        }

        /*
         * Se o utilizador abriu entretanto a aplicação,
         * damos alguns segundos ao plugin Capacitor normal
         * para assumir novamente o controlo.
         *
         * Depois destruímos este gestor temporário para
         * não ficarmos com dois CLLocationManager a enviar
         * a mesma posição.
         */
        DispatchQueue.main.asyncAfter(
            deadline:
                .now() + 5
        ) {
            [weak self, weak coordinator] in

            guard
                let self = self,
                let coordinator = coordinator,
                self.locationRelaunchCoordinator ===
                    coordinator
            else {
                return
            }

            coordinator.stop()

            self.locationRelaunchCoordinator =
                nil
        }
    }

    private func prepararRelaunchDeLocalizacao(
        _ launchOptions:
            [UIApplication.LaunchOptionsKey: Any]?
    ) {
        guard
            launchOptions?[.location] != nil,
            locationRelaunchCoordinator == nil
        else {
            return
        }

        /*
         * O iOS lançou a aplicação porque recebeu um novo
         * evento do serviço de localização.
         *
         * Não esperamos que o WebView/Capacitor/ViewController
         * carreguem para voltar a ligar Core Location.
         */
        let coordinator =
            LocationRelaunchCoordinator()

        locationRelaunchCoordinator =
            coordinator

        coordinator.start()
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken
            deviceToken: Data
    ) {
        NotificationCenter.default.post(
            name:
                .capacitorDidRegisterForRemoteNotifications,
            object:
                deviceToken
        )
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError
            error: Error
    ) {
        NotificationCenter.default.post(
            name:
                .capacitorDidFailToRegisterForRemoteNotifications,
            object:
                error
        )
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession:
            UISceneSession,
        options:
            UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let configuration =
            UISceneConfiguration(
                name:
                    "Default Configuration",
                sessionRole:
                    connectingSceneSession.role
            )

        configuration.delegateClass =
            SceneDelegate.self

        return configuration
    }
}


/*
 * Gestor nativo mínimo usado exclusivamente quando o iOS
 * relança a aplicação devido a Core Location.
 *
 * Não é um plugin Capacitor.
 *
 * O objetivo é que o relançamento não dependa de:
 *
 * AppDelegate
 * -> Scene
 * -> ViewController
 * -> Capacitor
 * -> BackgroundLocationPlugin
 *
 * Quando recebemos UIApplicationLaunchOptionsLocationKey
 * conseguimos reativar Core Location imediatamente.
 */
private final class LocationRelaunchCoordinator:
    NSObject,
    CLLocationManagerDelegate {

    private let endpoint =
        URL(
            string:
                "https://margot-app.com/background-location-update/"
        )!

    /*
     * Têm de ser exatamente os mesmos identificadores
     * usados pelo BackgroundLocationPlugin.swift.
     */
    private let keychainService =
        "com.margot.background-location"

    private let keychainAccount =
        "background-token"

    private let visibilityKey =
        "margot.background-location.visible"

    private let pendingLocationKey =
        "margot.background-location.pending"

    private let minimumSendInterval:
        TimeInterval = 60

    private let minimumMovement:
        CLLocationDistance = 20

    private let retryDelays:
        [TimeInterval] = [
            2,
            5,
            10
        ]

    private let manager =
        CLLocationManager()

    private lazy var session:
        URLSession = {
            let configuration =
                URLSessionConfiguration.default

            configuration.timeoutIntervalForRequest =
                15

            configuration.timeoutIntervalForResource =
                20

            configuration.waitsForConnectivity =
                false

            configuration.requestCachePolicy =
                .reloadIgnoringLocalCacheData

            return URLSession(
                configuration:
                    configuration
            )
        }()

    private var sending =
        false

    private var stopped =
        false

    private var pendingLocation:
        CLLocation?

    private var lastSentLocation:
        CLLocation?

    private var lastSentAt =
        Date.distantPast

    private var retryAttempt =
        0

    private var retryWorkItem:
        DispatchWorkItem?

    private var backgroundTask:
        UIBackgroundTaskIdentifier =
            .invalid

    override init() {
        super.init()

        manager.delegate =
            self

        manager.desiredAccuracy =
            kCLLocationAccuracyNearestTenMeters

        /*
         * Depois de o significant-change service nos relançar,
         * queremos voltar ao comportamento normal da Margot:
         * receber também deslocações curtas.
         */
        manager.distanceFilter =
            kCLDistanceFilterNone

        manager.activityType =
            .fitness

        manager.pausesLocationUpdatesAutomatically =
            false

        manager.showsBackgroundLocationIndicator =
            false
    }

    func start() {
        guard !stopped else {
            return
        }

        /*
         * Se o utilizador tinha desligado localização/invisibilidade,
         * ou se já não existe token válido, não voltamos a publicar
         * presença apenas porque o iOS relançou o processo.
         */
        guard
            readVisibility(),
            readToken() != nil,
            CLLocationManager
                .locationServicesEnabled(),
            manager.authorizationStatus ==
                .authorizedAlways
        else {
            return
        }

        /*
         * Esta é a parte essencial.
         *
         * O evento de significant-location-change conseguiu lançar
         * novamente o processo. A partir daqui voltamos também a
         * ligar o serviço standard para recuperar atualizações com
         * granularidade útil para o raio da Margot.
         */
        manager.allowsBackgroundLocationUpdates =
            true

        manager.startUpdatingLocation()

        if CLLocationManager
            .significantLocationChangeMonitoringAvailable()
        {
            /*
             * A Apple exige que este serviço seja iniciado novamente
             * depois de um relaunch causado por localização.
             */
            manager
                .startMonitoringSignificantLocationChanges()
        }

        manager.startMonitoringVisits()

        /*
         * Segundo a documentação da Apple, quando somos relançados
         * por significant location change, manager.location pode já
         * conter o evento que provocou o relaunch.
         *
         * Só o usamos se for realmente recente.
         */
        if
            let location =
                manager.location,
            isUsableLocation(
                location,
                maxAge:
                    180
            )
        {
            considerSending(
                location,
                force:
                    true
            )

            return
        }

        /*
         * Se havia uma posição que ficou pendente por uma falha
         * de rede muito recente, ainda podemos tentar recuperá-la.
         */
        if
            let pending =
                readPendingLocation(
                    maxAge:
                        180
                )
        {
            considerSending(
                pending,
                force:
                    true
            )
        }
    }

    func stop() {
        guard !stopped else {
            return
        }

        stopped =
            true

        retryWorkItem?
            .cancel()

        retryWorkItem =
            nil

        manager
            .stopUpdatingLocation()

        manager
            .stopMonitoringSignificantLocationChanges()

        manager
            .stopMonitoringVisits()

        manager.allowsBackgroundLocationUpdates =
            false

        pendingLocation =
            nil

        endBackgroundTask()
    }

    func locationManagerDidChangeAuthorization(
        _ manager:
            CLLocationManager
    ) {
        guard !stopped else {
            return
        }

        guard
            manager.authorizationStatus ==
                .authorizedAlways,
            readVisibility(),
            readToken() != nil
        else {
            stop()
            return
        }

        manager.allowsBackgroundLocationUpdates =
            true

        manager.startUpdatingLocation()

        if CLLocationManager
            .significantLocationChangeMonitoringAvailable()
        {
            manager
                .startMonitoringSignificantLocationChanges()
        }

        manager.startMonitoringVisits()
    }

    func locationManager(
        _ manager:
            CLLocationManager,
        didUpdateLocations locations:
            [CLLocation]
    ) {
        guard
            !stopped,
            readVisibility()
        else {
            return
        }

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

        considerSending(
            location,
            force:
                false
        )
    }

    func locationManager(
        _ manager:
            CLLocationManager,
        didVisit visit:
            CLVisit
    ) {
        guard
            !stopped,
            readVisibility()
        else {
            return
        }

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

        considerSending(
            location,
            force:
                true
        )
    }

    func locationManager(
        _ manager:
            CLLocationManager,
        didFailWithError error:
            Error
    ) {
        guard !stopped else {
            return
        }

        let locationError =
            error as?
                CLError

        if
            locationError?.code ==
                .denied
        {
            stop()
            return
        }

        /*
         * locationUnknown é um erro transitório e Core Location
         * volta a tentar sozinho.
         */
        if
            locationError?.code !=
                .locationUnknown
        {
            print(
                "[MARGOT LOCATION RELAUNCH] " +
                error.localizedDescription
            )
        }
    }

    private func considerSending(
        _ location:
            CLLocation,
        force:
            Bool
    ) {
        guard
            !stopped,
            readVisibility(),
            readToken() != nil,
            isUsableLocation(
                location,
                maxAge:
                    180
            )
        else {
            return
        }

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

        performSend(
            location
        )
    }

    private func performSend(
        _ location:
            CLLocation
    ) {
        guard
            !stopped,
            !sending,
            readVisibility(),
            let token =
                readToken()
        else {
            return
        }

        sending =
            true

        savePendingLocation(
            location
        )

        beginBackgroundTask()

        let payload:
            [String: Any] = [
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
                    true,

                "token":
                    token
            ]

        guard
            let body =
                try?
                    JSONSerialization
                        .data(
                            withJSONObject:
                                payload
                        )
        else {
            sending =
                false

            endBackgroundTask()

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
                [weak self]
                _,
                response,
                error in

                let statusCode =
                    (
                        response as?
                            HTTPURLResponse
                    )?
                    .statusCode

                DispatchQueue.main.async {
                    self?
                        .finishSend(
                            location,
                            statusCode:
                                statusCode,
                            error:
                                error
                        )
                }
            }
            .resume()
    }

    private func finishSend(
        _ location:
            CLLocation,
        statusCode:
            Int?,
        error:
            Error?
    ) {
        sending =
            false

        if statusCode == 401 {
            deleteToken()
            deletePendingLocation()

            endBackgroundTask()
            stop()

            return
        }

        if
            let statusCode =
                statusCode,
            (200...299)
                .contains(
                    statusCode
                )
        {
            lastSentAt =
                Date()

            lastSentLocation =
                location

            retryAttempt =
                0

            retryWorkItem?
                .cancel()

            retryWorkItem =
                nil

            deletePendingLocation()
        } else {
            pendingLocation =
                newest(
                    location,
                    pendingLocation
                )

            savePendingLocation(
                pendingLocation ??
                    location
            )

            scheduleRetry()

            if
                let error =
                    error
            {
                print(
                    "[MARGOT LOCATION RELAUNCH] " +
                    error.localizedDescription
                )
            } else if
                let statusCode =
                    statusCode
            {
                print(
                    "[MARGOT LOCATION RELAUNCH] HTTP \(statusCode)"
                )
            }
        }

        endBackgroundTask()

        if
            let pending =
                pendingLocation,
            isUsableLocation(
                pending,
                maxAge:
                    180
            ),
            statusCode != nil,
            statusCode.map({
                (200...299)
                    .contains(
                        $0
                    )
            }) == true
        {
            pendingLocation =
                nil

            considerSending(
                pending,
                force:
                    false
            )
        }
    }

    private func scheduleRetry() {
        guard
            !stopped,
            retryWorkItem == nil,
            let location =
                pendingLocation,
            isUsableLocation(
                location,
                maxAge:
                    180
            )
        else {
            return
        }

        let delayIndex =
            min(
                retryAttempt,
                retryDelays.count - 1
            )

        let delay =
            retryDelays[
                delayIndex
            ]

        retryAttempt =
            min(
                retryAttempt + 1,
                retryDelays.count
            )

        let workItem =
            DispatchWorkItem {
                [weak self] in

                guard
                    let self =
                        self,
                    !self.stopped
                else {
                    return
                }

                self.retryWorkItem =
                    nil

                guard
                    let location =
                        self.pendingLocation,
                    self.isUsableLocation(
                        location,
                        maxAge:
                            180
                    )
                else {
                    self.pendingLocation =
                        nil

                    self.deletePendingLocation()

                    return
                }

                self.performSend(
                    location
                )
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

    private func beginBackgroundTask() {
        guard
            backgroundTask ==
                .invalid
        else {
            return
        }

        backgroundTask =
            UIApplication.shared
                .beginBackgroundTask(
                    withName:
                        "MargotLocationRelaunch"
                ) {
                    [weak self] in

                    self?
                        .endBackgroundTask()
                }
    }

    private func endBackgroundTask() {
        guard
            backgroundTask !=
                .invalid
        else {
            return
        }

        UIApplication.shared
            .endBackgroundTask(
                backgroundTask
            )

        backgroundTask =
            .invalid
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

    private func savePendingLocation(
        _ location:
            CLLocation
    ) {
        let payload:
            [String: Any] = [
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

    private func readPendingLocation(
        maxAge:
            TimeInterval
    ) -> CLLocation? {
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
                    Double
        else {
            return nil
        }

        let date =
            Date(
                timeIntervalSince1970:
                    timestamp
            )

        guard
            abs(
                date.timeIntervalSinceNow
            ) <=
                maxAge
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
                date
        )
    }

    private func deletePendingLocation() {
        UserDefaults.standard
            .removeObject(
                forKey:
                    pendingLocationKey
            )
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
                query as
                    CFDictionary,
                &result
            ) ==
                errSecSuccess,

            let data =
                result as?
                    Data,

            let token =
                String(
                    data:
                        data,
                    encoding:
                        .utf8
                )
        else {
            return nil
        }

        let cleanToken =
            token.trimmingCharacters(
                in:
                    .whitespacesAndNewlines
            )

        guard
            cleanToken.range(
                of:
                    "^[A-Fa-f0-9]{64}$",
                options:
                    .regularExpression
            ) !=
                nil
        else {
            return nil
        }

        return cleanToken
    }

    private func deleteToken() {
        SecItemDelete(
            keychainQuery()
                as
                CFDictionary
        )
    }
}