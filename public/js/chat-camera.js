window.MargotChatCamera = function ({ dialog, onFile, onError, gallery }) {
    const video = dialog.querySelector('video'),
        photo = dialog.querySelector('img');
    const capture = dialog.querySelector('[data-camera="capture"]'),
        use = dialog.querySelector('[data-camera="use"]');
    let stream,
        file,
        photoUrl,
        facing = 'environment',
        generation = 0,
        disposed = false;
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
            if (!navigator.mediaDevices?.getUserMedia)
                throw new Error('A câmara não está disponível neste dispositivo.');
            const acquired = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } },
                audio: false
            });
            if (current !== generation || disposed) {
                acquired.getTracks().forEach((track) => track.stop());
                return;
            }
            stream = acquired;
            video.srcObject = stream;
            video.classList.toggle('frontal', facing === 'user');
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
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
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
    return {
        open() {
            if (disposed) return;
            dialog.showModal();
            preview();
        },
        close,
        destroy() {
            disposed = true;
            close();
            dialog.removeEventListener('click', action);
            dialog.removeEventListener('cancel', close);
        }
    };
};