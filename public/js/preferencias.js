(function (window) {
    'use strict';

    if (window.MargotPreferencias) {
        window.MargotPreferencias.aplicar();
        return;
    }

    var CHAVE = 'margot-preferencias-v1';
    var TIPOS = ['localizacao', 'notificacoes'];

    function normalizar(valor) {
        return valor === true || valor === false ? valor : null;
    }

    function ler() {
        var preferencias = { localizacao: null, notificacoes: null };

        try {
            var guardado = JSON.parse(window.localStorage.getItem(CHAVE) || '{}');

            TIPOS.forEach(function (tipo) {
                preferencias[tipo] = normalizar(guardado[tipo]);
            });
        } catch (erro) {
            console.warn('Não foi possível ler as preferências da Margot.', erro);
        }

        return preferencias;
    }

    function guardar(preferencias) {
        try {
            window.localStorage.setItem(CHAVE, JSON.stringify(preferencias));
        } catch (erro) {
            console.warn('Não foi possível guardar as preferências da Margot.', erro);
        }
    }

    function obter(tipo) {
        return TIPOS.includes(tipo) ? ler()[tipo] : null;
    }

    function foiEscolhida(tipo) {
        return typeof obter(tipo) === 'boolean';
    }

    function estaAtiva(tipo) {
        return obter(tipo) !== false;
    }

    function aplicar() {
        window.disableLocationTracking = obter('localizacao') === false;
        window.disableNotifications = obter('notificacoes') === false;
    }

    function definir(tipo, valor) {
        if (!TIPOS.includes(tipo) || typeof valor !== 'boolean') return false;

        var preferencias = ler();
        preferencias[tipo] = valor;

        guardar(preferencias);
        aplicar();

        window.dispatchEvent(new CustomEvent('margot:preferencias-alteradas', {
            detail: Object.assign({}, preferencias)
        }));

        return true;
    }

    window.MargotPreferencias = {
        obter: obter,
        definir: definir,
        foiEscolhida: foiEscolhida,
        estaAtiva: estaAtiva,
        todas: ler,
        aplicar: aplicar
    };

    window.addEventListener('storage', function (evento) {
        if (evento.key !== CHAVE) return;

        aplicar();

        window.dispatchEvent(new CustomEvent('margot:preferencias-alteradas', {
            detail: ler()
        }));
    });

    aplicar();
})(window);