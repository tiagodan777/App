(function (window, document) {
    'use strict';

    var API_BASE_FALLBACK = '/today/';
    var CACHE_MS = 30000;
    var cache = new Map();
    var miniMenuRequest = 0;
    var profileStatus = null;
    var profileLoaded = false;
    var editorOpen = false;
    var clothesDraft = [];
    var activePiece = '';
    var keyboardOffset = 0;

    var PIECES = [
        { type: 'tshirt', icon: '👕', label: 'T-shirt' },
        { type: 'shirt', icon: '👔', label: 'Camisa' },
        { type: 'sweater', icon: '🧶', label: 'Camisola' },
        { type: 'hoodie', icon: '🧥', label: 'Hoodie' },
        { type: 'jacket', icon: '🧥', label: 'Casaco' },
        { type: 'top', icon: '👚', label: 'Top' },
        { type: 'jeans', icon: '👖', label: 'Jeans' },
        { type: 'trousers', icon: '👖', label: 'Calças' },
        { type: 'shorts', icon: '🩳', label: 'Calções' },
        { type: 'skirt', icon: '👗', label: 'Saia' },
        { type: 'dress', icon: '👗', label: 'Vestido' },
        { type: 'sneakers', icon: '👟', label: 'Sapatilhas' },
        { type: 'boots', icon: '🥾', label: 'Botas' },
        { type: 'shoes', icon: '👞', label: 'Sapatos' },
        { type: 'sandals', icon: '🩴', label: 'Sandálias' },
        { type: 'cap', icon: '🧢', label: 'Boné' },
        { type: 'hat', icon: '👒', label: 'Chapéu' },
        { type: 'glasses', icon: '🕶️', label: 'Óculos' },
        { type: 'backpack', icon: '🎒', label: 'Mochila' }
    ];

    var COLORS = [
        { key: 'white', label: 'Branco', value: '#f8f8f5' },
        { key: 'black', label: 'Preto', value: '#222226' },
        { key: 'grey', label: 'Cinzento', value: '#9a9aa1' },
        { key: 'blue', label: 'Azul', value: '#4c7fd1' },
        { key: 'denim', label: 'Ganga', value: '#617fa6' },
        { key: 'red', label: 'Vermelho', value: '#d84c59' },
        { key: 'green', label: 'Verde', value: '#559569' },
        { key: 'yellow', label: 'Amarelo', value: '#e3bd48' },
        { key: 'pink', label: 'Rosa', value: '#e78aa6' },
        { key: 'purple', label: 'Roxo', value: '#8f70c8' },
        { key: 'brown', label: 'Castanho', value: '#8a6652' },
        { key: 'beige', label: 'Bege', value: '#d9c5a1' },
        { key: 'orange', label: 'Laranja', value: '#e88841' },
        { key: 'multicolor', label: 'Multicolor', value: 'conic-gradient(#e34f61,#e7bd48,#59a36e,#5782d2,#9670c8,#e34f61)' }
    ];

    function text(value) {
        return String(value == null ? '' : value).trim();
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function apiBase() {
        return String(window.todayUrl || API_BASE_FALLBACK).replace(/\/+$/, '') + '/';
    }

    function apiUrl(memberId) {
        return apiBase() + encodeURIComponent(text(memberId));
    }

    function validStatus(status) {
        return Boolean(
            status &&
            (
                text(status.note) ||
                (
                    Array.isArray(status.clothes) &&
                    status.clothes.length
                )
            )
        );
    }

    function pieceMeta(type) {
        return PIECES.find(function (item) {
            return item.type === type;
        }) || {
            type: type,
            icon: '👕',
            label: 'Peça'
        };
    }

    function colorMeta(key) {
        return COLORS.find(function (item) {
            return item.key === key;
        }) || {
            key: key,
            label: '',
            value: '#d8d8dc'
        };
    }

    function normalizeClothes(items) {
        if (!Array.isArray(items)) {
            return [];
        }

        var seen = Object.create(null);
        var result = [];

        items.forEach(function (item) {
            if (
                !item ||
                typeof item !== 'object' ||
                result.length >= 5
            ) {
                return;
            }

            var type = text(item.type).toLowerCase();
            var color = text(item.color).toLowerCase();

            if (
                !type ||
                seen[type] ||
                !PIECES.some(function (piece) {
                    return piece.type === type;
                })
            ) {
                return;
            }

            if (
                color &&
                !COLORS.some(function (entry) {
                    return entry.key === color;
                })
            ) {
                color = '';
            }

            seen[type] = true;

            result.push({
                type: type,
                color: color
            });
        });

        return result;
    }

    function load(memberId, force) {
        memberId = text(memberId);

        if (!memberId) {
            return Promise.resolve(null);
        }

        var cached = cache.get(memberId);

        if (
            !force &&
            cached &&
            Date.now() - cached.at < CACHE_MS
        ) {
            return Promise.resolve(cached.status);
        }

        return window.fetch(
            apiUrl(memberId),
            {
                method: 'GET',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json'
                }
            }
        ).then(function (response) {
            if (!response.ok) {
                throw new Error(
                    'today_' +
                    response.status
                );
            }

            return response.json();
        }).then(function (payload) {
            var status =
                payload &&
                payload.success
                    ? payload.today || null
                    : null;

            cache.set(
                memberId,
                {
                    at: Date.now(),
                    status: status
                }
            );

            return status;
        });
    }

    function clearNode(node) {
        while (
            node &&
            node.firstChild
        ) {
            node.removeChild(
                node.firstChild
            );
        }
    }

    function createClothingChip(item, compact) {
        var piece = pieceMeta(
            text(item.type)
        );

        var color = colorMeta(
            text(item.color)
        );

        var chip =
            document.createElement('span');

        var icon =
            document.createElement('span');

        var swatch =
            document.createElement('span');

        var label =
            document.createElement('span');

        chip.className =
            compact
                ? 'hoje-chip hoje-chip--compacto'
                : 'hoje-chip';

        icon.className =
            'hoje-chip-icone';

        swatch.className =
            'hoje-chip-cor';

        label.className =
            'hoje-chip-texto';

        icon.textContent =
            text(item.icon) ||
            piece.icon;

        swatch.style.background =
            color.value;

        swatch.setAttribute(
            'aria-hidden',
            'true'
        );

        label.textContent =
            compact
                ? (
                    text(item.color_label) ||
                    color.label ||
                    piece.label
                )
                : (
                    piece.label +
                    (
                        color.label
                            ? ' · ' + color.label
                            : ''
                    )
                );

        chip.setAttribute(
            'aria-label',
            piece.label +
            (
                color.label
                    ? ', ' + color.label
                    : ''
            )
        );

        chip.appendChild(icon);

        if (
            text(item.color) ||
            color.label
        ) {
            chip.appendChild(swatch);
        }

        chip.appendChild(label);

        return chip;
    }

    function renderStatusBox(
        box,
        status,
        compact
    ) {
        if (!box) {
            return;
        }

        var note =
            box.querySelector(
                '[data-hoje-nota]'
            );

        var clothes =
            box.querySelector(
                '[data-hoje-roupa]'
            );

        var hasStatus =
            validStatus(status);

        box.hidden =
            !hasStatus;

        box.setAttribute(
            'aria-hidden',
            hasStatus
                ? 'false'
                : 'true'
        );

        if (!hasStatus) {
            if (note) {
                note.textContent = '';
                note.hidden = true;
            }

            if (clothes) {
                clearNode(clothes);
                clothes.hidden = true;
            }

            return;
        }

        if (note) {
            var noteText =
                text(status.note);

            note.textContent =
                noteText;

            note.hidden =
                !noteText;
        }

        if (clothes) {
            clearNode(clothes);

            var items =
                Array.isArray(
                    status.clothes
                )
                    ? status.clothes
                    : [];

            items.forEach(function (item) {
                clothes.appendChild(
                    createClothingChip(
                        item,
                        compact
                    )
                );
            });

            clothes.hidden =
                items.length === 0;
        }
    }

    function showMiniMenuFor(memberId) {
        var box =
            byId('mini-menu-hoje');

        if (!box) {
            return;
        }

        memberId =
            text(memberId);

        var requestId =
            ++miniMenuRequest;

        renderStatusBox(
            box,
            null,
            true
        );

        box.classList.add(
            'a-carregar'
        );

        load(
            memberId,
            false
        ).then(function (status) {
            var menu =
                document.querySelector(
                    '.mini-menu'
                );

            var selected =
                menu
                    ? text(
                        menu.getAttribute(
                            'data-destinatario-id'
                        )
                    )
                    : '';

            if (
                requestId !== miniMenuRequest ||
                selected !== memberId
            ) {
                return;
            }

            box.classList.remove(
                'a-carregar'
            );

            renderStatusBox(
                box,
                status,
                true
            );
        }).catch(function () {
            if (
                requestId !==
                miniMenuRequest
            ) {
                return;
            }

            box.classList.remove(
                'a-carregar'
            );

            renderStatusBox(
                box,
                null,
                true
            );
        });
    }

    function renderProfile(status) {
        var box =
            byId('perfil-hoje-balao');

        var add =
            byId('perfil-hoje-adicionar');

        profileStatus =
            status || null;

        profileLoaded =
            true;

        if (box) {
            renderStatusBox(
                box,
                profileStatus,
                false
            );

            box.classList.toggle(
                'tem-nota',
                Boolean(
                    text(
                        profileStatus &&
                        profileStatus.note
                    )
                )
            );
        }

        if (add) {
            add.classList.toggle(
                'ativo',
                validStatus(profileStatus)
            );

            add.setAttribute(
                'aria-label',
                validStatus(profileStatus)
                    ? 'Editar a tua nota e roupa de hoje'
                    : 'Adicionar nota ou roupa de hoje'
            );
        }
    }

    function loadProfile(force) {
        var memberId =
            text(window.perfilMembroId);

        if (!memberId) {
            return Promise.resolve(null);
        }

        return load(
            memberId,
            Boolean(force)
        ).then(function (status) {
            renderProfile(status);

            return status;
        }).catch(function () {
            renderProfile(null);

            return null;
        });
    }

    function showMessage(
        message,
        type
    ) {
        var error =
            byId('hoje-editor-erro');

        if (error) {
            error.textContent =
                text(message);

            error.hidden =
                !text(message);
        }

        if (
            message &&
            type === 'erro' &&
            typeof window.mostrarMensagemTemporaria === 'function'
        ) {
            window.mostrarMensagemTemporaria(
                message,
                'erro'
            );
        }
    }

    function selectedPiece(type) {
        return clothesDraft.find(
            function (item) {
                return item.type === type;
            }
        ) || null;
    }

    function renderPieceGrid() {
        var grid =
            byId('hoje-pecas-grid');

        if (!grid) {
            return;
        }

        clearNode(grid);

        PIECES.forEach(function (piece) {
            var button =
                document.createElement(
                    'button'
                );

            var icon =
                document.createElement(
                    'span'
                );

            var label =
                document.createElement(
                    'span'
                );

            var chosen =
                selectedPiece(
                    piece.type
                );

            button.type =
                'button';

            button.className =
                'hoje-peca';

            button.dataset.type =
                piece.type;

            button.classList.toggle(
                'selecionada',
                Boolean(chosen)
            );

            button.classList.toggle(
                'ativa',
                activePiece === piece.type
            );

            icon.className =
                'hoje-peca-icone';

            icon.textContent =
                piece.icon;

            label.className =
                'hoje-peca-label';

            label.textContent =
                piece.label;

            if (
                chosen &&
                chosen.color
            ) {
                var dot =
                    document.createElement(
                        'span'
                    );

                dot.className =
                    'hoje-peca-cor';

                dot.style.background =
                    colorMeta(
                        chosen.color
                    ).value;

                dot.setAttribute(
                    'aria-hidden',
                    'true'
                );

                button.appendChild(dot);
            }

            button.appendChild(icon);
            button.appendChild(label);

            button.addEventListener(
                'click',
                function () {
                    if (
                        !chosen &&
                        clothesDraft.length >= 5
                    ) {
                        showMessage(
                            'Podes escolher até 5 peças.',
                            'aviso'
                        );

                        return;
                    }

                    activePiece =
                        piece.type;

                    showMessage('', '');

                    renderPieceGrid();
                    renderColorGrid();
                }
            );

            grid.appendChild(button);
        });
    }

    function renderColorGrid() {
        var area =
            byId('hoje-cores-area');

        var grid =
            byId('hoje-cores-grid');

        var title =
            byId('hoje-cores-titulo');

        if (
            !area ||
            !grid ||
            !title
        ) {
            return;
        }

        if (!activePiece) {
            area.hidden = true;
            clearNode(grid);
            return;
        }

        var piece =
            pieceMeta(activePiece);

        var chosen =
            selectedPiece(activePiece);

        title.textContent =
            'Cor de ' +
            piece.label.toLowerCase();

        area.hidden = false;

        clearNode(grid);

        COLORS.forEach(function (color) {
            var button =
                document.createElement(
                    'button'
                );

            var dot =
                document.createElement(
                    'span'
                );

            var label =
                document.createElement(
                    'span'
                );

            button.type =
                'button';

            button.className =
                'hoje-cor';

            button.classList.toggle(
                'selecionada',
                Boolean(
                    chosen &&
                    chosen.color === color.key
                )
            );

            button.setAttribute(
                'aria-label',
                color.label
            );

            dot.className =
                'hoje-cor-amostra';

            dot.style.background =
                color.value;

            label.className =
                'hoje-cor-label';

            label.textContent =
                color.label;

            button.appendChild(dot);
            button.appendChild(label);

            button.addEventListener(
                'click',
                function () {
                    var index =
                        clothesDraft.findIndex(
                            function (item) {
                                return (
                                    item.type ===
                                    activePiece
                                );
                            }
                        );

                    if (index >= 0) {
                        clothesDraft[index] = {
                            type: activePiece,
                            color: color.key
                        };
                    } else {
                        clothesDraft.push({
                            type: activePiece,
                            color: color.key
                        });
                    }

                    activePiece = '';

                    renderPieceGrid();
                    renderColorGrid();
                    renderSelectedClothes();
                    renderClothingSummary();
                }
            );

            grid.appendChild(button);
        });
    }

    function renderSelectedClothes() {
        var area =
            byId(
                'hoje-roupa-selecionada'
            );

        if (!area) {
            return;
        }

        clearNode(area);

        area.hidden =
            clothesDraft.length === 0;

        clothesDraft.forEach(
            function (item) {
                var piece =
                    pieceMeta(
                        item.type
                    );

                var color =
                    colorMeta(
                        item.color
                    );

                var button =
                    document.createElement(
                        'button'
                    );

                var icon =
                    document.createElement(
                        'span'
                    );

                var dot =
                    document.createElement(
                        'span'
                    );

                var label =
                    document.createElement(
                        'span'
                    );

                var remove =
                    document.createElement(
                        'span'
                    );

                button.type =
                    'button';

                button.className =
                    'hoje-roupa-selecionada-item';

                button.setAttribute(
                    'aria-label',
                    'Remover ' +
                    piece.label
                );

                icon.textContent =
                    piece.icon;

                icon.setAttribute(
                    'aria-hidden',
                    'true'
                );

                dot.className =
                    'hoje-roupa-selecionada-cor';

                dot.style.background =
                    color.value;

                dot.setAttribute(
                    'aria-hidden',
                    'true'
                );

                label.textContent =
                    piece.label +
                    (
                        color.label
                            ? ' · ' + color.label
                            : ''
                    );

                remove.className =
                    'hoje-roupa-selecionada-remover';

                remove.textContent =
                    '×';

                remove.setAttribute(
                    'aria-hidden',
                    'true'
                );

                button.appendChild(icon);
                button.appendChild(dot);
                button.appendChild(label);
                button.appendChild(remove);

                button.addEventListener(
                    'click',
                    function () {
                        clothesDraft =
                            clothesDraft.filter(
                                function (entry) {
                                    return (
                                        entry.type !==
                                        item.type
                                    );
                                }
                            );

                        if (
                            activePiece ===
                            item.type
                        ) {
                            activePiece = '';
                        }

                        renderPieceGrid();
                        renderColorGrid();
                        renderSelectedClothes();
                        renderClothingSummary();
                    }
                );

                area.appendChild(button);
            }
        );
    }

    function renderClothingSummary() {
        var summary =
            byId('hoje-roupa-resumo');

        var button =
            byId('hoje-abrir-roupa');

        if (
            !summary ||
            !button
        ) {
            return;
        }

        if (!clothesDraft.length) {
            summary.textContent =
                'Opcional';

            button.classList.remove(
                'tem-roupa'
            );

            return;
        }

        summary.textContent =
            clothesDraft
                .map(function (item) {
                    var piece =
                        pieceMeta(
                            item.type
                        );

                    var color =
                        colorMeta(
                            item.color
                        );

                    return (
                        piece.icon +
                        ' ' +
                        (
                            color.label ||
                            piece.label
                        )
                    );
                })
                .join(' · ');

        button.classList.add(
            'tem-roupa'
        );
    }

    function showEditorView(view) {
        var main =
            byId(
                'hoje-editor-principal'
            );

        var clothes =
            byId(
                'hoje-editor-roupa'
            );

        var title =
            byId(
                'hoje-editor-titulo'
            );

        var back =
            byId(
                'hoje-editor-voltar'
            );

        if (
            !main ||
            !clothes ||
            !title ||
            !back
        ) {
            return;
        }

        var clothesView =
            view === 'clothes';

        main.hidden =
            clothesView;

        clothes.hidden =
            !clothesView;

        back.hidden =
            !clothesView;

        title.textContent =
            clothesView
                ? 'Roupa de hoje'
                : 'Hoje';

        if (clothesView) {
            renderPieceGrid();
            renderColorGrid();
            renderSelectedClothes();
        }
    }

    function fillEditor(status) {
        var note =
            byId('hoje-nota-input');

        var deleteButton =
            byId('hoje-apagar');

        clothesDraft =
            normalizeClothes(
                status &&
                status.clothes
            );

        activePiece = '';

        if (note) {
            note.value =
                text(
                    status &&
                    status.note
                );

            updateCounter();
        }

        if (deleteButton) {
            deleteButton.hidden =
                !validStatus(status);
        }

        renderClothingSummary();
        renderSelectedClothes();
        renderPieceGrid();
        renderColorGrid();
        showMessage('', '');
        showEditorView('main');
    }

    function updateCounter() {
        var input =
            byId('hoje-nota-input');

        var counter =
            byId(
                'hoje-nota-contador'
            );

        if (
            !input ||
            !counter
        ) {
            return;
        }

        counter.textContent =
            String(
                input.value.length
            ) +
            '/160';
    }

    function setEditorBusy(busy) {
        var editor =
            byId('hoje-editor');

        if (!editor) {
            return;
        }

        editor.classList.toggle(
            'a-guardar',
            Boolean(busy)
        );

        editor
            .querySelectorAll(
                'button, textarea'
            )
            .forEach(
                function (element) {
                    if (
                        element.id ===
                        'hoje-editor-fechar'
                    ) {
                        return;
                    }

                    element.disabled =
                        Boolean(busy);
                }
            );
    }

    function updateKeyboardOffset(
        explicitHeight
    ) {
        var height =
            Number(explicitHeight);

        if (!Number.isFinite(height)) {
            height = 0;

            if (window.visualViewport) {
                height =
                    Math.max(
                        0,
                        window.innerHeight -
                        window.visualViewport.height -
                        window.visualViewport.offsetTop
                    );
            }
        }

        keyboardOffset =
            Math.max(
                0,
                Math.round(height)
            );

        document
            .documentElement
            .style
            .setProperty(
                '--hoje-teclado',
                keyboardOffset + 'px'
            );
    }

    function openEditor() {
        var editor =
            byId('hoje-editor');

        var note =
            byId('hoje-nota-input');

        if (
            !editor ||
            editorOpen
        ) {
            return;
        }

        var promise =
            profileLoaded
                ? Promise.resolve(
                    profileStatus
                )
                : loadProfile(false);

        promise.then(
            function (status) {
                fillEditor(status);

                editor.hidden =
                    false;

                editor.setAttribute(
                    'aria-hidden',
                    'false'
                );

                editor.classList.add(
                    'aberto'
                );

                document
                    .documentElement
                    .classList
                    .add(
                        'hoje-editor-aberto'
                    );

                document
                    .body
                    .classList
                    .add(
                        'hoje-editor-aberto'
                    );

                editorOpen =
                    true;

                updateKeyboardOffset();

                window.setTimeout(
                    function () {
                        if (
                            note &&
                            !window
                                .matchMedia(
                                    '(pointer: coarse)'
                                )
                                .matches
                        ) {
                            note.focus({
                                preventScroll:
                                    true
                            });
                        }
                    },
                    120
                );
            }
        );
    }

    function closeEditor() {
        var editor =
            byId('hoje-editor');

        if (
            !editor ||
            !editorOpen
        ) {
            return;
        }

        editor.classList.remove(
            'aberto'
        );

        editor.setAttribute(
            'aria-hidden',
            'true'
        );

        document
            .documentElement
            .classList
            .remove(
                'hoje-editor-aberto'
            );

        document
            .body
            .classList
            .remove(
                'hoje-editor-aberto'
            );

        editorOpen =
            false;

        activePiece = '';

        updateKeyboardOffset(0);

        window.setTimeout(
            function () {
                if (!editorOpen) {
                    editor.hidden = true;
                }
            },
            240
        );
    }

    function saveEditor() {
        var memberId =
            text(
                window.perfilMembroId
            );

        var note =
            byId('hoje-nota-input');

        if (
            !memberId ||
            !note
        ) {
            return;
        }

        setEditorBusy(true);
        showMessage('', '');

        window.fetch(
            apiUrl(memberId),
            {
                method: 'POST',
                credentials: 'same-origin',

                headers: {
                    Accept:
                        'application/json',

                    'Content-Type':
                        'application/json'
                },

                body:
                    JSON.stringify({
                        note:
                            note.value.trim(),

                        clothes:
                            clothesDraft.map(
                                function (item) {
                                    return {
                                        type:
                                            item.type,

                                        color:
                                            item.color
                                    };
                                }
                            )
                    })
            }
        ).then(function (response) {
            return response
                .json()
                .catch(function () {
                    return null;
                })
                .then(
                    function (payload) {
                        if (
                            !response.ok ||
                            !payload ||
                            !payload.success
                        ) {
                            throw new Error(
                                payload &&
                                payload.message
                                    ? payload.message
                                    : 'Não foi possível guardar.'
                            );
                        }

                        return (
                            payload.today ||
                            null
                        );
                    }
                );
        }).then(function (status) {
            cache.set(
                memberId,
                {
                    at: Date.now(),
                    status: status
                }
            );

            renderProfile(status);

            closeEditor();

            if (
                typeof window.mostrarMensagemTemporaria ===
                'function'
            ) {
                window.mostrarMensagemTemporaria(
                    'Atualizado para hoje.',
                    'sucesso'
                );
            }
        }).catch(function (error) {
            showMessage(
                error &&
                error.message &&
                !/^today_/.test(
                    error.message
                )
                    ? error.message
                    : 'Não foi possível guardar. Tenta novamente.',
                'erro'
            );
        }).finally(function () {
            setEditorBusy(false);
        });
    }

    function deleteEditor() {
        var memberId =
            text(
                window.perfilMembroId
            );

        if (!memberId) {
            return;
        }

        setEditorBusy(true);
        showMessage('', '');

        window.fetch(
            apiUrl(memberId),
            {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: {
                    Accept:
                        'application/json'
                }
            }
        ).then(function (response) {
            return response
                .json()
                .catch(function () {
                    return null;
                })
                .then(
                    function (payload) {
                        if (
                            !response.ok ||
                            !payload ||
                            !payload.success
                        ) {
                            throw new Error(
                                payload &&
                                payload.message
                                    ? payload.message
                                    : 'Não foi possível apagar.'
                            );
                        }
                    }
                );
        }).then(function () {
            cache.set(
                memberId,
                {
                    at: Date.now(),
                    status: null
                }
            );

            renderProfile(null);
            closeEditor();
        }).catch(function (error) {
            showMessage(
                error &&
                error.message
                    ? error.message
                    : 'Não foi possível apagar. Tenta novamente.',
                'erro'
            );
        }).finally(function () {
            setEditorBusy(false);
        });
    }

    function bindEditor() {
        var editor =
            byId('hoje-editor');

        if (!editor) {
            return;
        }

        var add =
            byId(
                'perfil-hoje-adicionar'
            );

        var bubble =
            byId(
                'perfil-hoje-balao'
            );

        var close =
            byId(
                'hoje-editor-fechar'
            );

        var backdrop =
            editor.querySelector(
                '[data-hoje-fechar]'
            );

        var openClothes =
            byId(
                'hoje-abrir-roupa'
            );

        var back =
            byId(
                'hoje-editor-voltar'
            );

        var finishClothes =
            byId(
                'hoje-roupa-concluir'
            );

        var save =
            byId(
                'hoje-guardar'
            );

        var remove =
            byId(
                'hoje-apagar'
            );

        var note =
            byId(
                'hoje-nota-input'
            );

        if (add) {
            add.addEventListener(
                'click',
                function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    openEditor();
                }
            );
        }

        if (
            bubble &&
            bubble.dataset.editable === '1'
        ) {
            bubble.addEventListener(
                'click',
                openEditor
            );

            bubble.addEventListener(
                'keydown',
                function (event) {
                    if (
                        event.key === 'Enter' ||
                        event.key === ' '
                    ) {
                        event.preventDefault();
                        openEditor();
                    }
                }
            );
        }

        if (close) {
            close.addEventListener(
                'click',
                closeEditor
            );
        }

        if (backdrop) {
            backdrop.addEventListener(
                'click',
                closeEditor
            );
        }

        if (openClothes) {
            openClothes.addEventListener(
                'click',
                function () {
                    showEditorView(
                        'clothes'
                    );
                }
            );
        }

        if (back) {
            back.addEventListener(
                'click',
                function () {
                    showEditorView(
                        'main'
                    );
                }
            );
        }

        if (finishClothes) {
            finishClothes.addEventListener(
                'click',
                function () {
                    activePiece = '';

                    renderClothingSummary();

                    showEditorView(
                        'main'
                    );
                }
            );
        }

        if (save) {
            save.addEventListener(
                'click',
                saveEditor
            );
        }

        if (remove) {
            remove.addEventListener(
                'click',
                deleteEditor
            );
        }

        if (note) {
            note.addEventListener(
                'input',
                updateCounter
            );
        }

        document.addEventListener(
            'keydown',
            function (event) {
                if (!editorOpen) {
                    return;
                }

                if (
                    event.key ===
                    'Escape'
                ) {
                    closeEditor();
                }
            }
        );

        if (
            window.visualViewport
        ) {
            window
                .visualViewport
                .addEventListener(
                    'resize',
                    function () {
                        if (editorOpen) {
                            updateKeyboardOffset();
                        }
                    }
                );

            window
                .visualViewport
                .addEventListener(
                    'scroll',
                    function () {
                        if (editorOpen) {
                            updateKeyboardOffset();
                        }
                    }
                );
        }

        try {
            var capacitor =
                window.Capacitor;

            var keyboard =
                capacitor &&
                capacitor.Plugins &&
                capacitor.Plugins.Keyboard;

            if (
                keyboard &&
                typeof keyboard.addListener ===
                'function'
            ) {
                keyboard.addListener(
                    'keyboardWillShow',
                    function (info) {
                        if (editorOpen) {
                            updateKeyboardOffset(
                                Number(
                                    info &&
                                    info.keyboardHeight
                                ) ||
                                0
                            );
                        }
                    }
                );

                keyboard.addListener(
                    'keyboardWillHide',
                    function () {
                        if (editorOpen) {
                            updateKeyboardOffset(
                                0
                            );
                        }
                    }
                );
            }
        } catch (error) {
        }
    }

    function init() {
        var profileBox =
            byId(
                'perfil-hoje-balao'
            );

        if (
            profileBox &&
            window.perfilMembroId
        ) {
            bindEditor();
            loadProfile(false);
        }
    }

    window.MargotToday = {
        load: load,
        showMiniMenuFor:
            showMiniMenuFor,

        refreshProfile:
            function () {
                return loadProfile(
                    true
                );
            },

        openEditor:
            openEditor
    };

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            init,
            {
                once: true
            }
        );
    } else {
        init();
    }
}(window, document));