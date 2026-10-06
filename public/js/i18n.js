/* Presentation only. Identifiers, URLs, form data and member content stay unchanged. */
(function (window, document) {
    'use strict';
    if (window.MargotI18n) return;

    var dictionary = window.MargotEnglish || {};
    var preference = window.navigator.language || (window.navigator.languages || [])[0] || '';
    var language = /^pt(?:[-_]|$)/i.test(preference.trim()) ? 'pt' : 'en';
    var locale = language === 'pt' ? 'pt-PT' : 'en-GB';
    var own = Object.prototype.hasOwnProperty;
    var records = new WeakMap();
    var excluded = [
        'script', 'style', 'svg', 'code', 'pre', 'textarea', '[contenteditable]',
        '[translate="no"]', '[data-i18n-skip]', '[data-hoje-nota]',
        '.perfil-gosto-nome', '.gosto-selecionado', '.perfil-identidade h1', '.perfil-sobre > p', '.mini-menu header h1',
        '.mini-menu-perfil img', '.chat-pessoa strong', '.chat-balao > p',
        '.chat-quote', '.chat-reply-label', '#chat-reply-preview span',
        '.conversa-conteudo > strong', '.conversa-resumo', '#conversa-acoes-nome',
        '.mensagem-aviso-corpo > span', '.hey-item-nome', '.bloqueados-item > strong',
        '.daylie-caption', '.daylie-stage img', '.daylie-draft-preview img',
        '.invite-code', '.invitation-applied-code', '#invite-code', '[data-invitation-code]', '.convite-codigo',
        '#dados-apagar > p:first-of-type > strong', '.delete-account-mensagem strong'
    ].join(',');
    var attributes = ['placeholder', 'aria-label', 'title', 'alt'];

    function exact(source) {
        var key = source.replace(/\s+/g, ' ').trim();
        var value = own.call(dictionary, key) ? dictionary[key] : null;
        return typeof value === 'string'
            ? source.match(/^\s*/)[0] + value + source.match(/\s*$/)[0]
            : source;
    }

    // These expressions are restricted to UI text; captures are never translated.
    var patterns = [
        [/^(.+) enviou-te um Hey\.$/, '$1 sent you a Hey.'],
        [/^(.+) recebeu o teu Hey$/, '$1 received your Hey'],
        [/^Mudar tom de pele, opção (\d+) de (\d+)$/, 'Change skin tone, option $1 of $2'],
        [/^(\d+) fotografias$/, '$1 photos'],
        [/^Remover (.+)$/, 'Remove $1'],
        [/^Bloquear (.+)\? Deixam de se ver e já não poderão trocar mensagens\.$/, 'Block $1? You will no longer see each other or be able to exchange messages.'],
        [/^Eliminar a conversa com (.+)\? A conversa será removida apenas para ti\.$/, 'Delete the conversation with $1? It will only be removed for you.'],
        [/^Tu e (.+) estão ligados$/, 'You and $1 are connected'],
        [/^Respondeste a (.+)$/, 'You replied to $1'],
        [/^(.+) respondeu-te$/, '$1 replied to you'],
        [/^(.+) respondeu à própria mensagem$/, '$1 replied to their own message'],
        [/^Nova mensagem de (.+)$/, 'New message from $1'],
        [/^(\d+) novas mensagens de (.+)$/, '$1 new messages from $2'],
        [/^Fotografia enviada por (.+)$/, 'Photo sent by $1'],
        [/^Fotografia (\d+) de (.+)$/, 'Photo $1 of $2'],
        [/^Fotografias de (.+)$/, 'Photos of $1'],
        [/^Foto de perfil de (.+)$/, 'Profile photo of $1'],
        [/^Fotografia de (.+)$/, 'Photo of $1'],
        [/^Conversa com (.+)$/, 'Conversation with $1'],
        [/^Abrir perfil de (.+)$/, 'Open $1’s profile'],
        [/^Desconectar de (.+)$/, 'Disconnect from $1'],
        [/^Conectar com (.+)$/, 'Connect with $1'],
        [/^(.+) ainda não adicionou fotografias$/, '$1 has not added any photos yet'],
        [/^Podes enviar outro Hey dentro de (\d+) minuto(s?)\.$/, 'You can send another Hey in $1 minute$2.'],
        [/^Podes enviar outro Hey dentro de (\d+) segundo(s?)\.$/, 'You can send another Hey in $1 second$2.'],
        [/^Reagir (.+)$/, 'React $1'],
        [/^(\d+) Hey(s?) por ler$/, '$1 unread Hey$2'],
        [/^Foto de perfil (\d+)$/, 'Profile photo $1'],
        [/^Ver mensagem original: ([\s\S]*)$/, 'View original message: $1']
    ];

    function t(source) {
        if (language === 'pt' || typeof source !== 'string') return source;
        var result = exact(source);
        if (result !== source) return result;
        for (var i = 0; i < patterns.length; i++) {
            if (patterns[i][0].test(source)) return source.replace(patterns[i][0], patterns[i][1]);
        }
        // Garment/colour labels consist of known catalogue entries only.
        var parts = source.split(' · ');
        if (parts.length > 1 && parts.every(function (part) { return own.call(dictionary, part); })) {
            return parts.map(exact).join(' · ');
        }
        return source;
    }

    function blocked(element) {
        return !element || Boolean(element.closest(excluded));
    }

    function update(node, key, current, write) {
        var entry = records.get(node);
        if (!entry) {
            entry = Object.create(null);
            records.set(node, entry);
        }
        if (entry[key] === current) return;
        var translated = t(current);
        entry[key] = translated;
        if (translated !== current) write(translated);
    }

    function textNode(node) {
        var parent = node.parentElement;
        if (blocked(parent) || parent.closest('.meu-hobbie,[data-sugerir-gosto],[data-resultado-gosto]')) return;
        // An option without an explicit value submits its text as form data.
        if (parent.tagName === 'OPTION' && !parent.hasAttribute('value')) return;
        if (parent.tagName === 'TITLE' && (/\/profile(?:\/|$)/.test(window.location.pathname) || document.querySelector('#perfil-galeria'))) return;
        update(node, 'text', node.nodeValue, function (value) { node.nodeValue = value; });
    }

    function elementAttributes(element) {
        if (blocked(element)) return;
        attributes.forEach(function (name) {
            if (!element.hasAttribute(name)) return;
            update(element, name, element.getAttribute(name), function (value) {
                element.setAttribute(name, value);
            });
        });
        // The existing submit controls have no name, so their labels are not submitted.
        if (element.matches('input[type="submit"]:not([name]),input[type="button"]:not([name])')) {
            update(element, 'value', element.value, function (value) { element.value = value; });
        }
        if (element.matches('meta[name="description"]')) {
            update(element, 'content', element.content, function (value) { element.content = value; });
        }
        if (element.matches('time.hey-item-data[datetime]')) {
            var value = element.getAttribute('datetime').trim().replace(' ', 'T');
            if (!/[zZ]|[+-]\d\d:\d\d$/.test(value)) value += 'Z';
            var date = new Date(value);
            if (!Number.isNaN(date.getTime())) {
                var formatted = new Intl.DateTimeFormat(locale, {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                }).format(date);
                if (element.textContent !== formatted && element.childNodes.length === 1 && element.firstChild.nodeType === 3) {
                    element.firstChild.nodeValue = formatted;
                }
            }
        }
    }

    function translate(root) {
        if (language === 'pt' || !root || !root.isConnected) return;
        if (root.nodeType === 3) {
            textNode(root);
            return;
        }
        if (root.nodeType !== 1 && root.nodeType !== 9) return;
        if (root.nodeType === 1) {
            if (blocked(root)) return;
            elementAttributes(root);
        }
        var walker = document.createTreeWalker(root, 5, {
            acceptNode: function (node) {
                return node.nodeType === 1 && blocked(node) ? 2 : 1;
            }
        });
        for (var node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.nodeType === 3) textNode(node);
            else elementAttributes(node);
        }
    }

    window.MargotI18n = Object.freeze({ language: language, locale: locale, t: t, system: t, translate: translate });
    document.documentElement.lang = locale;
    try {
        document.cookie = 'margot_language=' + language + '; Path=/; Max-Age=31536000; SameSite=Lax' +
            (window.location.protocol === 'https:' ? '; Secure' : '');
    } catch (_) { /* Translation does not depend on cookies. */ }

    if (language === 'pt') return;

    // Browser dialogs have no DOM. Preserve their original return values and receiver.
    ['alert', 'confirm'].forEach(function (name) {
        var original = window[name];
        if (typeof original !== 'function') return;
        window[name] = function (message) { return original.call(window, t(message)); };
    });

    [window.HTMLInputElement, window.HTMLTextAreaElement, window.HTMLSelectElement].forEach(function (type) {
        if (!type || typeof type.prototype.setCustomValidity !== 'function') return;
        var original = type.prototype.setCustomValidity;
        type.prototype.setCustomValidity = function (message) { return original.call(this, t(message)); };
    });

    var observer = new MutationObserver(function (mutations) {
        var roots = new Set();
        mutations.forEach(function (mutation) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(function (node) { roots.add(node); });
            } else {
                roots.add(mutation.target);
            }
        });
        roots.forEach(function (node) {
            var parent = node.parentNode;
            while (parent && !roots.has(parent)) parent = parent.parentNode;
            if (!parent) translate(node);
        });
    });
    observer.observe(document.documentElement, {
        childList: true, characterData: true, subtree: true, attributes: true,
        attributeFilter: attributes.concat(['value', 'content'])
    });
    translate(document);
    document.addEventListener('DOMContentLoaded', function () { translate(document); }, { once: true });
})(window, document);