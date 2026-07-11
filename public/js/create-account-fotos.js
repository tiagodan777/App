(function () {
    'use strict';

    const MAX_FOTOS = 6;

    window.fotosPerfil = window.fotosPerfil || [];

    let streamPerfil = null;
    let cameraPerfil = 'user';
    let capturaEmCurso = false;

    function elementos() {
        return {
            etapa: document.getElementById('fotos'),
            interfaceCamera: document.getElementById('perfil-camera-interface'),
            conteudo: document.getElementById('perfil-fotos-conteudo'),
            video: document.getElementById('perfil-camera-video'),
            canvas: document.getElementById('perfil-camera-canvas'),
            input: document.getElementById('perfil-input-fotos'),
            lista: document.getElementById('perfil-lista-fotos'),
            erro: document.getElementById('perfil-fotos-erro'),
            capturar: document.getElementById('perfil-capturar-foto')
        };
    }

    function mostrarErro(mensagem) {
        const ui = elementos();

        if (!ui.erro) {
            return;
        }

        ui.erro.textContent = mensagem || '';
    }

    function gerarIdFoto() {
        return (
            Date.now().toString(36) +
            Math.random().toString(36).substring(2)
        );
    }

    function normalizarNomeFicheiro(nome) {
        return nome
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9._-]/g, '-');
    }

    function adicionarFicheiros(files) {
        mostrarErro('');

        Array.from(files).forEach(function (file) {
            if (window.fotosPerfil.length >= MAX_FOTOS) {
                return;
            }

            if (!file.type.startsWith('image/')) {
                return;
            }

            const jaExiste = window.fotosPerfil.some(function (foto) {
                return (
                    foto.file.name === file.name &&
                    foto.file.size === file.size &&
                    foto.file.lastModified === file.lastModified
                );
            });

            if (jaExiste) {
                return;
            }

            window.fotosPerfil.push({
                id: gerarIdFoto(),
                file: file,
                url: URL.createObjectURL(file)
            });
        });

        if (window.fotosPerfil.length >= MAX_FOTOS) {
            mostrarErro('Podes adicionar no máximo 6 fotografias.');
        }

        renderizarFotos();
    }

    function removerFoto(id) {
        const index = window.fotosPerfil.findIndex(function (foto) {
            return foto.id === id;
        });

        if (index === -1) {
            return;
        }

        URL.revokeObjectURL(window.fotosPerfil[index].url);
        window.fotosPerfil.splice(index, 1);

        mostrarErro('');
        renderizarFotos();
    }

    function definirComoPrincipal(id) {
        const index = window.fotosPerfil.findIndex(function (foto) {
            return foto.id === id;
        });

        if (index <= 0) {
            return;
        }

        const foto = window.fotosPerfil.splice(index, 1)[0];
        window.fotosPerfil.unshift(foto);

        renderizarFotos();
    }

    function criarPlaceholder(index) {
        const placeholder = document.createElement('button');

        placeholder.type = 'button';
        placeholder.className = 'perfil-foto-placeholder';
        placeholder.dataset.index = index;

        placeholder.innerHTML = `
            <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
            >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>

            <span>Adicionar</span>
        `;

        return placeholder;
    }

    function criarCartaoFoto(foto, index) {
        const cartao = document.createElement('article');

        cartao.className = 'perfil-foto-cartao';
        cartao.dataset.id = foto.id;

        if (index === 0) {
            cartao.classList.add('principal');
        }

        const imagem = document.createElement('img');
        imagem.src = foto.url;
        imagem.alt = index === 0
            ? 'Foto principal'
            : 'Foto de perfil ' + (index + 1);

        const remover = document.createElement('button');
        remover.type = 'button';
        remover.className = 'perfil-remover-foto';
        remover.dataset.id = foto.id;
        remover.setAttribute('aria-label', 'Remover fotografia');

        remover.innerHTML = `
            <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
            >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;

        cartao.appendChild(imagem);
        cartao.appendChild(remover);

        if (index === 0) {
            const etiqueta = document.createElement('span');
            etiqueta.className = 'perfil-foto-principal';
            etiqueta.textContent = 'Principal';

            cartao.appendChild(etiqueta);
        } else {
            const principal = document.createElement('button');

            principal.type = 'button';
            principal.className = 'perfil-definir-principal';
            principal.dataset.id = foto.id;
            principal.textContent = 'Tornar principal';

            cartao.appendChild(principal);
        }

        return cartao;
    }

    function renderizarFotos() {
        const ui = elementos();

        if (!ui.lista) {
            return;
        }

        ui.lista.innerHTML = '';

        window.fotosPerfil.forEach(function (foto, index) {
            ui.lista.appendChild(criarCartaoFoto(foto, index));
        });

        for (
            let index = window.fotosPerfil.length;
            index < MAX_FOTOS;
            index++
        ) {
            ui.lista.appendChild(criarPlaceholder(index));
        }

        sincronizarInput();
    }

    function sincronizarInput() {
        const ui = elementos();

        if (!ui.input || typeof DataTransfer === 'undefined') {
            return;
        }

        const transferencia = new DataTransfer();

        window.fotosPerfil.forEach(function (foto, index) {
            const nome = normalizarNomeFicheiro(
                foto.file.name || 'foto-perfil-' + (index + 1) + '.jpg'
            );

            let ficheiro = foto.file;

            if (ficheiro.name !== nome) {
                ficheiro = new File(
                    [foto.file],
                    nome,
                    {
                        type: foto.file.type,
                        lastModified: foto.file.lastModified
                    }
                );
            }

            transferencia.items.add(ficheiro);
        });

        ui.input.files = transferencia.files;
    }

    async function iniciarCamera() {
        const ui = elementos();

        if (
            !ui.interfaceCamera ||
            !ui.video ||
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {
            mostrarErro('A câmara não está disponível neste dispositivo.');
            return;
        }

        pararCamera();

        try {
            streamPerfil = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: {
                        ideal: cameraPerfil
                    },
                    width: {
                        ideal: 1920
                    },
                    height: {
                        ideal: 1920
                    }
                },
                audio: false
            });

            ui.video.srcObject = streamPerfil;

            ui.interfaceCamera.style.display = 'flex';

            if (ui.conteudo) {
                ui.conteudo.style.display = 'none';
            }

            document.body.classList.add('perfil-camera-aberta');

            await ui.video.play();

        } catch (erro) {
            console.error(erro);

            mostrarErro(
                'Não foi possível abrir a câmara. Verifica as permissões.'
            );

            fecharCamera();
        }
    }

    function pararCamera() {
        if (!streamPerfil) {
            return;
        }

        streamPerfil.getTracks().forEach(function (track) {
            track.stop();
        });

        streamPerfil = null;
    }

    function fecharCamera() {
        const ui = elementos();

        pararCamera();

        if (ui.interfaceCamera) {
            ui.interfaceCamera.style.display = 'none';
        }

        if (ui.conteudo) {
            ui.conteudo.style.display = 'flex';
        }

        document.body.classList.remove('perfil-camera-aberta');
    }

    function criarCanvasQuadrado(video, canvas) {
        const tamanho = Math.min(
            video.videoWidth,
            video.videoHeight
        );

        const origemX = Math.floor(
            (video.videoWidth - tamanho) / 2
        );

        const origemY = Math.floor(
            (video.videoHeight - tamanho) / 2
        );

        const tamanhoSaida = Math.min(tamanho, 1600);

        canvas.width = tamanhoSaida;
        canvas.height = tamanhoSaida;

        const contexto = canvas.getContext('2d');

        contexto.save();

        if (cameraPerfil === 'user') {
            contexto.translate(tamanhoSaida, 0);
            contexto.scale(-1, 1);
        }

        contexto.drawImage(
            video,
            origemX,
            origemY,
            tamanho,
            tamanho,
            0,
            0,
            tamanhoSaida,
            tamanhoSaida
        );

        contexto.restore();

        return canvas;
    }

    function canvasParaBlob(canvas) {
        return new Promise(function (resolve, reject) {
            canvas.toBlob(
                function (blob) {
                    if (!blob) {
                        reject(
                            new Error('Não foi possível gerar a fotografia.')
                        );
                        return;
                    }

                    resolve(blob);
                },
                'image/jpeg',
                0.92
            );
        });
    }

    async function capturarFoto() {
        const ui = elementos();

        if (
            capturaEmCurso ||
            !ui.video ||
            !ui.canvas ||
            !ui.capturar
        ) {
            return;
        }

        if (
            ui.video.readyState < 2 ||
            ui.video.videoWidth === 0
        ) {
            mostrarErro('A câmara ainda está a iniciar.');
            return;
        }

        if (window.fotosPerfil.length >= MAX_FOTOS) {
            mostrarErro('Já adicionaste o máximo de 6 fotografias.');
            fecharCamera();
            return;
        }

        capturaEmCurso = true;
        ui.capturar.classList.add('a-capturar');

        try {
            const canvas = criarCanvasQuadrado(
                ui.video,
                ui.canvas
            );

            const blob = await canvasParaBlob(canvas);

            const ficheiro = new File(
                [blob],
                'foto-perfil-' + Date.now() + '.jpg',
                {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                }
            );

            adicionarFicheiros([ficheiro]);
            fecharCamera();

        } catch (erro) {
            console.error(erro);
            mostrarErro('Não foi possível tirar a fotografia.');

        } finally {
            capturaEmCurso = false;
            ui.capturar.classList.remove('a-capturar');
        }
    }

    function abrirSeletorFotos() {
        const ui = elementos();

        if (ui.input) {
            ui.input.click();
        }
    }

    function validarFotosPerfil() {
        if (window.fotosPerfil.length === 0) {
            mostrarErro('Adiciona pelo menos uma fotografia.');
            return false;
        }

        mostrarErro('');
        return true;
    }

    window.inicializarEtapaFotos = function () {
        if (!document.getElementById('fotos')) {
            return;
        }

        renderizarFotos();
    };

    window.pararCameraPerfil = function () {
        fecharCamera();
    };

    window.validarFotosPerfil = validarFotosPerfil;

    window.adicionarFotosPerfilAoFormData = function (formData) {
        window.fotosPerfil.forEach(function (foto, index) {
            formData.append(
                'imagens[]',
                foto.file,
                normalizarNomeFicheiro(
                    foto.file.name ||
                    'foto-perfil-' + (index + 1) + '.jpg'
                )
            );
        });
    };

    $(document).on('click', '#perfil-tirar-foto', function () {
        iniciarCamera();
    });

    $(document).on(
        'click',
        '#perfil-escolher-fotos, #perfil-abrir-galeria-camera',
        function () {
            abrirSeletorFotos();
        }
    );

    $(document).on('click', '.perfil-foto-placeholder', function () {
        abrirSeletorFotos();
    });

    $(document).on('change', '#perfil-input-fotos', function () {
        if (this.files && this.files.length > 0) {
            adicionarFicheiros(this.files);
            this.value = '';
        }
    });

    $(document).on('click', '.perfil-remover-foto', function (evento) {
        evento.stopPropagation();
        removerFoto($(this).data('id'));
    });

    $(document).on(
        'click',
        '.perfil-definir-principal',
        function (evento) {
            evento.stopPropagation();
            definirComoPrincipal($(this).data('id'));
        }
    );

    $(document).on('click', '#perfil-fechar-camera', function () {
        fecharCamera();
    });

    $(document).on('click', '#perfil-capturar-foto', function () {
        capturarFoto();
    });

    $(document).on('click', '#perfil-trocar-camera', function () {
        cameraPerfil = cameraPerfil === 'user'
            ? 'environment'
            : 'user';

        iniciarCamera();
    });

    window.addEventListener('pagehide', pararCamera);
})();