(function (window, document) {
    'use strict';

    var galeria =
        document.getElementById(
            'perfil-galeria'
        );

    var faixa =
        document.getElementById(
            'perfil-fotos'
        );

    if (!galeria || !faixa) return;

    var slides =
        Array.prototype.slice.call(
            faixa.querySelectorAll(
                '.perfil-slide'
            )
        );

    var indicadores =
        Array.prototype.slice.call(
            document.querySelectorAll(
                '#perfil-indicadores button'
            )
        );

    var anterior =
        document.getElementById(
            'perfil-anterior'
        );

    var seguinte =
        document.getElementById(
            'perfil-seguinte'
        );

    var indiceAtual = 0;
    var frameScroll = null;
    var ratoAtivo = false;
    var ratoMoveu = false;
    var ratoInicioX = 0;
    var scrollInicio = 0;

    if (slides.length === 0) return;

    function limitarIndice(indice) {
        return Math.max(
            0,
            Math.min(
                indice,
                slides.length - 1
            )
        );
    }

    function indiceMaisProximo() {
        var centro =
            faixa.scrollLeft +
            faixa.clientWidth / 2;

        var melhorIndice = 0;
        var menorDistancia = Infinity;

        slides.forEach(
            function (slide, indice) {
                var centroSlide =
                    slide.offsetLeft +
                    slide.offsetWidth / 2;

                var distancia =
                    Math.abs(
                        centroSlide -
                        centro
                    );

                if (
                    distancia <
                    menorDistancia
                ) {
                    menorDistancia =
                        distancia;

                    melhorIndice =
                        indice;
                }
            }
        );

        return melhorIndice;
    }

    function atualizarInterface(indice) {
        indiceAtual =
            limitarIndice(indice);

        slides.forEach(
            function (slide, posicao) {
                slide.setAttribute(
                    'aria-hidden',
                    posicao === indiceAtual
                        ? 'false'
                        : 'true'
                );
            }
        );

        indicadores.forEach(
            function (
                indicador,
                posicao
            ) {
                var ativo =
                    posicao ===
                    indiceAtual;

                indicador.classList.toggle(
                    'ativo',
                    ativo
                );

                indicador.setAttribute(
                    'aria-current',
                    ativo
                        ? 'true'
                        : 'false'
                );
            }
        );

        if (anterior) {
            anterior.disabled =
                indiceAtual === 0;
        }

        if (seguinte) {
            seguinte.disabled =
                indiceAtual ===
                slides.length - 1;
        }
    }

    function mostrarFoto(
        indice,
        suave
    ) {
        indice =
            limitarIndice(indice);

        faixa.scrollTo({
            left:
                slides[indice]
                    .offsetLeft,

            behavior:
                suave === false
                    ? 'auto'
                    : 'smooth'
        });

        atualizarInterface(
            indice
        );
    }

    function corrigirFoto(imagem) {
        var tentativa = 0;

        imagem.addEventListener(
            'error',
            function () {
                tentativa += 1;

                var fallback =
                    imagem.dataset
                        .fallback;

                var padrao =
                    imagem.dataset
                        .default;

                if (
                    tentativa === 1 &&
                    fallback
                ) {
                    imagem.src =
                        fallback;

                    return;
                }

                if (
                    padrao &&
                    imagem.src !==
                    new URL(
                        padrao,
                        window.location.href
                    ).href
                ) {
                    imagem.src =
                        padrao;
                }
            }
        );
    }

    faixa
        .querySelectorAll('img')
        .forEach(corrigirFoto);

    faixa.addEventListener(
        'scroll',
        function () {
            if (
                frameScroll !== null
            ) {
                return;
            }

            frameScroll =
                window.requestAnimationFrame(
                    function () {
                        frameScroll = null;

                        atualizarInterface(
                            indiceMaisProximo()
                        );
                    }
                );
        },
        {
            passive: true
        }
    );

    indicadores.forEach(
        function (indicador) {
            indicador.addEventListener(
                'click',
                function () {
                    mostrarFoto(
                        Number(
                            indicador.dataset
                                .indice
                        )
                    );
                }
            );
        }
    );

    if (anterior) {
        anterior.addEventListener(
            'click',
            function () {
                mostrarFoto(
                    indiceAtual - 1
                );
            }
        );
    }

    if (seguinte) {
        seguinte.addEventListener(
            'click',
            function () {
                mostrarFoto(
                    indiceAtual + 1
                );
            }
        );
    }

    /*
     * Arrasto com rato no computador.
     * No telefone é utilizado o scroll nativo.
     */
    faixa.addEventListener(
        'pointerdown',
        function (evento) {
            if (
                evento.pointerType !==
                'mouse' ||
                evento.button !== 0
            ) {
                return;
            }

            ratoAtivo = true;
            ratoMoveu = false;
            ratoInicioX =
                evento.clientX;

            scrollInicio =
                faixa.scrollLeft;

            faixa.classList.add(
                'a-arrastar'
            );

            faixa.setPointerCapture(
                evento.pointerId
            );
        }
    );

    faixa.addEventListener(
        'pointermove',
        function (evento) {
            if (!ratoAtivo) return;

            var distancia =
                evento.clientX -
                ratoInicioX;

            if (
                Math.abs(distancia) >
                4
            ) {
                ratoMoveu = true;
            }

            faixa.scrollLeft =
                scrollInicio -
                distancia;

            evento.preventDefault();
        }
    );

    function terminarArrasto(evento) {
        if (!ratoAtivo) return;

        ratoAtivo = false;

        faixa.classList.remove(
            'a-arrastar'
        );

        if (
            faixa.hasPointerCapture(
                evento.pointerId
            )
        ) {
            faixa.releasePointerCapture(
                evento.pointerId
            );
        }

        mostrarFoto(
            indiceMaisProximo()
        );

        window.setTimeout(
            function () {
                ratoMoveu = false;
            },
            0
        );
    }

    faixa.addEventListener(
        'pointerup',
        terminarArrasto
    );

    faixa.addEventListener(
        'pointercancel',
        terminarArrasto
    );

    faixa.addEventListener(
        'click',
        function (evento) {
            if (ratoMoveu) {
                evento.preventDefault();
            }
        },
        true
    );

    galeria.addEventListener(
        'keydown',
        function (evento) {
            if (
                evento.key ===
                'ArrowLeft'
            ) {
                evento.preventDefault();

                mostrarFoto(
                    indiceAtual - 1
                );
            }

            if (
                evento.key ===
                'ArrowRight'
            ) {
                evento.preventDefault();

                mostrarFoto(
                    indiceAtual + 1
                );
            }
        }
    );

    window.addEventListener(
        'resize',
        function () {
            mostrarFoto(
                indiceAtual,
                false
            );
        },
        {
            passive: true
        }
    );

    atualizarInterface(0);
})(
    window,
    document
);

