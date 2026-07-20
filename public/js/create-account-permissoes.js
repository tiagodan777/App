(function (window, document, $) {
    'use strict';

    var STORAGE_KEY = 'margot-permissoes-v1';
    var estado = carregarEstado();

    function carregarEstado() {
        try {
            var guardado = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');

            return {
                localizacao: guardado.localizacao || 'prompt',
                notificacoes: guardado.notificacoes || 'prompt'
            };
        } catch (erro) {
            return { localizacao: 'prompt', notificacoes: 'prompt' };
        }
    }

    function guardarEstado() {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
        } catch (erro) {
            console.warn('Não foi possível guardar o estado das permissões.', erro);
        }
    }

    function definirEstado(tipo, valor) {
        estado[tipo] = valor;
        guardarEstado();
        renderizar();
    }

    function estaResolvida(valor) {
        return ['granted', 'denied', 'unsupported'].includes(valor);
    }

    function mensagem(tipo, valor) {
        if (valor === 'granted') return tipo === 'localizacao' ? 'Localização permitida neste dispositivo.' : 'Notificações permitidas neste dispositivo.';
        if (valor === 'denied') return 'Bloqueada nas definições deste dispositivo.';
        if (valor === 'unsupported') return tipo === 'notificacoes' ? 'As notificações não estão disponíveis neste navegador. No iPhone, instala primeiro a Margot no ecrã principal.' : 'A localização não está disponível neste navegador.';
        if (valor === 'requesting') return 'À espera da tua resposta…';
        if (valor === 'error') return 'Não foi possível concluir o pedido. Tenta novamente.';

        return 'Ainda não escolheste.';
    }

    function renderizarTipo(tipo) {
        var valor = estado[tipo];
        var $cartao = $('.permissao-cartao[data-permissao="' + tipo + '"]');

        if (!$cartao.length) return;

        $cartao.attr('data-estado', valor);
        $cartao.find('.permissao-estado').text(mensagem(tipo, valor));

        $cartao.find('.permissao-pedir')
            .prop('disabled', valor === 'requesting' || estaResolvida(valor))
            .text(
                valor === 'granted' ? 'Permitida' :
                valor === 'denied' ? 'Bloqueada' :
                valor === 'unsupported' ? 'Indisponível' :
                valor === 'requesting' ? 'A aguardar…' :
                'Escolher'
            );
    }

    function renderizar() {
        renderizarTipo('localizacao');
        renderizarTipo('notificacoes');

        var resolvidas = estaResolvida(estado.localizacao) && estaResolvida(estado.notificacoes);

        $('#permissoes-proximo')
            .attr('aria-disabled', resolvidas ? 'false' : 'true')
            .toggleClass('desativado', !resolvidas);

        if (resolvidas) $('#permissoes-erro').text('');
    }

    async function sincronizarEstadoNativo() {
        if (!navigator.geolocation) {
            estado.localizacao = 'unsupported';
        } else if (navigator.permissions && navigator.permissions.query) {
            try {
                var localizacao = await navigator.permissions.query({ name: 'geolocation' });

                if (localizacao.state === 'granted' || localizacao.state === 'denied') {
                    estado.localizacao = localizacao.state;
                } else if (estaResolvida(estado.localizacao)) {
                    estado.localizacao = 'prompt';
                }
            } catch (erro) {
                // Alguns Safari não permitem consultar o estado.
            }
        }

        if (!('Notification' in window)) {
            estado.notificacoes = 'unsupported';
        } else if (Notification.permission === 'granted' || Notification.permission === 'denied') {
            estado.notificacoes = Notification.permission;
        } else if (estado.notificacoes === 'unsupported') {
            estado.notificacoes = 'prompt';
        }

        guardarEstado();
        renderizar();
    }

    function pedirLocalizacao() {
        if (!navigator.geolocation) {
            definirEstado('localizacao', 'unsupported');
            return;
        }

        definirEstado('localizacao', 'requesting');

        navigator.geolocation.getCurrentPosition(
            function () {
                definirEstado('localizacao', 'granted');
            },
            function (erro) {
                definirEstado('localizacao', erro.code === 1 ? 'denied' : 'error');
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    }

    async function pedirNotificacoes() {
        if (!('Notification' in window)) {
            definirEstado('notificacoes', 'unsupported');
            return;
        }

        definirEstado('notificacoes', 'requesting');

        try {
            var resultado = await Notification.requestPermission();
            definirEstado('notificacoes', resultado === 'granted' || resultado === 'denied' ? resultado : 'prompt');
        } catch (erro) {
            definirEstado('notificacoes', 'error');
        }
    }

    window.inicializarEtapaPermissoes = function () {
        if (!document.getElementById('permissoes')) return;

        estado = carregarEstado();
        renderizar();
        sincronizarEstadoNativo();
    };

    window.validarEtapaPermissoes = function () {
        var valida = estaResolvida(estado.localizacao) && estaResolvida(estado.notificacoes);

        if (!valida) {
            $('#permissoes-erro').text('Escolhe uma resposta para cada permissão antes de continuar.');
        }

        return valida;
    };

    $(document).on('click', '.permissao-pedir', function () {
        var tipo = String($(this).data('permissao') || '');

        if (tipo === 'localizacao') pedirLocalizacao();
        if (tipo === 'notificacoes') pedirNotificacoes();
    });
})(window, document, jQuery);