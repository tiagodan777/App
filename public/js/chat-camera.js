window.MargotChatCamera = function ({ dialog, onFile, onError, gallery }) {
    const video = dialog.querySelector('video');
    const photo = dialog.querySelector('img');
    const capture = dialog.querySelector('[data-camera="capture"]');
    const use = dialog.querySelector('[data-camera="use"]');

    let stream;
    let file;
    let photoUrl;
    let facing = 'environment';
    let generation = 0;
    let disposed = false;
    let nativePending = false;

    function stop() {
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        video.srcObject = null;
    }

    function clearPhoto() {
        if (photoUrl) URL.revokeObjectURL(photoUrl);

        photoUrl = null;
        file = null;
        photo.removeAttribute('src');
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

        photo.hidden = true;
        video.hidden = false;
        use.hidden = true;
        capture.hidden = false;
        capture.disabled = true;

        dialog.querySelector('[data-camera="retake"]').hidden = true;
        dialog.querySelector('[data-camera="flip"]').hidden = false;

        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error('A câmara não está disponível neste dispositivo.');
            }

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
            video.muted = true;
            video.playsInline = true;
            video.autoplay = true;
            video.srcObject = stream;
            video.classList.toggle('frontal', facing === 'user');

            const track = stream.getVideoTracks?.()[0];

            if (track?.getCapabilities?.().focusMode?.includes('continuous')) {
                await track.applyConstraints({
                    advanced: [{ focusMode: 'continuous' }]
                });
            }

            await video.play();

            if (current === generation) capture.disabled = false;
        } catch (error) {
            if (current !== generation) return;

            close();
            onError(
                error.name === 'NotAllowedError'
                    ? 'Permite o acesso à câmara nas definições para tirar fotografias.'
                    : 'Não foi possível abrir a câmara. Podes escolher uma fotografia da galeria.'
            );
        }
    }

    async function takePhoto() {
        if (!video.videoWidth) return;

        const current = generation;
        capture.disabled = true;
        window.MargotHaptics?.feedback('shutter');

        const canvas = document.createElement('canvas');
        const scale = Math.min(
            1,
            1920 / Math.max(video.videoWidth, video.videoHeight)
        );

        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', 0.9);
        });

        if (current !== generation) return;

        if (!blob) {
            capture.disabled = false;
            onError('Não foi possível tirar a fotografia.');
            return;
        }

        file = new File([blob], 'fotografia.jpg', { type: 'image/jpeg' });
        photoUrl = URL.createObjectURL(file);
        photo.src = photoUrl;
        photo.hidden = false;
        video.hidden = true;
        capture.hidden = true;
        use.hidden = false;

        stop();

        dialog.querySelector('[data-camera="retake"]').hidden = false;
        dialog.querySelector('[data-camera="flip"]').hidden = true;
    }

    function action(event) {
        const name = event.target.closest('[data-camera]')?.dataset.camera;

        if (name === 'close') close();

        if (name === 'gallery') {
            close();
            gallery.click();
        }

        if (name === 'flip') {
            facing = facing === 'user' ? 'environment' : 'user';
            preview();
        }

        if (name === 'capture') takePhoto();
        if (name === 'retake') preview();

        if (name === 'use' && file) {
            const chosen = file;
            close();
            onFile(chosen);
        }
    }

    dialog.addEventListener('click', action);
    dialog.addEventListener('cancel', close);

    async function openNative(plugin) {
        if (nativePending) return;

        nativePending = true;
        const current = ++generation;

        try {
            const result = await plugin.open();

            if (disposed || current !== generation) return;
            if (!result.base64) return;

            const bytes = Uint8Array.from(
                atob(result.base64),
                (letter) => letter.charCodeAt(0)
            );

            onFile(new File([bytes], 'fotografia.jpg', {
                type: 'image/jpeg'
            }));
        } catch (error) {
            if (!disposed && current === generation) {
                onError(error.message || 'Não foi possível abrir a câmara.');
            }
        } finally {
            nativePending = false;
        }
    }

    return {
        open() {
            if (disposed) return;

            const native = window.Capacitor?.Plugins?.ChatCamera;

            if (native && window.Capacitor?.isPluginAvailable?.('ChatCamera')) {
                openNative(native);
                return;
            }

            if (window.Capacitor?.getPlatform?.() === 'ios') {
                onError(
                    'Instala a nova versão da Margot para usar a câmara. ' +
                    'Entretanto, podes escolher uma fotografia da galeria.'
                );
                return;
            }

            dialog.showModal();
            preview();
        },

        close,

        suspend() {
            if (!nativePending) close();
        },

        destroy() {
            disposed = true;
            close();
            dialog.removeEventListener('click', action);
            dialog.removeEventListener('cancel', close);
        }
    };
};

// A escolha pertence ao anexo; os dois botões selecionam explicitamente o modo.
window.MargotPhotoMode = function (container) {
    const input = container.querySelector('input');

    function refresh() {
        container.querySelectorAll('[data-once]').forEach((button) => {
            button.setAttribute(
                'aria-pressed',
                String(input.checked === (button.dataset.once === 'true'))
            );
        });
    }

    container.addEventListener('click', (event) => {
        const button = event.target.closest('[data-once]');
        if (!button) return;

        input.checked = button.dataset.once === 'true';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        refresh();
    });

    refresh();
    return refresh;
};