(function (window, document) {
    'use strict';

    var button = document.getElementById('enviar-hey-perfil');

    if (!button) return;

    var targetId = String(button.dataset.destinatarioId || '');
    var timeout = null;

    function finish(message, error) {
        if (timeout !== null) {
            window.clearTimeout(timeout);
            timeout = null;
        }

        button.disabled = false;
        button.textContent = 'Hey';

        var status = document.getElementById('perfil-seguranca-estado');

        if (status && message) {
            status.textContent = message;
            status.classList.toggle('erro', Boolean(error));
        }
    }

    button.addEventListener('click', function () {
        if (!window.AppWebSocket || !window.AppWebSocket.isConnected()) {
            if (window.AppWebSocket) window.AppWebSocket.connect();
            finish('A ligação está a ser restabelecida.', true);
            return;
        }

        button.disabled = true;
        button.textContent = 'A enviar…';

        if (!window.AppWebSocket.send({
            type: 'notify',
            destinatario_id: targetId
        })) {
            finish('Não foi possível enviar o Hey.', true);
            return;
        }

        timeout = window.setTimeout(function () {
            finish(
                'Não recebemos confirmação. Confirma a ligação e tenta novamente.',
                true
            );
        }, 8000);
    });

    window.addEventListener('app:hey-enviado', function (event) {
        if (String(event.detail?.destinatario_id || '') !== targetId) return;

        if (timeout !== null) {
            window.clearTimeout(timeout);
            timeout = null;
        }

        button.textContent = 'Hey enviado';

        window.setTimeout(function () {
            finish('Hey enviado.', false);
        }, 900);
    });

    window.addEventListener('app:hey-erro', function (event) {
        if (
            event.detail?.destinatario_id &&
            String(event.detail.destinatario_id) !== targetId
        ) {
            return;
        }

        finish(
            String(event.detail?.message || 'Não foi possível enviar o Hey.'),
            true
        );
    });
})(window, document);

