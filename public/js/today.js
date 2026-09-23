(function (window, document) {
    'use strict';

    var PIECES = window.MargotClothes.pieces;
    var COLORS = window.MargotClothes.colors;
    var pieceMeta = window.MargotClothes.piece;
    var colorMeta = window.MargotClothes.color;
    var createGarmentIcon = window.MargotClothes.icon;
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
    var editorOpenFrame = 0;
    var clothesScrollBeforeColor = 0;
    var colorTransitionTimer = 0;
    var miniMenuFadeTimer = 0;

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
            status && (text(status.note) || (Array.isArray(status.clothes) && status.clothes.length))
        );
    }

    function normalizeClothes(items) {
        if (!Array.isArray(items)) return [];

        var seen = Object.create(null);
        var result = [];

        items.forEach(function (item) {
            if (!item || typeof item !== 'object' || result.length >= 5) return;

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
            result.push({ type: type, color: color });
        });

        return result;
    }

    function load(memberId, force) {
        memberId = text(memberId);
        if (!memberId) return Promise.resolve(null);

        var cached = cache.get(memberId);

        if (!force && cached && Date.now() - cached.at < CACHE_MS) {
            return Promise.resolve(cached.status);
        }

        return window
            .fetch(apiUrl(memberId), {
                method: 'GET',
                credentials: 'same-origin',
                headers: { Accept: 'application/json' }
            })
            .then(function (response) {
                if (!response.ok) throw new Error('today_' + response.status);
                return response.json();
            })
            .then(function (payload) {
                var status = payload && payload.success ? payload.today || null : null;
                cache.set(memberId, { at: Date.now(), status: status });
                return status;
            });
    }

    function clearNode(node) {
        while (node && node.firstChild) node.removeChild(node.firstChild);
    }

    function createClothingChip(item, compact) {
        var piece = pieceMeta(text(item.type));
        var color = colorMeta(text(item.color));
        var chip = document.createElement('span');
        var icon = document.createElement('span');
        var label = document.createElement('span');

        chip.className = compact ? 'hoje-chip hoje-chip--compacto' : 'hoje-chip';
        icon.className = 'hoje-chip-icone';
        label.className = 'hoje-chip-texto';

        icon.appendChild(createGarmentIcon(piece.type, text(item.color), 'hoje-chip-garment'));

        label.textContent = compact
            ? color.label || piece.label
            : piece.label + (color.label ? ' · ' + color.label : '');

        chip.setAttribute('aria-label', piece.label + (color.label ? ', ' + color.label : ''));
        chip.appendChild(icon);
        chip.appendChild(label);

        return chip;
    }

    function clearStatusBoxContent(note, clothes) {
        if (note) {
            note.textContent = '';
            note.hidden = true;
        }

        if (clothes) {
            clearNode(clothes);
            clothes.hidden = true;
        }
    }

    function hideMiniMenuStatus(box, note, clothes) {
        if (miniMenuFadeTimer) {
            window.clearTimeout(miniMenuFadeTimer);
            miniMenuFadeTimer = 0;
        }

        box.setAttribute('aria-hidden', 'true');

        if (box.hidden) {
            box.classList.remove('a-visivel', 'a-sair');
            clearStatusBoxContent(note, clothes);
            return;
        }

        box.classList.remove('a-visivel');
        box.classList.add('a-sair');

        miniMenuFadeTimer = window.setTimeout(function () {
            if (box.getAttribute('aria-hidden') !== 'true') return;

            box.hidden = true;
            box.classList.remove('a-sair');
            clearStatusBoxContent(note, clothes);
            miniMenuFadeTimer = 0;
        }, 210);
    }

    function showMiniMenuStatus(box) {
        if (miniMenuFadeTimer) {
            window.clearTimeout(miniMenuFadeTimer);
            miniMenuFadeTimer = 0;
        }

        box.hidden = false;
        box.setAttribute('aria-hidden', 'false');
        box.classList.remove('a-sair', 'a-visivel');

        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
                if (box.hidden || box.getAttribute('aria-hidden') === 'true') return;
                box.classList.add('a-visivel');
            });
        });
    }

    function renderStatusBox(box, status, compact) {
        if (!box) return;

        var note = box.querySelector('[data-hoje-nota]');
        var clothes = box.querySelector('[data-hoje-roupa]');
        var hasStatus = validStatus(status);
        var isMiniMenu = box.id === 'mini-menu-hoje';

        if (!hasStatus) {
            if (isMiniMenu) {
                hideMiniMenuStatus(box, note, clothes);
            } else {
                box.hidden = true;
                box.setAttribute('aria-hidden', 'true');
                clearStatusBoxContent(note, clothes);
            }

            return;
        }

        if (note) {
            var noteText = text(status.note);
            note.textContent = noteText;
            note.hidden = !noteText;
        }

        if (clothes) {
            clearNode(clothes);

            var items = Array.isArray(status.clothes) ? status.clothes : [];

            items.forEach(function (item) {
                clothes.appendChild(createClothingChip(item, compact));
            });

            clothes.hidden = items.length === 0;
        }

        if (isMiniMenu) {
            showMiniMenuStatus(box);
        } else {
            box.hidden = false;
            box.setAttribute('aria-hidden', 'false');
        }
    }

    function showMiniMenuFor(memberId) {
        window.MargotDaylies?.refreshMini(memberId);

        var box = byId('mini-menu-hoje');
        if (!box) return;

        memberId = text(memberId);
        var requestId = ++miniMenuRequest;

        renderStatusBox(box, null, true);
        box.classList.add('a-carregar');

        load(memberId, false)
            .then(function (status) {
                var menu = document.querySelector('.mini-menu');
                var selected = menu ? text(menu.getAttribute('data-destinatario-id')) : '';

                if (requestId !== miniMenuRequest || selected !== memberId) return;

                box.classList.remove('a-carregar');
                renderStatusBox(box, status, true);
            })
            .catch(function () {
                if (requestId !== miniMenuRequest) return;
                box.classList.remove('a-carregar');
                renderStatusBox(box, null, true);
            });
    }

    function renderProfile(status) {
        var box = byId('perfil-hoje-balao');
        var add = byId('perfil-hoje-adicionar');

        profileStatus = status || null;
        profileLoaded = true;

        if (box) {
            renderStatusBox(box, profileStatus, false);
            box.classList.toggle('tem-nota', Boolean(text(profileStatus && profileStatus.note)));
        }

        if (add) {
            add.classList.toggle('ativo', validStatus(profileStatus));
            add.setAttribute(
                'aria-label',
                validStatus(profileStatus)
                    ? 'Editar a tua nota e roupa de hoje'
                    : 'Adicionar nota ou roupa de hoje'
            );
        }
    }

    function loadProfile(force) {
        var memberId = text(window.perfilMembroId);
        if (!memberId) return Promise.resolve(null);

        return load(memberId, Boolean(force))
            .then(function (status) {
                renderProfile(status);
                return status;
            })
            .catch(function () {
                renderProfile(null);
                return null;
            });
    }

    function showMessage(message, type) {
        var error = byId('hoje-editor-erro');

        if (error) {
            error.textContent = text(message);
            error.hidden = !text(message);
        }

        if (message && type === 'erro' && typeof window.mostrarMensagemTemporaria === 'function') {
            window.mostrarMensagemTemporaria(message, 'erro');
        }
    }

    function selectedPiece(type) {
        return (
            clothesDraft.find(function (item) {
                return item.type === type;
            }) || null
        );
    }

    function editorSheet() {
        var editor = byId('hoje-editor');
        return editor ? editor.querySelector('.hoje-editor-sheet') : null;
    }

    function setSheetScroll(top, smooth) {
        var sheet = editorSheet();
        if (!sheet) return;

        try {
            sheet.scrollTo({
                top: Math.max(0, Number(top) || 0),
                behavior: smooth ? 'smooth' : 'auto'
            });
        } catch (error) {
            sheet.scrollTop = Math.max(0, Number(top) || 0);
        }
    }

    function resetColorMode() {
        var view = byId('hoje-editor-roupa');
        var help = view ? view.querySelector('.hoje-roupa-ajuda') : null;
        var selected = byId('hoje-roupa-selecionada');
        var grid = byId('hoje-pecas-grid');
        var area = byId('hoje-cores-area');
        var finish = byId('hoje-roupa-concluir');

        if (colorTransitionTimer) {
            window.clearTimeout(colorTransitionTimer);
            colorTransitionTimer = 0;
        }

        if (view) view.classList.remove('a-escolher-cor');
        if (help) help.hidden = false;

        if (grid) {
            grid.hidden = false;
            grid.classList.remove('hoje-pecas-sair', 'hoje-pecas-regressar');
        }

        if (selected) selected.hidden = clothesDraft.length === 0;
        if (finish) finish.hidden = false;

        if (area) {
            area.hidden = true;
            area.classList.remove('hoje-cores-entrar', 'hoje-cores-sair');
        }
    }

    function openColorPicker(type) {
        var view = byId('hoje-editor-roupa');
        var help = view ? view.querySelector('.hoje-roupa-ajuda') : null;
        var selected = byId('hoje-roupa-selecionada');
        var grid = byId('hoje-pecas-grid');
        var area = byId('hoje-cores-area');
        var finish = byId('hoje-roupa-concluir');
        var sheet = editorSheet();

        if (!view || !grid || !area) return;

        activePiece = type;
        clothesScrollBeforeColor = sheet ? sheet.scrollTop : 0;

        var editorTitle = byId('hoje-editor-titulo');
        if (editorTitle) editorTitle.textContent = 'Escolhe a cor';

        showMessage('', '');
        view.classList.add('a-escolher-cor');
        grid.classList.add('hoje-pecas-sair');

        if (colorTransitionTimer) window.clearTimeout(colorTransitionTimer);

        colorTransitionTimer = window.setTimeout(function () {
            if (help) help.hidden = true;
            if (selected) selected.hidden = true;
            if (finish) finish.hidden = true;

            grid.hidden = true;
            grid.classList.remove('hoje-pecas-sair');

            renderColorGrid();
            area.classList.remove('hoje-cores-sair');
            void area.offsetWidth;
            area.classList.add('hoje-cores-entrar');

            setSheetScroll(0, false);
            colorTransitionTimer = 0;
        }, 120);
    }

    function closeColorPicker(restoreScroll) {
        var view = byId('hoje-editor-roupa');
        var help = view ? view.querySelector('.hoje-roupa-ajuda') : null;
        var selected = byId('hoje-roupa-selecionada');
        var grid = byId('hoje-pecas-grid');
        var area = byId('hoje-cores-area');
        var finish = byId('hoje-roupa-concluir');

        if (!view || !grid || !area) {
            activePiece = '';
            return;
        }

        area.classList.remove('hoje-cores-entrar');
        area.classList.add('hoje-cores-sair');

        if (colorTransitionTimer) window.clearTimeout(colorTransitionTimer);

        colorTransitionTimer = window.setTimeout(function () {
            activePiece = '';

            var editorTitle = byId('hoje-editor-titulo');
            if (editorTitle) editorTitle.textContent = 'Roupa de hoje';

            renderColorGrid();
            renderPieceGrid();
            renderSelectedClothes();
            renderClothingSummary();

            view.classList.remove('a-escolher-cor');

            if (help) help.hidden = false;
            if (finish) finish.hidden = false;

            grid.hidden = false;
            grid.classList.remove('hoje-pecas-sair');
            void grid.offsetWidth;
            grid.classList.add('hoje-pecas-regressar');

            window.setTimeout(function () {
                grid.classList.remove('hoje-pecas-regressar');
            }, 240);

            if (restoreScroll) {
                window.requestAnimationFrame(function () {
                    setSheetScroll(clothesScrollBeforeColor, false);
                });
            }

            colorTransitionTimer = 0;
        }, 120);
    }

    function renderPieceGrid() {
        var grid = byId('hoje-pecas-grid');
        if (!grid) return;

        clearNode(grid);

        PIECES.forEach(function (piece) {
            var button = document.createElement('button');
            var icon = document.createElement('span');
            var label = document.createElement('span');
            var chosen = selectedPiece(piece.type);

            button.type = 'button';
            button.className = 'hoje-peca';
            button.dataset.type = piece.type;
            button.classList.toggle('selecionada', Boolean(chosen));

            icon.className = 'hoje-peca-icone';
            icon.appendChild(
                createGarmentIcon(
                    piece.type,
                    chosen && chosen.color ? chosen.color : '',
                    'hoje-peca-garment'
                )
            );

            label.className = 'hoje-peca-label';
            label.textContent = piece.label;

            button.appendChild(icon);
            button.appendChild(label);

            button.addEventListener('click', function () {
                if (!chosen && clothesDraft.length >= 5) {
                    showMessage('Podes escolher até 5 peças.', 'aviso');
                    return;
                }

                openColorPicker(piece.type);
            });

            grid.appendChild(button);
        });
    }

    function renderColorGrid() {
        var area = byId('hoje-cores-area');
        var grid = byId('hoje-cores-grid');
        var title = byId('hoje-cores-titulo');
        var preview = byId('hoje-cores-peca-preview');

        if (!area || !grid || !title) return;

        if (!activePiece) {
            area.hidden = true;
            clearNode(grid);
            if (preview) clearNode(preview);
            return;
        }

        var piece = pieceMeta(activePiece);
        var chosen = selectedPiece(activePiece);

        title.textContent = piece.label;
        area.hidden = false;
        clearNode(grid);

        if (preview) {
            clearNode(preview);
            preview.appendChild(
                createGarmentIcon(
                    activePiece,
                    chosen && chosen.color ? chosen.color : '',
                    'hoje-cores-peca-garment'
                )
            );
        }

        COLORS.forEach(function (color) {
            var button = document.createElement('button');
            var sample = document.createElement('span');
            var label = document.createElement('span');

            button.type = 'button';
            button.className = 'hoje-cor';
            button.classList.toggle('selecionada', Boolean(chosen && chosen.color === color.key));
            button.setAttribute('aria-label', piece.label + ', ' + color.label);

            sample.className = 'hoje-cor-amostra';
            sample.appendChild(createGarmentIcon(activePiece, color.key, 'hoje-cor-garment'));

            label.className = 'hoje-cor-label';
            label.textContent = color.label;

            button.appendChild(sample);
            button.appendChild(label);

            button.addEventListener('click', function () {
                var type = activePiece;

                var index = clothesDraft.findIndex(function (item) {
                    return item.type === type;
                });

                if (index >= 0) {
                    clothesDraft[index] = { type: type, color: color.key };
                } else {
                    clothesDraft.push({ type: type, color: color.key });
                }

                grid.querySelectorAll('.hoje-cor').forEach(function (item) {
                    item.classList.remove('selecionada');
                });

                button.classList.add('selecionada');

                if (preview) {
                    clearNode(preview);
                    preview.appendChild(createGarmentIcon(type, color.key, 'hoje-cores-peca-garment'));
                }

                window.setTimeout(function () {
                    closeColorPicker(true);
                }, 90);
            });

            grid.appendChild(button);
        });
    }

    function renderSelectedClothes() {
        var area = byId('hoje-roupa-selecionada');
        if (!area) return;

        clearNode(area);
        area.hidden = clothesDraft.length === 0;

        clothesDraft.forEach(function (item) {
            var piece = pieceMeta(item.type);
            var color = colorMeta(item.color);
            var button = document.createElement('button');
            var icon = document.createElement('span');
            var label = document.createElement('span');
            var remove = document.createElement('span');

            button.type = 'button';
            button.className = 'hoje-roupa-selecionada-item';
            button.setAttribute(
                'aria-label',
                'Remover ' + piece.label + (color.label ? ' ' + color.label : '')
            );

            icon.className = 'hoje-roupa-selecionada-icone';
            icon.appendChild(createGarmentIcon(item.type, item.color, 'hoje-selecionada-garment'));
            icon.setAttribute('aria-hidden', 'true');

            label.className = 'hoje-roupa-selecionada-label';
            label.textContent = piece.label + (color.label ? ' · ' + color.label : '');

            remove.className = 'hoje-roupa-selecionada-remover';
            remove.textContent = '×';
            remove.setAttribute('aria-hidden', 'true');

            button.appendChild(icon);
            button.appendChild(label);
            button.appendChild(remove);

            button.addEventListener('click', function () {
                clothesDraft = clothesDraft.filter(function (entry) {
                    return entry.type !== item.type;
                });

                if (activePiece === item.type) activePiece = '';

                renderPieceGrid();
                renderColorGrid();
                renderSelectedClothes();
                renderClothingSummary();
            });

            area.appendChild(button);
        });
    }

    function renderClothingSummary() {
        var summary = byId('hoje-roupa-resumo');
        var button = byId('hoje-abrir-roupa');
        var preview = button ? button.querySelector('.hoje-opcao-roupa-icone') : null;

        if (!summary || !button) return;

        if (preview) {
            clearNode(preview);

            var previewItem = clothesDraft.length
                ? clothesDraft[0]
                : { type: 'tshirt', color: '' };

            preview.appendChild(
                createGarmentIcon(previewItem.type, previewItem.color, 'hoje-opcao-garment')
            );
        }

        if (!clothesDraft.length) {
            summary.textContent = 'Opcional';
            button.classList.remove('tem-roupa');
            return;
        }

        summary.textContent = clothesDraft
            .map(function (item) {
                var piece = pieceMeta(item.type);
                var color = colorMeta(item.color);

                return piece.label + (color.label ? ' ' + color.label.toLowerCase() : '');
            })
            .join(' · ');

        button.classList.add('tem-roupa');
    }

    function animateEditorView(node, direction) {
        if (!node) return;

        node.classList.remove('hoje-view-entra-direita', 'hoje-view-entra-esquerda');
        void node.offsetWidth;
        node.classList.add(
            direction === 'back' ? 'hoje-view-entra-esquerda' : 'hoje-view-entra-direita'
        );

        window.setTimeout(function () {
            node.classList.remove('hoje-view-entra-direita', 'hoje-view-entra-esquerda');
        }, 240);
    }

    function showEditorView(view) {
        var main = byId('hoje-editor-principal');
        var clothes = byId('hoje-editor-roupa');
        var title = byId('hoje-editor-titulo');
        var back = byId('hoje-editor-voltar');

        if (!main || !clothes || !title || !back) return;

        var clothesView = view === 'clothes';
        var wasClothes = !clothes.hidden;

        main.hidden = clothesView;
        clothes.hidden = !clothesView;
        back.hidden = !clothesView;
        title.textContent = clothesView ? 'Roupa de hoje' : 'Hoje';

        if (clothesView) {
            activePiece = '';
            resetColorMode();
            renderPieceGrid();
            renderColorGrid();
            renderSelectedClothes();

            if (!wasClothes) {
                setSheetScroll(0, false);
                animateEditorView(clothes, 'forward');
            }
        } else if (wasClothes) {
            activePiece = '';
            resetColorMode();
            animateEditorView(main, 'back');
        }
    }

    function fillEditor(status) {
        var note = byId('hoje-nota-input');
        var deleteButton = byId('hoje-apagar');

        clothesDraft = normalizeClothes(status && status.clothes);
        activePiece = '';

        if (note) {
            note.value = text(status && status.note);
            updateCounter();
        }

        if (deleteButton) deleteButton.hidden = !validStatus(status);

        renderClothingSummary();
        renderSelectedClothes();
        renderPieceGrid();
        renderColorGrid();
        showMessage('', '');
        showEditorView('main');
    }

    function updateCounter() {
        var input = byId('hoje-nota-input');
        var counter = byId('hoje-nota-contador');

        if (!input || !counter) return;

        counter.textContent = String(input.value.length) + '/160';
    }

    function setEditorBusy(busy) {
        var editor = byId('hoje-editor');
        if (!editor) return;

        editor.classList.toggle('a-guardar', Boolean(busy));

        editor.querySelectorAll('button, textarea').forEach(function (element) {
            if (element.id === 'hoje-editor-fechar') return;
            element.disabled = Boolean(busy);
        });
    }

    function updateKeyboardOffset(explicitHeight) {
        var height = Number(explicitHeight);

        if (!Number.isFinite(height)) {
            height = 0;

            if (window.visualViewport) {
                height = Math.max(
                    0,
                    window.innerHeight -
                        window.visualViewport.height -
                        window.visualViewport.offsetTop
                );
            }
        }

        keyboardOffset = Math.max(0, Math.round(height));
        document.documentElement.style.setProperty('--hoje-teclado', keyboardOffset + 'px');
    }

    function setEditorDrag(editor, distance) {
        if (!editor) return;

        var sheet = editor.querySelector('.hoje-editor-sheet');
        var max = sheet ? Math.max(260, sheet.getBoundingClientRect().height) : 520;
        var amount = Math.max(0, Math.min(Number(distance) || 0, max));
        var backdrop = Math.max(0.12, 1 - (amount / max) * 0.9);

        editor.style.setProperty('--hoje-arrasto', amount + 'px');
        editor.style.setProperty('--hoje-fundo-opacidade', String(backdrop));
    }

    function clearEditorDrag(editor) {
        if (!editor) return;

        editor.classList.remove('a-arrastar');
        editor.style.removeProperty('--hoje-arrasto');
        editor.style.removeProperty('--hoje-fundo-opacidade');
    }

    function bindEditorSwipe(editor) {
        var sheet = editor && editor.querySelector('.hoje-editor-sheet');
        if (!sheet) return;

        var state = {
            tracking: false,
            dragging: false,
            startY: 0,
            currentY: 0,
            startedAt: 0
        };

        function reset() {
            state.tracking = false;
            state.dragging = false;
            state.startY = 0;
            state.currentY = 0;
            state.startedAt = 0;
        }

        sheet.addEventListener(
            'touchstart',
            function (event) {
                if (
                    !editorOpen ||
                    keyboardOffset > 0 ||
                    !event.touches ||
                    event.touches.length !== 1 ||
                    sheet.scrollTop > 1
                ) {
                    return;
                }

                var target = event.target;

                if (
                    target &&
                    target.closest &&
                    target.closest('textarea, input, select, button, a, [contenteditable="true"]')
                ) {
                    return;
                }

                state.tracking = true;
                state.dragging = false;
                state.startY = event.touches[0].clientY;
                state.currentY = state.startY;
                state.startedAt = Date.now();
            },
            { passive: true }
        );

        sheet.addEventListener(
            'touchmove',
            function (event) {
                if (!state.tracking || !event.touches || event.touches.length !== 1) return;

                var current = event.touches[0].clientY;
                var delta = current - state.startY;

                if (!state.dragging && delta <= 7) return;

                if (delta < 0 || sheet.scrollTop > 1) {
                    reset();
                    return;
                }

                state.dragging = true;
                state.currentY = current;

                editor.classList.add('a-arrastar');
                setEditorDrag(editor, delta);
                event.preventDefault();
            },
            { passive: false }
        );

        function finish(event) {
            if (!state.tracking) return;

            var endY = state.currentY || state.startY;

            if (event && event.changedTouches && event.changedTouches.length) {
                endY = event.changedTouches[0].clientY;
            }

            var distance = Math.max(0, endY - state.startY);
            var elapsed = Math.max(1, Date.now() - state.startedAt);
            var velocity = distance / elapsed;
            var shouldClose = state.dragging && (distance >= 110 || velocity >= 0.62);

            if (shouldClose) {
                editor.classList.remove('a-arrastar');
                closeEditor(true);
            } else if (state.dragging) {
                editor.classList.remove('a-arrastar');

                window.requestAnimationFrame(function () {
                    setEditorDrag(editor, 0);
                });

                window.setTimeout(function () {
                    if (editorOpen) clearEditorDrag(editor);
                }, 280);
            }

            reset();
        }

        sheet.addEventListener('touchend', finish, { passive: true });
        sheet.addEventListener('touchcancel', finish, { passive: true });
    }

    function openEditor() {
        var editor = byId('hoje-editor');
        var note = byId('hoje-nota-input');

        if (!editor || editorOpen) return;

        var promise = profileLoaded
            ? Promise.resolve(profileStatus)
            : loadProfile(false);

        promise.then(function (status) {
            fillEditor(status);

            if (editorOpenFrame) window.cancelAnimationFrame(editorOpenFrame);

            editor.classList.remove('aberto', 'a-arrastar');
            clearEditorDrag(editor);

            editor.hidden = false;
            editor.setAttribute('aria-hidden', 'false');

            document.documentElement.classList.add('hoje-editor-aberto');
            document.body.classList.add('hoje-editor-aberto');

            editorOpen = true;
            updateKeyboardOffset();

            editorOpenFrame = window.requestAnimationFrame(function () {
                editorOpenFrame = window.requestAnimationFrame(function () {
                    if (!editorOpen) return;

                    editor.classList.add('aberto');
                    editorOpenFrame = 0;
                });
            });

            window.setTimeout(function () {
                if (editorOpen && note && !window.matchMedia('(pointer: coarse)').matches) {
                    note.focus({ preventScroll: true });
                }
            }, 340);
        });
    }

    function closeEditor(fromDrag) {
        var editor = byId('hoje-editor');
        if (!editor || !editorOpen) return;

        if (editorOpenFrame) {
            window.cancelAnimationFrame(editorOpenFrame);
            editorOpenFrame = 0;
        }

        editor.classList.remove('a-arrastar');
        editor.classList.remove('aberto');
        editor.setAttribute('aria-hidden', 'true');

        document.documentElement.classList.remove('hoje-editor-aberto');
        document.body.classList.remove('hoje-editor-aberto');

        editorOpen = false;
        activePiece = '';
        updateKeyboardOffset(0);

        window.setTimeout(
            function () {
                if (!editorOpen) {
                    editor.hidden = true;
                    clearEditorDrag(editor);
                }
            },
            fromDrag ? 260 : 280
        );
    }

    function saveEditor() {
        var memberId = text(window.perfilMembroId);
        var note = byId('hoje-nota-input');

        if (!memberId || !note) return;

        setEditorBusy(true);
        showMessage('', '');

        window
            .fetch(apiUrl(memberId), {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    note: note.value.trim(),
                    clothes: clothesDraft.map(function (item) {
                        return { type: item.type, color: item.color };
                    })
                })
            })
            .then(function (response) {
                return response
                    .json()
                    .catch(function () {
                        return null;
                    })
                    .then(function (payload) {
                        if (!response.ok || !payload || !payload.success) {
                            throw new Error(
                                payload && payload.message
                                    ? payload.message
                                    : 'Não foi possível guardar.'
                            );
                        }

                        return payload.today || null;
                    });
            })
            .then(function (status) {
                cache.set(memberId, { at: Date.now(), status: status });
                renderProfile(status);
                closeEditor();

                if (status) window.MargotDaylies?.celebrate('Pronto para hoje!');

                if (typeof window.mostrarMensagemTemporaria === 'function') {
                    window.mostrarMensagemTemporaria('Atualizado para hoje.', 'sucesso');
                }
            })
            .catch(function (error) {
                showMessage(
                    error && error.message && !/^today_/.test(error.message)
                        ? error.message
                        : 'Não foi possível guardar. Tenta novamente.',
                    'erro'
                );
            })
            .finally(function () {
                setEditorBusy(false);
            });
    }

    function deleteEditor() {
        var memberId = text(window.perfilMembroId);
        if (!memberId) return;

        setEditorBusy(true);
        showMessage('', '');

        window
            .fetch(apiUrl(memberId), {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: { Accept: 'application/json' }
            })
            .then(function (response) {
                return response
                    .json()
                    .catch(function () {
                        return null;
                    })
                    .then(function (payload) {
                        if (!response.ok || !payload || !payload.success) {
                            throw new Error(
                                payload && payload.message
                                    ? payload.message
                                    : 'Não foi possível apagar.'
                            );
                        }
                    });
            })
            .then(function () {
                cache.set(memberId, { at: Date.now(), status: null });
                renderProfile(null);
                closeEditor();
            })
            .catch(function (error) {
                showMessage(
                    error && error.message
                        ? error.message
                        : 'Não foi possível apagar. Tenta novamente.',
                    'erro'
                );
            })
            .finally(function () {
                setEditorBusy(false);
            });
    }

    function bindEditor() {
        var editor = byId('hoje-editor');
        if (!editor) return;

        bindEditorSwipe(editor);

        var add = byId('perfil-hoje-adicionar');
        var bubble = byId('perfil-hoje-balao');
        var close = byId('hoje-editor-fechar');
        var backdrop = editor.querySelector('[data-hoje-fechar]');
        var openClothes = byId('hoje-abrir-roupa');
        var back = byId('hoje-editor-voltar');
        var finishClothes = byId('hoje-roupa-concluir');
        var save = byId('hoje-guardar');
        var remove = byId('hoje-apagar');
        var note = byId('hoje-nota-input');

        if (add) {
            add.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                openEditor();
            });
        }

        if (bubble && bubble.dataset.editable === '1') {
            bubble.addEventListener('click', openEditor);

            bubble.addEventListener('keydown', function (event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openEditor();
                }
            });
        }

        if (close) {
            close.addEventListener('click', closeEditor);
        }

        if (backdrop) {
            backdrop.addEventListener('click', closeEditor);
        }

        if (openClothes) {
            openClothes.addEventListener('click', function () {
                showEditorView('clothes');
            });
        }

        if (back) {
            back.addEventListener('click', function () {
                if (activePiece) {
                    closeColorPicker(true);
                    return;
                }

                showEditorView('main');
            });
        }

        if (finishClothes) {
            finishClothes.addEventListener('click', function () {
                activePiece = '';
                renderClothingSummary();
                showEditorView('main');
            });
        }

        if (save) {
            save.addEventListener('click', saveEditor);
        }

        if (remove) {
            remove.addEventListener('click', deleteEditor);
        }

        if (note) {
            note.addEventListener('input', updateCounter);
        }

        document.addEventListener('keydown', function (event) {
            if (!editorOpen) return;

            if (event.key === 'Escape') {
                if (activePiece) {
                    closeColorPicker(true);
                } else {
                    closeEditor();
                }
            }
        });

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', function () {
                if (editorOpen) {
                    updateKeyboardOffset();
                }
            });

            window.visualViewport.addEventListener('scroll', function () {
                if (editorOpen) {
                    updateKeyboardOffset();
                }
            });
        }

        try {
            var capacitor = window.Capacitor;
            var keyboard = capacitor && capacitor.Plugins && capacitor.Plugins.Keyboard;

            if (keyboard && typeof keyboard.addListener === 'function') {
                keyboard.addListener('keyboardWillShow', function (info) {
                    if (editorOpen) {
                        updateKeyboardOffset(Number(info && info.keyboardHeight) || 0);
                    }
                });

                keyboard.addListener('keyboardWillHide', function () {
                    if (editorOpen) {
                        updateKeyboardOffset(0);
                    }
                });
            }
        } catch (error) {}
    }

    function init() {
        var profileBox = byId('perfil-hoje-balao');

        if (profileBox && window.perfilMembroId) {
            bindEditor();
            loadProfile(false);
        }
    }

    window.MargotToday = {
        load: load,
        showMiniMenuFor: showMiniMenuFor,
        refreshProfile: function () {
            return loadProfile(true);
        },
        openEditor: openEditor
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})(window, document);