(function () {
    'use strict';

    if (window.__margotBackgroundLocationLoaded) {
        return;
    }

    window.__margotBackgroundLocationLoaded = true;

    var capacitor = window.Capacitor;
    var plugin = capacitor && capacitor.Plugins
        ? capacitor.Plugins.BackgroundLocation
        : null;

    if (!plugin && capacitor && typeof capacitor.registerPlugin === 'function') {
        plugin = capacitor.registerPlugin('BackgroundLocation');
    }

    var geolocationPlugin = capacitor && capacitor.Plugins
        ? capacitor.Plugins.Geolocation
        : null;

    if (!geolocationPlugin && capacitor && typeof capacitor.registerPlugin === 'function') {
        geolocationPlugin = capacitor.registerPlugin('Geolocation');
    }

    var androidLocationPermissionPromise = null;

    function plataformaAtual() {
        if (capacitor && typeof capacitor.getPlatform === 'function') {
            return String(capacitor.getPlatform() || 'web').toLowerCase();
        }

        return 'web';
    }

    function preferencias() {
        return window.MargotPreferencias || null;
    }

    /*
     * A localização nativa em background depende da preferência do utilizador.
     * A flag temporária disableLocationTracking pode apenas desativar
     * a lógica do mapa numa página, como o chat.
     */
    function localizacaoPermitida() {
        var gestor = preferencias();

        if (gestor && typeof gestor.obter === 'function') {
            return gestor.obter('localizacao') !== false;
        }

        return window.disableLocationTracking !== true;
    }

    function estaInvisivel() {
        var gestor = preferencias();

        if (gestor && typeof gestor.obter === 'function') {
            return gestor.obter('invisivel') === true;
        }

        return window.margotInvisible === true;
    }

    function presencaVisivel() {
        return localizacaoPermitida() && !estaInvisivel();
    }

    function plataformaNativa() {
        if (!capacitor) {
            return false;
        }

        if (typeof capacitor.isNativePlatform === 'function') {
            return capacitor.isNativePlatform();
        }

        if (typeof capacitor.getPlatform === 'function') {
            return capacitor.getPlatform() !== 'web';
        }

        return false;
    }

    function pluginDisponivel() {
        if (!plataformaNativa() || !plugin) {
            return false;
        }

        if (typeof capacitor.isPluginAvailable === 'function') {
            return capacitor.isPluginAvailable('BackgroundLocation');
        }

        return true;
    }

    function androidNativo() {
        return plataformaNativa() && plataformaAtual() === 'android';
    }

    function permissaoLocalizacaoConcedida(estado) {
        if (!estado || typeof estado !== 'object') {
            return false;
        }

        return estado.location === 'granted' || estado.coarseLocation === 'granted';
    }

    /*
     * No Android, push-notifications.js gere POST_NOTIFICATIONS.
     * O pedido de localização espera pela conclusão desse fluxo.
     */
    function aguardarPermissaoNotificacoesAndroid() {
        if (!androidNativo()) {
            return Promise.resolve();
        }

        if (window.margotNotificationPermissionFlowManaged !== true) {
            return Promise.resolve();
        }

        if (window.margotNotificationPermissionFlowCompleted === true) {
            return Promise.resolve();
        }

        return new Promise(function (resolve) {
            var terminou = false;

            var concluir = function () {
                if (terminou) {
                    return;
                }

                terminou = true;
                window.removeEventListener(
                    'margot:notificacoes-permissao-concluida',
                    concluir
                );

                resolve();
            };

            window.addEventListener(
                'margot:notificacoes-permissao-concluida',
                concluir
            );

            if (window.margotNotificationPermissionFlowCompleted === true) {
                concluir();
            }
        });
    }

    function publicarPermissaoLocalizacaoAndroid(granted, estado) {
        window.margotAndroidLocationPermissionFlowCompleted = true;

        window.dispatchEvent(
            new CustomEvent('margot:localizacao-permissao-concluida', {
                detail: {
                    granted: granted === true,
                    status: estado || null
                }
            })
        );
    }

    function garantirPermissaoLocalizacaoAndroid() {
        if (!androidNativo()) {
            return Promise.resolve({ granted: true, status: null });
        }

        window.margotAndroidLocationPermissionFlowManaged = true;

        if (androidLocationPermissionPromise) {
            return androidLocationPermissionPromise;
        }

        if (
            !geolocationPlugin ||
            typeof geolocationPlugin.checkPermissions !== 'function' ||
            typeof geolocationPlugin.requestPermissions !== 'function'
        ) {
            return Promise.resolve({ granted: false, status: null });
        }

        androidLocationPermissionPromise = aguardarPermissaoNotificacoesAndroid()
            .then(function () {
                return geolocationPlugin.checkPermissions();
            })
            .then(function (estado) {
                if (permissaoLocalizacaoConcedida(estado)) {
                    return { granted: true, status: estado };
                }

                return geolocationPlugin
                    .requestPermissions({ permissions: ['location'] })
                    .then(function (novoEstado) {
                        return {
                            granted: permissaoLocalizacaoConcedida(novoEstado),
                            status: novoEstado
                        };
                    });
            })
            .then(function (resultado) {
                androidLocationPermissionPromise = null;

                publicarPermissaoLocalizacaoAndroid(
                    resultado.granted,
                    resultado.status
                );

                return resultado;
            })
            .catch(function (erro) {
                androidLocationPermissionPromise = null;

                console.error(
                    'Não foi possível pedir a permissão de localização:',
                    erro
                );

                publicarPermissaoLocalizacaoAndroid(false, null);

                return { granted: false, status: null, error: erro };
            });

        return androidLocationPermissionPromise;
    }

    function obterTokenCsrf() {
        var elemento = document.querySelector('meta[name="csrf-token"]');
        return elemento ? String(elemento.getAttribute('content') || '').trim() : '';
    }

    async function pedirTokenBackground() {
        var headers = {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        };

        var csrfToken = obterTokenCsrf();

        if (csrfToken !== '') {
            headers['X-CSRF-Token'] = csrfToken;
        }

        var resposta = await fetch(
            String(window.backgroundLocationTokenUrl || '/background-location-token/'),
            {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: headers
            }
        );

        var dados = {};

        try {
            dados = await resposta.json();
        } catch (erro) {
            dados = {};
        }

        if (resposta.status === 401) {
            return null;
        }

        if (!resposta.ok || !dados.success || !dados.token) {
            throw new Error(
                dados.message || 'Não foi possível ativar a localização em segundo plano.'
            );
        }

        return String(dados.token);
    }

    function localizacaoAtiva(resultado) {
        return !!(
            resultado &&
            (
                resultado.active === true ||
                resultado.isActive === true ||
                resultado.is_active === true
            )
        );
    }

    function tokenGuardado(resultado) {
        return !!(
            resultado &&
            (resultado.token_stored === true || resultado.tokenStored === true)
        );
    }

    async function definirVisibilidade(visivel) {
        if (typeof plugin.setVisibility !== 'function') {
            return estadoAtual();
        }

        return plugin.setVisibility({ visible: !!visivel });
    }

    async function estadoAtual() {
        if (!pluginDisponivel()) {
            return { available: false, active: false };
        }

        return plugin.status();
    }

    var geracao = 0;

    async function renovarToken(versao, requestAlways) {
        if (versao === undefined) versao = geracao;

        if (!pluginDisponivel()) {
            return { available: false, active: false };
        }

        var token = await pedirTokenBackground();

        if (versao !== geracao || !localizacaoPermitida()) {
            return { active: false, cancelled: true };
        }

        if (!token) {
            return {
                available: true,
                authenticated: false,
                active: false
            };
        }

        var resultado = await plugin.start({
            token: token,
            visible: presencaVisivel(),
            requestAlways: requestAlways === true
        });

        if (versao !== geracao || !localizacaoPermitida()) {
            return plugin.stop();
        }

        return resultado;
    }

    var inicializacao = null;

    async function iniciar() {
        await window.MargotLocationReady;

        if (!pluginDisponivel()) {
            return { available: false, active: false };
        }

        if (inicializacao) {
            return inicializacao;
        }

        var versao = geracao;

        inicializacao = (async function () {
            try {
                if (!localizacaoPermitida()) {
                    return parar();
                }

                /*
                 * Android: espera pela permissão de notificações antes
                 * de pedir localização. Não se aplica ao iOS.
                 */
                if (androidNativo() && presencaVisivel()) {
                    var permissaoAndroid = await garantirPermissaoLocalizacaoAndroid();

                    if (versao !== geracao) {
                        return { active: false, cancelled: true };
                    }

                    if (!permissaoAndroid.granted) {
                        return estadoAtual();
                    }
                }

                var estado = await estadoAtual();

                if (versao !== geracao) {
                    return { active: false, cancelled: true };
                }

                /*
                 * Se o serviço já está ativo, basta sincronizar a visibilidade.
                 * Evita criar um token novo em cada regresso à app.
                 */
                if (
                    localizacaoAtiva(estado) ||
                    (tokenGuardado(estado) && !presencaVisivel())
                ) {
                    var estadoSincronizado = await definirVisibilidade(presencaVisivel());

                    if (versao !== geracao) return plugin.stop();

                    return estadoSincronizado;
                }

                var resultado = await renovarToken(versao);
                return resultado;
            } catch (erro) {
                console.error('Localização em segundo plano:', erro);

                return {
                    available: true,
                    active: false,
                    error: String(erro && erro.message ? erro.message : erro)
                };
            } finally {
                inicializacao = null;
            }
        })();

        return inicializacao;
    }

    async function parar() {
        // Invalida arranques pendentes, mesmo que o HTTP termine depois do logout.
        geracao += 1;

        if (!pluginDisponivel()) {
            return { available: false, active: false };
        }

        window.MargotLocationOnboarding?.close();
        return plugin.stop();
    }

    async function abrirDefinicoes() {
        if (!pluginDisponivel()) {
            return false;
        }

        await plugin.openSettings();
        return true;
    }

    window.MargotBackgroundLocation = {
        start: function () {
            return iniciar();
        },
        requestAlways: function () {
            return renovarToken(geracao, true);
        },
        stop: parar,
        status: estadoAtual,
        openSettings: abrirDefinicoes,
        showSettingsNotice: function () {
            window.MargotLocationOnboarding?.open();
        }
    };

    if (pluginDisponivel() && typeof plugin.addListener === 'function') {
        var renovarAutorizacao = function () {
            if (!localizacaoPermitida()) {
                parar().catch(function (erro) {
                    console.error('Não foi possível parar a localização:', erro);
                });
                return;
            }

            renovarToken().catch(function (erro) {
                console.error(
                    'Não foi possível renovar a autorização da localização:',
                    erro
                );
            });
        };

        [
            'backgroundLocationAuthorizationExpired',
            'backgroundLocationTokenExpired'
        ].forEach(function (evento) {
            plugin.addListener(evento, renovarAutorizacao);
        });

        plugin.addListener('backgroundLocationAuthorizationChanged', function (state) {
            window.MargotLocationOnboarding?.authorizationChanged(state);

            if (localizacaoPermitida()) {
                iniciar();
            }
        });
    }

    function arrancar() {
        if (localizacaoPermitida()) {
            iniciar();
        } else {
            parar().catch(function (erro) {
                console.error('Localização em segundo plano:', erro);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', arrancar, { once: true });
    } else {
        arrancar();
    }

    /*
     * Ao voltar à app, verifica o serviço e sincroniza a visibilidade.
     * O Swift força também uma atualização de localização.
     */
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
            arrancar();
        }
    });

    window.addEventListener('margot:preferencias-alteradas', arrancar);
})();