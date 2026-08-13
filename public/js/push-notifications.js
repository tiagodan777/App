(function (window, document) {
    'use strict';

    if (window.MargotPushNotifications) return;

    var TOKEN_KEY = 'margot-push-token-v1';
    var INSTALLATION_KEY = 'margot-installation-id-v1';
    var SYNC_KEY = 'margot-push-sync-v1';
    var PENDING_DESTINATION_KEY = 'margot-push-destination-v1';
    var PENDING_DESTINATION_MAX_AGE = 10 * 60 * 1000;
    var CHANNEL_ID = 'margot_activity';
    var UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
    var plugin = null;
    var listenersPromise = null;
    var registrationPromise = null;

    function isNative() {
        return Boolean(
            window.Capacitor &&
            typeof window.Capacitor.isNativePlatform === 'function' &&
            window.Capacitor.isNativePlatform()
        );
    }

    function platform() {
        if (!isNative()) return 'web';

        if (typeof window.Capacitor.getPlatform === 'function') {
            return String(window.Capacitor.getPlatform() || '').toLowerCase();
        }

        return /iphone|ipad|ipod/i.test(navigator.userAgent)
            ? 'ios'
            : 'android';
    }

    function pushPlugin() {
        if (!isNative()) return null;
        if (plugin) return plugin;

        var plugins = window.Capacitor.Plugins || {};

        if (plugins.PushNotifications) {
            plugin = plugins.PushNotifications;
        } else if (typeof window.Capacitor.registerPlugin === 'function') {
            plugin = window.Capacitor.registerPlugin('PushNotifications');
        }

        return plugin;
    }

    function newUuid() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID().toLowerCase();
        }

        var bytes = new Uint8Array(16);

        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
            window.crypto.getRandomValues(bytes);
        } else {
            for (var index = 0; index < bytes.length; index += 1) {
                bytes[index] = Math.floor(Math.random() * 256);
            }
        }

        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;

        var hex = Array.from(bytes, function (byte) {
            return byte.toString(16).padStart(2, '0');
        }).join('');

        return [
            hex.slice(0, 8),
            hex.slice(8, 12),
            hex.slice(12, 16),
            hex.slice(16, 20),
            hex.slice(20)
        ].join('-');
    }

    function installationId() {
        var value = '';

        try {
            value = String(window.localStorage.getItem(INSTALLATION_KEY) || '');
        } catch (error) {
            value = '';
        }

        if (UUID_PATTERN.test(value)) {
            return value.toLowerCase();
        }

        value = newUuid();

        try {
            window.localStorage.setItem(INSTALLATION_KEY, value);
        } catch (error) {
            console.warn('Não foi possível guardar o identificador push.', error);
        }

        return value;
    }

    function storedToken() {
        try {
            return String(window.localStorage.getItem(TOKEN_KEY) || '').trim();
        } catch (error) {
            return '';
        }
    }

    function storeToken(token) {
        try {
            window.localStorage.setItem(TOKEN_KEY, token);
        } catch (error) {
            console.warn('Não foi possível guardar o token push.', error);
        }
    }

    function clearLocalRegistration() {
        try {
            window.localStorage.removeItem(TOKEN_KEY);
            window.localStorage.removeItem(SYNC_KEY);
            window.localStorage.removeItem(PENDING_DESTINATION_KEY);
        } catch (error) {
            console.warn('Não foi possível limpar o registo push local.', error);
        }
    }

    function notificationsWanted() {
        var preferences = window.MargotPreferencias;

        return !preferences || preferences.obter('notificacoes') !== false;
    }

    function memberId() {
        return String(window.membroId || '').trim();
    }

    function validInternalDestination(value) {
        var destination = String(value || '').trim();

        if (!destination || destination.indexOf('//') === 0) return '';

        try {
            var url = new URL(destination, window.location.origin);

            if (url.origin !== window.location.origin) return '';

            var uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
            var allowed = new RegExp('^/(?:profile|messages)/' + uuid + '/?$', 'i');

            return allowed.test(url.pathname)
                ? url.pathname + url.search
                : '';
        } catch (error) {
            return '';
        }
    }

    function actionDestination(action) {
        var notification = action && action.notification
            ? action.notification
            : {};
        var data = notification.data && typeof notification.data === 'object'
            ? notification.data
            : {};

        return validInternalDestination(
            data.url || notification.url || ''
        );
    }

    function openNotification(action) {
        var destination = actionDestination(action);

        if (!destination) return;

        try {
            window.localStorage.setItem(
                PENDING_DESTINATION_KEY,
                JSON.stringify({
                    destination: destination,
                    at: Date.now()
                })
            );
        } catch (error) {
            console.warn('Não foi possível guardar o destino do push.', error);
        }

        if (memberId()) {
            window.location.assign(destination);
            return;
        }

        if (!/^\/login\/?$/i.test(window.location.pathname)) {
            window.location.assign(
                String(window.loginUrl || '/login/')
            );
        }
    }

    function redirectPendingDestination() {
        if (!memberId()) return false;

        var pending = null;

        try {
            pending = JSON.parse(
                window.localStorage.getItem(PENDING_DESTINATION_KEY) || 'null'
            );
        } catch (error) {
            pending = null;
        }

        var destination = validInternalDestination(
            pending && pending.destination
        );
        var savedAt = Number(pending && pending.at || 0);

        if (
            !destination ||
            savedAt < Date.now() - PENDING_DESTINATION_MAX_AGE
        ) {
            try {
                window.localStorage.removeItem(PENDING_DESTINATION_KEY);
            } catch (error) {
                /* O registo expirado não interfere com a navegação. */
            }

            return false;
        }

        var current = window.location.pathname + window.location.search;

        if (current === destination) {
            try {
                window.localStorage.removeItem(PENDING_DESTINATION_KEY);
            } catch (error) {
                /* O destino já abriu corretamente. */
            }

            return false;
        }

        try {
            window.localStorage.removeItem(PENDING_DESTINATION_KEY);
        } catch (error) {
            /* A validação anterior mantém o destino seguro. */
        }

        window.location.assign(destination);
        return true;
    }

    function notificationData(notification) {
        return notification &&
            notification.data &&
            typeof notification.data === 'object'
            ? notification.data
            : {};
    }

    function dispatchForegroundNotification(notification) {
        var data = notificationData(notification);
        var type = String(data.type || '').toLowerCase();

        window.dispatchEvent(new CustomEvent('margot:push-recebido', {
            detail: notification || {}
        }));

        if (type === 'hey') {
            window.dispatchEvent(new CustomEvent('app:hey-recebido', {
                detail: data
            }));
            return;
        }

        if (type === 'message') {
            window.dispatchEvent(new CustomEvent(
                'app:chat-push-recebido',
                { detail: data }
            ));
        }
    }

    async function postDevice(action, token) {
        var endpoint = String(window.pushDeviceUrl || '/push-device/');
        var currentMemberId = memberId();

        if (!currentMemberId) return false;

        var response = await window.fetch(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
                action: action,
                platform: platform(),
                token: token || '',
                installation_id: installationId()
            })
        });

        if (!response.ok) {
            throw new Error('O servidor recusou o registo push (' + response.status + ').');
        }

        var result = await response.json();
        return result && result.success === true;
    }

    function syncFingerprint(token) {
        return memberId() + ':' + platform() + ':' + token;
    }

    function wasRecentlySynced(token) {
        try {
            var value = JSON.parse(window.localStorage.getItem(SYNC_KEY) || '{}');

            return value &&
                value.fingerprint === syncFingerprint(token) &&
                Number(value.at || 0) > Date.now() - (60 * 60 * 1000);
        } catch (error) {
            return false;
        }
    }

    function markSynced(token) {
        try {
            window.localStorage.setItem(SYNC_KEY, JSON.stringify({
                fingerprint: syncFingerprint(token),
                at: Date.now()
            }));
        } catch (error) {
            console.warn('Não foi possível guardar o estado push.', error);
        }
    }

    async function syncToken(token, force) {
        token = String(token || '').trim();

        if (!token || !memberId() || !notificationsWanted()) return false;
        if (!force && wasRecentlySynced(token)) return true;

        var success = await postDevice('register', token);

        if (success) markSynced(token);
        return success;
    }

    async function prepareAndroidChannel(push) {
        if (platform() !== 'android' || typeof push.createChannel !== 'function') {
            return;
        }

        await push.createChannel({
            id: CHANNEL_ID,
            name: 'Atividade da Margot',
            description: 'Heys e novas mensagens',
            importance: 4,
            visibility: 1,
            vibration: true
        });
    }

    async function prepareListeners(push) {
        if (listenersPromise) return listenersPromise;

        listenersPromise = (async function () {
            await push.addListener('registration', function (result) {
                var token = String(result && result.value || '').trim();

                if (!token) return;
                storeToken(token);

                syncToken(token, true).catch(function (error) {
                    console.warn('Não foi possível sincronizar o token push.', error);
                });
            });

            await push.addListener('registrationError', function (error) {
                console.warn(
                    'O sistema não conseguiu registar as notificações push.',
                    error
                );
            });

            await push.addListener(
                'pushNotificationReceived',
                dispatchForegroundNotification
            );

            await push.addListener(
                'pushNotificationActionPerformed',
                openNotification
            );
        })().catch(function (error) {
            listenersPromise = null;
            throw error;
        });

        return listenersPromise;
    }

    async function permissionState() {
        var push = pushPlugin();

        if (!push) return isNative() ? 'unsupported' : 'web';

        try {
            var permissions = await push.checkPermissions();
            return String(permissions && permissions.receive || 'prompt');
        } catch (error) {
            return 'unknown';
        }
    }

    async function requestPermission() {
        var push = pushPlugin();

        if (!push) return 'unsupported';

        await prepareListeners(push);
        var permissions = await push.checkPermissions();
        var state = String(permissions && permissions.receive || 'prompt');

        if (state !== 'granted') {
            permissions = await push.requestPermissions();
            state = String(permissions && permissions.receive || 'denied');
        }

        if (state === 'granted') {
            await prepareAndroidChannel(push);
            await push.register();
        }

        return state;
    }

    async function register() {
        if (registrationPromise) return registrationPromise;

        registrationPromise = (async function () {
            var push = pushPlugin();

            if (!push || !notificationsWanted()) return false;

            await prepareListeners(push);
            var state = await permissionState();

            if (state !== 'granted') return false;

            await prepareAndroidChannel(push);

            var token = storedToken();
            if (token) await syncToken(token, false);

            await push.register();
            return true;
        })().catch(function (error) {
            console.warn('Não foi possível iniciar as notificações push.', error);
            return false;
        }).finally(function () {
            registrationPromise = null;
        });

        return registrationPromise;
    }

    async function unregister() {
        var push = pushPlugin();
        var token = storedToken();

        try {
            if (memberId()) {
                await postDevice('unregister', token);
            }
        } catch (error) {
            console.warn('Não foi possível remover o dispositivo no servidor.', error);
        }

        try {
            if (push && typeof push.unregister === 'function') {
                await push.unregister();
            }

            if (push && typeof push.removeAllDeliveredNotifications === 'function') {
                await push.removeAllDeliveredNotifications();
            }
        } finally {
            clearLocalRegistration();
        }

        return true;
    }

    window.MargotPushNotifications = {
        isNative: isNative,
        isAvailable: function () { return Boolean(pushPlugin()); },
        permissionState: permissionState,
        requestPermission: requestPermission,
        register: register,
        unregister: unregister
    };

    async function initialize() {
        var push = pushPlugin();

        if (push) {
            try {
                await prepareListeners(push);
            } catch (error) {
                console.warn(
                    'Não foi possível preparar as notificações push.',
                    error
                );
            }
        }

        if (redirectPendingDestination()) return;

        if (memberId() && notificationsWanted()) register();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }

    window.addEventListener('margot:preferencias-alteradas', function (event) {
        var preferences = event.detail || {};

        if (preferences.notificacoes === true) {
            register();
        } else if (preferences.notificacoes === false && memberId()) {
            unregister();
        }
    });
})(window, document);