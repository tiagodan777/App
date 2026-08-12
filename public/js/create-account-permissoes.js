(function (window, document, $) {
    'use strict';

    var API = window.MargotPreferencias;
    var aPedir = { localizacao: false, notificacoes: false };

    if (!API) {
        console.error('preferencias.js tem de ser carregado antes de create-account-permissoes.js.');
        return;
    }

    function aplicacaoNativa() {
        return Boolean(
            window.Capacitor &&
            typeof window.Capacitor.isNativePlatform === 'function' &&
            window.Capacitor.isNativePlatform()
        );
    }

    function geolocalizacaoNativa() {
        var plugins = window.Capacitor && window.Capacitor.Plugins;

        return aplicacaoNativa() && plugins && plugins.Geolocation
            ? plugins.Geolocation
            : null;
    }

    function estadoConcedido(estado) {
        return estado === 'granted' || estado === 'limited';
    }

    function cartao(tipo) {
        return $('.permissao-cartao[data-permissao="' + tipo + '"]');
    }

    function definirErro(mensagem) {
        $('#permissoes-erro').text(mensagem || '');
    }

    async function estadoLocalizacao() {
        var geolocalizacao = geolocalizacaoNativa();

        if (aplicacaoNativa() && geolocalizacao) {
            try {
                var permissoes = await geolocalizacao.checkPermissions();
                return permissoes.location || permissoes.coarseLocation || 'prompt';
            } catch (erro) {
                return 'unknown';
            }
        }

        if (!window.isSecureContext || !navigator.geolocation) return 'unsupported';
        if (!navigator.permissions || !navigator.permissions.query) return 'unknown';

        try {
            return (await navigator.permissions.query({ name: 'geolocation' })).state;
        } catch (erro) {
            return 'unknown';
        }
    }

    function estadoNotificacoes() {
        if (!window.isSecureContext || !('Notification' in window)) return 'unsupported';
        return Notification.permission;
    }

    function textoEstado(tipo, preferencia, estado) {
        var destino = aplicacaoNativa() ? 'da app' : 'do navegador';

        if (preferencia === false) {
            if (estadoConcedido(estado)) return 'Desativada na Margot. O sistema ainda tem autorização.';
            if (estado === 'denied') return 'Desativada e bloqueada nas definições ' + destino + '.';
            return 'Desativada na Margot.';
        }

        if (estado === 'denied') return 'Bloqueada nas definições ' + destino + '.';
        if (estado === 'unsupported') return 'Não está disponível neste dispositivo.';
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
        var estado = tipo === 'localizacao'
            ? await estadoLocalizacao()
            : estadoNotificacoes();
        var ativa = preferencia === true && (
            geolocalizacaoNativa()
                ? estadoConcedido(estado)
                : estado !== 'denied' && estado !== 'unsupported'
        );

        $cartao.attr('data-ativa', ativa ? 'true' : 'false');
        $cartao.find('.permissao-estado').text(textoEstado(tipo, preferencia, estado));
        $cartao.find('.permissao-ativar')
            .prop('hidden', ativa)
            .prop('disabled', aPedir[tipo] || estado === 'unsupported');
        $cartao.find('.permissao-desativar')
            .prop('hidden', !ativa)
            .prop('disabled', aPedir[tipo]);
    }

    async function renderizar() {
        await Promise.all([
            renderizarTipo('localizacao'),
            renderizarTipo('notificacoes')
        ]);

        $('#permissoes-proximo')
            .removeClass('desativado')
            .attr('aria-disabled', 'false');
    }

    async function sincronizarComSistema() {
        var localizacao = await estadoLocalizacao();
        var notificacoes = estadoNotificacoes();

        if (localizacao === 'unsupported' || localizacao === 'denied') {
            API.definir('localizacao', false);
        } else if (!API.foiEscolhida('localizacao') && estadoConcedido(localizacao)) {
            API.definir('localizacao', true);
        }

        if (notificacoes === 'unsupported' || notificacoes === 'denied') {
            API.definir('notificacoes', false);
        } else if (!API.foiEscolhida('notificacoes') && notificacoes === 'granted') {
            API.definir('notificacoes', true);
        }

        await renderizar();
    }

    async function ativarLocalizacaoNativa(geolocalizacao) {
        try {
            var permissoes = await geolocalizacao.checkPermissions();
            var estado = permissoes.location || permissoes.coarseLocation || 'prompt';

            if (!estadoConcedido(estado)) {
                permissoes = await geolocalizacao.requestPermissions({
                    permissions: ['location']
                });
                estado = permissoes.location || permissoes.coarseLocation || 'denied';
            }

            API.definir('localizacao', estadoConcedido(estado));

            if (!estadoConcedido(estado)) {
                definirErro('A localização está bloqueada. Podes permiti-la nas definições da app.');
            }
        } catch (erro) {
            API.definir('localizacao', false);
            definirErro('Não foi possível pedir a permissão de localização. Tenta novamente.');
        } finally {
            aPedir.localizacao = false;
            await renderizar();
        }
    }

    function ativarLocalizacaoWeb() {
        if (!window.isSecureContext || !navigator.geolocation) {
            aPedir.localizacao = false;
            API.definir('localizacao', false);
            definirErro('A localização não está disponível neste dispositivo.');
            renderizar();
            return;
        }

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

    function ativarLocalizacao() {
        if (aPedir.localizacao) return;

        aPedir.localizacao = true;
        definirErro('');
        renderizar();

        var geolocalizacao = geolocalizacaoNativa();

        if (geolocalizacao) {
            ativarLocalizacaoNativa(geolocalizacao);
            return;
        }

        ativarLocalizacaoWeb();
    }

    async function ativarNotificacoes() {
        if (aPedir.notificacoes) return;

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

        if (tipo === 'localizacao') {
            definirErro(
                aplicacaoNativa()
                    ? 'A Margot deixou de usar a tua localização. Podes remover também a autorização nas definições da app.'
                    : 'A Margot deixou de usar a tua localização. Podes remover também a autorização nas definições deste site.'
            );
        } else {
            definirErro('A Margot deixou de criar notificações. Podes remover também a autorização nas definições deste site.');
        }

        renderizar();
    }

    window.inicializarEtapaPermissoes = function () {
        if (!document.getElementById('permissoes')) return;
        sincronizarComSistema();
    };

    window.validarEtapaPermissoes = function () {
        var valido = API.foiEscolhida('localizacao') && API.foiEscolhida('notificacoes');

        if (!valido) {
            definirErro('Escolhe se queres ativar ou desativar as duas opções.');
        }

        return valido;
    };

    $(document)
        .off('click.margotPermissoes', '.permissao-ativar')
        .on('click.margotPermissoes', '.permissao-ativar', function () {
            var tipo = String($(this).data('permissao') || '');

            if (tipo === 'localizacao') ativarLocalizacao();
            if (tipo === 'notificacoes') ativarNotificacoes();
        })
        .off('click.margotPermissoes', '.permissao-desativar')
        .on('click.margotPermissoes', '.permissao-desativar', function () {
            var tipo = String($(this).data('permissao') || '');

            if (tipo === 'localizacao' || tipo === 'notificacoes') {
                desativar(tipo);
            }
        });
})(window, document, jQuery);