(function (window, document) {
    'use strict';

    var heyButton = document.getElementById('enviar-hey-perfil');
    var reportButton = document.getElementById('denunciar-perfil');
    var blockButton = document.getElementById('bloquear-perfil');
    var dialog = document.getElementById('perfil-denuncia-dialog');
    var form = document.getElementById('perfil-denuncia-form');
    var cancelButton = document.getElementById('perfil-denuncia-cancelar');
    var submitButton = document.getElementById('perfil-denuncia-enviar');
    var dialogError = document.getElementById('perfil-denuncia-erro');
    var status = document.getElementById('perfil-seguranca-estado');
    var targetId = String(heyButton?.dataset.destinatarioId || '');
    var busy = false;

    if (!targetId || !reportButton || !blockButton || !dialog || !form) return;

    function setStatus(message, isError) {
        if (!status) return;

        status.textContent = String(message || '');
        status.classList.toggle('erro', Boolean(isError));
    }

    function closeDialog() {
        if (typeof dialog.close === 'function') {
            dialog.close();
        } else {
            dialog.removeAttribute('open');
        }
    }

    async function safetyRequest(action, fields) {
        var body = new FormData();

        body.set('action', action);
        body.set('target_id', targetId);
        body.set('context_type', 'perfil');
        body.set('proximity_token', String(window.profileProximityToken || ''));
        body.set('_csrf', String(window.csrfToken || ''));

        Object.keys(fields || {}).forEach(function (key) {
            body.set(key, fields[key]);
        });

        var response = await window.fetch(
            String(window.profileSafetyUrl || '/safety'),
            {
                method: 'POST',
                body: body,
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-Token': String(window.csrfToken || ''),
                    'X-Requested-With': 'XMLHttpRequest'
                }
            }
        );
        var result = await response.json().catch(function () {
            return {};
        });

        if (!response.ok || !result.success) {
            throw new Error(
                result.message ||
                'Não foi possível concluir esta ação.'
            );
        }

        return result;
    }

    reportButton.addEventListener('click', function () {
        form.reset();
        dialogError.hidden = true;
        dialogError.textContent = '';

        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', 'open');
        }
    });

    cancelButton?.addEventListener('click', closeDialog);

    form.addEventListener('submit', async function (event) {
        event.preventDefault();

        if (busy) return;

        var reason = String(
            document.getElementById('perfil-denuncia-motivo')?.value || ''
        );
        var message = String(
            document.getElementById('perfil-denuncia-mensagem')?.value || ''
        );

        if (!reason) {
            dialogError.textContent = 'Escolhe o motivo da denúncia.';
            dialogError.hidden = false;
            return;
        }

        busy = true;
        submitButton.disabled = true;
        dialogError.hidden = true;

        try {
            var result = await safetyRequest('report', {
                motivo: reason,
                mensagem: message
            });
            closeDialog();
            setStatus(
                'Denúncia enviada. Referência: ' +
                    String(result.reference || 'indisponível') +
                    '.',
                false
            );
        } catch (error) {
            dialogError.textContent = error.message;
            dialogError.hidden = false;
        } finally {
            busy = false;
            submitButton.disabled = false;
        }
    });

    blockButton.addEventListener('click', async function () {
        if (
            busy ||
            !window.confirm(
                'Bloquear esta pessoa? Deixam imediatamente de se ver e contactar.'
            )
        ) {
            return;
        }

        busy = true;
        blockButton.disabled = true;
        reportButton.disabled = true;

        try {
            await safetyRequest('block');

            if (window.AppWebSocket?.isConnected()) {
                window.AppWebSocket.send({
                    type: 'block_refresh',
                    target_id: targetId
                });
            }

            window.location.assign(
                String(window.profileHomeUrl || '/index')
            );
        } catch (error) {
            setStatus(error.message, true);
            busy = false;
            blockButton.disabled = false;
            reportButton.disabled = false;
        }
    });
})(window, document);
