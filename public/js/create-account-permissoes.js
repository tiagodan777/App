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
        if (preferencia === false) {
            if (nativo === 'granted') return 'Desativada na Margot. O navegador ainda tem autorização.';
            if (nativo === 'denied') return 'Desativada e bloqueada nas definições do navegador.';
            return 'Desativada na Margot.';
        }

        if (nativo === 'denied') return 'Bloqueada no navegador. Altera a permissão nas definições deste site.';
        if (nativo === 'unsupported') return 'Não está disponível neste navegador ou dispositivo.';
        if (aPedir[tipo]) return 'À espera da tua resposta…';

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

        var resolvido = API.foiEscolhida('localizacao') && API.foiEscolhida('notificacoes');

        $('#permissoes-proximo')
            .toggleClass('desativado', !resolvido)
            .attr('aria-disabled', String(!resolvido));

        if (resolvido) definirErro('');
    }

    async function sincronizarComNavegador() {
        var localizacao = await estadoNativoLocalizacao();
        var notificacoes = estadoNativoNotificacoes();

        if (localizacao === 'unsupported' || localizacao === 'denied') {
            API.definir('localizacao', false);
        } else if (!API.foiEscolhida('localizacao') && localizacao === 'granted') {
            API.definir('localizacao', true);
        }

        if (notificacoes === 'unsupported' || notificacoes === 'denied') {
            API.definir('notificacoes', false);
        } else if (!API.foiEscolhida('notificacoes') && notificacoes === 'granted') {
            API.definir('notificacoes', true);
        }

        await renderizar();
    }

    function ativarLocalizacao() {
        if (!window.isSecureContext || !navigator.geolocation) {
            API.definir('localizacao', false);
            definirErro('A localização não está disponível neste dispositivo.');
            renderizar();
            return;
        }

        aPedir.localizacao = true;
        definirErro('');
        renderizar();

        navigator.geolocation.getCurrentPosition(
            function () {
                aPedir.localizacao = false;
                API.definir('localizacao', true);
                renderizar();
            },
            function (erro) {
                aPedir.localizacao = false;
                API.definir('localizacao', false);

                definirErro(
                    erro.code === 1
                        ? 'A localização está bloqueada. Podes permiti-la nas definições deste site.'
                        : 'Não foi possível obter a localização. Tenta novamente.'
                );

                renderizar();
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
            API.definir('notificacoes', false);
            definirErro('As notificações não estão disponíveis aqui. No iPhone, instala a Margot no ecrã principal.');
            await renderizar();
            return;
        }

        if (Notification.permission === 'denied') {
            API.definir('notificacoes', false);
            definirErro('As notificações estão bloqueadas. Permite-as nas definições deste site.');
            await renderizar();
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

            API.definir('notificacoes', resposta === 'granted');

            if (resposta !== 'granted') {
                definirErro('As notificações ficaram desativadas. Podes ativá-las mais tarde ao editar o perfil.');
            }
        } catch (erro) {
            API.definir('notificacoes', false);
            definirErro('Não foi possível pedir a permissão para notificações.');
        }

        aPedir.notificacoes = false;
        await renderizar();
    }

    function desativar(tipo) {
        API.definir(tipo, false);

        definirErro(
            tipo === 'localizacao'
                ? 'A Margot deixou de usar a tua localização. Para remover também a autorização do navegador, usa as definições deste site.'
                : 'A Margot deixou de criar notificações. Para remover também a autorização do navegador, usa as definições deste site.'
        );

        renderizar();
    }

    window.inicializarEtapaPermissoes = function () {
        if (!document.getElementById('permissoes')) return;

        renderizar();
        sincronizarComNavegador();
    };

    window.validarEtapaPermissoes = function () {
        var valido = API.foiEscolhida('localizacao') && API.foiEscolhida('notificacoes');

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