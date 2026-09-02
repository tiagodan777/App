(function (window, document) {
    'use strict';

    var perfil = document.getElementById('perfil');
    var galeria = document.getElementById('perfil-galeria');
    var faixa = document.getElementById('perfil-fotos');

    if (!perfil || !galeria || !faixa) {
        return;
    }

    var slides = Array.prototype.slice.call(
        faixa.querySelectorAll('.perfil-slide')
    );

    if (!slides.length) {
        return;
    }

    var indicadores = Array.prototype.slice.call(
        document.querySelectorAll('#perfil-indicadores button')
    );

    var botaoAnterior = document.getElementById('perfil-anterior');
    var botaoSeguinte = document.getElementById('perfil-seguinte');
    var contadorAtual = document.getElementById('perfil-contador-atual');

    var lightbox = document.getElementById('perfil-lightbox');
    var lightboxMedia = document.getElementById('perfil-lightbox-media');
    var lightboxImagem = document.getElementById('perfil-lightbox-imagem');
    var lightboxFechar = document.getElementById('perfil-lightbox-fechar');
    var lightboxAnterior = document.getElementById('perfil-lightbox-anterior');
    var lightboxSeguinte = document.getElementById('perfil-lightbox-seguinte');
    var lightboxContadorAtual = document.getElementById('perfil-lightbox-contador-atual');

    var indiceAtual = 0;
    var modalAberto = false;
    var rafScroll = null;

    function limitarIndice(indice) {
        return Math.max(0, Math.min(indice, slides.length - 1));
    }

    function formatarNumero(numero) {
        return numero < 10 ? '0' + numero : String(numero);
    }

    function atualizarFallbacks() {
        faixa.querySelectorAll('img').forEach(function (imagem) {
            imagem.addEventListener('error', function () {
                var fallback = imagem.dataset.fallback || '';
                var padrao = imagem.dataset.default || '';

                if (fallback && imagem.src.indexOf(fallback) === -1) {
                    imagem.src = fallback;
                    return;
                }

                if (padrao) {
                    imagem.src = padrao;
                }
            });
        });
    }

    function atualizarUI(indice) {
        indiceAtual = limitarIndice(indice);

        slides.forEach(function (slide, i) {
            slide.setAttribute('aria-hidden', i === indiceAtual ? 'false' : 'true');
        });

        indicadores.forEach(function (botao, i) {
            var ativo = i === indiceAtual;
            botao.classList.toggle('ativo', ativo);
            botao.setAttribute('aria-current', ativo ? 'true' : 'false');
        });

        if (contadorAtual) {
            contadorAtual.textContent = formatarNumero(indiceAtual + 1);
        }

        if (botaoAnterior) {
            botaoAnterior.disabled = indiceAtual === 0;
        }

        if (botaoSeguinte) {
            botaoSeguinte.disabled = indiceAtual === slides.length - 1;
        }

        if (modalAberto) {
            atualizarLightboxSlide(indiceAtual);
        }
    }

    function mostrarFoto(indice, suave) {
        indice = limitarIndice(indice);

        faixa.scrollTo({
            left: slides[indice].offsetLeft,
            behavior: suave === false ? 'auto' : 'smooth'
        });

        atualizarUI(indice);
    }

    function obterIndiceMaisProximo() {
        var largura = faixa.clientWidth || 1;
        return limitarIndice(Math.round(faixa.scrollLeft / largura));
    }

    function aoScrollFaixa() {
        if (rafScroll !== null) {
            return;
        }

        rafScroll = window.requestAnimationFrame(function () {
            rafScroll = null;
            atualizarUI(obterIndiceMaisProximo());
        });
    }

    function atualizarLightboxSlide(indice) {
        if (!lightboxImagem) {
            return;
        }

        indice = limitarIndice(indice);

        var imagem = slides[indice].querySelector('img');
        if (!imagem) {
            return;
        }

        lightboxImagem.src = imagem.currentSrc || imagem.src;
        lightboxImagem.alt = imagem.alt || '';

        if (lightboxContadorAtual) {
            lightboxContadorAtual.textContent = formatarNumero(indice + 1);
        }

        if (lightboxAnterior) {
            lightboxAnterior.disabled = indice === 0;
        }

        if (lightboxSeguinte) {
            lightboxSeguinte.disabled = indice === slides.length - 1;
        }
    }

    function aplicarTransformacaoInicial() {
        if (!lightboxMedia) {
            return;
        }

        var origem = galeria.getBoundingClientRect();
        var destino = lightboxMedia.getBoundingClientRect();

        var scaleX = origem.width / destino.width;
        var scaleY = origem.height / destino.height;

        var origemCentroX = origem.left + (origem.width / 2);
        var origemCentroY = origem.top + (origem.height / 2);

        var destinoCentroX = destino.left + (destino.width / 2);
        var destinoCentroY = destino.top + (destino.height / 2);

        var deltaX = origemCentroX - destinoCentroX;
        var deltaY = origemCentroY - destinoCentroY;

        lightboxMedia.style.setProperty('--from-x', deltaX + 'px');
        lightboxMedia.style.setProperty('--from-y', deltaY + 'px');
        lightboxMedia.style.setProperty('--from-scale-x', scaleX);
        lightboxMedia.style.setProperty('--from-scale-y', scaleY);
    }

    function abrirLightbox(indice) {
        if (!lightbox || !lightboxMedia) {
            return;
        }

        indice = limitarIndice(indice);
        atualizarUI(indice);
        atualizarLightboxSlide(indice);

        lightbox.hidden = false;
        lightbox.setAttribute('aria-hidden', 'false');
        lightbox.classList.add('is-mounted');

        document.documentElement.classList.add('perfil-modal-aberta');
        document.body.classList.add('perfil-modal-aberta');

        modalAberto = true;

        window.requestAnimationFrame(function () {
            aplicarTransformacaoInicial();

            window.requestAnimationFrame(function () {
                lightbox.classList.add('is-open');
            });
        });
    }

    function fecharLightbox() {
        if (!lightbox || !lightboxMedia || !modalAberto) {
            return;
        }

        aplicarTransformacaoInicial();
        lightbox.classList.remove('is-open');
        modalAberto = false;

        window.setTimeout(function () {
            lightbox.classList.remove('is-mounted');
            lightbox.hidden = true;
            lightbox.setAttribute('aria-hidden', 'true');
            document.documentElement.classList.remove('perfil-modal-aberta');
            document.body.classList.remove('perfil-modal-aberta');
            galeria.focus({ preventScroll: true });
        }, 660);
    }

    function irParaAnterior() {
        mostrarFoto(indiceAtual - 1);
    }

    function irParaSeguinte() {
        mostrarFoto(indiceAtual + 1);
    }

    indicadores.forEach(function (indicador) {
        indicador.addEventListener('click', function () {
            var indice = Number(indicador.dataset.indice || 0);
            mostrarFoto(indice);
        });
    });

    if (botaoAnterior) {
        botaoAnterior.addEventListener('click', irParaAnterior);
    }

    if (botaoSeguinte) {
        botaoSeguinte.addEventListener('click', irParaSeguinte);
    }

    faixa.addEventListener('scroll', aoScrollFaixa, { passive: true });

    faixa.addEventListener('click', function (evento) {
        var imagem = evento.target.closest('.perfil-slide img');
        if (!imagem) {
            return;
        }

        var slide = imagem.closest('.perfil-slide');
        if (!slide) {
            return;
        }

        abrirLightbox(Number(slide.dataset.indice || 0));
    });

    if (lightboxFechar) {
        lightboxFechar.addEventListener('click', fecharLightbox);
    }

    if (lightbox) {
        lightbox.addEventListener('click', function (evento) {
            if (evento.target && evento.target.hasAttribute('data-fechar-modal')) {
                fecharLightbox();
            }
        });
    }

    if (lightboxAnterior) {
        lightboxAnterior.addEventListener('click', function () {
            var novoIndice = limitarIndice(indiceAtual - 1);
            mostrarFoto(novoIndice, false);
            atualizarLightboxSlide(novoIndice);
        });
    }

    if (lightboxSeguinte) {
        lightboxSeguinte.addEventListener('click', function () {
            var novoIndice = limitarIndice(indiceAtual + 1);
            mostrarFoto(novoIndice, false);
            atualizarLightboxSlide(novoIndice);
        });
    }

    galeria.addEventListener('keydown', function (evento) {
        if (evento.key === 'ArrowLeft') {
            evento.preventDefault();
            irParaAnterior();
        }

        if (evento.key === 'ArrowRight') {
            evento.preventDefault();
            irParaSeguinte();
        }

        if (evento.key === 'Enter' || evento.key === ' ') {
            evento.preventDefault();
            abrirLightbox(indiceAtual);
        }
    });

    document.addEventListener('keydown', function (evento) {
        if (!modalAberto) {
            return;
        }

        if (evento.key === 'Escape') {
            evento.preventDefault();
            fecharLightbox();
        }

        if (evento.key === 'ArrowLeft') {
            evento.preventDefault();
            if (indiceAtual > 0) {
                mostrarFoto(indiceAtual - 1, false);
                atualizarLightboxSlide(indiceAtual);
            }
        }

        if (evento.key === 'ArrowRight') {
            evento.preventDefault();
            if (indiceAtual < slides.length - 1) {
                mostrarFoto(indiceAtual + 1, false);
                atualizarLightboxSlide(indiceAtual);
            }
        }
    });

    window.addEventListener('resize', function () {
        mostrarFoto(indiceAtual, false);

        if (modalAberto) {
            aplicarTransformacaoInicial();
            window.requestAnimationFrame(function () {
                if (lightbox.classList.contains('is-open')) {
                    lightboxMedia.style.setProperty('--from-x', '0px');
                    lightboxMedia.style.setProperty('--from-y', '0px');
                    lightboxMedia.style.setProperty('--from-scale-x', '1');
                    lightboxMedia.style.setProperty('--from-scale-y', '1');
                }
            });
        }
    });

    atualizarFallbacks();
    atualizarUI(0);
})(window, document);


