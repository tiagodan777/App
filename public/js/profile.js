(function (window, document) {
    'use strict';

    var perfil = document.getElementById('perfil');
    var galeria = document.getElementById('perfil-galeria');
    var faixa = document.getElementById('perfil-fotos');

    if (!perfil || !galeria || !faixa) {
        return;
    }

    var slides = Array.prototype.slice.call(faixa.querySelectorAll('.perfil-slide'));
    var indicadores = Array.prototype.slice.call(document.querySelectorAll('#perfil-indicadores button'));
    var anterior = document.getElementById('perfil-anterior');
    var seguinte = document.getElementById('perfil-seguinte');
    var contadorAtual = document.getElementById('perfil-contador-atual');

    var abrirBotao = document.getElementById('perfil-expandir');
    var modal = document.getElementById('perfil-modal');
    var modalImagem = document.getElementById('perfil-modal-imagem');
    var modalFechar = document.getElementById('perfil-modal-fechar');
    var modalAnterior = document.getElementById('perfil-modal-anterior');
    var modalSeguinte = document.getElementById('perfil-modal-seguinte');
    var modalContadorAtual = document.getElementById('perfil-modal-contador-atual');

    var indiceAtual = 0;
    var frameScroll = null;
    var resizeObserver = null;

    var dragging = false;
    var moved = false;
    var startX = 0;
    var startScroll = 0;

    var modalAberto = false;
    var modalTimer = null;

    if (!slides.length) {
        return;
    }

    function limitarIndice(indice) {
        return Math.max(0, Math.min(indice, slides.length - 1));
    }

    function formatarNumero(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function prefersReducedMotion() {
        return Boolean(
            window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        );
    }

    function getSlideImage(indice) {
        indice = limitarIndice(indice);
        return slides[indice] ? slides[indice].querySelector('img') : null;
    }

    function getNearestIndex() {
        var centro = faixa.scrollLeft + faixa.clientWidth / 2;
        var bestIndex = 0;
        var bestDistance = Infinity;

        slides.forEach(function (slide, i) {
            var slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
            var distance = Math.abs(slideCenter - centro);

            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
            }
        });

        return bestIndex;
    }

    function atualizarUI(indice) {
        indiceAtual = limitarIndice(indice);

        slides.forEach(function (slide, i) {
            slide.setAttribute('aria-hidden', i === indiceAtual ? 'false' : 'true');
        });

        indicadores.forEach(function (button, i) {
            var active = i === indiceAtual;
            button.classList.toggle('ativo', active);
            button.setAttribute('aria-current', active ? 'true' : 'false');
        });

        if (contadorAtual) {
            contadorAtual.textContent = formatarNumero(indiceAtual + 1);
        }

        if (anterior) {
            anterior.disabled = indiceAtual === 0;
        }

        if (seguinte) {
            seguinte.disabled = indiceAtual === slides.length - 1;
        }

        if (modalAberto) {
            atualizarModal(indiceAtual);
        }
    }

    function goToSlide(indice, smooth) {
        indice = limitarIndice(indice);

        faixa.scrollTo({
            left: slides[indice].offsetLeft,
            behavior: smooth === false || prefersReducedMotion() ? 'auto' : 'smooth'
        });

        atualizarUI(indice);
    }

    function bindImageFallback(img) {
        var tries = 0;

        img.addEventListener('error', function () {
            tries += 1;

            var fallback = img.dataset.fallback;
            var def = img.dataset.default;

            if (tries === 1 && fallback) {
                img.src = fallback;
                return;
            }

            if (def && img.src !== new URL(def, window.location.href).href) {
                img.src = def;
            }
        });
    }

    faixa.querySelectorAll('img').forEach(bindImageFallback);

    function atualizarModal(indice) {
        if (!modal || !modalImagem) {
            return;
        }

        indice = limitarIndice(indice);

        var image = getSlideImage(indice);
        if (!image) {
            return;
        }

        modalImagem.src = image.currentSrc || image.src;
        modalImagem.alt = image.alt || '';

        if (modalContadorAtual) {
            modalContadorAtual.textContent = formatarNumero(indice + 1);
        }

        if (modalAnterior) {
            modalAnterior.disabled = indice === 0;
        }

        if (modalSeguinte) {
            modalSeguinte.disabled = indice === slides.length - 1;
        }
    }

    function abrirModalFoto(indice) {
        if (!modal || !modalImagem) {
            return;
        }

        if (modalTimer !== null) {
            window.clearTimeout(modalTimer);
            modalTimer = null;
        }

        indice = limitarIndice(indice);
        goToSlide(indice, false);
        atualizarModal(indice);

        modalAberto = true;
        modal.setAttribute('aria-hidden', 'false');
        perfil.classList.add('modal-aberto');

        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
                modal.classList.add('ativo');
            });
        });

        if (modalFechar) {
            window.setTimeout(function () {
                modalFechar.focus({ preventScroll: true });
            }, 50);
        }
    }

    function fecharModalFoto() {
        if (!modal || !modalAberto) {
            return;
        }

        modalAberto = false;
        modal.classList.remove('ativo');
        perfil.classList.remove('modal-aberto');

        modalTimer = window.setTimeout(function () {
            modalTimer = null;
            modal.setAttribute('aria-hidden', 'true');
            if (modalImagem) {
                modalImagem.src = '';
            }
            galeria.focus({ preventScroll: true });
        }, prefersReducedMotion() ? 0 : 230);
    }

    function updateModalSlide(indice) {
        indice = limitarIndice(indice);
        goToSlide(indice, false);
        atualizarModal(indice);
    }

    if (abrirBotao) {
        abrirBotao.addEventListener('click', function () {
            abrirModalFoto(indiceAtual);
        });
    }

    if (modalFechar) {
        modalFechar.addEventListener('click', fecharModalFoto);
    }

    if (modalAnterior) {
        modalAnterior.addEventListener('click', function () {
            updateModalSlide(indiceAtual - 1);
        });
    }

    if (modalSeguinte) {
        modalSeguinte.addEventListener('click', function () {
            updateModalSlide(indiceAtual + 1);
        });
    }

    if (modal) {
        modal.addEventListener('click', function (event) {
            if (event.target && event.target.hasAttribute('data-fechar-modal')) {
                fecharModalFoto();
            }
        });
    }

    faixa.addEventListener('scroll', function () {
        if (frameScroll !== null) {
            return;
        }

        frameScroll = window.requestAnimationFrame(function () {
            frameScroll = null;
            atualizarUI(getNearestIndex());
        });
    }, { passive: true });

    indicadores.forEach(function (button) {
        button.addEventListener('click', function (event) {
            event.stopPropagation();
            goToSlide(Number(button.dataset.indice));
        });
    });

    if (anterior) {
        anterior.addEventListener('click', function (event) {
            event.stopPropagation();
            goToSlide(indiceAtual - 1);
        });
    }

    if (seguinte) {
        seguinte.addEventListener('click', function (event) {
            event.stopPropagation();
            goToSlide(indiceAtual + 1);
        });
    }

    faixa.addEventListener('pointerdown', function (event) {
        if (event.pointerType !== 'mouse' || event.button !== 0) {
            return;
        }

        dragging = true;
        moved = false;
        startX = event.clientX;
        startScroll = faixa.scrollLeft;

        faixa.classList.add('a-arrastar');
        faixa.setPointerCapture(event.pointerId);
    });

    faixa.addEventListener('pointermove', function (event) {
        if (!dragging) {
            return;
        }

        var distance = event.clientX - startX;

        if (Math.abs(distance) > 4) {
            moved = true;
        }

        faixa.scrollLeft = startScroll - distance;
        event.preventDefault();
    });

    function endDrag(event) {
        if (!dragging) {
            return;
        }

        dragging = false;
        faixa.classList.remove('a-arrastar');

        if (faixa.hasPointerCapture(event.pointerId)) {
            faixa.releasePointerCapture(event.pointerId);
        }

        goToSlide(getNearestIndex());

        window.setTimeout(function () {
            moved = false;
        }, 20);
    }

    faixa.addEventListener('pointerup', endDrag);
    faixa.addEventListener('pointercancel', endDrag);

    faixa.addEventListener('click', function (event) {
        if (moved) {
            event.preventDefault();
            return;
        }

        var image = event.target.closest('.perfil-slide img');
        if (!image) {
            return;
        }

        var slide = image.closest('.perfil-slide');
        if (!slide) {
            return;
        }

        abrirModalFoto(Number(slide.dataset.indice));
    });

    function onKeyDown(event) {
        if (modalAberto) {
            if (event.key === 'Escape') {
                event.preventDefault();
                fecharModalFoto();
                return;
            }

            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                updateModalSlide(indiceAtual - 1);
                return;
            }

            if (event.key === 'ArrowRight') {
                event.preventDefault();
                updateModalSlide(indiceAtual + 1);
                return;
            }

            return;
        }

        if (document.activeElement !== galeria) {
            return;
        }

        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goToSlide(indiceAtual - 1);
        }

        if (event.key === 'ArrowRight') {
            event.preventDefault();
            goToSlide(indiceAtual + 1);
        }

        if (event.key === 'Home') {
            event.preventDefault();
            goToSlide(0);
        }

        if (event.key === 'End') {
            event.preventDefault();
            goToSlide(slides.length - 1);
        }
    }

    document.addEventListener('keydown', onKeyDown);

    function onResize() {
        goToSlide(indiceAtual, false);
    }

    if ('ResizeObserver' in window) {
        resizeObserver = new window.ResizeObserver(onResize);
        resizeObserver.observe(faixa);
    } else {
        window.addEventListener('resize', onResize, { passive: true });
    }

    function teardown() {
        if (frameScroll !== null) {
            window.cancelAnimationFrame(frameScroll);
            frameScroll = null;
        }

        if (modalTimer !== null) {
            window.clearTimeout(modalTimer);
            modalTimer = null;
        }

        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        } else {
            window.removeEventListener('resize', onResize);
        }

        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('margot:page-leave', teardown);
    }

    document.addEventListener('margot:page-leave', teardown);

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

    var etiqueta = botao.querySelector('.perfil-hey-texto');
    var estadoAcessivel = document.getElementById('perfil-hey-estado');

    var resetTimer = null;
    var confirmTimer = null;
    var sending = false;

    var textoInicial = etiqueta ? etiqueta.textContent : 'Hey';

    function sameTarget(event) {
        var detail = event && event.detail ? event.detail : {};
        return String(detail.destinatario_id || '') === String(botao.dataset.destinatarioId || '');
    }

    function setLabel(text) {
        if (etiqueta) {
            etiqueta.textContent = text;
        } else {
            botao.textContent = text;
        }
    }

    function announce(text) {
        if (estadoAcessivel) {
            estadoAcessivel.textContent = text;
        }
    }

    function clearConfirmTimer() {
        if (confirmTimer === null) {
            return;
        }

        window.clearTimeout(confirmTimer);
        confirmTimer = null;
    }

    function resetButton() {
        clearConfirmTimer();

        sending = false;
        botao.disabled = false;
        botao.removeAttribute('aria-busy');
        botao.classList.remove('a-enviar', 'enviado');
        setLabel(textoInicial);
    }

    function showTemporaryMessage(text, type) {
        announce(text);

        if (typeof window.mostrarMensagemTemporaria === 'function') {
            window.mostrarMensagemTemporaria(text, type || 'erro');
        }
    }

    function sendHey() {
        var destinatarioId = botao.dataset.destinatarioId;

        if (sending || !destinatarioId) {
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

            showTemporaryMessage('A ligação está a ser restabelecida.', 'erro');
            return;
        }

        sending = true;
        botao.disabled = true;
        botao.setAttribute('aria-busy', 'true');
        botao.classList.add('a-enviar');

        setLabel('A enviar…');
        announce('A enviar o Hey.');

        var sent = window.AppWebSocket.send({
            type: 'notify',
            destinatario_id: destinatarioId
        });

        if (!sent) {
            resetButton();
            showTemporaryMessage('Não foi possível enviar o Hey.', 'erro');
            return;
        }

        confirmTimer = window.setTimeout(function () {
            confirmTimer = null;
            resetButton();
            announce('Não foi recebida confirmação do envio. Podes tentar novamente.');
        }, 8000);
    }

    function onHeySent(event) {
        if (!sameTarget(event)) {
            return;
        }

        clearConfirmTimer();

        sending = false;
        botao.disabled = true;
        botao.removeAttribute('aria-busy');
        botao.classList.remove('a-enviar');
        botao.classList.add('enviado');

        setLabel('Hey enviado');
        announce('Hey enviado com sucesso.');

        if (resetTimer !== null) {
            window.clearTimeout(resetTimer);
        }

        resetTimer = window.setTimeout(function () {
            resetTimer = null;
            resetButton();
        }, 1600);
    }

    function onHeyError(event) {
        if (!sameTarget(event)) {
            return;
        }

        resetButton();
        showTemporaryMessage('Não foi possível enviar o Hey.', 'erro');
    }

    function teardown() {
        if (resetTimer !== null) {
            window.clearTimeout(resetTimer);
            resetTimer = null;
        }

        clearConfirmTimer();

        botao.removeEventListener('click', sendHey);
        window.removeEventListener('app:hey-enviado', onHeySent);
        window.removeEventListener('app:hey-erro', onHeyError);
        document.removeEventListener('margot:page-leave', teardown);
    }

    botao.addEventListener('click', sendHey);
    window.addEventListener('app:hey-enviado', onHeySent);
    window.addEventListener('app:hey-erro', onHeyError);
    document.addEventListener('margot:page-leave', teardown);
})(window, document);