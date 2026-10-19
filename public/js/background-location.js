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

    var ultimaConsultaPolicy = -Infinity;
    var consultaPolicy = null;

    function atualizarPolicy(state) {
        window.MargotNativeLocationCacheAvailable = state?.policy_version === 'native-battery-1';
        // Capability gated: older installed builds never receive an unknown method call.
        if (!state || state.policy_version !== 'native-battery-1' || !plugin ||
            typeof plugin.configure !== 'function' || consultaPolicy ||
            Date.now() - ultimaConsultaPolicy < 3600000) return;
        ultimaConsultaPolicy = Date.now();
        consultaPolicy = comPrazo(fetch('/location-policy.json', {cache:'no-store',credentials:'same-origin'})
            .then(function(response) {
                if (!response.ok) throw new Error('Política indisponível');
                return response.json();
            }),5000)
            .then(function(policy) { return comPrazo(plugin.configure({policy:policy}),5000); })
            .catch(function() {
                // Keep the validated on-device policy; retry after five minutes of foreground use.
                ultimaConsultaPolicy = Date.now() - 3300000;
            })
            .finally(function() { consultaPolicy = null; });
    }

    var androidLocationPermissionPromise = null;
    var renovacao = null;
    var ultimaRetoma = 0;

    function comPrazo(promise, ms) {
        var timer;
        return Promise.race([promise, new Promise(function (_, reject) {
            timer = window.setTimeout(function () {
                reject(new Error('A ligação à localização demorou demasiado tempo.'));
            }, ms);
        })]).finally(function () { window.clearTimeout(timer); });
    }

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
        return localizacaoPermitida() && (!estaInvisivel() || window.MargotLocationPrivacy?.allowsCollection() === true);
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
     * Aguarda a preparação inicial das notificações no Android.
     * Essa preparação consulta o estado sem abrir um pedido de autorização.
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

        var controller = new AbortController();
        var resposta;
        var dados;

        try {
            var pacote = await comPrazo((async function () {
                var response = await fetch(
                    String(window.backgroundLocationTokenUrl || '/background-location-token/'),
                    {
                        method: 'POST',
                        credentials: 'same-origin',
                        cache: 'no-store',
                        headers: headers,
                        signal: controller.signal
                    }
                );

                var body = await response.json().catch(function () {
                    return {};
                });

                return { response: response, body: body };
            })(), 15000);

            resposta = pacote.response;
            dados = pacote.body;
        } finally {
            controller.abort();
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

        var state = await comPrazo(plugin.status(), 10000);
        atualizarPolicy(state);

        if (androidNativo()) {
            // O plugin nativo já consulta GPS e permissões. checkPermissions()
            // pode lançar uma exceção com o GPS desligado e esconder o aviso.
            state.services_enabled = state.permission !== 'disabled';
        }

        return state;
    }

    var geracao = 0;

    function renovarToken(versao, requestAlways) {
        if (renovacao) {
            return renovacao;
        }

        renovacao = executarRenovacao(versao, requestAlways).finally(function () {
            renovacao = null;
        });

        return renovacao;
    }

    async function executarRenovacao(versao, requestAlways) {
        if (versao === undefined) {
            versao = geracao;
        }

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

    async function pedirPermissao(always) {
        var state = await estadoAtual();

        if (plataformaAtual() === 'ios') {
            if (state.permission_flow_version !== 2) {
                // Compatibilidade com builds já publicados.
                if (always || !geolocationPlugin) {
                    return state;
                }

                const permission = await geolocationPlugin.checkPermissions();

                if (
                    !permissaoLocalizacaoConcedida(permission) &&
                    permission.location !== 'denied'
                ) {
                    await geolocationPlugin.requestPermissions({
                        permissions: ['location']
                    });
                }

                return estadoAtual();
            }

            return plugin.requestPermission({ always: always === true });
        }

        return garantirPermissaoLocalizacaoAndroid();
    }

    var inicializacao = null;
    var ultimaConfirmacaoAndroid = 0;

    async function iniciar(periodico) {
        await window.MargotLocationReady;

        if (document.visibilityState !== 'visible') {
            return { active: false, deferred: true };
        }

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
                 * Compatibilidade com páginas sem o novo coordenador.
                 * Com o coordenador, as permissões são pedidas por ele.
                 */
                if (
                    !window.MargotLocationOnboarding &&
                    androidNativo() &&
                    presencaVisivel()
                ) {
                    var permissaoAndroid = await garantirPermissaoLocalizacaoAndroid();

                    if (versao !== geracao) {
                        return { active: false, cancelled: true };
                    }

                    if (!permissaoAndroid.granted) {
                        return estadoAtual();
                    }
                }

                var estado = await estadoAtual();

                if (window.MargotLocationOnboarding) {
                    if (
                        plataformaAtual() === 'ios' &&
                        (
                            !['when_in_use', 'always'].includes(estado.authorization) ||
                            estado.services_enabled === false
                        )
                    ) {
                        return estado;
                    }

                    if (
                        androidNativo() &&
                        !permissaoLocalizacaoConcedida(
                            await comPrazo(geolocationPlugin.checkPermissions(), 10000)
                        )
                    ) {
                        return estado;
                    }
                }

                if (versao !== geracao) {
                    return { active: false, cancelled: true };
                }

                var visivel = presencaVisivel();

                if (
                    periodico === true &&
                    plataformaAtual() === 'ios' &&
                    estado.authorization === 'when_in_use' &&
                    tokenGuardado(estado) &&
                    estado.visible === visivel
                ) {
                    return estado;
                }

                // Android: confirmar arranque real, mesmo com active antigo.
                if (androidNativo() && visivel && tokenGuardado(estado)) {
                    if (
                        document.visibilityState !== 'visible' ||
                        !localizacaoPermitida() ||
                        !visivel
                    ) {
                        return { active: false, deferred: true };
                    }

                    var agoraAndroid = Date.now();

                    if (
                        localizacaoAtiva(estado) &&
                        estado.visible === true &&
                        agoraAndroid - ultimaConfirmacaoAndroid < 15000
                    ) {
                        return estado;
                    }

                    ultimaConfirmacaoAndroid = agoraAndroid;

                    // Usa o token existente e pede ao Android para iniciar
                    // o serviço. Não pára um serviço que já esteja a correr.
                    var estadoAndroid = await comPrazo(
                        definirVisibilidade(true),
                        10000
                    );

                    if (versao !== geracao) {
                        return plugin.stop();
                    }

                    return estadoAndroid;
                }

                if (localizacaoAtiva(estado) && estado.visible === visivel) {
                    return estado;
                }

                if (tokenGuardado(estado) && !visivel && estado.visible === false) {
                    return estado;
                }

                if (tokenGuardado(estado)) {
                    // Um serviço parado pode retomar com o token que já tem.
                    // No iOS "Ao usar", active=false é normal; não rodar tokens.
                    if (
                        plataformaAtual() === 'ios' &&
                        estado.authorization === 'when_in_use' &&
                        estado.visible === visivel &&
                        Date.now() - ultimaRetoma < 5000
                    ) {
                        return estado;
                    }

                    ultimaRetoma = Date.now();

                    var estadoSincronizado = await definirVisibilidade(
                        presencaVisivel()
                    );

                    if (versao !== geracao) {
                        return plugin.stop();
                    }

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
        requestPermission: pedirPermissao,
        showSettingsNotice: function () {
            window.MargotLocationOnboarding?.open();
        }
    };

    if (pluginDisponivel() && typeof plugin.addListener === 'function') {
        var renovarAutorizacao = function () {
            if (document.visibilityState !== 'visible') {
                return;
            }

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
    window.addEventListener('online', arrancar);
    document.addEventListener('margot:permissions-resume', arrancar);

    // Recupera falhas transitórias enquanto a app está visível, sem pedir permissões.
    window.setInterval(function () {
        if (
            document.visibilityState === 'visible' &&
            localizacaoPermitida() &&
            window.MargotLocationOnboarding
        ) {
            iniciar(true);
        }
    }, 60000);
})();