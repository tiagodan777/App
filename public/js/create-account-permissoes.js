(function (window, document, $) {
    'use strict';

    var API = window.MargotPreferencias;
    var aPedir = { localizacao: false, notificacoes: false };

    if (!API) {
        console.error('preferencias.js tem de ser carregado antes de create-account-permissoes.js.');
        return;
    }

    function cartao(tipo) {
        return $('.permissao-cartao[data-permissao="' + tipo + '"]');
    }

    function definirErro(mensagem) {
        $('#permissoes-erro').text(mensagem || '');
    }

    async function estadoNativoLocalizacao() {
        if (!window.isSecureContext || !navigator.geolocation) return 'unsupported';
        if (!navigator.permissions || !navigator.permissions.query) return 'unknown';

        try {
            return (await navigator.permissions.query({ name: 'geolocation' })).state;
        } catch (erro) {
            return 'unknown';
        }
    }

    function estadoNativoNotificacoes() {
        if (!window.isSecureContext || !('Notification' in window)) return 'unsupported';
        return Notification.permission;
    }

    function textoEstado(tipo, preferencia, nativo) {
        if (aPedir[tipo]) return 'À espera da confirmação…';

        if (preferencia === false) {
            if (nativo === 'granted') return 'Desativada na Margot. O navegador ainda tem autorização.';
            if (nativo === 'denied') return 'Desativada e bloqueada nas definições do navegador.';
            return 'Desativada na Margot.';
        }

        if (nativo === 'denied') return 'Bloqueada no navegador. Altera a permissão nas definições deste site.';
        if (nativo === 'unsupported') return 'Não está disponível neste navegador ou dispositivo.';

        if (preferencia === true) {
            return tipo === 'localizacao'
                ? 'Ativa: a Margot pode usar a tua localização.'
                : 'Ativas: a Margot pode enviar-te notificações.';
        }

        return 'Ainda não escolheste.';
    }

    async function renderizarTipo(tipo) {
        var $cartao = cartao(tipo);
        if (!$cartao.length) return;

        var preferencia = API.obter(tipo);
        var nativo = tipo === 'localizacao' ? await estadoNativoLocalizacao() : estadoNativoNotificacoes();
        var ativa = preferencia === true && nativo !== 'denied' && nativo !== 'unsupported';

        $cartao.attr('data-ativa', ativa ? 'true' : 'false');
        $cartao.find('.permissao-estado').text(textoEstado(tipo, preferencia, nativo));
        $cartao.find('.permissao-ativar').prop('hidden', ativa).prop('disabled', aPedir[tipo] || nativo === 'unsupported');
        $cartao.find('.permissao-desativar').prop('hidden', !ativa).prop('disabled', aPedir[tipo]);
    }

    async function renderizar() {
        await Promise.all([
            renderizarTipo('localizacao'),
            renderizarTipo('notificacoes')
        ]);

        var resolvido =
            API.foiEscolhida('localizacao') &&
            API.foiEscolhida('notificacoes') &&
            !aPedir.localizacao &&
            !aPedir.notificacoes;

        $('#permissoes-proximo')
            .toggleClass('desativado', !resolvido)
            .attr('aria-disabled', String(!resolvido));

        if (resolvido) definirErro('');
    }

    async function definirEConfirmar(tipo, valor) {
        if (!API.definir(tipo, valor)) return false;

        if (typeof API.quandoConfirmada !== 'function') return true;

        return API.quandoConfirmada(tipo);
    }

    async function sincronizarComNavegador() {
        var localizacao = await estadoNativoLocalizacao();
        var notificacoes = estadoNativoNotificacoes();
        var sincronizacoes = [];
        var tiposSincronizados = [];

        if (localizacao === 'unsupported' || localizacao === 'denied') {
            aPedir.localizacao = true;
            tiposSincronizados.push('localizacao');
            sincronizacoes.push(definirEConfirmar('localizacao', false));
        } else if (!API.foiEscolhida('localizacao') && localizacao === 'granted') {
            aPedir.localizacao = true;
            tiposSincronizados.push('localizacao');
            sincronizacoes.push(definirEConfirmar('localizacao', true));
        }

        if (notificacoes === 'unsupported' || notificacoes === 'denied') {
            aPedir.notificacoes = true;
            tiposSincronizados.push('notificacoes');
            sincronizacoes.push(definirEConfirmar('notificacoes', false));
        } else if (!API.foiEscolhida('notificacoes') && notificacoes === 'granted') {
            aPedir.notificacoes = true;
            tiposSincronizados.push('notificacoes');
            sincronizacoes.push(definirEConfirmar('notificacoes', true));
        }

        renderizar();
        var resultados = await Promise.all(sincronizacoes);
        tiposSincronizados.forEach(function (tipo) {
            aPedir[tipo] = false;
        });
        await renderizar();

        if (resultados.some(function (resultado) { return resultado !== true; })) {
            definirErro('Não foi possível guardar uma das preferências.');
        }
    }

    async function ativarLocalizacao() {
        if (!window.isSecureContext || !navigator.geolocation) {
            aPedir.localizacao = true;
            await definirEConfirmar('localizacao', false);
            aPedir.localizacao = false;
            await renderizar();
            definirErro('A localização não está disponível neste dispositivo.');
            return;
        }

        aPedir.localizacao = true;
        definirErro('');
        renderizar();

        navigator.geolocation.getCurrentPosition(
            async function () {
                var confirmada = await definirEConfirmar(
                    'localizacao',
                    true
                );
                aPedir.localizacao = false;
                await renderizar();

                if (!confirmada) {
                    definirErro('Não foi possível guardar a preferência de localização.');
                }
            },
            async function (erro) {
                var confirmada = await definirEConfirmar(
                    'localizacao',
                    false
                );
                aPedir.localizacao = false;
                await renderizar();

                definirErro(
                    !confirmada
                        ? 'Não foi possível guardar a preferência de localização.'
                        : erro.code === 1
                        ? 'A localização está bloqueada. Podes permiti-la nas definições deste site.'
                        : 'Não foi possível obter a localização. Tenta novamente.'
                );
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        );
    }

    async function ativarNotificacoes() {
        if (!window.isSecureContext || !('Notification' in window)) {
            aPedir.notificacoes = true;
            await definirEConfirmar('notificacoes', false);
            aPedir.notificacoes = false;
            await renderizar();
            definirErro('As notificações não estão disponíveis aqui. No iPhone, instala a Margot no ecrã principal.');
            return;
        }

        if (Notification.permission === 'denied') {
            aPedir.notificacoes = true;
            await definirEConfirmar('notificacoes', false);
            aPedir.notificacoes = false;
            await renderizar();
            definirErro('As notificações estão bloqueadas. Permite-as nas definições deste site.');
            return;
        }

        aPedir.notificacoes = true;
        definirErro('');
        renderizar();

        try {
            var pedido = Notification.permission === 'granted'
                ? Promise.resolve('granted')
                : Notification.requestPermission();

            var resposta = await pedido;
            var confirmada = await definirEConfirmar(
                'notificacoes',
                resposta === 'granted'
            );

            aPedir.notificacoes = false;
            await renderizar();

            if (!confirmada) {
                definirErro('Não foi possível guardar a preferência de notificações.');
            } else if (resposta !== 'granted') {
                definirErro('As notificações ficaram desativadas. Podes ativá-las mais tarde ao editar o perfil.');
            }
        } catch (erro) {
            await definirEConfirmar('notificacoes', false);
            aPedir.notificacoes = false;
            await renderizar();
            definirErro('Não foi possível pedir a permissão para notificações.');
        }
    }

    async function desativar(tipo) {
        aPedir[tipo] = true;
        definirErro('');
        renderizar();

        var confirmada = await definirEConfirmar(tipo, false);
        aPedir[tipo] = false;
        await renderizar();

        if (!confirmada) {
            definirErro('Não foi possível guardar esta preferência.');
            return;
        }

        definirErro(
            tipo === 'localizacao'
                ? 'A Margot deixou de usar a tua localização. Para remover também a autorização do navegador, usa as definições deste site.'
                : 'A Margot deixou de criar notificações. Para remover também a autorização do navegador, usa as definições deste site.'
        );
    }

    window.inicializarEtapaPermissoes = function () {
        if (!document.getElementById('permissoes')) return;

        renderizar();
        sincronizarComNavegador();
    };

    window.validarEtapaPermissoes = function () {
        var valido =
            API.foiEscolhida('localizacao') &&
            API.foiEscolhida('notificacoes') &&
            !aPedir.localizacao &&
            !aPedir.notificacoes;

        if (!valido) {
            definirErro('Escolhe se queres ativar ou desativar as duas opções.');
        }

        return valido;
    };

    $(document).on('click', '.permissao-ativar', function () {
        var tipo = String($(this).data('permissao') || '');

        if (tipo === 'localizacao') ativarLocalizacao();
        if (tipo === 'notificacoes') ativarNotificacoes();
    });

    $(document).on('click', '.permissao-desativar', function () {
        var tipo = String($(this).data('permissao') || '');

        if (tipo === 'localizacao' || tipo === 'notificacoes') {
            desativar(tipo);
        }
    });
})(window, document, jQuery);
