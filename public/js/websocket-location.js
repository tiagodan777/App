// GPS pontual do mapa. O serviço nativo continua a gerir o segundo plano.
window.MargotLocationTracker = function (actions) {
    'use strict';

    const MOVING_INTERVAL = 30000;
    const QUIET_INTERVAL = 60000;
    const MOVING_WINDOW = 120000;
    const MAX_AGE = 10000;
    const FIX_TIMEOUT = 15000;

    let generation = 0;
    let request = null;
    let refreshTimer = null;
    let refreshing = false;
    let lastFix = null;
    let lastSentAt = -Infinity;
    let lastRequestedAt = -Infinity;
    let movingUntil = 0;
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
            nativePlugin = window.Capacitor.Plugins?.Geolocation ||
                window.Capacitor.registerPlugin?.('Geolocation');
        }

        return nativePlugin;
    }

    function interval() {
        return Date.now() < movingUntil
            ? MOVING_INTERVAL
            : QUIET_INTERVAL;
    }

    function usable(fix) {
        if (!fix) return false;

        const age = Date.now() - fix.timestamp;
        return age >= -5000 && age <= MAX_AGE;
    }

    function distance(a, b) {
        const radians = degrees => degrees * Math.PI / 180;
        const latitude = radians(b.latitude - a.latitude);
        const longitude = radians(b.longitude - a.longitude);

        const h = Math.sin(latitude / 2) ** 2 +
            Math.cos(radians(a.latitude)) *
            Math.cos(radians(b.latitude)) *
            Math.sin(longitude / 2) ** 2;

        return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
    }

    function receive(position) {
        if (!foreground() || !position?.coords) return false;

        const {latitude, longitude, accuracy} = position.coords;
        const timestamp = position.timestamp;

        if (
            ![latitude, longitude, accuracy, timestamp].every(Number.isFinite) ||
            Math.abs(latitude) > 90 ||
            Math.abs(longitude) > 180 ||
            accuracy < 0 ||
            timestamp <= 0
        ) {
            return false;
        }

        const fix = {latitude, longitude, accuracy, timestamp};

        if (
            !usable(fix) ||
            (lastFix && timestamp < lastFix.timestamp)
        ) {
            return false;
        }

        // O ruído dentro da incerteza das duas posições não prova movimento.
        if (
            lastFix &&
            timestamp > lastFix.timestamp &&
            distance(lastFix, fix) >=
                Math.max(25, lastFix.accuracy + accuracy)
        ) {
            movingUntil = Date.now() + MOVING_WINDOW;
        }

        lastFix = fix;
        lastErrorAt = -Infinity;
        sendLastKnownLocation();

        return true;
    }

    function sendLastKnownLocation() {
        if (!foreground() || !usable(lastFix)) return false;

        if (Date.now() - lastSentAt < MOVING_INTERVAL) {
            return true;
        }

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

    function handleError(error) {
        if (!foreground()) return;

        const denied = error?.code === 1 ||
            ['OS-PLUG-GLOC-0003', 'OS-PLUG-GLOC-0004']
                .includes(error?.code);

        if (denied) {
            permissionConfirmed = false;
            lastFix = null;
            actions.clearMap();
        }

        if (Date.now() - lastErrorAt < 60000) return;

        lastErrorAt = Date.now();
        console.warn('Localização:', error);

        if (usable(lastFix)) return;

        actions.showMessage(
            denied
                ? 'A localização não foi autorizada.'
                : 'Não foi possível atualizar a localização. Vamos tentar novamente.',
            'erro'
        );
    }

    async function checkPermission() {
        if (!native()) return true;

        const cycle = generation;
        let timer;

        try {
            const geo = plugin();
            if (!geo) return false;

            const state = await Promise.race([
                geo.checkPermissions(),
                new Promise((_, reject) => {
                    timer = window.setTimeout(
                        () => reject({code: 3}),
                        10000
                    );
                })
            ]);

            if (cycle !== generation) return false;

            permissionConfirmed =
                state?.location === 'granted' ||
                state?.coarseLocation === 'granted';

            if (!permissionConfirmed) {
                actions.clearMap();
            }

            return permissionConfirmed;
        } catch (error) {
            if (cycle === generation) {
                permissionConfirmed = false;
                handleError(error);
            }

            return false;
        } finally {
            window.clearTimeout(timer);
        }
    }

    function scheduleRefresh() {
        window.clearTimeout(refreshTimer);
        refreshTimer = null;

        if (!refreshing || !foreground()) return;

        const delay = Math.max(
            1000,
            lastRequestedAt + interval() - Date.now()
        );

        refreshTimer = window.setTimeout(async () => {
            refreshTimer = null;
            await requestCurrentLocation();
            scheduleRefresh();
        }, delay);
    }

    async function requestCurrentLocation() {
        const cycle = generation;

        await window.MargotLocationReady;

        if (cycle !== generation || !foreground()) return;
        if (request) return request.done;

        if (usable(lastFix)) {
            sendLastKnownLocation();
            return;
        }

        // Focus, pageshow, autenticação e resume não duplicam os pedidos.
        if (Date.now() - lastRequestedAt < MOVING_INTERVAL) return;

        lastRequestedAt = Date.now();

        let resolve;

        const ticket = {
            done: new Promise(finish => {
                resolve = finish;
            }),
            watch: null,
            timer: null,
            finished: false,
            finish: null
        };

        request = ticket;

        const current = () =>
            request === ticket &&
            generation === cycle &&
            foreground();

        ticket.finish = () => {
            if (ticket.finished) return;

            ticket.finished = true;
            window.clearTimeout(ticket.timer);

            clearWatch(ticket.watch);
            ticket.watch = null;

            if (request === ticket) {
                request = null;
            }

            resolve();
        };

        const received = (position, error) => {
            if (!current()) return;

            if (error) {
                handleError(error);
                ticket.finish();
            } else if (receive(position)) {
                ticket.finish();
            }
        };

        const assignWatch = item => {
            if (!current()) {
                clearWatch(item);
            } else {
                ticket.watch = item;
            }
        };

        try {
            const geo = native() ? plugin() : null;

            if (native() && (!geo || !await checkPermission())) {
                ticket.finish();
                return;
            }

            if (!current()) {
                ticket.finish();
                return;
            }

            if (
                !geo &&
                (!window.isSecureContext || !navigator.geolocation)
            ) {
                ticket.finish();
                return;
            }

            ticket.timer = window.setTimeout(() => {
                if (current()) {
                    handleError({code: 3});
                }

                ticket.finish();
            }, FIX_TIMEOUT);

            const options = {
                enableHighAccuracy: true,
                maximumAge: MAX_AGE,
                timeout: FIX_TIMEOUT,
                minimumUpdateInterval: 1000,
                interval: 1000
            };

            if (geo) {
                // O ID pode chegar depois do callback ou do cancelamento.
                Promise.resolve(geo.watchPosition(options, received))
                    .then(id =>
                        assignWatch({
                            id,
                            native: true,
                            plugin: geo
                        })
                    )
                    .catch(error => {
                        if (current()) {
                            handleError(error);
                        }

                        ticket.finish();
                    });
            } else {
                const id = navigator.geolocation.watchPosition(
                    position => received(position),
                    error => received(null, error),
                    options
                );

                assignWatch({id, native: false});
            }

            await ticket.done;
        } catch (error) {
            if (current()) {
                handleError(error);
            }

            ticket.finish();
        }
    }

    function startLocationTracking() {
        return requestCurrentLocation();
    }

    function startLocationRefresh() {
        refreshing = true;
        scheduleRefresh();
    }

    function stopLocationTracking() {
        generation++;
        refreshing = false;

        window.clearTimeout(refreshTimer);
        refreshTimer = null;

        request?.finish();

        lastFix = null;
        lastSentAt = -Infinity;
        lastRequestedAt = -Infinity;
        lastErrorAt = -Infinity;
        movingUntil = 0;
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