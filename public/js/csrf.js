(function () {
    'use strict';

    var meta = document.querySelector('meta[name="csrf-token"]');
    var token = meta ? String(meta.content || '').trim() : '';
    var metodosProtegidos = ['POST', 'PUT', 'PATCH', 'DELETE'];

    if (!token) {
        console.error('O token CSRF não está disponível.');
        return;
    }

    function metodoProtegido(metodo) {
        return metodosProtegidos.includes(
            String(metodo || 'GET').toUpperCase()
        );
    }

    function mesmaOrigem(destino) {
        try {
            return new URL(destino, window.location.href).origin ===
                window.location.origin;
        } catch (erro) {
            return false;
        }
    }

    function prepararFormularios(raiz) {
        var formularios = [];

        if (raiz instanceof HTMLFormElement) {
            formularios.push(raiz);
        }

        if (raiz && typeof raiz.querySelectorAll === 'function') {
            formularios = formularios.concat(
                Array.from(raiz.querySelectorAll('form'))
            );
        }

        formularios.forEach(function (formulario) {
            if (!metodoProtegido(formulario.method)) {
                return;
            }

            var campo = formulario.querySelector(
                'input[name="_csrf"]'
            );

            if (!campo) {
                campo = document.createElement('input');
                campo.type = 'hidden';
                campo.name = '_csrf';
                formulario.appendChild(campo);
            }

            campo.value = token;
        });
    }

    prepararFormularios(document);

    document.addEventListener(
        'submit',
        function (evento) {
            prepararFormularios(evento.target);
        },
        true
    );

    if (typeof MutationObserver === 'function') {
        new MutationObserver(function (alteracoes) {
            alteracoes.forEach(function (alteracao) {
                alteracao.addedNodes.forEach(function (no) {
                    if (no.nodeType === Node.ELEMENT_NODE) {
                        prepararFormularios(no);
                    }
                });
            });
        }).observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    if (typeof window.fetch === 'function') {
        var fetchOriginal = window.fetch.bind(window);

        window.fetch = function (entrada, opcoes) {
            var configuracao = Object.assign({}, opcoes || {});
            var metodo = configuracao.method ||
                (entrada instanceof Request ? entrada.method : 'GET');
            var destino = entrada instanceof Request
                ? entrada.url
                : String(entrada);

            if (
                metodoProtegido(metodo) &&
                mesmaOrigem(destino)
            ) {
                var headers = new Headers(
                    configuracao.headers ||
                    (entrada instanceof Request ? entrada.headers : undefined)
                );

                headers.set('X-CSRF-Token', token);
                configuracao.headers = headers;
            }

            return fetchOriginal(entrada, configuracao);
        };
    }

    if (
        window.jQuery &&
        typeof window.jQuery.ajaxPrefilter === 'function'
    ) {
        window.jQuery.ajaxPrefilter(function (opcoes, originais, xhr) {
            if (
                metodoProtegido(opcoes.type || opcoes.method) &&
                mesmaOrigem(opcoes.url || window.location.href)
            ) {
                xhr.setRequestHeader('X-CSRF-Token', token);
            }
        });
    }

    window.csrfToken = token;
})();