(function (window, document) {
    'use strict';

    if (window.MargotPreferencias) {
        window.MargotPreferencias.aplicar();
        return;
    }

    var CHAVE = 'margot-preferencias-v1';
    var TIPOS = ['localizacao', 'notificacoes', 'invisivel'];

    function tipoValido(tipo) {
        return TIPOS.indexOf(tipo) !== -1;
    }

    function normalizar(tipo, valor) {
        if (tipo === 'invisivel') return valor === true;

        return valor === true || valor === false ? valor : null;
    }

    function ler() {
        var preferencias = {
            localizacao: null,
            notificacoes: null,
            invisivel: false
        };

        try {
            var guardado = JSON.parse(window.localStorage.getItem(CHAVE) || '{}');

            if (!guardado || typeof guardado !== 'object' || Array.isArray(guardado)) {
                guardado = {};
            }

            TIPOS.forEach(function (tipo) {
                preferencias[tipo] = normalizar(tipo, guardado[tipo]);
            });
        } catch (erro) {
            console.warn('Não foi possível ler as preferências da Margot.', erro);
        }

        return preferencias;
    }

    function guardar(preferencias) {
        try {
            window.localStorage.setItem(CHAVE, JSON.stringify(preferencias));
            return true;
        } catch (erro) {
            console.warn('Não foi possível guardar as preferências da Margot.', erro);
            return false;
        }
    }

    function obter(tipo) {
        return tipoValido(tipo) ? ler()[tipo] : null;
    }

    function foiEscolhida(tipo) {
        return tipoValido(tipo) && typeof obter(tipo) === 'boolean';
    }

    function estaAtiva(tipo) {
        if (!tipoValido(tipo)) return false;
        if (tipo === 'invisivel') return obter(tipo) === true;

        return obter(tipo) !== false;
    }

    function estaInvisivel() {
        return obter('invisivel') === true;
    }

    function aplicar() {
        var preferencias = ler();

        window.disableLocationTracking = preferencias.localizacao === false;
        window.disableNotifications = preferencias.notificacoes === false;
        window.margotInvisible = preferencias.invisivel === true;
        window.disableMapPresence = window.disableLocationTracking || window.margotInvisible;

        if (document && document.documentElement) {
            document.documentElement.setAttribute(
                'data-margot-invisivel',
                window.margotInvisible ? 'true' : 'false'
            );
        }
    }

    function emitirAlteracao(preferencias) {
        window.dispatchEvent(new CustomEvent('margot:preferencias-alteradas', {
            detail: Object.assign({}, preferencias)
        }));
    }

    function definir(tipo, valor) {
        if (!tipoValido(tipo) || typeof valor !== 'boolean') return false;

        var preferencias = ler();
        preferencias[tipo] = valor;

        if (!guardar(preferencias)) return false;

        aplicar();
        emitirAlteracao(preferencias);

        return true;
    }

    function alternarInvisivel() {
        var novoEstado = !estaInvisivel();

        return definir('invisivel', novoEstado) ? novoEstado : estaInvisivel();
    }

    window.MargotPreferencias = {
        obter: obter,
        definir: definir,
        foiEscolhida: foiEscolhida,
        estaAtiva: estaAtiva,
        estaInvisivel: estaInvisivel,
        alternarInvisivel: alternarInvisivel,
        todas: ler,
        aplicar: aplicar
    };

    window.addEventListener('storage', function (evento) {
        if (evento.key !== CHAVE) return;

        aplicar();
        emitirAlteracao(ler());
    });

    aplicar();
})(window, document);