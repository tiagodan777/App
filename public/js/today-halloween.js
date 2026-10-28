(function (window, document) {
    'use strict';

    if (window.MargotHalloween && window.MargotHalloween.destroy) {
        window.MargotHalloween.destroy();
    }

    var pageActive = true;
    var script = document.currentScript;
    var url = script && script.dataset.catalogUrl;
    var originalPiece = window.MargotClothes.piece;
    var originalIcon = window.MargotClothes.icon;
    var items = [], groups = [], lookup = new Map();
    var mode = 'normal', kind = 'costume', query = '', category = '';
    var controls = null, dialog = null, refresh = null;
    var returnType = '', returnFocus = null;

    var api = {
        enabled: false,
        version: '',
        ready: null,
        find: find,
        render: render,
        closeDetail: closeDetail,
        decorateStatus: decorateStatus,
        destroy: destroy
    };

    window.MargotHalloween = api;

    function node(tag, cls, text) {
        var el = document.createElement(tag);

        if (cls) el.className = cls;
        if (text !== undefined) el.textContent = text;

        return el;
    }

    function button(cls, text, action) {
        var el = node('button', cls, text);
        el.type = 'button';

        if (action) el.addEventListener('click', action);

        return el;
    }

    function find(type) {
        return api.enabled
            ? lookup.get(String(type)) || null
            : null;
    }

    function fold(s) {
        return String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function art(item, cls) {
        var el = node('span', 'hw-garment ' + (cls || ''));

        el.setAttribute('aria-hidden', 'true');
        el.style.backgroundImage = 'url("' + item.asset + '")';
        el.style.backgroundPosition =
            (item.cell % 3 * 50) + '% ' +
            (Math.floor(item.cell / 3) * 100 / 3) + '%';
        el.style.aspectRatio = String(item.aspect);

        return el;
    }

    // Instalado antes de today.js guardar as referências aos renderizadores.
    window.MargotClothes.piece = function (type) {
        var item = find(type);

        return item
            ? {type: item.id, label: item.label, icon: '🎃'}
            : originalPiece(type);
    };

    window.MargotClothes.icon = function (type, color, cls) {
        var item = find(type);

        return item
            ? art(item, cls)
            : originalIcon(type, color, cls);
    };

    var catalogController = new AbortController();
    var catalogTimer, cancelCatalog;

    var catalogTimeout = new Promise(function (_, reject) {
        cancelCatalog = reject;

        catalogTimer = window.setTimeout(function () {
            catalogController.abort();
            reject(new Error('catalog_timeout'));
        }, 8000);
    });

    api.ready = url
        ? Promise.race([
            window.fetch(url, {
                credentials: 'same-origin',
                cache: 'no-store',
                signal: catalogController.signal,
                headers: {Accept: 'application/json'}
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error('catalog_' + response.status);
                }

                return response.json();
            }),
            catalogTimeout
        ]).then(function (payload) {
            if (!pageActive) {
                throw new Error('page_left');
            }

            if (
                !payload.success ||
                !payload.catalog ||
                payload.catalog.version !== 'hw26-pilot-1'
            ) {
                throw new Error('catalog_version');
            }

            items = payload.catalog.items;
            groups = payload.catalog.groups;

            if (!Array.isArray(items) || !Array.isArray(groups)) {
                throw new Error('catalog_invalid');
            }

            lookup = new Map(items.map(function (item) {
                return [item.id, item];
            }));

            api.version = payload.catalog.version;
            api.enabled = true;

            return true;
        }).catch(function () {
            // A coleção normal continua disponível se o catálogo falhar.
            api.enabled = false;
            items = [];
            groups = [];
            lookup.clear();

            return false;
        }).finally(function () {
            window.clearTimeout(catalogTimer);
        })
        : Promise.resolve(false);

    if (!url) {
        window.clearTimeout(catalogTimer);
    }

    function destroy() {
        if (!pageActive) return;

        pageActive = false;
        api.enabled = false;
        lookup.clear();

        catalogController.abort();
        window.clearTimeout(catalogTimer);

        if (url && cancelCatalog) {
            cancelCatalog(new Error('page_left'));
        }

        if (dialog) {
            dialog.remove();
            dialog = null;
        }

        document.removeEventListener('margot:page-leave', destroy);

        if (window.MargotHalloween === api) {
            window.MargotHalloween = null;
        }
    }

    document.addEventListener(
        'margot:page-leave',
        destroy,
        {once: true}
    );

    function decorateStatus(box, status) {
        var selection = status && Array.isArray(status.clothes)
            ? status.clothes
            : [];

        var first = selection.map(function (x) {
            return find(x.type);
        }).find(function (x) {
            return x && x.kind === 'costume';
        }) || selection.map(function (x) {
            return find(x.type);
        }).find(Boolean);

        box.classList.toggle('hw-status', Boolean(first));

        if (box.dataset.editable === '1') {
            // O botão + continua a abrir o editor.
            if (first) {
                box.removeAttribute('role');
                box.removeAttribute('tabindex');
                box.removeAttribute('aria-label');
            } else {
                box.setAttribute('role', 'button');
                box.tabIndex = 0;
                box.setAttribute(
                    'aria-label',
                    'Editar a tua nota e roupa de hoje'
                );
            }
        }

        if (!first) return;

        var container = box.querySelector('[data-hoje-roupa]');
        if (!container) return;

        var open = button('hw-status-open', '', function (event) {
            event.stopPropagation();
            returnFocus = open;
            openStatusDetail(selection, first);
        });

        open.setAttribute('aria-haspopup', 'dialog');

        open.setAttribute(
            'aria-label',
            'Ver roupa de hoje: ' + first.label +
            (
                selection.length > 1
                    ? ' e mais ' + (selection.length - 1) + ' peças'
                    : ''
            )
        );

        open.appendChild(art(first));

        var caption = node('span', 'hw-status-caption');

        caption.append(
            node('strong', '', first.label),
            node(
                'small',
                '',
                selection.length > 1
                    ? '+' + (selection.length - 1) + ' peças · Ver roupa'
                    : 'Ver roupa ›'
            )
        );

        open.appendChild(caption);
        container.replaceChildren(open);
    }

    function ensureDialog() {
        if (dialog) return;

        dialog = node('dialog', 'hw-detail');
        dialog.setAttribute('aria-labelledby', 'hw-detail-title');
        document.body.appendChild(dialog);

        dialog.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.stopPropagation();
            }
        });

        dialog.addEventListener('close', function () {
            var target = returnFocus ||
                Array.from(document.querySelectorAll('.hw-card'))
                    .find(function (x) {
                        return x.dataset.type === returnType;
                    });

            if (target && target.isConnected) {
                target.focus({preventScroll: true});
            }
        });
    }

    function openStatusDetail(selection, main) {
        ensureDialog();
        dialog.replaceChildren();

        var close = button('hw-close', '×', closeDetail);
        close.setAttribute('aria-label', 'Fechar roupa');

        var stage = node('div', 'hw-detail-art');
        stage.appendChild(art(main));

        var content = node('div', 'hw-detail-content');
        var title = node('h2', '', main.label);
        title.id = 'hw-detail-title';

        content.append(
            node(
                'small',
                'hw-kind',
                main.kind === 'costume'
                    ? 'Disfarce completo · Hoje'
                    : 'Peças de Halloween · Hoje'
            ),
            title,
            node('p', 'hw-source', main.inspiration || main.world)
        );

        var list = node('ul', 'hw-worn-list');

        selection.filter(function (x) {
            return x.type !== main.id;
        }).forEach(function (x) {
            var meta = window.MargotClothes.piece(x.type);
            var color = window.MargotClothes.color(x.color);
            var li = node('li');
            var icon = node('span', 'hw-worn-icon');

            icon.appendChild(
                window.MargotClothes.icon(x.type, x.color, '')
            );

            li.append(
                icon,
                node(
                    'span',
                    '',
                    meta.label + (color.label ? ' · ' + color.label : '')
                )
            );

            list.appendChild(li);
        });

        if (list.childElementCount) {
            content.appendChild(list);
        }

        content.appendChild(
            node(
                'p',
                'hw-detail-hint',
                'A roupa acompanha o estado Hoje e desaparece quando esse estado termina.'
            )
        );

        dialog.append(close, stage, content);
        dialog.showModal();
        close.focus({preventScroll: true});
    }

    function ensureControls(grid) {
        if (controls) return;

        controls = node('section', 'hw-controls');
        controls.setAttribute('aria-label', 'Coleção de roupa');

        var tabs = node('div', 'hw-tabs');

        ['normal', 'halloween'].forEach(function (value) {
            var b = button(
                '',
                value === 'normal' ? 'Normal' : 'Halloween',
                function () {
                    mode = value;
                    query = '';
                    category = '';
                    controls.querySelector('input').value = '';
                    refresh();
                }
            );

            b.dataset.mode = value;
            tabs.appendChild(b);
        });

        var panel = node('div', 'hw-panel');
        var types = node('div', 'hw-types');

        [
            ['costume', 'Disfarces completos', 'Um conjunto já pronto.'],
            ['piece', 'Peças soltas', 'Combina roupa e acessórios.']
        ].forEach(function (entry) {
            var b = button('', '', function () {
                kind = entry[0];
                category = '';
                refresh();
            });

            b.dataset.kind = entry[0];

            b.append(
                node('strong', '', entry[1]),
                node('small', '', entry[2])
            );

            types.appendChild(b);
        });

        var label = node('label', 'hw-search');
        label.appendChild(node('span', '', 'Pesquisar na coleção'));

        var search = node('input');
        search.type = 'search';
        search.placeholder = 'Filme, série, artista ou peça…';

        search.addEventListener('input', function () {
            query = search.value;
            refresh();
        });

        label.appendChild(search);

        var filters = node('div', 'hw-filters');
        filters.setAttribute('aria-label', 'Categoria');

        var count = node('p', 'hw-count');
        count.setAttribute('aria-live', 'polite');

        panel.append(types, label, filters, count);
        controls.append(tabs, panel);
        grid.before(controls);
    }

    function syncControls() {
        controls.querySelectorAll('[data-mode]').forEach(function (b) {
            b.setAttribute(
                'aria-pressed',
                String(b.dataset.mode === mode)
            );
        });

        controls.querySelectorAll('[data-kind]').forEach(function (b) {
            b.setAttribute(
                'aria-pressed',
                String(b.dataset.kind === kind)
            );
        });

        controls.querySelector('.hw-panel').hidden =
            mode !== 'halloween';

        var filters = controls.querySelector('.hw-filters');
        var focused = document.activeElement &&
            document.activeElement.dataset.category;
        var scroll = filters.scrollLeft;

        filters.replaceChildren();

        var categories = [{id: '', label: 'Todos'}];

        if (kind === 'costume') {
            categories.push({id: 'new', label: 'Novidades'});
        }

        categories.concat(
            groups.filter(function (g) {
                return g.kind === kind;
            })
        ).forEach(function (g) {
            var b = button('', g.label, function () {
                category = g.id;
                refresh();
            });

            b.dataset.category = g.id;

            b.setAttribute(
                'aria-pressed',
                String(category === g.id)
            );

            filters.appendChild(b);

            if (focused !== undefined && focused === g.id) {
                b.focus({preventScroll: true});
            }
        });

        filters.scrollLeft = scroll;
    }

    function render(grid, selection, change, rerender) {
        if (!api.enabled) return false;

        refresh = rerender;
        ensureControls(grid);
        syncControls();

        grid.classList.toggle('hw-grid', mode === 'halloween');

        var view = document.getElementById('hoje-editor-roupa');

        if (view) {
            view.classList.toggle('hw-mode', mode === 'halloween');
        }

        if (mode !== 'halloween') return false;

        var terms = fold(query).split(/\s+/).filter(Boolean);

        var visible = items.filter(function (item) {
            var haystack = fold(
                [
                    item.label,
                    item.inspiration,
                    item.world,
                    item.category
                ].join(' ')
            );

            return item.kind === kind &&
                (
                    !category ||
                    (
                        category === 'new'
                            ? item.isNew
                            : item.sheet === category
                    )
                ) &&
                terms.every(function (term) {
                    return haystack.includes(term);
                });
        }).sort(function (a, b) {
            return Number(b.isNew) - Number(a.isNew);
        });

        controls.querySelector('.hw-count').textContent =
            visible.length +
            (
                kind === 'costume'
                    ? ' disfarces completos'
                    : ' peças soltas'
            );

        grid.replaceChildren();

        visible.forEach(function (item) {
            var chosen = selection.some(function (x) {
                return x.type === item.id;
            });

            var card = button('hw-card', '', function () {
                openDetail(item, selection, change);
            });

            card.dataset.type = item.id;
            card.setAttribute('aria-pressed', String(chosen));
            card.setAttribute('aria-haspopup', 'dialog');

            var image = node('span', 'hw-card-art');
            image.appendChild(art(item));

            card.append(
                image,
                node(
                    'small',
                    'hw-kind',
                    item.kind === 'costume'
                        ? 'Disfarce completo'
                        : 'Peça solta'
                ),
                node('strong', '', item.label),
                node(
                    'span',
                    'hw-source',
                    item.inspiration || item.world
                )
            );

            grid.appendChild(card);
        });

        if (!visible.length) {
            grid.appendChild(
                node(
                    'p',
                    'hw-empty',
                    'Não encontrámos essa escolha. Experimenta outro nome ou categoria.'
                )
            );
        }

        return true;
    }

    function closeDetail() {
        if (dialog && dialog.open) {
            dialog.close();
        }
    }

    function openDetail(item, selection, change) {
        ensureDialog();

        returnFocus = null;
        returnType = item.id;
        dialog.replaceChildren();

        var close = button('hw-close', '×', closeDetail);
        close.setAttribute('aria-label', 'Fechar detalhes');

        var stage = node('div', 'hw-detail-art');
        stage.appendChild(art(item));

        var content = node('div', 'hw-detail-content');
        var title = node('h2', '', item.label);
        title.id = 'hw-detail-title';

        var error = node('p', 'hw-error');
        error.setAttribute('role', 'alert');

        var choose = button(
            'hw-choose',
            item.kind === 'costume'
                ? 'Usar este disfarce'
                : 'Adicionar esta peça',
            function () {
                var next = selection.slice();

                if (!next.some(function (x) {
                    return x.type === item.id;
                })) {
                    if (item.kind === 'costume') {
                        next = next.filter(function (x) {
                            var meta = find(x.type);
                            return !meta || meta.kind !== 'costume';
                        });
                    }

                    if (next.length >= 5) {
                        error.textContent =
                            'Podes escolher até 5 elementos. Remove um para acrescentar outro.';
                        return;
                    }

                    next.push({type: item.id, color: ''});
                }

                change(next);
                closeDetail();
            }
        );

        content.append(
            node(
                'small',
                'hw-kind',
                item.kind === 'costume'
                    ? 'Disfarce completo'
                    : 'Peça solta'
            ),
            title,
            node('p', 'hw-source', item.inspiration || item.world),
            node(
                'p',
                'hw-detail-hint',
                item.kind === 'costume'
                    ? 'Conta como uma escolha. Substitui o disfarce completo anterior e mantém os acessórios.'
                    : 'Combina esta peça com as restantes. Até 5 elementos no total.'
            ),
            error,
            choose
        );

        dialog.append(close, stage, content);
        dialog.showModal();
        close.focus({preventScroll: true});
    }
})(window, document);