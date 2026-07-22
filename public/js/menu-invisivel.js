(function (window, document) {
    'use strict';

    function iniciar() {
        var botao =
            document.getElementById(
                'alternar-invisivel'
            );

        var estado =
            document.getElementById(
                'alternar-invisivel-estado'
            );

        var preferencias =
            window.MargotPreferencias;

        if (!botao) {
            return;
        }

        if (!preferencias) {
            console.error(
                'preferencias.js tem de ser carregado antes de menu-invisivel.js.'
            );

            botao.disabled = true;

            return;
        }

        function estaInvisivel() {
            return (
                preferencias.obter(
                    'invisivel'
                ) === true
            );
        }

        function renderizar() {
            var invisivel =
                estaInvisivel();

            var localizacaoDesativada =
                preferencias.obter(
                    'localizacao'
                ) === false;

            var etiqueta =
                invisivel
                    ? 'Voltar a ficar visível'
                    : 'Ficar invisível';

            botao.dataset.invisivel =
                String(invisivel);

            botao.dataset.localizacaoDesativada =
                String(
                    localizacaoDesativada
                );

            botao.setAttribute(
                'aria-pressed',
                String(invisivel)
            );

            botao.setAttribute(
                'aria-label',
                etiqueta
            );

            botao.title =
                etiqueta;

            if (estado) {
                estado.textContent =
                    invisivel
                        ? 'Modo invisível ativo'
                        : 'Modo invisível desativado';
            }
        }

        function mostrarMensagem(
            mensagem,
            tipo
        ) {
            if (
                typeof window
                    .mostrarMensagemTemporaria
                !== 'function'
            ) {
                return;
            }

            window.mostrarMensagemTemporaria(
                mensagem,
                tipo || 'sucesso'
            );
        }

        botao.addEventListener(
            'click',
            function () {
                var novoEstado =
                    !estaInvisivel();

                var guardou =
                    preferencias.definir(
                        'invisivel',
                        novoEstado
                    );

                if (!guardou) {
                    mostrarMensagem(
                        'Não foi possível alterar o modo invisível.',
                        'erro'
                    );

                    return;
                }

                /*
                 * Atualiza imediatamente:
                 * - data-invisivel;
                 * - aria-label;
                 * - eye.png / eye-block.png,
                 *   através do CSS.
                 */
                renderizar();

                if (novoEstado) {
                    mostrarMensagem(
                        'Modo invisível ativado. Já não apareces no mapa.'
                    );

                    return;
                }

                if (
                    preferencias.obter(
                        'localizacao'
                    ) === false
                ) {
                    mostrarMensagem(
                        'O modo invisível foi desativado, mas a localização continua desativada nas preferências.',
                        'erro'
                    );

                    return;
                }

                mostrarMensagem(
                    'Modo invisível desativado. Voltaste a aparecer no mapa.'
                );
            }
        );

        /*
         * Atualiza o botão quando a preferência é alterada:
         * - noutra página;
         * - noutro separador;
         * - através do localStorage.
         */
        window.addEventListener(
            'margot:preferencias-alteradas',
            renderizar
        );

        renderizar();
    }

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            iniciar,
            {
                once: true
            }
        );
    } else {
        iniciar();
    }
})(window, document);