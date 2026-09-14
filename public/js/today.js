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
    var editorOpenFrame = 0;
    var garmentIconSequence = 0;
    var clothesScrollBeforeColor = 0;
    var colorTransitionTimer = 0;

    var PIECES = [{ type: 'tshirt', icon: '👕', label: 'T-shirt' }, { type: 'shirt', icon: '👔', label: 'Camisa' }, { type: 'sweater', icon: '🧶', label: 'Camisola' }, { type: 'hoodie', icon: '🧥', label: 'Hoodie' }, { type: 'jacket', icon: '🧥', label: 'Casaco' }, { type: 'top', icon: '👚', label: 'Top' }, { type: 'jeans', icon: '👖', label: 'Jeans' }, { type: 'trousers', icon: '👖', label: 'Calças' }, { type: 'shorts', icon: '🩳', label: 'Calções' }, { type: 'skirt', icon: '👗', label: 'Saia' }, { type: 'dress', icon: '👗', label: 'Vestido' }, { type: 'sneakers', icon: '👟', label: 'Sapatilhas' }, { type: 'boots', icon: '🥾', label: 'Botas' }, { type: 'shoes', icon: '👞', label: 'Sapatos' }, { type: 'sandals', icon: '🩴', label: 'Sandálias' }, { type: 'cap', icon: '🧢', label: 'Boné' }, { type: 'hat', icon: '👒', label: 'Chapéu' }, { type: 'glasses', icon: '🕶️', label: 'Óculos' }, { type: 'backpack', icon: '🎒', label: 'Mochila' }];

    var COLORS = [{ key: 'white', label: 'Branco', value: '#f8f8f5' }, { key: 'black', label: 'Preto', value: '#222226' }, { key: 'grey', label: 'Cinzento', value: '#9a9aa1' }, { key: 'blue', label: 'Azul', value: '#4c7fd1' }, { key: 'denim', label: 'Ganga', value: '#617fa6' }, { key: 'red', label: 'Vermelho', value: '#d84c59' }, { key: 'green', label: 'Verde', value: '#559569' }, { key: 'yellow', label: 'Amarelo', value: '#e3bd48' }, { key: 'pink', label: 'Rosa', value: '#e78aa6' }, { key: 'purple', label: 'Roxo', value: '#8f70c8' }, { key: 'brown', label: 'Castanho', value: '#8a6652' }, { key: 'beige', label: 'Bege', value: '#d9c5a1' }, { key: 'orange', label: 'Laranja', value: '#e88841' }, { key: 'multicolor', label: 'Multicolor', value: 'conic-gradient(#e34f61,#e7bd48,#59a36e,#5782d2,#9670c8,#e34f61)' }];

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
        return Boolean(status && (text(status.note) || (Array.isArray(status.clothes) && status.clothes.length)));
    }

    function pieceMeta(type) {
        return PIECES.find(function (item) {
            return item.type === type;
        }) || { type: type, icon: '👕', label: 'Peça' };
    }

    function colorMeta(key) {
        return COLORS.find(function (item) {
            return item.key === key;
        }) || { key: key, label: '', value: '#d8d8dc' };
    }

    function svgNode(name, attributes) {
        var node = document.createElementNS('http://www.w3.org/2000/svg', name);
        Object.keys(attributes || {}).forEach(function (key) {
            node.setAttribute(key, attributes[key]);
        });
        return node;
    }

    function garmentPaint(svg, colorKey) {
        var color = colorMeta(colorKey);

        if (colorKey === 'multicolor') {
            var id = 'hoje-garment-gradient-' + (++garmentIconSequence);
            var defs = svgNode('defs');
            var gradient = svgNode('linearGradient', { id: id, x1: '0%', y1: '0%', x2: '100%', y2: '100%' });

            [['0%', '#e34f61'], ['24%', '#e7bd48'], ['48%', '#59a36e'], ['72%', '#5782d2'], ['100%', '#9670c8']].forEach(function (stop) {
                gradient.appendChild(svgNode('stop', { offset: stop[0], 'stop-color': stop[1] }));
            });

            defs.appendChild(gradient);
            svg.appendChild(defs);
            return 'url(#' + id + ')';
        }

        return colorKey ? color.value : '#d8d5dc';
    }

    function garmentPath(svg, d, fill, options) {
        options = options || {};

        var path = svgNode('path', {
            d: d,
            fill: options.fill === 'none' ? 'none' : (options.fill || fill),
            stroke: options.stroke || '#312d35',
            'stroke-opacity': options.strokeOpacity || '0.23',
            'stroke-width': options.strokeWidth || '1.8',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            'vector-effect': 'non-scaling-stroke'
        });

        svg.appendChild(path);
        return path;
    }

    function garmentLine(svg, d, options) {
        return garmentPath(svg, d, 'none', Object.assign({
            fill: 'none',
            stroke: '#312d35',
            strokeOpacity: '0.28',
            strokeWidth: '1.5'
        }, options || {}));
    }

    function createGarmentIcon(type, colorKey, className) {
        var svg = svgNode('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' });
        svg.classList.add('hoje-garment-svg');

        if (className) {
            String(className).split(/\s+/).filter(Boolean).forEach(function (name) {
                svg.classList.add(name);
            });
        }

        var fill = garmentPaint(svg, colorKey);

        switch (type) {
            case 'shirt':
                garmentPath(svg, 'M20 12 12 17 7 29 15 34 20 27 20 54 44 54 44 27 49 34 57 29 52 17 44 12 38 18 32 15 26 18Z', fill);
                garmentPath(svg, 'M26 18 32 25 38 18 32 15Z', '#f4f1f5', { strokeOpacity: '0.18', strokeWidth: '1.2' });
                garmentLine(svg, 'M32 24V53');
                garmentLine(svg, 'M29.5 31h5M29.5 38h5M29.5 45h5', { strokeWidth: '1.2' });
                break;

            case 'sweater':
                garmentPath(svg, 'M21 12 12 17 5 38 14 42 20 28 20 55 44 55 44 28 50 42 59 38 52 17 43 12C40 17 37 19 32 19S24 17 21 12Z', fill);
                garmentLine(svg, 'M20 49h24M22 13c2 6 6 9 10 9s8-3 10-9');
                break;

            case 'hoodie':
                garmentPath(svg, 'M21 14 12 19 6 40 15 43 20 29 20 55 44 55 44 29 49 43 58 40 52 19 43 14Z', fill);
                garmentPath(svg, 'M22 16C23 7 28 4 32 4s9 3 10 12c-2 5-5 8-10 8s-8-3-10-8Z', fill, { strokeOpacity: '0.18', strokeWidth: '1.5' });
                garmentLine(svg, 'M28 24v8M36 24v8M27 45c3-2 7-2 10 0');
                break;

            case 'jacket':
                garmentPath(svg, 'M21 12 12 17 6 40 15 43 20 28 20 55 44 55 44 28 49 43 58 40 52 17 43 12 32 18Z', fill);
                garmentLine(svg, 'M32 18V55M23 34l7 4M41 34l-7 4');
                break;

            case 'top':
                garmentPath(svg, 'M24 12c1 5 4 7 8 7s7-2 8-7l7 6-5 10v26H22V28l-5-10Z', fill);
                garmentLine(svg, 'M24 13c1 7 4 10 8 10s7-3 8-10');
                break;

            case 'jeans':
                garmentPath(svg, 'M17 9h30l-2 20-5 27H30l2-28-2 28H20l-5-27Z', fill);
                garmentLine(svg, 'M17 17h30M32 10v18M21 19c2 4 5 6 9 6M43 19c-2 4-5 6-9 6');
                break;

            case 'trousers':
                garmentPath(svg, 'M18 9h28l1 18-6 29H30l2-29-2 29H19l-2-29Z', fill);
                garmentLine(svg, 'M18 16h28M32 10v17');
                break;

            case 'shorts':
                garmentPath(svg, 'M17 11h30l1 14-5 17H33l-1-14-1 14H21l-5-17Z', fill);
                garmentLine(svg, 'M18 18h28M32 12v16');
                break;

            case 'skirt':
                garmentPath(svg, 'M23 10h18l8 43H15Z', fill);
                garmentLine(svg, 'M22 17h20');
                break;

            case 'dress':
                garmentPath(svg, 'M25 9c1 5 3 7 7 7s6-2 7-7l7 9-6 10 10 27H14l10-27-6-10Z', fill);
                garmentLine(svg, 'M24 28h16');
                break;

            case 'sneakers':
                garmentPath(svg, 'M10 38c7 0 13-8 16-17l10 5c2 8 8 11 17 14 4 1 6 4 5 8H9c-4-3-3-7 1-10Z', fill);
                garmentLine(svg, 'M13 40h37M27 28l9 4M24 33l11 4');
                break;

            case 'boots':
                garmentPath(svg, 'M18 9h20v27c3 5 8 7 15 9 4 1 5 4 4 8H14c-3-3-2-7 4-10Z', fill);
                garmentLine(svg, 'M18 34h20M17 47h36');
                break;

            case 'shoes':
                garmentPath(svg, 'M11 35c7-1 13-7 18-15l8 4c3 7 8 10 16 13 4 2 6 5 4 9H10c-4-3-3-8 1-11Z', fill);
                garmentLine(svg, 'M14 39h38M29 27l9 4');
                break;

            case 'sandals':
                garmentPath(svg, 'M13 44c7-10 14-17 24-22l9 5c-6 9-13 17-23 26-7 5-15-2-10-9Z', fill, { strokeOpacity: '0.22' });
                garmentLine(svg, 'M24 34c7 0 12 3 15 8M30 29l8 14');
                break;

            case 'cap':
                garmentPath(svg, 'M14 34c1-13 8-21 19-21s19 8 20 21Z', fill);
                garmentPath(svg, 'M32 34h25c0 6-9 9-25 7Z', fill, { strokeOpacity: '0.18', strokeWidth: '1.4' });
                garmentLine(svg, 'M33 14v20');
                break;

            case 'hat':
                garmentPath(svg, 'M21 12h22l5 27H16Z', fill);
                garmentPath(svg, 'M7 39c6-4 15-6 25-6s19 2 25 6c-4 7-14 11-25 11S11 46 7 39Z', fill, { strokeOpacity: '0.18', strokeWidth: '1.4' });
                garmentLine(svg, 'M18 31h28');
                break;

            case 'glasses':
                garmentPath(svg, 'M8 25c8-3 16-3 22 1l2 4 2-4c6-4 14-4 22-1l-3 18c-8 5-16 2-20-6h-2c-4 8-12 11-20 6Z', fill, { strokeOpacity: '0.28' });
                garmentLine(svg, 'M30 30h4');
                break;

            case 'backpack':
                garmentPath(svg, 'M18 22c0-10 5-16 14-16s14 6 14 16l6 28c-5 5-12 8-20 8s-15-3-20-8Z', fill);
                garmentLine(svg, 'M23 22c0-7 3-11 9-11s9 4 9 11M16 35h32M23 39h18v11H23Z');
                break;

            case 'tshirt':
            default:
                garmentPath(svg, 'M21 12 12 17 6 29 15 34 20 27 20 54 44 54 44 27 49 34 58 29 52 17 43 12C40 17 37 19 32 19S24 17 21 12Z', fill);
                garmentLine(svg, 'M22 13c2 6 5 9 10 9s8-3 10-9');
                break;
        }

        return svg;
    }

    function normalizeClothes(items) {
        if (!Array.isArray(items)) return [];

        var seen = Object.create(null);
        var result = [];

        items.forEach(function (item) {
            if (!item || typeof item !== 'object' || result.length >= 5) return;

            var type = text(item.type).toLowerCase();
            var color = text(item.color).toLowerCase();

            if (!type || seen[type] || !PIECES.some(function (piece) {
                return piece.type === type;
            })) return;

            if (color && !COLORS.some(function (entry) {
                return entry.key === color;
            })) color = '';

            seen[type] = true;
            result.push({ type: type, color: color });
        });

        return result;
    }

    function load(memberId, force) {
        memberId = text(memberId);
        if (!memberId) return Promise.resolve(null);

        var cached = cache.get(memberId);
        if (!force && cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.status);

        return window.fetch(apiUrl(memberId), {
            method: 'GET',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        }).then(function (response) {
            if (!response.ok) throw new Error('today_' + response.status);
            return response.json();
        }).then(function (payload) {
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
        label.textContent = compact ? (color.label || piece.label) : (piece.label + (color.label ? ' · ' + color.label : ''));

        chip.setAttribute('aria-label', piece.label + (color.label ? ', ' + color.label : ''));
        chip.appendChild(icon);
        chip.appendChild(label);

        return chip;
    }

    function renderStatusBox(box, status, compact) {
        if (!box) return;

        var note = box.querySelector('[data-hoje-nota]');
        var clothes = box.querySelector('[data-hoje-roupa]');
        var hasStatus = validStatus(status);

        box.hidden = !hasStatus;
        box.setAttribute('aria-hidden', hasStatus ? 'false' : 'true');

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
    }

    function showMiniMenuFor(memberId) {
        var box = byId('mini-menu-hoje');
        if (!box) return;

        memberId = text(memberId);
        var requestId = ++miniMenuRequest;

        renderStatusBox(box, null, true);
        box.classList.add('a-carregar');

        load(memberId, false).then(function (status) {
            var menu = document.querySelector('.mini-menu');
            var selected = menu ? text(menu.getAttribute('data-destinatario-id')) : '';

            if (requestId !== miniMenuRequest || selected !== memberId) return;

            box.classList.remove('a-carregar');
            renderStatusBox(box, status, true);
        }).catch(function () {
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
            add.setAttribute('aria-label', validStatus(profileStatus) ? 'Editar a tua nota e roupa de hoje' : 'Adicionar nota ou roupa de hoje');
        }
    }

    function loadProfile(force) {
        var memberId = text(window.perfilMembroId);
        if (!memberId) return Promise.resolve(null);

        return load(memberId, Boolean(force)).then(function (status) {
            renderProfile(status);
            return status;
        }).catch(function () {
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
        return clothesDraft.find(function (item) {
            return item.type === type;
        }) || null;
    }

    function editorSheet() {
        var editor = byId('hoje-editor');
        return editor ? editor.querySelector('.hoje-editor-sheet') : null;
    }

    function setSheetScroll(top, smooth) {
        var sheet = editorSheet();
        if (!sheet) return;

        try {
            sheet.scrollTo({ top: Math.max(0, Number(top) || 0), behavior: smooth ? 'smooth' : 'auto' });
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
            icon.appendChild(createGarmentIcon(piece.type, chosen && chosen.color ? chosen.color : '', 'hoje-peca-garment'));

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
            preview.appendChild(createGarmentIcon(activePiece, chosen && chosen.color ? chosen.color : '', 'hoje-cores-peca-garment'));
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
            button.setAttribute('aria-label', 'Remover ' + piece.label + (color.label ? ' ' + color.label : ''));

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

            preview.appendChild(createGarmentIcon(previewItem.type, previewItem.color, 'hoje-opcao-garment'));
        }

        if (!clothesDraft.length) {
            summary.textContent = 'Opcional';
            button.classList.remove('tem-roupa');
            return;
        }

        summary.textContent = clothesDraft.map(function (item) {
            var piece = pieceMeta(item.type);
            var color = colorMeta(item.color);

            return piece.label + (color.label ? ' ' + color.label.toLowerCase() : '');
        }).join(' · ');

        button.classList.add('tem-roupa');
    }

    function animateEditorView(node, direction) {
        if (!node) return;

        node.classList.remove('hoje-view-entra-direita', 'hoje-view-entra-esquerda');
        void node.offsetWidth;
        node.classList.add(direction === 'back' ? 'hoje-view-entra-esquerda' : 'hoje-view-entra-direita');

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

        sheet.addEventListener('touchstart', function (event) {
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
        }, { passive: true });

        sheet.addEventListener('touchmove', function (event) {
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
        }, { passive: false });

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

            if (editorOpenFrame) {
                window.cancelAnimationFrame(editorOpenFrame);
            }

            editor.classList.remove('aberto', 'a-arrastar');
            clearEditorDrag(editor);

            editor.hidden = false;
            editor.setAttribute('aria-hidden', 'false');

            document.documentElement.classList.add('hoje-editor-aberto');
            document.body.classList.add('hoje-editor-aberto');

            editorOpen = true;
            updateKeyboardOffset();

            /*
             * Duplo requestAnimationFrame:
             * primeiro o browser pinta o sheet fora do ecrã;
             * depois aplicamos .aberto e a transição fica visível.
             */
            editorOpenFrame = window.requestAnimationFrame(function () {
                editorOpenFrame = window.requestAnimationFrame(function () {
                    if (!editorOpen) return;

                    editor.classList.add('aberto');
                    editorOpenFrame = 0;
                });
            });

            window.setTimeout(function () {
                if (
                    editorOpen &&
                    note &&
                    !window.matchMedia('(pointer: coarse)').matches
                ) {
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

        window.setTimeout(function () {
            if (!editorOpen) {
                editor.hidden = true;
                clearEditorDrag(editor);
            }
        }, fromDrag ? 260 : 280);
    }

    function saveEditor() {
        var memberId = text(window.perfilMembroId);
        var note = byId('hoje-nota-input');

        if (!memberId || !note) return;

        setEditorBusy(true);
        showMessage('', '');

        window.fetch(apiUrl(memberId), {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                note: note.value.trim(),
                clothes: clothesDraft.map(function (item) {
                    return {
                        type: item.type,
                        color: item.color
                    };
                })
            })
        }).then(function (response) {
            return response.json().catch(function () {
                return null;
            }).then(function (payload) {
                if (!response.ok || !payload || !payload.success) {
                    throw new Error(
                        payload && payload.message
                            ? payload.message
                            : 'Não foi possível guardar.'
                    );
                }

                return payload.today || null;
            });
        }).then(function (status) {
            cache.set(memberId, {
                at: Date.now(),
                status: status
            });

            renderProfile(status);
            closeEditor();

            if (typeof window.mostrarMensagemTemporaria === 'function') {
                window.mostrarMensagemTemporaria(
                    'Atualizado para hoje.',
                    'sucesso'
                );
            }
        }).catch(function (error) {
            showMessage(
                error &&
                error.message &&
                !/^today_/.test(error.message)
                    ? error.message
                    : 'Não foi possível guardar. Tenta novamente.',
                'erro'
            );
        }).finally(function () {
            setEditorBusy(false);
        });
    }

    function deleteEditor() {
        var memberId = text(window.perfilMembroId);

        if (!memberId) return;

        setEditorBusy(true);
        showMessage('', '');

        window.fetch(apiUrl(memberId), {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json'
            }
        }).then(function (response) {
            return response.json().catch(function () {
                return null;
            }).then(function (payload) {
                if (!response.ok || !payload || !payload.success) {
                    throw new Error(
                        payload && payload.message
                            ? payload.message
                            : 'Não foi possível apagar.'
                    );
                }
            });
        }).then(function () {
            cache.set(memberId, {
                at: Date.now(),
                status: null
            });

            renderProfile(null);
            closeEditor();
        }).catch(function (error) {
            showMessage(
                error && error.message
                    ? error.message
                    : 'Não foi possível apagar. Tenta novamente.',
                'erro'
            );
        }).finally(function () {
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
            var keyboard =
                capacitor &&
                capacitor.Plugins &&
                capacitor.Plugins.Keyboard;

            if (keyboard && typeof keyboard.addListener === 'function') {
                keyboard.addListener('keyboardWillShow', function (info) {
                    if (editorOpen) {
                        updateKeyboardOffset(
                            Number(info && info.keyboardHeight) || 0
                        );
                    }
                });

                keyboard.addListener('keyboardWillHide', function () {
                    if (editorOpen) {
                        updateKeyboardOffset(0);
                    }
                });
            }
        } catch (error) {
        }
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
        document.addEventListener(
            'DOMContentLoaded',
            init,
            { once: true }
        );
    } else {
        init();
    }
}(window, document));