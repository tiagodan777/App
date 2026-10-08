(function (window, document) {
    'use strict';

    var faixa = document.getElementById('perfil-fotos');
    if (!faixa) return;

    var ativo = true;
    var limpezas = [];

    faixa.querySelectorAll('img[data-perfil-foto-pendente]').forEach(function (imagem) {
        var versao = 0;
        var temporizador = null;

        function cancelarEspera() {
            if (temporizador !== null) {
                window.clearTimeout(temporizador);
                temporizador = null;
            }
        }

        function mostrar() {
            cancelarEspera();
            imagem.removeAttribute('data-perfil-foto-pendente');
        }

        function carregou() {
            cancelarEspera();

            var atual = ++versao;
            var origem = imagem.currentSrc || imagem.src;

            if (!imagem.complete || !imagem.naturalWidth) return;

            function concluir() {
                if (!ativo || atual !== versao) return;
                if ((imagem.currentSrc || imagem.src) !== origem) return;
                if (!imagem.complete || !imagem.naturalWidth) return;

                mostrar();
            }

            if (typeof imagem.decode !== 'function') {
                concluir();
                return;
            }

            // Só começa após o download: evita esconder uma foto já carregada
            // caso o WebView não termine a promessa de descodificação.
            temporizador = window.setTimeout(concluir, 1500);

            try {
                Promise.resolve(imagem.decode()).then(concluir, concluir);
            } catch (erro) {
                concluir();
            }
        }

        function falhou() {
            ++versao;
            cancelarEspera();

            // profile.js continua a escolher a fotografia alternativa.
            // A microtarefa deixa os restantes listeners terminar primeiro.
            Promise.resolve().then(function () {
                if (!ativo) return;
                if (!imagem.complete) return;

                if (imagem.naturalWidth) {
                    carregou();
                } else {
                    mostrar();
                }
            });
        }

        imagem.addEventListener('load', carregou);
        imagem.addEventListener('error', falhou);

        if (imagem.complete) {
            if (imagem.naturalWidth) {
                carregou();
            } else {
                mostrar();
            }
        }

        limpezas.push(function () {
            ++versao;
            cancelarEspera();

            imagem.removeEventListener('load', carregou);
            imagem.removeEventListener('error', falhou);
            imagem.removeAttribute('data-perfil-foto-pendente');
        });
    });

    function sair() {
        ativo = false;

        limpezas.forEach(function (limpar) {
            limpar();
        });

        limpezas = [];
        document.removeEventListener('margot:page-leave', sair);
    }

    document.addEventListener('margot:page-leave', sair);
})(window, document);