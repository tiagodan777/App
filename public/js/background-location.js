(function () {
    'use strict';

    if (window.__margotBackgroundLocationLoaded) {
        return;
    }

    window.__margotBackgroundLocationLoaded = true;

    var capacitor = window.Capacitor;

    var plugin =
        capacitor &&
        capacitor.Plugins
            ? capacitor
                .Plugins
                .BackgroundLocation
            : null;

    if (
        !plugin &&
        capacitor &&
        typeof capacitor.registerPlugin ===
            'function'
    ) {
        plugin =
            capacitor.registerPlugin(
                'BackgroundLocation'
            );
    }

    function plataformaAtual() {
        if (
            capacitor &&
            typeof capacitor.getPlatform ===
                'function'
        ) {
            return String(
                capacitor.getPlatform() ||
                'web'
            ).toLowerCase();
        }

        return 'web';
    }

    function preferencias() {
        return (
            window.MargotPreferencias ||
            null
        );
    }

    /*
     * IMPORTANTE:
     *
     * A localização nativa em background deve depender
     * da preferência real do utilizador.
     *
     * Algumas páginas, como o chat, podem utilizar
     * window.disableLocationTracking para impedir lógica
     * específica do mapa nessa página.
     *
     * Essa flag temporária NÃO deve desligar a localização
     * nativa em segundo plano.
     */
    function localizacaoPermitida() {
        var gestor =
            preferencias();

        if (
            gestor &&
            typeof gestor.obter ===
                'function'
        ) {
            return (
                gestor.obter(
                    'localizacao'
                ) !==
                false
            );
        }

        return (
            window.disableLocationTracking !==
            true
        );
    }

    function estaInvisivel() {
        var gestor =
            preferencias();

        if (
            gestor &&
            typeof gestor.obter ===
                'function'
        ) {
            return (
                gestor.obter(
                    'invisivel'
                ) ===
                true
            );
        }

        return (
            window.margotInvisible ===
            true
        );
    }

    function presencaVisivel() {
        return (
            localizacaoPermitida() &&
            !estaInvisivel()
        );
    }

    function plataformaNativa() {
        if (!capacitor) {
            return false;
        }

        if (
            typeof capacitor.isNativePlatform ===
            'function'
        ) {
            return capacitor
                .isNativePlatform();
        }

        if (
            typeof capacitor.getPlatform ===
            'function'
        ) {
            return (
                capacitor.getPlatform() !==
                'web'
            );
        }

        return false;
    }

    function pluginDisponivel() {
        if (
            !plataformaNativa() ||
            !plugin
        ) {
            return false;
        }

        if (
            typeof capacitor.isPluginAvailable ===
            'function'
        ) {
            return capacitor
                .isPluginAvailable(
                    'BackgroundLocation'
                );
        }

        return true;
    }

    function obterTokenCsrf() {
        var elemento =
            document.querySelector(
                'meta[name="csrf-token"]'
            );

        return elemento
            ? String(
                elemento.getAttribute(
                    'content'
                ) ||
                ''
            ).trim()
            : '';
    }

    async function pedirTokenBackground() {
        var headers = {
            'Accept':
                'application/json',

            'X-Requested-With':
                'XMLHttpRequest'
        };

        var csrfToken =
            obterTokenCsrf();

        if (
            csrfToken !==
            ''
        ) {
            headers[
                'X-CSRF-Token'
            ] =
                csrfToken;
        }

        var resposta =
            await fetch(
                String(
                    window
                        .backgroundLocationTokenUrl ||
                    '/background-location-token/'
                ),
                {
                    method:
                        'POST',

                    credentials:
                        'same-origin',

                    cache:
                        'no-store',

                    headers:
                        headers
                }
            );

        var dados = {};

        try {
            dados =
                await resposta.json();
        } catch (
            erro
        ) {
            dados = {};
        }

        if (
            resposta.status ===
            401
        ) {
            return null;
        }

        if (
            !resposta.ok ||
            !dados.success ||
            !dados.token
        ) {
            throw new Error(
                dados.message ||
                'Não foi possível ativar a localização em segundo plano.'
            );
        }

        return String(
            dados.token
        );
    }

    function precisaDasDefinicoes(
        resultado
    ) {
        if (
            !resultado ||
            typeof resultado !==
                'object'
        ) {
            return false;
        }

        if (
            resultado.requiresSettings ===
                true ||
            resultado.requires_settings ===
                true
        ) {
            return true;
        }

        var autorizacao =
            String(
                resultado.authorization ||
                resultado
                    .authorizationStatus ||
                resultado
                    .authorization_status ||
                ''
            ).toLowerCase();

        var permissao =
            String(
                resultado.permission ||
                resultado
                    .permissionStatus ||
                resultado
                    .permission_status ||
                ''
            ).toLowerCase();

        return (
            autorizacao ===
                'authorizedwheninuse' ||
            autorizacao ===
                'wheninuse' ||
            autorizacao ===
                'when_in_use' ||
            autorizacao ===
                'denied' ||
            autorizacao ===
                'restricted' ||
            permissao ===
                'disabled' ||
            permissao ===
                'when_in_use' ||
            permissao ===
                'denied' ||
            permissao ===
                'restricted'
        );
    }

    function localizacaoAtiva(
        resultado
    ) {
        return !!(
            resultado &&
            (
                resultado.active ===
                    true ||
                resultado.isActive ===
                    true ||
                resultado.is_active ===
                    true
            )
        );
    }

    function tokenGuardado(
        resultado
    ) {
        return !!(
            resultado &&
            (
                resultado.token_stored ===
                    true ||
                resultado.tokenStored ===
                    true
            )
        );
    }

    async function definirVisibilidade(
        visivel
    ) {
        if (
            typeof plugin.setVisibility !==
            'function'
        ) {
            return estadoAtual();
        }

        return plugin
            .setVisibility({
                visible:
                    !!visivel
            });
    }

    function adicionarEstiloAviso() {
        if (
            document.getElementById(
                'margot-background-location-style'
            )
        ) {
            return;
        }

        var estilo =
            document.createElement(
                'style'
            );

        estilo.id =
            'margot-background-location-style';

        estilo.textContent = [
            '.margot-background-location-overlay{position:fixed;inset:0;z-index:10000;padding:20px;background:rgba(0,0,0,.38);display:flex;align-items:flex-end;justify-content:center;}',
            '.margot-background-location-card{width:min(100%,420px);margin-bottom:max(12px,env(safe-area-inset-bottom,12px));padding:22px;border-radius:28px;background:#fff;color:#111;box-shadow:0 18px 55px rgba(0,0,0,.24);font-family:Helvetica,Arial,sans-serif;}',
            '.margot-background-location-card h2{margin:0 0 10px;font-size:22px;line-height:1.15;}',
            '.margot-background-location-card p{margin:0;color:#555;font-size:15px;line-height:1.45;}',
            '.margot-background-location-actions{margin-top:20px;display:flex;gap:10px;}',
            '.margot-background-location-actions button{min-height:48px;padding:0 18px;border:0;border-radius:24px;font-size:15px;font-weight:700;cursor:pointer;}',
            '.margot-background-location-later{flex:1;background:#f0f0f2;color:#222;}',
            '.margot-background-location-settings{flex:1.4;background:#111;color:#fff;}'
        ].join('');

        document.head
            .appendChild(
                estilo
            );
    }

    function fecharAviso() {
        var aviso =
            document.getElementById(
                'margot-background-location-overlay'
            );

        if (aviso) {
            aviso.remove();
        }
    }

    function conteudoAvisoDefinicoes() {
        if (
            plataformaAtual() ===
            'android'
        ) {
            return {
                titulo:
                    'Ativa a localização',

                texto:
                    'A Margot precisa da tua localização para mostrar as pessoas que estão perto de ti. ' +
                    'Podes alterar esta permissão nas Definições.',

                botao:
                    'Abrir Definições'
            };
        }

        return {
            titulo:
                'Mantém-te visível na Margot',

            texto:
                'No iPhone, abre Localização e escolhe “Sempre”. ' +
                'Assim podes continuar a aparecer entre as pessoas por perto quando a Margot está em segundo plano.',

            botao:
                'Abrir Definições'
        };
    }

    function mostrarAvisoDefinicoes(
        forcar
    ) {
        if (
            !pluginDisponivel()
        ) {
            return;
        }

        if (
            document.getElementById(
                'margot-background-location-overlay'
            )
        ) {
            return;
        }

        var chave =
            'margot-background-location-aviso';

        var ultimaApresentacao =
            Number(
                localStorage.getItem(
                    chave
                ) ||
                0
            );

        var umDia =
            24 *
            60 *
            60 *
            1000;

        if (
            !forcar &&
            Date.now() -
                ultimaApresentacao <
                umDia
        ) {
            return;
        }

        localStorage.setItem(
            chave,
            String(
                Date.now()
            )
        );

        adicionarEstiloAviso();

        var fundo =
            document.createElement(
                'div'
            );

        var cartao =
            document.createElement(
                'section'
            );

        var titulo =
            document.createElement(
                'h2'
            );

        var texto =
            document.createElement(
                'p'
            );

        var acoes =
            document.createElement(
                'div'
            );

        var maisTarde =
            document.createElement(
                'button'
            );

        var abrirDefinicoes =
            document.createElement(
                'button'
            );

        fundo.id =
            'margot-background-location-overlay';

        fundo.className =
            'margot-background-location-overlay';

        fundo.setAttribute(
            'role',
            'dialog'
        );

        fundo.setAttribute(
            'aria-modal',
            'true'
        );

        fundo.setAttribute(
            'aria-labelledby',
            'margot-background-location-title'
        );

        cartao.className =
            'margot-background-location-card';

        var conteudo =
            conteudoAvisoDefinicoes();

        titulo.id =
            'margot-background-location-title';

        titulo.textContent =
            conteudo.titulo;

        texto.textContent =
            conteudo.texto;

        acoes.className =
            'margot-background-location-actions';

        maisTarde.type =
            'button';

        maisTarde.className =
            'margot-background-location-later';

        maisTarde.textContent =
            'Agora não';

        abrirDefinicoes.type =
            'button';

        abrirDefinicoes.className =
            'margot-background-location-settings';

        abrirDefinicoes.textContent =
            conteudo.botao;

        maisTarde
            .addEventListener(
                'click',
                fecharAviso
            );

        abrirDefinicoes
            .addEventListener(
                'click',
                async function () {
                    fecharAviso();

                    try {
                        await plugin
                            .openSettings();
                    } catch (
                        erro
                    ) {
                        console.error(
                            'Não foi possível abrir as definições:',
                            erro
                        );
                    }
                }
            );

        acoes.appendChild(
            maisTarde
        );

        acoes.appendChild(
            abrirDefinicoes
        );

        cartao.appendChild(
            titulo
        );

        cartao.appendChild(
            texto
        );

        cartao.appendChild(
            acoes
        );

        fundo.appendChild(
            cartao
        );

        document.body
            .appendChild(
                fundo
            );
    }

    async function estadoAtual() {
        if (
            !pluginDisponivel()
        ) {
            return {
                available:
                    false,

                active:
                    false
            };
        }

        return plugin
            .status();
    }

    async function renovarToken() {
        if (
            !pluginDisponivel()
        ) {
            return {
                available:
                    false,

                active:
                    false
            };
        }

        var token =
            await pedirTokenBackground();

        if (!token) {
            return {
                available:
                    true,

                authenticated:
                    false,

                active:
                    false
            };
        }

        /*
         * O Swift agora lê efetivamente o campo visible.
         */
        var resultado =
            await plugin.start({
                token:
                    token,

                visible:
                    presencaVisivel()
            });

        if (
            presencaVisivel() &&
            precisaDasDefinicoes(
                resultado
            )
        ) {
            mostrarAvisoDefinicoes(
                false
            );
        }

        return resultado;
    }

    var inicializacao =
        null;

    async function iniciar(
        forcarAviso
    ) {
        if (
            !pluginDisponivel()
        ) {
            return {
                available:
                    false,

                active:
                    false
            };
        }

        if (
            inicializacao
        ) {
            return inicializacao;
        }

        inicializacao =
            (async function () {
                try {
                    if (
                        !localizacaoPermitida()
                    ) {
                        return parar();
                    }

                    var estado =
                        await estadoAtual();

                    /*
                     * Se o serviço nativo já está vivo,
                     * não precisamos de criar outro token.
                     *
                     * Só sincronizamos visibilidade.
                     *
                     * No iOS novo, setVisibility(true)
                     * força também uma atualização imediata.
                     */
                    if (
                        localizacaoAtiva(
                            estado
                        ) ||
                        (
                            tokenGuardado(
                                estado
                            ) &&
                            !presencaVisivel()
                        )
                    ) {
                        var estadoSincronizado =
                            await definirVisibilidade(
                                presencaVisivel()
                            );

                        if (
                            presencaVisivel() &&
                            precisaDasDefinicoes(
                                estadoSincronizado
                            )
                        ) {
                            mostrarAvisoDefinicoes(
                                !!forcarAviso
                            );
                        }

                        return estadoSincronizado;
                    }

                    if (
                        presencaVisivel() &&
                        precisaDasDefinicoes(
                            estado
                        )
                    ) {
                        mostrarAvisoDefinicoes(
                            !!forcarAviso
                        );
                    }

                    var resultado =
                        await renovarToken();

                    if (
                        presencaVisivel() &&
                        precisaDasDefinicoes(
                            resultado
                        )
                    ) {
                        mostrarAvisoDefinicoes(
                            !!forcarAviso
                        );
                    }

                    return resultado;
                } catch (
                    erro
                ) {
                    console.error(
                        'Localização em segundo plano:',
                        erro
                    );

                    return {
                        available:
                            true,

                        active:
                            false,

                        error:
                            String(
                                erro &&
                                erro.message
                                    ? erro.message
                                    : erro
                            )
                    };
                } finally {
                    inicializacao =
                        null;
                }
            })();

        return inicializacao;
    }

    async function parar() {
        if (
            !pluginDisponivel()
        ) {
            return {
                available:
                    false,

                active:
                    false
            };
        }

        fecharAviso();

        return plugin
            .stop();
    }

    async function abrirDefinicoes() {
        if (
            !pluginDisponivel()
        ) {
            return false;
        }

        await plugin
            .openSettings();

        return true;
    }

    window.MargotBackgroundLocation = {
        start:
            function () {
                return iniciar(
                    true
                );
            },

        stop:
            parar,

        status:
            estadoAtual,

        openSettings:
            abrirDefinicoes,

        showSettingsNotice:
            function () {
                mostrarAvisoDefinicoes(
                    true
                );
            }
    };

    if (
        pluginDisponivel() &&
        typeof plugin.addListener ===
            'function'
    ) {
        var renovarAutorizacao =
            function () {
                if (
                    !localizacaoPermitida()
                ) {
                    parar()
                        .catch(
                            function (
                                erro
                            ) {
                                console.error(
                                    'Não foi possível parar a localização:',
                                    erro
                                );
                            }
                        );

                    return;
                }

                renovarToken()
                    .catch(
                        function (
                            erro
                        ) {
                            console.error(
                                'Não foi possível renovar a autorização da localização:',
                                erro
                            );
                        }
                    );
            };

        [
            'backgroundLocationAuthorizationExpired',
            'backgroundLocationTokenExpired'
        ].forEach(
            function (
                evento
            ) {
                plugin
                    .addListener(
                        evento,
                        renovarAutorizacao
                    );
            }
        );

        plugin.addListener(
            'backgroundLocationAuthorizationChanged',
            function () {
                if (
                    localizacaoPermitida()
                ) {
                    iniciar(
                        false
                    );
                }
            }
        );
    }

    function arrancar() {
        if (
            localizacaoPermitida()
        ) {
            iniciar(
                false
            );
        } else {
            parar()
                .catch(
                    function (
                        erro
                    ) {
                        console.error(
                            'Localização em segundo plano:',
                            erro
                        );
                    }
                );
        }
    }

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            arrancar,
            {
                once:
                    true
            }
        );
    } else {
        arrancar();
    }

    /*
     * Ao voltar à app:
     * - verifica o serviço;
     * - sincroniza visibilidade;
     * - e o Swift força uma localização.
     */
    document.addEventListener(
        'visibilitychange',
        function () {
            if (
                document.visibilityState ===
                'visible'
            ) {
                arrancar();
            }
        }
    );

    window.addEventListener(
        'margot:preferencias-alteradas',
        arrancar
    );
})();