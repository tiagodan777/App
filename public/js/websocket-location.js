// Localização em primeiro plano. O transporte e o mapa são fornecidos pelo websocket.js.
window.MargotLocationTracker = function (actions) {
    'use strict';

    var send = actions.send;
    var limparMapaLocal = actions.clearMap;
    var mostrarMensagemTemporaria = actions.showMessage;

    var locationRefreshTimer = null;
    var locationWatchId = null;
    var locationWatchProvider = null;
    var locationWatchStarting = false;
    var locationWatchGeneration = 0;
    var locationLifecycleGeneration = 0;
    var locationRequestPending = false;
    var locationTrackingStartedAt = 0;

    var lastLocationErrorAt = 0;
    var lastLocationSentAt = 0;
    var lastSentLatitude = null;
    var lastSentLongitude = null;
    var lastKnownLocation = null;

    var LOCATION_MIN_INTERVAL = 15000;
    var LOCATION_REFRESH_INTERVAL = 45000;
    var LOCATION_MIN_DISTANCE = 5;
    var LOCATION_MAX_AGE = 10000;
    var LOCATION_TIMEOUT = 30000;
    var LOCATION_ERROR_COOLDOWN = 30000;
    var LOCATION_STARTUP_GRACE = 60000;

    async function startLocationTracking() {
        var lifecycle = locationLifecycleGeneration;
        await window.MargotLocationReady;

        if (lifecycle !== locationLifecycleGeneration || window.disableLocationTracking
            || document.visibilityState !== 'visible' || locationWatchId !== null || locationWatchStarting) {
            return;
        }

        // Reservar antes da primeira verificação assíncrona impede dois arranques.
        locationWatchStarting = true;
        var nativeWatchPending = false;
        var nativeGeolocation;
        try {
            nativeGeolocation = getNativeGeolocation();
            if (isNativeApp()) {
                if (!nativeGeolocation) {
                    mostrarMensagemTemporaria('A localização nativa não está disponível.', 'erro');
                    return;
                }
                if (window.MargotLocationOnboarding) {
                    var permission = await nativeGeolocation.checkPermissions();
                    if (!locationPermissionGranted(permission)) return;
                }
                if (isAndroidNativeApp() && !await ensureAndroidLocationPermission(nativeGeolocation)) {
                    return;
                }
                if (lifecycle !== locationLifecycleGeneration || window.disableLocationTracking
                    || document.visibilityState !== 'visible') return;

                nativeWatchPending = true;
                startNativeLocationWatch(nativeGeolocation);
                return;
            }
            if (!window.isSecureContext) {
                mostrarMensagemTemporaria('A localização exige HTTPS.', 'erro');
                return;
            }
            if (!('geolocation' in navigator)) {
                mostrarMensagemTemporaria('Este dispositivo não suporta localização.', 'erro');
                return;
            }
            locationTrackingStartedAt = Date.now();
            locationWatchProvider = 'web';
            locationWatchId = navigator.geolocation.watchPosition(
                function (position) {
                    if (lifecycle === locationLifecycleGeneration) handleLocationSuccess(position);
                },
                function (error) {
                    if (lifecycle === locationLifecycleGeneration) handleLocationError(error);
                },
                getLocationOptions()
            );
        } catch (error) {
            if (lifecycle === locationLifecycleGeneration) {
                console.warn('Não foi possível iniciar a localização.', error);
            }
        } finally {
            if (!nativeWatchPending && lifecycle === locationLifecycleGeneration) {
                locationWatchStarting = false;
            }
        }
    }

    function startNativeLocationWatch(nativeGeolocation) {
        locationTrackingStartedAt = Date.now();

        var generation = ++locationWatchGeneration;

        Promise.resolve().then(function () {
            return nativeGeolocation.watchPosition(getLocationOptions(), function (position, error) {
                if (
                    generation !== locationWatchGeneration ||
                    window.disableLocationTracking
                ) {
                    return;
                }

                if (error) {
                    handleLocationError(error);
                    return;
                }

                if (position) {
                    handleLocationSuccess(position);
                }
            });
        }).then(function (watchId) {
                if (
                    generation !== locationWatchGeneration ||
                    window.disableLocationTracking
                ) {
                    return Promise.resolve().then(function () {
                        return nativeGeolocation.clearWatch({ id: String(watchId) });
                    }).catch(function (error) {
                            console.warn(
                                'Não foi possível terminar a localização nativa.',
                                error
                            );
                        });
                }

                locationWatchId = String(watchId);
                locationWatchProvider = 'native';
                locationWatchStarting = false;
            })
            .catch(function (error) {
                if (generation !== locationWatchGeneration) {
                    return;
                }

                locationWatchId = null;
                locationWatchProvider = null;
                locationWatchStarting = false;

                handleLocationError(error);
            });
    }

    async function requestCurrentLocation() {
        var lifecycle = locationLifecycleGeneration;
        await window.MargotLocationReady;
        if (lifecycle !== locationLifecycleGeneration || window.disableLocationTracking
            || document.visibilityState !== 'visible' || locationRequestPending) return;

        locationRequestPending = true;
        var current = function () {
            return lifecycle === locationLifecycleGeneration && !window.disableLocationTracking
                && document.visibilityState === 'visible';
        };
        try {
            var nativeGeolocation = getNativeGeolocation();
            if (isNativeApp()) {
                if (!nativeGeolocation) {
                    mostrarMensagemTemporaria('A localização nativa não está disponível.', 'erro');
                    return;
                }
                if (window.MargotLocationOnboarding) {
                    var permission = await nativeGeolocation.checkPermissions();
                    if (!locationPermissionGranted(permission)) return;
                }
                if (isAndroidNativeApp() && !await ensureAndroidLocationPermission(nativeGeolocation)) {
                    return;
                }
                if (!current()) return;
                var position = await nativeGeolocation.getCurrentPosition(getLocationOptions());
                if (current()) handleLocationSuccess(position);
                return;
            }
            if (!window.isSecureContext || !('geolocation' in navigator)) return;
            await new Promise(function (resolve) {
                navigator.geolocation.getCurrentPosition(
                    function (position) {
                        if (current()) handleLocationSuccess(position);
                        resolve();
                    },
                    function (error) {
                        if (current()) handleLocationError(error);
                        resolve();
                    },
                    getLocationOptions()
                );
            });
        } catch (error) {
            if (current()) handleLocationError(error);
        } finally {
            // Uma resposta antiga não pode libertar um pedido de um novo ciclo.
            if (lifecycle === locationLifecycleGeneration) locationRequestPending = false;
        }
    }

    function isNativeApp() {
        return Boolean(
            window.Capacitor &&
            typeof window.Capacitor.isNativePlatform === 'function' &&
            window.Capacitor.isNativePlatform()
        );
    }

    function isAndroidNativeApp() {
        return Boolean(
            isNativeApp() &&
            window.Capacitor &&
            typeof window.Capacitor.getPlatform === 'function' &&
            window.Capacitor.getPlatform() === 'android'
        );
    }

    var nativeGeolocationPlugin = null;
    var androidLocationPermissionPromise = null;
    var androidLocationPermissionConfirmed = !isAndroidNativeApp();

    function getNativeGeolocation() {
        if (!isNativeApp() || !window.Capacitor) {
            return null;
        }

        if (nativeGeolocationPlugin) {
            return nativeGeolocationPlugin;
        }

        var plugins = window.Capacitor.Plugins || {};

        if (plugins.Geolocation) {
            nativeGeolocationPlugin = plugins.Geolocation;
            return nativeGeolocationPlugin;
        }

        if (typeof window.Capacitor.registerPlugin === 'function') {
            nativeGeolocationPlugin = window.Capacitor.registerPlugin('Geolocation');
            return nativeGeolocationPlugin;
        }

        return null;
    }

    function locationPermissionGranted(status) {
        if (!status || typeof status !== 'object') {
            return false;
        }

        return status.location === 'granted' || status.coarseLocation === 'granted';
    }

    function ensureAndroidLocationPermission(nativeGeolocation) {
        if (!isAndroidNativeApp()) {
            return Promise.resolve(true);
        }

        if (androidLocationPermissionPromise) {
            return androidLocationPermissionPromise;
        }

        if (!nativeGeolocation || typeof nativeGeolocation.checkPermissions !== 'function') {
            androidLocationPermissionConfirmed = false;
            limparMapaLocal();
            return Promise.resolve(false);
        }

        /*
         * O pedido de autorização pertence ao fluxo de localização.
         * Aqui apenas confirmamos se o Android já concedeu a permissão.
         */
        androidLocationPermissionPromise = nativeGeolocation
            .checkPermissions()
            .then(function (status) {
                var granted = locationPermissionGranted(status);

                androidLocationPermissionPromise = null;
                androidLocationPermissionConfirmed = granted;

                if (!granted) {
                    limparMapaLocal();
                }

                return granted;
            })
            .catch(function (error) {
                androidLocationPermissionPromise = null;
                androidLocationPermissionConfirmed = false;

                limparMapaLocal();

                console.warn(
                    'Não foi possível verificar a permissão de localização.',
                    error
                );

                return false;
            });

        return androidLocationPermissionPromise;
    }

    function getLocationOptions() {
        return {
            enableHighAccuracy: true,
            maximumAge: LOCATION_MAX_AGE,
            timeout: LOCATION_TIMEOUT
        };
    }

    function startLocationRefresh() {
        clearLocationRefreshTimer();

        locationRefreshTimer = window.setInterval(function () {
            if (
                document.visibilityState !== 'visible' ||
                window.disableLocationTracking
            ) {
                return;
            }

            // O watcher pode já ter uma leitura recente; nesse caso não duplicar GPS.
            var age = lastKnownLocation ? Date.now() - lastKnownLocation.timestamp : Infinity;
            if (age >= 0 && age <= LOCATION_MAX_AGE) {
                sendLastKnownLocation();
                return;
            }
            // Não renovar indefinidamente coordenadas antigas quando o watcher cala.
            requestCurrentLocation().catch(function (error) {
                console.warn('Não foi possível atualizar a localização.', error);
            });
        }, LOCATION_REFRESH_INTERVAL);
    }

    function stopLocationTracking() {
        var watchId = locationWatchId;
        var watchProvider = locationWatchProvider;
        var nativeGeolocation = getNativeGeolocation();

        locationWatchGeneration += 1;
        locationLifecycleGeneration += 1;
        locationWatchId = null;
        locationWatchProvider = null;
        locationWatchStarting = false;

        if (watchId !== null && watchProvider === 'native' && nativeGeolocation) {
            Promise.resolve().then(function () {
                return nativeGeolocation.clearWatch({ id: String(watchId) });
            }).catch(function (error) {
                console.warn('Não foi possível terminar a localização nativa.', error);
            });
        } else if (
            watchId !== null &&
            watchProvider === 'web' &&
            navigator.geolocation
        ) {
            navigator.geolocation.clearWatch(watchId);
        }

        clearLocationRefreshTimer();

        locationRequestPending = false;
        locationTrackingStartedAt = 0;
        lastLocationErrorAt = 0;
        lastLocationSentAt = 0;
        lastSentLatitude = null;
        lastSentLongitude = null;
        lastKnownLocation = null;
    }

    function handleLocationSuccess(position) {
        if (window.disableLocationTracking) {
            return;
        }

        if (!position || !position.coords) {
            return;
        }

        var latitude = Number(position.coords.latitude);
        var longitude = Number(position.coords.longitude);
        var accuracy = Number(position.coords.accuracy) || 0;

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return;
        }

        lastKnownLocation = {
            latitude: latitude,
            longitude: longitude,
            accuracy: accuracy,
            timestamp: Number(position.timestamp) || Date.now()
        };

        lastLocationErrorAt = 0;

        var agora = Date.now();

        var distancia = lastSentLatitude === null
            ? Infinity
            : calculateDistanceMeters(
                lastSentLatitude,
                lastSentLongitude,
                latitude,
                longitude
            );

        var passouTempo = agora - lastLocationSentAt >= LOCATION_MIN_INTERVAL;

        if (
            lastSentLatitude !== null &&
            !passouTempo &&
            distancia < LOCATION_MIN_DISTANCE
        ) {
            return;
        }

        sendLastKnownLocation();
    }

    function sendLastKnownLocation() {
        if (!lastKnownLocation || window.disableLocationTracking) {
            return false;
        }

        if (
            !send({
                type: 'location',
                latitude: lastKnownLocation.latitude,
                longitude: lastKnownLocation.longitude,
                accuracy: lastKnownLocation.accuracy,
                timestamp: lastKnownLocation.timestamp
            })
        ) {
            return false;
        }

        lastLocationSentAt = Date.now();
        lastSentLatitude = lastKnownLocation.latitude;
        lastSentLongitude = lastKnownLocation.longitude;

        return true;
    }

    function handleLocationError(error) {
        if (window.disableLocationTracking) {
            return;
        }

        var code = error && error.code;
        var errorMessage = String(
            error && error.message ? error.message : ''
        ).toLowerCase();

        var mensagem = 'Não foi possível obter a localização.';

        var permissionDenied =
            code === 1 ||
            code === 'OS-PLUG-GLOC-0003' ||
            code === 'OS-PLUG-GLOC-0004' ||
            errorMessage.includes('permission denied') ||
            errorMessage.includes('not authorized');

        var positionUnavailable =
            code === 2 ||
            code === 'OS-PLUG-GLOC-0002' ||
            code === 'OS-PLUG-GLOC-0007' ||
            code === 'OS-PLUG-GLOC-0008' ||
            code === 'OS-PLUG-GLOC-0017';

        var timedOut =
            code === 3 ||
            code === 'OS-PLUG-GLOC-0010' ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('timed out');

        if (permissionDenied) {
            mensagem = 'A localização não foi autorizada.';
        } else if (positionUnavailable) {
            mensagem = 'A localização não está disponível.';
        } else if (timedOut) {
            mensagem = 'A localização demorou demasiado tempo.';

            if (
                lastKnownLocation ||
                (
                    locationTrackingStartedAt > 0 &&
                    Date.now() - locationTrackingStartedAt < LOCATION_STARTUP_GRACE
                )
            ) {
                console.warn(
                    'A atualização pontual da localização expirou; foi mantida a última posição válida.',
                    error
                );
                return;
            }
        }

        console.warn(mensagem, error);

        if (
            lastLocationErrorAt > 0 &&
            Date.now() - lastLocationErrorAt < LOCATION_ERROR_COOLDOWN
        ) {
            return;
        }

        lastLocationErrorAt = Date.now();
        mostrarMensagemTemporaria(mensagem, 'erro');
    }

    function calculateDistanceMeters(lat1, lng1, lat2, lng2) {
        var raio = 6371000;
        var latitude1 = toRadians(lat1);
        var latitude2 = toRadians(lat2);
        var diferencaLatitude = toRadians(lat2 - lat1);
        var diferencaLongitude = toRadians(lng2 - lng1);

        var a =
            Math.sin(diferencaLatitude / 2) ** 2 +
            Math.cos(latitude1) *
                Math.cos(latitude2) *
                Math.sin(diferencaLongitude / 2) ** 2;

        return raio * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function toRadians(valor) {
        return (valor * Math.PI) / 180;
    }

    function clearLocationRefreshTimer() {
        if (!locationRefreshTimer) {
            return;
        }

        window.clearInterval(locationRefreshTimer);
        locationRefreshTimer = null;
    }

    return {
        startLocationTracking: startLocationTracking,
        requestCurrentLocation: requestCurrentLocation,
        isAndroidNativeApp: isAndroidNativeApp,
        startLocationRefresh: startLocationRefresh,
        stopLocationTracking: stopLocationTracking,
        sendLastKnownLocation: sendLastKnownLocation,

        checkPermission: function () {
            return ensureAndroidLocationPermission(getNativeGeolocation());
        },

        permissionConfirmed: function () {
            return androidLocationPermissionConfirmed;
        },

        confirmPermission: function (granted) {
            androidLocationPermissionConfirmed = granted;
        }
    };
};