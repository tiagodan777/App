// Localização do mapa em primeiro plano; o serviço nativo mantém o segundo plano.
window.MargotLocationTracker = function (actions) {
    'use strict';

    const SEND_INTERVAL = 15000;
    const REFRESH_INTERVAL = 45000;
    const MAX_AGE = 10000;
    const TIMEOUT = 30000;
    const WATCH_RECOVERY = 90000;

    let generation = 0;
    let watchGeneration = 0;
    let watch = null;
    let watchStarting = false;
    let watchStartedAt = 0;
    let refreshTimer = null;
    let request = null;
    let lastFix = null;
    let lastFixAt = 0;
    let lastSentAt = -Infinity;
    let lastErrorAt = -Infinity;
    let nativePlugin = null;
    let permissionConfirmed = !isAndroidNativeApp();

    const foreground = () =>
        !window.disableLocationTracking &&
        document.visibilityState === 'visible';

    const native = () =>
        Boolean(window.Capacitor?.isNativePlatform?.());

    function isAndroidNativeApp() {
        return Boolean(
            window.Capacitor?.isNativePlatform?.() &&
            window.Capacitor?.getPlatform?.() === 'android'
        );
    }

    function plugin() {
        if (!native()) return null;

        if (!nativePlugin) {
            nativePlugin =
                window.Capacitor.Plugins?.Geolocation ||
                window.Capacitor.registerPlugin?.('Geolocation');
        }

        return nativePlugin;
    }

    function options() {
        return {
            enableHighAccuracy: true,
            maximumAge: MAX_AGE,
            timeout: TIMEOUT,
            minimumUpdateInterval: SEND_INTERVAL,
            interval: 30000
        };
    }

    function bounded(promise, milliseconds) {
        let timer;

        return Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = window.setTimeout(
                    () => reject({
                        code: 3,
                        message: 'Location timeout'
                    }),
                    milliseconds
                );
            })
        ]).finally(() => window.clearTimeout(timer));
    }

    async function checkPermission() {
        if (!native()) return true;

        const cycle = generation;

        try {
            const geo = plugin();
            if (!geo) return false;

            const state = await bounded(
                geo.checkPermissions(),
                10000
            );

            if (cycle !== generation) return false;

            const granted =
                state?.location === 'granted' ||
                state?.coarseLocation === 'granted';

            permissionConfirmed = granted;

            if (!granted) actions.clearMap();

            return granted;
        } catch (error) {
            if (cycle !== generation) return false;

            permissionConfirmed = false;
            handleError(error);
            return false;
        }
    }

    function usable(fix) {
        if (!fix) return false;

        const age = Date.now() - fix.timestamp;
        return age >= -5000 && age <= MAX_AGE;
    }

    function receive(position) {
        if (!foreground() || !position?.coords) return;

        const {latitude, longitude, accuracy} = position.coords;
        const timestamp = position.timestamp;

        if (
            ![latitude, longitude, accuracy, timestamp]
                .every(Number.isFinite) ||
            Math.abs(latitude) > 90 ||
            Math.abs(longitude) > 180 ||
            accuracy < 0 ||
            timestamp <= 0
        ) {
            return;
        }

        const fix = {
            latitude,
            longitude,
            accuracy,
            timestamp
        };

        // Uma receção nova não torna uma captura antiga recente.
        if (
            !usable(fix) ||
            (lastFix && timestamp < lastFix.timestamp)
        ) {
            return;
        }

        lastFix = fix;
        lastFixAt = Date.now();
        lastErrorAt = -Infinity;

        sendLastKnownLocation();
    }

    function sendLastKnownLocation() {
        if (!foreground() || !usable(lastFix)) return false;

        // Movimento/ruído do GPS não pode contornar este limite.
        if (Date.now() - lastSentAt < SEND_INTERVAL) return true;

        if (!actions.send({type: 'location', ...lastFix})) {
            return false;
        }

        lastSentAt = Date.now();
        return true;
    }

    function clearWatch(item) {
        if (!item) return;

        if (item.native) {
            Promise.resolve()
                .then(() =>
                    item.plugin.clearWatch({id: String(item.id)})
                )
                .catch(error =>
                    console.warn(
                        'Não foi possível terminar o GPS.',
                        error
                    )
                );
        } else {
            navigator.geolocation?.clearWatch(item.id);
        }
    }

    function invalidateWatch() {
        watchGeneration++;
        clearWatch(watch);
        watch = null;
        watchStarting = false;
    }

    async function startLocationTracking() {
        const cycle = generation;

        await window.MargotLocationReady;

        if (
            cycle !== generation ||
            !foreground() ||
            watch ||
            watchStarting
        ) {
            return;
        }

        watchStarting = true;

        const ticket = ++watchGeneration;

        const current = () =>
            cycle === generation &&
            ticket === watchGeneration &&
            foreground();

        try {
            if (native()) {
                const geo = plugin();

                if (
                    !geo ||
                    !await checkPermission() ||
                    !current()
                ) {
                    return;
                }

                watchStartedAt = Date.now();

                const pending = Promise.resolve()
                    .then(() =>
                        geo.watchPosition(
                            options(),
                            (position, error) => {
                                if (!current()) return;

                                if (error) handleError(error);
                                else receive(position);
                            }
                        )
                    )
                    .then(id => {
                        const item = {
                            id,
                            native: true,
                            plugin: geo
                        };

                        if (!current()) clearWatch(item);
                        else watch = item;
                    });

                await bounded(pending, TIMEOUT + 5000);
            } else {
                if (
                    !window.isSecureContext ||
                    !navigator.geolocation
                ) {
                    return;
                }

                watchStartedAt = Date.now();

                const id = navigator.geolocation.watchPosition(
                    position => {
                        if (current()) receive(position);
                    },
                    error => {
                        if (current()) handleError(error);
                    },
                    options()
                );

                watch = {id, native: false};
            }
        } catch (error) {
            if (current()) {
                invalidateWatch();
                handleError(error);
            }
        } finally {
            if (ticket === watchGeneration) {
                watchStarting = false;
            }
        }
    }

    async function requestCurrentLocation() {
        const cycle = generation;

        await window.MargotLocationReady;

        if (
            cycle !== generation ||
            !foreground() ||
            request
        ) {
            return;
        }

        // Focus, pageshow e resume podem chegar quase ao mesmo tempo.
        if (usable(lastFix)) {
            sendLastKnownLocation();
            return;
        }

        const ticket = {};
        request = ticket;

        const current = () =>
            request === ticket &&
            cycle === generation &&
            foreground();

        try {
            let position;

            if (native()) {
                const geo = plugin();

                if (
                    !geo ||
                    !await checkPermission() ||
                    !current()
                ) {
                    return;
                }

                position = await bounded(
                    geo.getCurrentPosition(options()),
                    TIMEOUT + 5000
                );
            } else {
                if (
                    !window.isSecureContext ||
                    !navigator.geolocation
                ) {
                    return;
                }

                position = await bounded(
                    new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(
                            resolve,
                            reject,
                            options()
                        );
                    }),
                    TIMEOUT + 5000
                );
            }

            if (current()) receive(position);
        } catch (error) {
            if (current()) handleError(error);
        } finally {
            if (request === ticket) request = null;
        }
    }

    function startLocationRefresh() {
        if (refreshTimer !== null) return;

        refreshTimer = window.setInterval(() => {
            if (!foreground()) return;

            if (
                (watch || watchStarting) &&
                Date.now() - Math.max(watchStartedAt, lastFixAt) >=
                    WATCH_RECOVERY
            ) {
                invalidateWatch();
            }

            startLocationTracking();

            // Um watch saudável não precisa de outro pedido GPS.
            if (
                watch &&
                lastFixAt > 0 &&
                Date.now() - lastFixAt < REFRESH_INTERVAL
            ) {
                return;
            }

            if (!usable(lastFix)) requestCurrentLocation();
            else sendLastKnownLocation();
        }, REFRESH_INTERVAL);
    }

    function stopLocationTracking() {
        generation++;
        invalidateWatch();

        if (refreshTimer !== null) {
            window.clearInterval(refreshTimer);
        }

        refreshTimer = null;
        request = null;
        lastFix = null;
        lastFixAt = watchStartedAt = 0;
        lastSentAt = lastErrorAt = -Infinity;
    }

    function handleError(error) {
        if (!foreground()) return;

        const code = error?.code;

        const denied =
            code === 1 ||
            [
                'OS-PLUG-GLOC-0003',
                'OS-PLUG-GLOC-0004'
            ].includes(code);

        if (denied) {
            lastFix = null;
            actions.clearMap();
        }

        if (Date.now() - lastErrorAt < 30000) return;

        lastErrorAt = Date.now();
        console.warn('Localização:', error);

        const timeout =
            code === 3 ||
            code === 'OS-PLUG-GLOC-0010';

        if (
            timeout &&
            (
                usable(lastFix) ||
                (
                    watchStartedAt &&
                    Date.now() - watchStartedAt < 60000
                )
            )
        ) {
            return;
        }

        actions.showMessage(
            denied
                ? 'A localização não foi autorizada.'
                : 'Não foi possível atualizar a localização. Vamos tentar novamente.',
            'erro'
        );
    }

    return {
        startLocationTracking,
        requestCurrentLocation,
        startLocationRefresh,
        stopLocationTracking,
        sendLastKnownLocation,
        isAndroidNativeApp,
        checkPermission,
        permissionConfirmed: () => permissionConfirmed,
        confirmPermission: granted => {
            permissionConfirmed = granted === true;
        }
    };
};