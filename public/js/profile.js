(function (window, document) {
    'use strict';

    document.documentElement.classList.remove('perfil-modal-aberta');
    document.body.classList.remove('perfil-modal-aberta');

    var perfil = document.getElementById('perfil');
    var galeria = document.getElementById('perfil-galeria');
    var faixa = document.getElementById('perfil-fotos');

    if (!perfil || !galeria || !faixa) {
        return;
    }

    var slides = Array.prototype.slice.call(faixa.querySelectorAll('.perfil-slide'));

    if (!slides.length) {
        return;
    }

    var indicadores = Array.prototype.slice.call(
        document.querySelectorAll('#perfil-indicadores button')
    );
    var anterior = document.getElementById('perfil-anterior');
    var seguinte = document.getElementById('perfil-seguinte');
    var contadorAtual = document.getElementById('perfil-contador-atual');
    var lightbox = document.getElementById('perfil-lightbox');
    var lightboxMedia = document.getElementById('perfil-lightbox-media');
    var lightboxImagem = document.getElementById('perfil-lightbox-imagem');
    var lightboxPath = document.getElementById('perfil-lightbox-path');
    var lightboxFechar = document.getElementById('perfil-lightbox-fechar');
    var lightboxAnterior = document.getElementById('perfil-lightbox-anterior');
    var lightboxSeguinte = document.getElementById('perfil-lightbox-seguinte');
    var lightboxContadorAtual = document.getElementById('perfil-lightbox-contador-atual');

    /* ESTADO */
    var indiceAtual = 0;
    var lightboxAberto = false;
    var frameScroll = null;
    var observadorTamanho = null;
    var temporizadorFecho = null;
    var animacaoPathFrame = null;
    var temporizadorSplash = null;
    var animacaoGaleriaFrame = null;
    var pointerAtivo = false;
    var pointerId = null;
    var pointerInicioX = 0;
    var pointerInicioY = 0;
    var pointerUltimoX = 0;
    var pointerInicioScroll = 0;
    var pointerInicioTempo = 0;
    var pointerDirecao = null;
    var pointerMoveu = false;
    var ignorarClickAte = 0;

    /* PATHS */
    var PATH_ILHA = [
        0.075, 0.235, 0.055, 0.125, 0.135, 0.045, 0.285, 0.055,
        0.39, 0.01, 0.5, 0.07, 0.61, 0.05, 0.75, 0.02,
        0.875, 0.095, 0.915, 0.225, 0.985, 0.32, 0.94, 0.435,
        0.965, 0.545, 0.995, 0.675, 0.915, 0.775, 0.825, 0.835,
        0.755, 0.945, 0.62, 0.9, 0.515, 0.95, 0.405, 0.995,
        0.305, 0.93, 0.215, 0.92, 0.105, 0.91, 0.045, 0.82,
        0.06, 0.7, 0.015, 0.605, 0.07, 0.495, 0.045, 0.405,
        0.025, 0.33, 0.095, 0.305, 0.075, 0.235
    ];

    var PATH_SPLASH = [
        0.008, 0.115, 0.0, 0.035, 0.07, 0.008, 0.195, 0.02,
        0.29, 0.0, 0.405, 0.025, 0.515, 0.008, 0.655, 0.0,
        0.8, 0.018, 0.925, 0.07, 0.995, 0.115, 0.985, 0.25,
        0.998, 0.365, 1.0, 0.5, 0.985, 0.62, 0.997, 0.735,
        0.985, 0.87, 0.875, 0.935, 0.755, 0.95, 0.655, 0.995,
        0.53, 0.975, 0.42, 0.992, 0.3, 0.998, 0.2, 0.965,
        0.105, 0.95, 0.02, 0.92, 0.005, 0.82, 0.015, 0.705,
        0.002, 0.6, 0.018, 0.5, 0.005, 0.39, 0.002, 0.275,
        0.025, 0.205, 0.008, 0.115
    ];

    var PATH_RECT = [
        0.0, 0.0, 0.08, 0.0, 0.17, 0.0, 0.25, 0.0,
        0.33, 0.0, 0.42, 0.0, 0.5, 0.0, 0.58, 0.0,
        0.67, 0.0, 0.75, 0.0, 0.83, 0.0, 0.92, 0.0,
        1.0, 0.0, 1.0, 0.16, 1.0, 0.33, 1.0, 0.5,
        1.0, 0.67, 1.0, 0.84, 1.0, 1.0, 0.89, 1.0,
        0.77, 1.0, 0.66, 1.0, 0.55, 1.0, 0.44, 1.0,
        0.33, 1.0, 0.22, 1.0, 0.11, 1.0, 0.0, 1.0,
        0.0, 0.66, 0.0, 0.33, 0.0, 0.0
    ];

    /* HELPERS */
    function limitarIndice(indice) {
        return Math.max(0, Math.min(indice, slides.length - 1));
    }

    function formatarNumero(numero) {
        return numero < 10 ? '0' + numero : String(numero);
    }

    function prefereMovimentoReduzido() {
        return Boolean(
            window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        );
    }

    function obterImagem(indice) {
        indice = limitarIndice(indice);
        return slides[indice] ? slides[indice].querySelector('img') : null;
    }

    function indiceMaisProximo() {
        var centro = faixa.scrollLeft + faixa.clientWidth / 2;
        var melhor = 0;
        var menorDistancia = Infinity;

        slides.forEach(function (slide, indice) {
            var centroSlide = slide.offsetLeft + slide.offsetWidth / 2;
            var distancia = Math.abs(centroSlide - centro);

            if (distancia < menorDistancia) {
                menorDistancia = distancia;
                melhor = indice;
            }
        });

        return limitarIndice(melhor);
    }

    /* ANIMAÇÃO DA GALERIA */
    function cancelarAnimacaoGaleria() {
        if (animacaoGaleriaFrame !== null) {
            window.cancelAnimationFrame(animacaoGaleriaFrame);
            animacaoGaleriaFrame = null;
        }
    }

    function easingGaleria(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function animarGaleriaPara(indice, duracao) {
        indice = limitarIndice(indice);
        cancelarAnimacaoGaleria();

        var destino = slides[indice].offsetLeft;
        var origem = faixa.scrollLeft;
        var distancia = destino - origem;

        if (prefereMovimentoReduzido() || Math.abs(distancia) < 1) {
            faixa.scrollLeft = destino;
            atualizarUI(indice);
            return;
        }

        var inicio = window.performance.now();
        faixa.classList.add('a-arrastar');

        function frame(agora) {
            var progresso = Math.min(1, (agora - inicio) / duracao);
            var suavizado = easingGaleria(progresso);

            faixa.scrollLeft = origem + distancia * suavizado;

            if (progresso < 1) {
                animacaoGaleriaFrame = window.requestAnimationFrame(frame);
            } else {
                animacaoGaleriaFrame = null;
                faixa.scrollLeft = destino;
                faixa.classList.remove('a-arrastar');
                atualizarUI(indice);
            }
        }

        animacaoGaleriaFrame = window.requestAnimationFrame(frame);
    }

    /* PATH */
    function criarPath(valores) {
        var partes = ['M', valores[0], valores[1]];

        for (var i = 2; i < valores.length; i += 6) {
            partes.push('C', ...valores.slice(i, i + 6));
        }

        partes.push('Z');
        return partes.join(' ');
    }

    function cancelarAnimacaoPath() {
        if (animacaoPathFrame !== null) {
            window.cancelAnimationFrame(animacaoPathFrame);
            animacaoPathFrame = null;
        }

        if (temporizadorSplash !== null) {
            window.clearTimeout(temporizadorSplash);
            temporizadorSplash = null;
        }
    }

    function animarPath(origem, destino, duracao, callback) {
        if (!lightboxPath) {
            if (typeof callback === 'function') callback();
            return;
        }

        if (prefereMovimentoReduzido()) {
            lightboxPath.setAttribute('d', criarPath(destino));
            if (typeof callback === 'function') callback();
            return;
        }

        if (animacaoPathFrame !== null) {
            window.cancelAnimationFrame(animacaoPathFrame);
            animacaoPathFrame = null;
        }

        var inicio = window.performance.now();

        function easing(t) {
            return 1 - Math.pow(1 - t, 4);
        }

        function frame(agora) {
            var progresso = Math.min(1, (agora - inicio) / duracao);
            var suavizado = easing(progresso);

            var atual = origem.map(function (valor, indice) {
                return valor + (destino[indice] - valor) * suavizado;
            });

            lightboxPath.setAttribute('d', criarPath(atual));

            if (progresso < 1) {
                animacaoPathFrame = window.requestAnimationFrame(frame);
            } else {
                animacaoPathFrame = null;
                lightboxPath.setAttribute('d', criarPath(destino));

                if (typeof callback === 'function') callback();
            }
        }

        animacaoPathFrame = window.requestAnimationFrame(frame);
    }

    function animarAberturaPath() {
        cancelarAnimacaoPath();

        animarPath(PATH_ILHA, PATH_SPLASH, 360, function () {
            temporizadorSplash = window.setTimeout(function () {
                temporizadorSplash = null;
                animarPath(PATH_SPLASH, PATH_RECT, 410);
            }, 10);
        });
    }

    function animarFechoPath() {
        cancelarAnimacaoPath();

        animarPath(PATH_RECT, PATH_SPLASH, 260, function () {
            animarPath(PATH_SPLASH, PATH_ILHA, 390);
        });
    }

    /* FALLBACK */
    function prepararFallback(imagem) {
        imagem.addEventListener('error', function () {
            var tentativas = Number(imagem.dataset.fallbackTentativas || 0);
            tentativas += 1;
            imagem.dataset.fallbackTentativas = String(tentativas);

            var fallback = imagem.dataset.fallback;
            var padrao = imagem.dataset.default;

            if (tentativas === 1 && fallback) {
                imagem.src = fallback;
                return;
            }

            if (tentativas <= 2 && padrao) {
                imagem.src = padrao;
            }
        });
    }

    faixa.querySelectorAll('img').forEach(prepararFallback);

    /* UI */
    function atualizarUI(indice) {
        indiceAtual = limitarIndice(indice);

        slides.forEach(function (slide, posicao) {
            slide.setAttribute(
                'aria-hidden',
                posicao === indiceAtual ? 'false' : 'true'
            );
        });

        indicadores.forEach(function (indicador, posicao) {
            var ativo = posicao === indiceAtual;
            indicador.classList.toggle('ativo', ativo);
            indicador.setAttribute('aria-current', ativo ? 'true' : 'false');
        });

        if (contadorAtual) {
            contadorAtual.textContent = formatarNumero(indiceAtual + 1);
        }

        if (anterior) anterior.disabled = indiceAtual === 0;
        if (seguinte) seguinte.disabled = indiceAtual === slides.length - 1;
    }

    /* LIGHTBOX TAMANHO */
    function ajustarLightboxAoAspecto(larguraNatural, alturaNatural) {
        if (!lightboxMedia || !larguraNatural || !alturaNatural) {
            return;
        }

        var larguraMaxima = Math.min(window.innerWidth * 0.92, 880);
        var alturaMaxima = Math.min(window.innerHeight * 0.8, 920);
        var proporcao = Math.min(
            larguraMaxima / larguraNatural,
            alturaMaxima / alturaNatural
        );

        lightboxMedia.style.width = Math.max(120, larguraNatural * proporcao) + 'px';
        lightboxMedia.style.height = Math.max(120, alturaNatural * proporcao) + 'px';
    }

    function atualizarLightboxFoto(indice) {
        if (!lightboxImagem) return;

        indice = limitarIndice(indice);
        var imagem = obterImagem(indice);

        if (!imagem) return;

        if (imagem.naturalWidth && imagem.naturalHeight) {
            ajustarLightboxAoAspecto(imagem.naturalWidth, imagem.naturalHeight);
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

    /* TROCA SUAVE NO LIGHTBOX */
    var photoGestures = window.MargotPhotoGestures(
        lightbox,
        lightboxImagem,
        function (direction) {
            if (lightboxAberto) trocarFotoLightbox(indiceAtual + direction);
        }
    );

    function trocarFotoLightbox(novoIndice) {
        novoIndice = limitarIndice(novoIndice);
        if (novoIndice === indiceAtual) return;

        var direction = novoIndice > indiceAtual ? 1 : -1;

        photoGestures.changePhoto(function () {
            indiceAtual = novoIndice;
            atualizarUI(indiceAtual);
            faixa.scrollLeft = slides[indiceAtual].offsetLeft;
            atualizarLightboxFoto(indiceAtual);
        }, direction);
    }

    /* ORIGEM LIGHTBOX */
    function calcularTransformacaoOrigem() {
        if (!lightboxMedia || !galeria) return;

        var origem = galeria.getBoundingClientRect();
        var destino = lightboxMedia.getBoundingClientRect();

        if (!origem.width || !origem.height || !destino.width || !destino.height) {
            return;
        }

        var centroOrigemX = origem.left + origem.width / 2;
        var centroOrigemY = origem.top + origem.height / 2;
        var centroDestinoX = destino.left + destino.width / 2;
        var centroDestinoY = destino.top + destino.height / 2;

        lightboxMedia.style.setProperty(
            '--perfil-origem-x',
            centroOrigemX - centroDestinoX + 'px'
        );
        lightboxMedia.style.setProperty(
            '--perfil-origem-y',
            centroOrigemY - centroDestinoY + 'px'
        );
        lightboxMedia.style.setProperty(
            '--perfil-origem-scale-x',
            String(origem.width / destino.width)
        );
        lightboxMedia.style.setProperty(
            '--perfil-origem-scale-y',
            String(origem.height / destino.height)
        );
    }

    /* ABRIR */
    function abrirLightbox(indice) {
        if (!lightbox || !lightboxMedia || !lightboxImagem) return;

        if (temporizadorFecho !== null) {
            window.clearTimeout(temporizadorFecho);
            temporizadorFecho = null;
        }

        photoGestures.reset();
        indiceAtual = limitarIndice(indice);
        atualizarUI(indiceAtual);
        atualizarLightboxFoto(indiceAtual);

        if (lightboxPath) {
            lightboxPath.setAttribute('d', criarPath(PATH_ILHA));
        }

        lightbox.hidden = false;
        lightbox.setAttribute('aria-hidden', 'false');
        lightbox.classList.add('is-mounted');
        document.documentElement.classList.add('perfil-modal-aberta');
        document.body.classList.add('perfil-modal-aberta');
        lightboxAberto = true;

        window.requestAnimationFrame(function () {
            calcularTransformacaoOrigem();

            window.requestAnimationFrame(function () {
                lightbox.classList.add('is-open');
                animarAberturaPath();
            });
        });

        if (lightboxFechar) {
            window.setTimeout(function () {
                lightboxFechar.focus({ preventScroll: true });
            }, 80);
        }
    }

    /* FECHAR */
    function fecharLightbox() {
        if (!lightbox || !lightboxAberto) return;

        photoGestures.reset(true);
        calcularTransformacaoOrigem();
        animarFechoPath();
        lightbox.classList.remove('is-open');
        lightboxAberto = false;

        temporizadorFecho = window.setTimeout(function () {
            temporizadorFecho = null;
            cancelarAnimacaoPath();
            lightbox.classList.remove('is-mounted');
            lightbox.hidden = true;
            lightbox.setAttribute('aria-hidden', 'true');
            document.documentElement.classList.remove('perfil-modal-aberta');
            document.body.classList.remove('perfil-modal-aberta');

            if (lightboxImagem) lightboxImagem.src = '';

            if (lightboxPath) {
                lightboxPath.setAttribute('d', criarPath(PATH_ILHA));
            }

            galeria.focus({ preventScroll: true });
        }, prefereMovimentoReduzido() ? 0 : 830);
    }

    /* SWIPE / DRAG PRINCIPAL */
    function terminarPointer(evento, cancelado) {
        if (!pointerAtivo) return;

        var largura = faixa.clientWidth || 1;
        var distancia = pointerUltimoX - pointerInicioX;
        var tempo = Math.max(1, window.performance.now() - pointerInicioTempo);
        var velocidade = distancia / tempo;
        var indiceInicio = limitarIndice(Math.round(pointerInicioScroll / largura));
        var destino = indiceMaisProximo();

        if (!cancelado && pointerDirecao === 'horizontal') {
            var limite = largura * 0.16;

            if (distancia < -limite || velocidade < -0.42) {
                destino = limitarIndice(indiceInicio + 1);
            } else if (distancia > limite || velocidade > 0.42) {
                destino = limitarIndice(indiceInicio - 1);
            } else {
                destino = indiceInicio;
            }
        }

        if (pointerDirecao === 'horizontal') {
            ignorarClickAte = window.performance.now() + 250;
            animarGaleriaPara(destino, 380);
        }

        if (
            pointerId !== null &&
            faixa.hasPointerCapture &&
            faixa.hasPointerCapture(pointerId)
        ) {
            try {
                faixa.releasePointerCapture(pointerId);
            } catch (erro) {
                /* sem ação */
            }
        }

        pointerAtivo = false;
        pointerId = null;
        pointerDirecao = null;
        pointerMoveu = false;
    }

    faixa.addEventListener('pointerdown', function (evento) {
        if (evento.pointerType === 'mouse' && evento.button !== 0) return;

        cancelarAnimacaoGaleria();
        pointerAtivo = true;
        pointerId = evento.pointerId;
        pointerDirecao = null;
        pointerMoveu = false;
        pointerInicioX = evento.clientX;
        pointerInicioY = evento.clientY;
        pointerUltimoX = evento.clientX;
        pointerInicioScroll = faixa.scrollLeft;
        pointerInicioTempo = window.performance.now();
    });

    faixa.addEventListener('pointermove', function (evento) {
        if (!pointerAtivo) return;

        pointerUltimoX = evento.clientX;

        var deltaX = evento.clientX - pointerInicioX;
        var deltaY = evento.clientY - pointerInicioY;
        var absX = Math.abs(deltaX);
        var absY = Math.abs(deltaY);

        if (pointerDirecao === null && (absX > 6 || absY > 6)) {
            if (absX > absY * 1.15) {
                pointerDirecao = 'horizontal';
                faixa.classList.add('a-arrastar');

                if (faixa.setPointerCapture) {
                    try {
                        faixa.setPointerCapture(evento.pointerId);
                    } catch (erro) {
                        /* sem ação */
                    }
                }
            } else {
                pointerDirecao = 'vertical';
            }
        }

        if (pointerDirecao !== 'horizontal') return;

        evento.preventDefault();
        pointerMoveu = true;
        faixa.scrollLeft = pointerInicioScroll - deltaX;
    });

    faixa.addEventListener('pointerup', function (evento) {
        faixa.classList.remove('a-arrastar');
        terminarPointer(evento, false);
    });

    faixa.addEventListener('pointercancel', function (evento) {
        faixa.classList.remove('a-arrastar');
        terminarPointer(evento, true);
    });

    /* SCROLL */
    faixa.addEventListener('scroll', function () {
        if (pointerAtivo || animacaoGaleriaFrame !== null) return;
        if (frameScroll !== null) return;

        frameScroll = window.requestAnimationFrame(function () {
            frameScroll = null;
            atualizarUI(indiceMaisProximo());
        });
    }, { passive: true });

    /* INDICADORES */
    indicadores.forEach(function (indicador) {
        indicador.addEventListener('click', function (evento) {
            evento.stopPropagation();
            animarGaleriaPara(Number(indicador.dataset.indice || 0), 420);
        });
    });

    /* SETAS PRINCIPAIS */
    if (anterior) {
        anterior.addEventListener('click', function (evento) {
            evento.stopPropagation();
            animarGaleriaPara(indiceAtual - 1, 420);
        });
    }

    if (seguinte) {
        seguinte.addEventListener('click', function (evento) {
            evento.stopPropagation();
            animarGaleriaPara(indiceAtual + 1, 420);
        });
    }

    /* ABRIR FOTO */
    faixa.addEventListener('click', function (evento) {
        if (window.performance.now() < ignorarClickAte) {
            evento.preventDefault();
            return;
        }

        var imagem = evento.target.closest('.perfil-slide img');
        if (!imagem) return;

        var slide = imagem.closest('.perfil-slide');
        if (!slide) return;

        abrirLightbox(Number(slide.dataset.indice || 0));
    });

    /* LIGHTBOX CONTROLOS */
    if (lightbox) {
        lightbox.addEventListener('click', function (evento) {
            if (!lightboxAberto) return;
            if (evento.target.closest('.perfil-lightbox-media')) return;
            if (evento.target.closest('.perfil-lightbox-nav')) return;
            if (evento.target.closest('.perfil-lightbox-fechar')) return;

            fecharLightbox();
        });
    }

    if (lightboxFechar) {
        lightboxFechar.addEventListener('click', function (evento) {
            evento.stopPropagation();
            fecharLightbox();
        });
    }

    if (lightboxAnterior) {
        lightboxAnterior.addEventListener('click', function (evento) {
            evento.stopPropagation();
            if (indiceAtual <= 0) return;
            trocarFotoLightbox(indiceAtual - 1);
        });
    }

    if (lightboxSeguinte) {
        lightboxSeguinte.addEventListener('click', function (evento) {
            evento.stopPropagation();
            if (indiceAtual >= slides.length - 1) return;
            trocarFotoLightbox(indiceAtual + 1);
        });
    }

    /* TECLADO */
    function aoPremirTecla(evento) {
        if (lightboxAberto) {
            if (evento.key === 'Escape') {
                evento.preventDefault();
                fecharLightbox();
                return;
            }

            if (evento.key === 'ArrowLeft' && indiceAtual > 0) {
                evento.preventDefault();
                trocarFotoLightbox(indiceAtual - 1);
                return;
            }

            if (evento.key === 'ArrowRight' && indiceAtual < slides.length - 1) {
                evento.preventDefault();
                trocarFotoLightbox(indiceAtual + 1);
                return;
            }

            return;
        }

        if (document.activeElement !== galeria) return;

        if (evento.key === 'ArrowLeft') {
            evento.preventDefault();
            animarGaleriaPara(indiceAtual - 1, 420);
        }

        if (evento.key === 'ArrowRight') {
            evento.preventDefault();
            animarGaleriaPara(indiceAtual + 1, 420);
        }

        if (evento.key === 'Enter' || evento.key === ' ') {
            evento.preventDefault();
            abrirLightbox(indiceAtual);
        }
    }

    document.addEventListener('keydown', aoPremirTecla);

    /* RESIZE */
    function aoRedimensionar() {
        cancelarAnimacaoGaleria();
        faixa.scrollLeft = slides[indiceAtual].offsetLeft;

        if (lightboxAberto) {
            atualizarLightboxFoto(indiceAtual);
            calcularTransformacaoOrigem();
        }
    }

    if ('ResizeObserver' in window) {
        observadorTamanho = new window.ResizeObserver(aoRedimensionar);
        observadorTamanho.observe(faixa);
    } else {
        window.addEventListener('resize', aoRedimensionar, { passive: true });
    }

    /* CLEANUP */
    function desativarPagina() {
        photoGestures.destroy();
        cancelarAnimacaoGaleria();
        cancelarAnimacaoPath();

        if (frameScroll !== null) {
            window.cancelAnimationFrame(frameScroll);
            frameScroll = null;
        }

        if (temporizadorFecho !== null) {
            window.clearTimeout(temporizadorFecho);
        }

        if (observadorTamanho) {
            observadorTamanho.disconnect();
            observadorTamanho = null;
        }

        document.documentElement.classList.remove('perfil-modal-aberta');
        document.body.classList.remove('perfil-modal-aberta');
        document.removeEventListener('keydown', aoPremirTecla);
        document.removeEventListener('margot:page-leave', desativarPagina);
    }

    document.addEventListener('margot:page-leave', desativarPagina);
    atualizarUI(0);
})(window, document);