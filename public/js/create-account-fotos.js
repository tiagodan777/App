(function (window, document, $) {
    'use strict';

    const MAX_FOTOS = 6;
    const LADO_MAXIMO = 2400;

    window.fotosPerfil = window.fotosPerfil || [];

    let streamPerfil = null;
    let cameraPerfil = 'user';
    let capturaEmCurso = false;

    function obterElementos() {
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
        const erro = obterElementos().erro;
        if (erro) erro.textContent = mensagem || '';
    }

    function gerarIdFoto() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }

        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    function normalizarNomeFicheiro(nome) {
        return String(nome)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9._-]/g, '-');
    }

    function libertarUrl(foto) {
        if (foto && foto.url && foto.url.startsWith('blob:')) {
            URL.revokeObjectURL(foto.url);
        }
    }

    function adicionarFicheiros(files) {
        mostrarErro('');

        const ficheiros = Array.from(files || []);
        const ultrapassouLimite = ficheiros.length > MAX_FOTOS - window.fotosPerfil.length;

        for (const file of ficheiros) {
            if (window.fotosPerfil.length >= MAX_FOTOS) break;
            if (!file.type || !file.type.startsWith('image/')) continue;

            const jaExiste = window.fotosPerfil.some(function (foto) {
                return foto.file.name === file.name &&
                    foto.file.size === file.size &&
                    foto.file.lastModified === file.lastModified;
            });

            if (jaExiste) continue;

            window.fotosPerfil.push({
                id: gerarIdFoto(),
                file: file,
                url: URL.createObjectURL(file)
            });
        }

        if (ultrapassouLimite) {
            mostrarErro('Podes adicionar no máximo 6 fotografias.');
        }

        renderizarFotos();
    }

    function removerFoto(id) {
        const indice = window.fotosPerfil.findIndex(function (foto) {
            return foto.id === id;
        });

        if (indice === -1) return;

        libertarUrl(window.fotosPerfil[indice]);
        window.fotosPerfil.splice(indice, 1);
        mostrarErro('');
        renderizarFotos();
    }

    function definirComoPrincipal(id) {
        const indice = window.fotosPerfil.findIndex(function (foto) {
            return foto.id === id;
        });

        if (indice <= 0) return;

        const foto = window.fotosPerfil.splice(indice, 1)[0];
        window.fotosPerfil.unshift(foto);
        renderizarFotos();
    }

    function criarPlaceholder() {
        const placeholder = document.createElement('button');

        placeholder.type = 'button';
        placeholder.className = 'perfil-foto-placeholder';
        placeholder.innerHTML = `
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Adicionar</span>
        `;

        return placeholder;
    }

    function criarCartaoFoto(foto, indice) {
        const cartao = document.createElement('article');

        cartao.className = 'perfil-foto-cartao';
        cartao.dataset.id = foto.id;

        if (indice === 0) cartao.classList.add('principal');

        const imagem = document.createElement('img');

        imagem.src = foto.url;
        imagem.alt = indice === 0 ? 'Foto principal' : 'Foto de perfil ' + (indice + 1);

        const remover = document.createElement('button');

        remover.type = 'button';
        remover.className = 'perfil-remover-foto';
        remover.dataset.id = foto.id;
        remover.setAttribute('aria-label', 'Remover fotografia');
        remover.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;

        cartao.appendChild(imagem);
        cartao.appendChild(remover);

        if (indice === 0) {
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
        const lista = obterElementos().lista;

        if (!lista) return;

        lista.innerHTML = '';

        window.fotosPerfil.forEach(function (foto, indice) {
            lista.appendChild(criarCartaoFoto(foto, indice));
        });

        for (let indice = window.fotosPerfil.length; indice < MAX_FOTOS; indice++) {
            lista.appendChild(criarPlaceholder());
        }
    }

    function aplicarEspelhoCamera(video) {
        const transformacao = cameraPerfil === 'user' ? 'scaleX(-1)' : 'none';

        video.style.transform = transformacao;
        video.style.webkitTransform = transformacao;
    }

    async function iniciarCamera() {
        const ui = obterElementos();

        if (!ui.interfaceCamera || !ui.video || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            mostrarErro('A câmara não está disponível neste dispositivo.');
            return;
        }

        pararCamera();

        try {
            streamPerfil = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: cameraPerfil },
                    width: { ideal: 1920 },
                    height: { ideal: 1440 },
                    aspectRatio: { ideal: 4 / 3 }
                },
                audio: false
            });

            ui.video.srcObject = streamPerfil;
            aplicarEspelhoCamera(ui.video);
            ui.interfaceCamera.style.display = 'flex';

            if (ui.conteudo) ui.conteudo.style.display = 'none';

            document.body.classList.add('perfil-camera-aberta');
            await ui.video.play();
        } catch (erro) {
            console.error(erro);
            mostrarErro('Não foi possível abrir a câmara. Verifica as permissões.');
            fecharCamera();
        }
    }

    function pararCamera() {
        if (streamPerfil) {
            streamPerfil.getTracks().forEach(function (track) {
                track.stop();
            });

            streamPerfil = null;
        }

        const video = document.getElementById('perfil-camera-video');

        if (video) video.srcObject = null;
    }

    function fecharCamera() {
        const ui = obterElementos();

        pararCamera();

        if (ui.interfaceCamera) ui.interfaceCamera.style.display = 'none';
        if (ui.conteudo) ui.conteudo.style.display = 'flex';

        document.body.classList.remove('perfil-camera-aberta');
    }

    function criarCanvasProporcional(video, canvas) {
        const larguraOrigem = video.videoWidth;
        const alturaOrigem = video.videoHeight;
        const escala = Math.min(1, LADO_MAXIMO / Math.max(larguraOrigem, alturaOrigem));
        const larguraSaida = Math.max(1, Math.round(larguraOrigem * escala));
        const alturaSaida = Math.max(1, Math.round(alturaOrigem * escala));

        canvas.width = larguraSaida;
        canvas.height = alturaSaida;

        const contexto = canvas.getContext('2d');

        if (!contexto) {
            throw new Error('Não foi possível preparar a fotografia.');
        }

        contexto.save();

        if (cameraPerfil === 'user') {
            contexto.translate(larguraSaida, 0);
            contexto.scale(-1, 1);
        }

        contexto.drawImage(
            video,
            0,
            0,
            larguraOrigem,
            alturaOrigem,
            0,
            0,
            larguraSaida,
            alturaSaida
        );

        contexto.restore();

        return canvas;
    }

    function canvasParaBlob(canvas) {
        return new Promise(function (resolve, reject) {
            canvas.toBlob(function (blob) {
                if (!blob) {
                    reject(new Error('Não foi possível gerar a fotografia.'));
                    return;
                }

                resolve(blob);
            }, 'image/jpeg', 0.92);
        });
    }

    async function capturarFoto() {
        const ui = obterElementos();

        if (capturaEmCurso || !ui.video || !ui.canvas || !ui.capturar) return;

        if (ui.video.readyState < 2 || ui.video.videoWidth === 0 || ui.video.videoHeight === 0) {
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
            const canvas = criarCanvasProporcional(ui.video, ui.canvas);
            const blob = await canvasParaBlob(canvas);
            const agora = Date.now();

            const ficheiro = new File(
                [blob],
                'foto-perfil-' + agora + '.jpg',
                {
                    type: 'image/jpeg',
                    lastModified: agora
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
        const input = obterElementos().input;

        if (input) input.click();
    }

    function validarFotosPerfil() {
        mostrarErro('');
        return true;
    }

    window.inicializarEtapaFotos = function () {
        if (document.getElementById('fotos')) {
            renderizarFotos();
        }
    };

    window.pararCameraPerfil = fecharCamera;
    window.validarFotosPerfil = validarFotosPerfil;

    window.adicionarFotosPerfilAoFormData = function (formData) {
        window.fotosPerfil.forEach(function (foto, indice) {
            const nome = normalizarNomeFicheiro(
                foto.file.name || 'foto-perfil-' + (indice + 1) + '.jpg'
            );

            formData.append('imagens[]', foto.file, nome);
        });
    };

    $(document).on('click', '#perfil-tirar-foto', iniciarCamera);

    $(document).on(
        'click',
        '#perfil-escolher-fotos, #perfil-abrir-galeria-camera',
        abrirSeletorFotos
    );

    $(document).on(
        'click',
        '.perfil-foto-placeholder',
        abrirSeletorFotos
    );

    $(document).on('change', '#perfil-input-fotos', function () {
        if (!this.files || this.files.length === 0) return;

        adicionarFicheiros(this.files);
        this.value = '';
    });

    $(document).on('click', '.perfil-remover-foto', function (evento) {
        evento.stopPropagation();
        removerFoto(String($(this).data('id')));
    });

    $(document).on('click', '.perfil-definir-principal', function (evento) {
        evento.stopPropagation();
        definirComoPrincipal(String($(this).data('id')));
    });

    $(document).on('click', '#perfil-fechar-camera', fecharCamera);
    $(document).on('click', '#perfil-capturar-foto', capturarFoto);

    $(document).on('click', '#perfil-trocar-camera', function () {
        cameraPerfil = cameraPerfil === 'user' ? 'environment' : 'user';
        iniciarCamera();
    });

    window.addEventListener('pagehide', pararCamera);
})(window, document, jQuery);