(function (window, document) {
    'use strict';

    var camera = null;
    var operacaoEmCurso = false;

    function estaNaAplicacaoNativa() {
        return Boolean(
            window.Capacitor &&
            typeof window.Capacitor.isNativePlatform === 'function' &&
            window.Capacitor.isNativePlatform() &&
            typeof window.Capacitor.registerPlugin === 'function'
        );
    }

    function obterCamera() {
        if (camera) {
            return camera;
        }

        camera = window.Capacitor.registerPlugin('Camera');
        return camera;
    }

    function erroFoiCancelamento(erro) {
        var codigo = String(erro && erro.code ? erro.code : '');
        var mensagem = String(
            erro && erro.message ? erro.message : ''
        ).toLowerCase();

        return [
            'OS-PLUG-CAMR-0006',
            'OS-PLUG-CAMR-0020'
        ].indexOf(codigo) !== -1 ||
            mensagem.indexOf('cancel') !== -1;
    }

    function erroFoiPermissao(erro) {
        var codigo = String(erro && erro.code ? erro.code : '');
        var mensagem = String(
            erro && erro.message ? erro.message : ''
        ).toLowerCase();

        return [
            'OS-PLUG-CAMR-0003',
            'OS-PLUG-CAMR-0005'
        ].indexOf(codigo) !== -1 ||
            mensagem.indexOf('permission') !== -1;
    }

    function mostrarErro(idInput, erro) {
        var mensagem = erroFoiPermissao(erro)
            ? 'Não foi possível aceder à câmara ou às fotografias. Ativa a permissão nas definições do telefone.'
            : 'Não foi possível adicionar este ficheiro. Tenta novamente.';

        var seletorErro = idInput === 'perfil-input-fotos'
            ? '#perfil-fotos-erro'
            : idInput === 'chat-media'
                ? '#chat-erro'
                : '';

        var elementoErro = seletorErro
            ? document.querySelector(seletorErro)
            : null;

        if (elementoErro) {
            elementoErro.textContent = mensagem;
            elementoErro.hidden = false;
            return;
        }

        window.alert(mensagem);
    }

    function caminhoWebDoResultado(resultado) {
        if (resultado && resultado.webPath) {
            return resultado.webPath;
        }

        if (
            resultado &&
            resultado.uri &&
            window.Capacitor &&
            typeof window.Capacitor.convertFileSrc === 'function'
        ) {
            return window.Capacitor.convertFileSrc(resultado.uri);
        }

        return '';
    }

    function resultadoEVideo(resultado) {
        return Boolean(
            resultado &&
            (
                resultado.type === 1 ||
                String(resultado.type).toLowerCase() === 'video'
            )
        );
    }

    function mimeDoResultado(resultado, blob, eVideo) {
        var formato = String(
            resultado &&
            resultado.metadata &&
            resultado.metadata.format
                ? resultado.metadata.format
                : ''
        ).toLowerCase().replace(/^[.]/, '');

        if (blob.type) {
            return blob.type;
        }

        if (eVideo) {
            if (formato === 'mov') {
                return 'video/quicktime';
            }

            return 'video/' + (formato || 'mp4');
        }

        if (formato === 'jpg') {
            formato = 'jpeg';
        }

        if (formato === 'heic' || formato === 'heif') {
            return 'image/' + formato;
        }

        return 'image/' + (formato || 'jpeg');
    }

    function extensaoDoFicheiro(mime, eVideo) {
        var extensoes = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/heic': 'heic',
            'image/heif': 'heif',
            'video/mp4': 'mp4',
            'video/quicktime': 'mov',
            'video/webm': 'webm'
        };

        return extensoes[mime] || (eVideo ? 'mp4' : 'jpg');
    }

    async function converterResultadoEmFicheiro(resultado, indice) {
        var caminho = caminhoWebDoResultado(resultado);

        if (!caminho) {
            throw new Error(
                'O ficheiro escolhido não tem um caminho acessível.'
            );
        }

        var resposta = await window.fetch(caminho);

        if (!resposta.ok) {
            throw new Error(
                'Não foi possível ler o ficheiro escolhido.'
            );
        }

        var blob = await resposta.blob();
        var eVideo = resultadoEVideo(resultado);
        var mime = mimeDoResultado(resultado, blob, eVideo);
        var extensao = extensaoDoFicheiro(mime, eVideo);
        var nome = 'margot-' +
            (eVideo ? 'video-' : 'foto-') +
            Date.now() + '-' +
            (indice + 1) + '.' +
            extensao;

        if (blob.type !== mime) {
            blob = blob.slice(0, blob.size, mime);
        }

        return new window.File([blob], nome, {
            type: mime,
            lastModified: Date.now()
        });
    }

    async function converterResultados(resultados) {
        var ficheiros = [];

        for (
            var indice = 0;
            indice < resultados.length;
            indice += 1
        ) {
            ficheiros.push(
                await converterResultadoEmFicheiro(
                    resultados[indice],
                    indice
                )
            );
        }

        return ficheiros;
    }

    function colocarFicheirosNoInput(idInput, ficheiros) {
        var input = document.getElementById(idInput);

        if (!input || !ficheiros.length) {
            return;
        }

        var transferencia = new window.DataTransfer();

        ficheiros.forEach(function (ficheiro) {
            transferencia.items.add(ficheiro);
        });

        input.files = transferencia.files;

        input.dispatchEvent(
            new window.Event('change', {
                bubbles: true
            })
        );
    }

    async function executar(idInput, operacao) {
        if (operacaoEmCurso) {
            return;
        }

        operacaoEmCurso = true;

        try {
            var resultados = await operacao();

            if (!resultados || !resultados.length) {
                return;
            }

            var ficheiros = await converterResultados(resultados);

            colocarFicheirosNoInput(
                idInput,
                ficheiros
            );
        } catch (erro) {
            if (!erroFoiCancelamento(erro)) {
                console.error('[Margot Camera]', erro);
                mostrarErro(idInput, erro);
            }
        } finally {
            operacaoEmCurso = false;
        }
    }

    function tirarFotoDePerfil() {
        executar(
            'perfil-input-fotos',
            async function () {
                var resultado = await obterCamera().takePhoto({
                    quality: 90,
                    correctOrientation: true,
                    includeMetadata: true,
                    saveToGallery: false,
                    cameraDirection: 'FRONT',
                    encodingType: 0
                });

                return resultado ? [resultado] : [];
            }
        );
    }

    function escolherFotosDePerfil() {
        executar(
            'perfil-input-fotos',
            async function () {
                var selecao =
                    await obterCamera().chooseFromGallery({
                        quality: 90,
                        correctOrientation: true,
                        includeMetadata: true,
                        mediaType: 0,
                        allowMultipleSelection: true,
                        limit: 6,
                        editable: 'no'
                    });

                return selecao &&
                    Array.isArray(selecao.results)
                    ? selecao.results
                    : [];
            }
        );
    }

    function escolherAnexo(idInput) {
        executar(
            idInput,
            async function () {
                var selecao =
                    await obterCamera().chooseFromGallery({
                        quality: 90,
                        correctOrientation: true,
                        includeMetadata: true,
                        mediaType: 2,
                        allowMultipleSelection: false,
                        limit: 1,
                        editable: 'no'
                    });

                return selecao &&
                    Array.isArray(selecao.results)
                    ? selecao.results
                    : [];
            }
        );
    }

    document.addEventListener(
        'click',
        function (evento) {
            if (
                !estaNaAplicacaoNativa() ||
                operacaoEmCurso ||
                !evento.target ||
                typeof evento.target.closest !== 'function'
            ) {
                return;
            }

            var botaoTirarFoto = evento.target.closest(
                '#perfil-tirar-foto'
            );

            var botaoGaleria = evento.target.closest(
                '#perfil-escolher-fotos, ' +
                '#perfil-abrir-galeria-camera, ' +
                '.perfil-foto-placeholder'
            );

            var botaoAnexo = evento.target.closest(
                'label[for="chat-media"], ' +
                'label[for="mini-menu-media"]'
            );

            if (
                !botaoTirarFoto &&
                !botaoGaleria &&
                !botaoAnexo
            ) {
                return;
            }

            evento.preventDefault();
            evento.stopPropagation();

            if (
                typeof evento.stopImmediatePropagation ===
                'function'
            ) {
                evento.stopImmediatePropagation();
            }

            if (botaoTirarFoto) {
                tirarFotoDePerfil();
                return;
            }

            if (botaoGaleria) {
                escolherFotosDePerfil();
                return;
            }

            escolherAnexo(
                botaoAnexo.getAttribute('for')
            );
        },
        true
    );
}(window, document));