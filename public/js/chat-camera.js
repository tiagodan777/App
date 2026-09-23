window.MargotChatCamera = function ({
    dialog,
    onFile,
    onError,
    gallery,
    allowViewOnce = true
}) {
    const live = dialog.querySelector('[data-camera-live]');
    const playback = dialog.querySelector('[data-camera-playback]');
    const photo = dialog.querySelector('img');
    const mode = dialog.querySelector('[data-camera-mode]');
    const capture = dialog.querySelector('[data-camera="capture"]');
    const use = dialog.querySelector('[data-camera="use"]');
    const retake = dialog.querySelector('[data-camera="retake"]');
    const flip = dialog.querySelector('[data-camera="flip"]');
    const status = dialog.querySelector('[data-camera-status]');

    const events = new AbortController();

    const on = (element, name, fn) =>
        element.addEventListener(name, fn, { signal: events.signal });

    let stream, microphone, recorder, file, photoUrl;
    let holdTimer, limitTimer, frame;

    let facing = 'environment',
        generation = 0,
        disposed = false,
        nativePending = false;

    let viewOnce = false,
        held = false,
        recording = false,
        preparing = false,
        discarding = false;

    let pressY = 0,
        zoom = 1,
        pressZoom = 1,
        pointer = null;

    function setMode(value) {
        viewOnce = Boolean(value);

        mode.querySelectorAll('[data-once]').forEach((button) => {
            button.setAttribute(
                'aria-pressed',
                String(viewOnce === (button.dataset.once === 'true'))
            );
        });
    }

    function stop() {
        clearTimeout(holdTimer);
        clearTimeout(limitTimer);
        cancelAnimationFrame(frame);

        if (recorder?.state === 'recording') recorder.stop();
        recorder = null;

        stream?.getTracks().forEach((track) => track.stop());
        microphone?.getTracks().forEach((track) => track.stop());

        stream = microphone = null;
        live.srcObject = null;

        playback.pause();

        recording = preparing = held = false;
        capture.classList.remove('is-recording');
    }

    function clearPhoto() {
        playback.removeAttribute('src');
        photo.removeAttribute('src');

        if (photoUrl) URL.revokeObjectURL(photoUrl);

        photoUrl = null;
        file = null;
        mode.hidden = true;
        setMode(false);
    }

    function close() {
        generation++;
        stop();
        clearPhoto();

        if (dialog.open) dialog.close();
    }

    async function preview() {
        const current = ++generation;

        stop();
        clearPhoto();

        photo.hidden = playback.hidden = use.hidden = retake.hidden = true;
        live.hidden = capture.hidden = flip.hidden = false;
        capture.disabled = true;
        zoom = 1;

        status.textContent = 'A abrir câmara…';

        try {
            const acquired = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: facing },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });

            if (current !== generation || disposed) {
                acquired.getTracks().forEach((track) => track.stop());
                return;
            }

            stream = acquired;
            live.muted = true;
            live.playsInline = true;
            live.srcObject = stream;

            updateZoom();
            await live.play();

            if (current !== generation) return;

            capture.disabled = false;
            status.textContent = 'Toque: foto · Manter: vídeo · Deslizar: zoom';
        } catch (error) {
            if (current !== generation) return;

            close();

            onError(
                'Não foi possível abrir a câmara. Verifica a permissão ou escolhe um ficheiro da galeria.'
            );
        }
    }

    function updateZoom() {
        live.style.transform =
            `scale(${facing === 'user' ? -zoom : zoom}, ${zoom})`;
    }

    function draw(canvas) {
        const context = canvas.getContext('2d');
        const width = live.videoWidth / zoom;
        const height = live.videoHeight / zoom;

        context.save();

        if (facing === 'user') {
            context.translate(canvas.width, 0);
            context.scale(-1, 1);
        }

        context.drawImage(
            live,
            (live.videoWidth - width) / 2,
            (live.videoHeight - height) / 2,
            width,
            height,
            0,
            0,
            canvas.width,
            canvas.height
        );

        context.restore();
    }

    function canvasFor(maxSize) {
        const canvas = document.createElement('canvas');

        const scale = Math.min(
            1,
            maxSize / Math.max(live.videoWidth, live.videoHeight)
        );

        canvas.width = Math.round(live.videoWidth * scale);
        canvas.height = Math.round(live.videoHeight * scale);

        return canvas;
    }

    async function takePhoto() {
        if (!live.videoWidth || recording || preparing) return;

        const current = generation;
        capture.disabled = true;

        window.MargotHaptics?.feedback('shutter');

        const canvas = canvasFor(1920);
        draw(canvas);

        const blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', 0.9)
        );

        if (current !== generation) return;

        if (!blob) {
            capture.disabled = false;
            onError('Não foi possível tirar a fotografia.');
            return;
        }

        review(new File([blob], 'fotografia.jpg', {
            type: 'image/jpeg'
        }));
    }

    async function startVideo() {
        const current = generation;

        preparing = true;
        status.textContent = 'A preparar vídeo…';

        try {
            if (
                !window.MediaRecorder ||
                !HTMLCanvasElement.prototype.captureStream
            ) {
                throw new Error(
                    'Este dispositivo não suporta gravação de vídeo. Escolhe um vídeo da galeria.'
                );
            }

            const audio = await navigator.mediaDevices.getUserMedia({
                audio: true
            });

            if (!held || current !== generation || disposed) {
                audio.getTracks().forEach((track) => track.stop());

                if (current === generation) {
                    preparing = false;
                    status.textContent = 'Mantém premido para gravar';
                }

                return;
            }

            microphone = audio;

            const canvas = canvasFor(1280);
            const output = canvas.captureStream(30);

            audio.getAudioTracks().forEach((track) => {
                output.addTrack(track);
            });

            const mime = [
                'video/mp4',
                'video/webm;codecs=vp8,opus',
                'video/webm'
            ].find((type) => MediaRecorder.isTypeSupported(type));

            if (!mime) {
                throw new Error(
                    'Não foi possível encontrar um formato de vídeo compatível.'
                );
            }

            recorder = new MediaRecorder(output, {
                mimeType: mime,
                videoBitsPerSecond: 4000000
            });

            const chunks = [];
            let bytes = 0;
            const started = performance.now();

            discarding = false;

            recorder.ondataavailable = (event) => {
                if (event.data.size) {
                    chunks.push(event.data);
                    bytes += event.data.size;
                }

                if (bytes > 95 * 1024 * 1024) finishVideo(false);
            };

            recorder.onstop = () => {
                output.getTracks().forEach((track) => track.stop());
                cancelAnimationFrame(frame);
                clearTimeout(limitTimer);

                if (current !== generation || disposed) return;

                recording = preparing = false;
                recorder = null;
                capture.classList.remove('is-recording');

                if (discarding) {
                    preview();
                    return;
                }

                const blob = new Blob(chunks, {
                    type: mime.split(';')[0]
                });

                if (!blob.size) {
                    preview();
                    onError('O vídeo ficou vazio. Tenta novamente.');
                    return;
                }

                review(
                    new File(
                        [blob],
                        mime.startsWith('video/mp4')
                            ? 'video.mp4'
                            : 'video.webm',
                        { type: blob.type }
                    )
                );
            };

            recorder.onerror = () => {
                if (current !== generation) return;
                close();
                onError('Não foi possível gravar o vídeo.');
            };

            function renderFrame() {
                if (current !== generation || !recording) return;

                draw(canvas);

                const seconds = Math.floor(
                    (performance.now() - started) / 1000
                );

                status.textContent =
                    `● ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · ${zoom.toFixed(1)}×`;

                frame = requestAnimationFrame(renderFrame);
            }

            recording = true;
            preparing = false;

            capture.classList.add('is-recording');
            renderFrame();
            recorder.start(250);

            limitTimer = setTimeout(() => finishVideo(false), 60000);
        } catch (error) {
            if (current !== generation) return;

            close();

            onError(
                error.name === 'NotAllowedError'
                    ? 'Permite o microfone para gravar vídeo com som.'
                    : error.message
            );
        }
    }

    function finishVideo(cancel) {
        held = false;
        if (!recording) return;

        discarding = cancel;
        preparing = true;
        status.textContent = 'A preparar vídeo…';

        if (recorder?.state === 'recording') recorder.stop();
    }

    function review(value) {
        if (disposed) return;

        generation++;
        stop();
        clearPhoto();

        file = value;

        const isVideo = file.type.startsWith('video/');
        mode.hidden = isVideo || !allowViewOnce;

        if (!dialog.open) dialog.showModal();

        photoUrl = URL.createObjectURL(file);

        const element = isVideo ? playback : photo;
        element.src = photoUrl;

        playback.hidden = !isVideo;
        photo.hidden = isVideo;
        live.hidden = capture.hidden = flip.hidden = true;
        use.hidden = retake.hidden = false;

        use.textContent = isVideo ? 'Usar vídeo' : 'Usar fotografia';
        status.textContent = '';
    }

    on(capture, 'pointerdown', (event) => {
        if (
            event.button !== 0 ||
            capture.disabled ||
            preparing ||
            recording
        ) {
            return;
        }

        event.preventDefault();

        pointer = event.pointerId;
        capture.setPointerCapture?.(pointer);

        held = true;
        pressY = event.clientY;
        pressZoom = zoom;

        holdTimer = setTimeout(startVideo, 250);
    });

    on(capture, 'pointermove', (event) => {
        if (event.pointerId !== pointer || !held) return;

        zoom = Math.min(
            6,
            Math.max(
                1,
                pressZoom * Math.pow(2, (pressY - event.clientY) / 120)
            )
        );

        updateZoom();
    });

    function release(event) {
        if (event.pointerId !== pointer) return;

        pointer = null;
        clearTimeout(holdTimer);

        const tap =
            held &&
            !recording &&
            !preparing &&
            event.type === 'pointerup';

        held = false;

        if (recording) {
            finishVideo(event.type !== 'pointerup');
        } else if (tap) {
            takePhoto();
        }
    }

    on(capture, 'pointerup', release);
    on(capture, 'pointercancel', release);
    on(capture, 'lostpointercapture', release);

    on(dialog, 'click', (event) => {
        const choice = event.target.closest('[data-once]');

        if (choice) setMode(choice.dataset.once === 'true');

        const name = event.target.closest('[data-camera]')?.dataset.camera;

        if (name === 'close') {
            close();
            return;
        }

        if (recording || preparing) return;

        if (name === 'gallery') {
            close();
            gallery.click();
        }

        if (name === 'flip') {
            facing = facing === 'user' ? 'environment' : 'user';
            preview();
        }

        if (name === 'capture' && event.detail === 0) takePhoto();
        if (name === 'retake') preview();

        if (name === 'use' && file) {
            const chosen = file;
            const once = viewOnce;

            close();
            onFile(chosen, once);
        }
    });

    on(dialog, 'cancel', close);

    async function openNative(plugin) {
        if (nativePending) return;

        nativePending = true;
        const current = ++generation;
        let result;

        try {
            result = await plugin.open({ allowViewOnce });

            if (
                disposed ||
                current !== generation ||
                result.cancelled
            ) {
                return;
            }

            if (result.id) {
                if (!result.size || result.size > 100 * 1024 * 1024) {
                    throw new Error('O vídeo pode ter no máximo 100 MB.');
                }

                const parts = [];
                let offset = 0;

                while (offset < result.size) {
                    if (disposed || current !== generation) return;

                    const chunk = await plugin.readChunk({
                        id: result.id,
                        offset
                    });

                    const bytes = Uint8Array.from(
                        atob(chunk.base64),
                        (letter) => letter.charCodeAt(0)
                    );

                    if (!bytes.length || offset + bytes.length > result.size) {
                        throw new Error('O vídeo não foi lido completamente.');
                    }

                    parts.push(bytes);
                    offset += bytes.length;
                }

                if (!disposed && current === generation) {
                    onFile(
                        new File(parts, 'video.mp4', {
                            type: 'video/mp4'
                        }),
                        false
                    );
                }
            } else if (result.base64) {
                const bytes = Uint8Array.from(
                    atob(result.base64),
                    (letter) => letter.charCodeAt(0)
                );

                onFile(
                    new File([bytes], 'fotografia.jpg', {
                        type: 'image/jpeg'
                    }),
                    result.viewOnce === true
                );
            }
        } catch (error) {
            if (!disposed && current === generation) {
                onError(
                    error.message || 'Não foi possível abrir a câmara.'
                );
            }
        } finally {
            if (result?.id) {
                await plugin.release({ id: result.id }).catch(() => {});
            }

            nativePending = false;
        }
    }

    return {
        open() {
            if (disposed) return;

            const native = window.Capacitor?.Plugins?.ChatCamera;

            if (
                native &&
                window.Capacitor?.isPluginAvailable?.('ChatCamera')
            ) {
                openNative(native);
                return;
            }

            if (window.Capacitor?.getPlatform?.() === 'ios') {
                onError(
                    'Instala a nova versão da Margot para usar a câmara.'
                );
                return;
            }

            dialog.showModal();
            preview();
        },

        review,
        close,

        suspend() {
            if (!nativePending) close();
        },

        destroy() {
            disposed = true;
            close();
            events.abort();
        }
    };
};