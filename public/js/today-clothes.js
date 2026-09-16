(function (window, document) {
    'use strict';

    var garmentIconSequence = 0;
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
        {
            key: 'multicolor',
            label: 'Multicolor',
            value: 'conic-gradient(#e34f61,#e7bd48,#59a36e,#5782d2,#9670c8,#e34f61)'
        }
    ];

    function pieceMeta(type) {
        return (
            PIECES.find(function (item) {
                return item.type === type;
            }) || { type: type, icon: '👕', label: 'Peça' }
        );
    }

    function colorMeta(key) {
        return (
            COLORS.find(function (item) {
                return item.key === key;
            }) || { key: key, label: '', value: '#d8d8dc' }
        );
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
            var id = 'hoje-garment-gradient-' + ++garmentIconSequence;
            var defs = svgNode('defs');
            var gradient = svgNode('linearGradient', { id: id, x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
            [
                ['0%', '#e34f61'],
                ['24%', '#e7bd48'],
                ['48%', '#59a36e'],
                ['72%', '#5782d2'],
                ['100%', '#9670c8']
            ].forEach(function (stop) {
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
            fill: options.fill === 'none' ? 'none' : options.fill || fill,
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
        return garmentPath(
            svg,
            d,
            'none',
            Object.assign({ fill: 'none', stroke: '#312d35', strokeOpacity: '0.28', strokeWidth: '1.5' }, options || {})
        );
    }

    function createGarmentIcon(type, colorKey, className) {
        var svg = svgNode('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' });
        svg.classList.add('hoje-garment-svg');
        if (className) {
            String(className)
                .split(/\s+/)
                .filter(Boolean)
                .forEach(function (name) {
                    svg.classList.add(name);
                });
        }
        var fill = garmentPaint(svg, colorKey);
        switch (type) {
            case 'shirt':
                garmentPath(
                    svg,
                    'M20 12 12 17 7 29 15 34 20 27 20 54 44 54 44 27 49 34 57 29 52 17 44 12 38 18 32 15 26 18Z',
                    fill
                );
                garmentPath(svg, 'M26 18 32 25 38 18 32 15Z', '#f4f1f5', { strokeOpacity: '0.18', strokeWidth: '1.2' });
                garmentLine(svg, 'M32 24V53');
                garmentLine(svg, 'M29.5 31h5M29.5 38h5M29.5 45h5', { strokeWidth: '1.2' });
                break;
            case 'sweater':
                garmentPath(
                    svg,
                    'M21 12 12 17 5 38 14 42 20 28 20 55 44 55 44 28 50 42 59 38 52 17 43 12C40 17 37 19 32 19S24 17 21 12Z',
                    fill
                );
                garmentLine(svg, 'M20 49h24M22 13c2 6 6 9 10 9s8-3 10-9');
                break;
            case 'hoodie':
                garmentPath(svg, 'M21 14 12 19 6 40 15 43 20 29 20 55 44 55 44 29 49 43 58 40 52 19 43 14Z', fill);
                garmentPath(svg, 'M22 16C23 7 28 4 32 4s9 3 10 12c-2 5-5 8-10 8s-8-3-10-8Z', fill, {
                    strokeOpacity: '0.18',
                    strokeWidth: '1.5'
                });
                garmentLine(svg, 'M28 24v8M36 24v8M27 45c3-2 7-2 10 0');
                break;
            case 'jacket':
                garmentPath(
                    svg,
                    'M21 12 12 17 6 40 15 43 20 28 20 55 44 55 44 28 49 43 58 40 52 17 43 12 32 18Z',
                    fill
                );
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
                garmentPath(svg, 'M13 44c7-10 14-17 24-22l9 5c-6 9-13 17-23 26-7 5-15-2-10-9Z', fill, {
                    strokeOpacity: '0.22'
                });
                garmentLine(svg, 'M24 34c7 0 12 3 15 8M30 29l8 14');
                break;
            case 'cap':
                garmentPath(svg, 'M14 34c1-13 8-21 19-21s19 8 20 21Z', fill);
                garmentPath(svg, 'M32 34h25c0 6-9 9-25 7Z', fill, { strokeOpacity: '0.18', strokeWidth: '1.4' });
                garmentLine(svg, 'M33 14v20');
                break;
            case 'hat':
                garmentPath(svg, 'M21 12h22l5 27H16Z', fill);
                garmentPath(svg, 'M7 39c6-4 15-6 25-6s19 2 25 6c-4 7-14 11-25 11S11 46 7 39Z', fill, {
                    strokeOpacity: '0.18',
                    strokeWidth: '1.4'
                });
                garmentLine(svg, 'M18 31h28');
                break;
            case 'glasses':
                garmentPath(
                    svg,
                    'M8 25c8-3 16-3 22 1l2 4 2-4c6-4 14-4 22-1l-3 18c-8 5-16 2-20-6h-2c-4 8-12 11-20 6Z',
                    fill,
                    { strokeOpacity: '0.28' }
                );
                garmentLine(svg, 'M30 30h4');
                break;
            case 'backpack':
                garmentPath(svg, 'M18 22c0-10 5-16 14-16s14 6 14 16l6 28c-5 5-12 8-20 8s-15-3-20-8Z', fill);
                garmentLine(svg, 'M23 22c0-7 3-11 9-11s9 4 9 11M16 35h32M23 39h18v11H23Z');
                break;
            case 'tshirt':
            default:
                garmentPath(
                    svg,
                    'M21 12 12 17 6 29 15 34 20 27 20 54 44 54 44 27 49 34 58 29 52 17 43 12C40 17 37 19 32 19S24 17 21 12Z',
                    fill
                );
                garmentLine(svg, 'M22 13c2 6 5 9 10 9s8-3 10-9');
                break;
        }
        return svg;
    }
    window.MargotClothes = {
        pieces: PIECES,
        colors: COLORS,
        piece: pieceMeta,
        color: colorMeta,
        icon: createGarmentIcon
    };
})(window, document);