/* =========================================================
   HEY
   ========================================================= */

(function (window, document) {
    'use strict';

    var botao = document.getElementById('enviar-hey-perfil');

    if (!botao) {
        return;
    }

    var texto = botao.querySelector('.perfil-hey-texto');
    var estadoAcessivel = document.getElementById('perfil-hey-estado');

    var textoInicial = texto ? texto.textContent : 'Hey';
    var emEnvio = false;
    var timeoutConfirmacao = null;
    var timeoutReposicao = null;

    function atualizarTexto(valor) {
        if (texto) {
            texto.textContent = valor;
        }
    }

    function anunciar(valor) {
        if (estadoAcessivel) {
            estadoAcessivel.textContent = valor;
        }
    }

    function reporBotao() {
        emEnvio = false;
        botao.disabled = false;
        botao.classList.remove('a-enviar', 'enviado');
        botao.removeAttribute('aria-busy');
        atualizarTexto(textoInicial);
    }

    function mostrarMensagem(textoMensagem, tipo) {
        anunciar(textoMensagem);

        if (typeof window.mostrarMensagemTemporaria === 'function') {
            window.mostrarMensagemTemporaria(textoMensagem, tipo || 'erro');
        }
    }

    function idsCoincidem(evento) {
        var detalhe = evento && evento.detail ? evento.detail : {};
        return String(detalhe.destinatario_id || '') === String(botao.dataset.destinatarioId || '');
    }

    function enviarHey() {
        var destinatarioId = botao.dataset.destinatarioId;

        if (!destinatarioId || emEnvio) {
            return;
        }

        if (
            !window.AppWebSocket ||
            typeof window.AppWebSocket.isConnected !== 'function' ||
            !window.AppWebSocket.isConnected()
        ) {
            if (window.AppWebSocket && typeof window.AppWebSocket.connect === 'function') {
                window.AppWebSocket.connect();
            }

            mostrarMensagem('A ligação está a ser restabelecida.', 'erro');
            return;
        }

        emEnvio = true;
        botao.disabled = true;
        botao.classList.add('a-enviar');
        botao.setAttribute('aria-busy', 'true');
        atualizarTexto('A enviar…');
        anunciar('A enviar Hey.');

        var enviado = window.AppWebSocket.send({
            type: 'notify',
            destinatario_id: destinatarioId
        });

        if (!enviado) {
            reporBotao();
            mostrarMensagem('Não foi possível enviar o Hey.', 'erro');
            return;
        }

        timeoutConfirmacao = window.setTimeout(function () {
            timeoutConfirmacao = null;
            reporBotao();
            mostrarMensagem('Não foi recebida confirmação. Podes tentar outra vez.', 'erro');
        }, 8000);
    }

    function heyEnviado(evento) {
        if (!idsCoincidem(evento)) {
            return;
        }

        if (timeoutConfirmacao) {
            window.clearTimeout(timeoutConfirmacao);
            timeoutConfirmacao = null;
        }

        emEnvio = false;
        botao.disabled = true;
        botao.classList.remove('a-enviar');
        botao.classList.add('enviado');
        botao.removeAttribute('aria-busy');
        atualizarTexto('Hey enviado');
        anunciar('Hey enviado com sucesso.');

        if (timeoutReposicao) {
            window.clearTimeout(timeoutReposicao);
        }

        timeoutReposicao = window.setTimeout(function () {
            timeoutReposicao = null;
            reporBotao();
        }, 1600);
    }

    function heyErro(evento) {
        if (!idsCoincidem(evento)) {
            return;
        }

        if (timeoutConfirmacao) {
            window.clearTimeout(timeoutConfirmacao);
            timeoutConfirmacao = null;
        }

        reporBotao();
        mostrarMensagem('Não foi possível enviar o Hey.', 'erro');
    }

    botao.addEventListener('click', enviarHey);
    window.addEventListener('app:hey-enviado', heyEnviado);
    window.addEventListener('app:hey-erro', heyErro);
})(window, document);