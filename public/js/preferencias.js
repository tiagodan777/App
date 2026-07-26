(function (window, document) {
    'use strict';

    if (window.MargotPreferencias) {
        window.MargotPreferencias.aplicar();
        return;
    }

    var PREFIXO_CHAVE = 'margot-preferencias-v2';
    var CHAVE_LEGADA = 'margot-preferencias-v1';
    var CHAVE_ESCOPO_CONVIDADO = 'margot-preferencias-guest-scope-v1';
    var TIPOS = ['localizacao', 'notificacoes', 'invisivel'];
    var CONFIG = window.margotPreferencesConfig || {};
    var membroId = String(CONFIG.memberId || '').trim();
    var aSair = false;
    var sequencia = 0;
    var ultimaSequenciaPorTipo = {
        localizacao: 0,
        notificacoes: 0,
        invisivel: 0
    };
    var ultimaConclusaoPorTipo = {
        localizacao: 0,
        notificacoes: 0,
        invisivel: 0
    };
    var filaServidor = Promise.resolve();
    var promessasPorTipo = {
        localizacao: Promise.resolve(true),
        notificacoes: Promise.resolve(true),
        invisivel: Promise.resolve(true)
    };

    function tipoValido(tipo) {
        return TIPOS.indexOf(tipo) !== -1;
    }

    function normalizar(tipo, valor) {
        if (tipo === 'invisivel') return valor === true;

        return valor === true || valor === false ? valor : null;
    }

    function preferenciasVazias() {
        return {
            localizacao: null,
            notificacoes: null,
            invisivel: false
        };
    }

    function copiar(preferencias) {
        return {
            localizacao: normalizar('localizacao', preferencias.localizacao),
            notificacoes: normalizar('notificacoes', preferencias.notificacoes),
            invisivel: normalizar('invisivel', preferencias.invisivel)
        };
    }

    function criarEscopoConvidado() {
        var bytes;

        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
            bytes = new Uint8Array(16);
            window.crypto.getRandomValues(bytes);

            return Array.prototype.map.call(bytes, function (valor) {
                return valor.toString(16).padStart(2, '0');
            }).join('');
        }

        return [
            Date.now().toString(36),
            Math.random().toString(36).slice(2),
            Math.random().toString(36).slice(2)
        ].join('-');
    }

    function obterEscopoConvidado() {
        var escopo = '';

        try {
            escopo = String(
                window.sessionStorage.getItem(CHAVE_ESCOPO_CONVIDADO) || ''
            ).trim();

            if (!/^[a-z0-9-]{16,128}$/i.test(escopo)) {
                escopo = criarEscopoConvidado();
                window.sessionStorage.setItem(CHAVE_ESCOPO_CONVIDADO, escopo);
            }
        } catch (erro) {
            escopo = criarEscopoConvidado();
        }

        return escopo;
    }

    function chaveConvidado(escopo) {
        return PREFIXO_CHAVE + ':guest:' + escopo;
    }

    function limparDadosNaoAssociadosAoMembro() {
        try {
            window.localStorage.removeItem(CHAVE_LEGADA);
        } catch (erro) {
            console.warn('Não foi possível remover preferências antigas da Margot.', erro);
        }

        if (membroId === '') return;

        try {
            var chaveMembroAtual = PREFIXO_CHAVE + ':member:' + membroId;
            var chavesDeOutrosMembros = [];

            for (var indice = 0; indice < window.localStorage.length; indice++) {
                var chaveLocal = window.localStorage.key(indice);

                if (
                    typeof chaveLocal === 'string' &&
                    chaveLocal.indexOf(PREFIXO_CHAVE + ':member:') === 0 &&
                    chaveLocal !== chaveMembroAtual
                ) {
                    chavesDeOutrosMembros.push(chaveLocal);
                }
            }

            chavesDeOutrosMembros.forEach(function (chaveLocal) {
                window.localStorage.removeItem(chaveLocal);
            });

            var escopoConvidado = String(
                window.sessionStorage.getItem(CHAVE_ESCOPO_CONVIDADO) || ''
            ).trim();

            if (escopoConvidado !== '') {
                window.localStorage.removeItem(chaveConvidado(escopoConvidado));
                window.sessionStorage.removeItem(CHAVE_ESCOPO_CONVIDADO);
            }
        } catch (erro) {
            console.warn('Não foi possível limpar as preferências temporárias.', erro);
        }
    }

    limparDadosNaoAssociadosAoMembro();

    var CHAVE = membroId !== ''
        ? PREFIXO_CHAVE + ':member:' + membroId
        : chaveConvidado(obterEscopoConvidado());

    function normalizarRevision(valor) {
        var revision = String(valor || '').trim();

        if (!/^[0-9]+$/.test(revision)) return '0';

        revision = revision.replace(/^0+(?=[0-9])/, '');

        return revision || '0';
    }

    function revisionPosterior(candidata, atual) {
        var primeira = normalizarRevision(candidata);
        var segunda = normalizarRevision(atual);

        if (primeira.length !== segunda.length) {
            return primeira.length > segunda.length;
        }

        return primeira > segunda;
    }

    function lerRegistoGuardado() {
        var preferencias = preferenciasVazias();
        var revision = '0';

        try {
            var guardado = JSON.parse(window.localStorage.getItem(CHAVE) || '{}');

            if (!guardado || typeof guardado !== 'object' || Array.isArray(guardado)) {
                guardado = {};
            }

            var valores = guardado.preferences;

            if (!valores || typeof valores !== 'object' || Array.isArray(valores)) {
                valores = guardado;
            } else {
                revision = normalizarRevision(guardado.revision);
            }

            TIPOS.forEach(function (tipo) {
                preferencias[tipo] = normalizar(tipo, valores[tipo]);
            });
        } catch (erro) {
            console.warn('Não foi possível ler as preferências da Margot.', erro);
        }

        return {
            preferences: preferencias,
            revision: revision
        };
    }

    function guardar(preferencias, revision) {
        try {
            window.localStorage.setItem(CHAVE, JSON.stringify({
                preferences: copiar(preferencias),
                revision: normalizarRevision(revision)
            }));
            return true;
        } catch (erro) {
            console.warn('Não foi possível guardar as preferências da Margot.', erro);
            return false;
        }
    }

    var registoGuardado = lerRegistoGuardado();
    var estadoConfirmado = registoGuardado.preferences;
    var revisaoConfirmada = registoGuardado.revision;
    var estadoDesejado = copiar(estadoConfirmado);

    function normalizarResposta(preferencias, fallback) {
        var normalizadas = copiar(fallback || preferenciasVazias());

        if (!preferencias || typeof preferencias !== 'object' || Array.isArray(preferencias)) {
            return normalizadas;
        }

        TIPOS.forEach(function (tipo) {
            if (typeof preferencias[tipo] === 'boolean') {
                normalizadas[tipo] = preferencias[tipo];
            }
        });

        return normalizadas;
    }

    function aplicarEstadoInicialDoServidor() {
        var inicial = CONFIG.initial;

        if (
            membroId === '' ||
            !inicial ||
            typeof inicial !== 'object' ||
            Array.isArray(inicial)
        ) {
            return;
        }

        estadoConfirmado = normalizarResposta(inicial, preferenciasVazias());
        estadoDesejado = copiar(estadoConfirmado);
        guardar(estadoConfirmado, revisaoConfirmada);
    }

    function guardarNoServidor(tipo, valor) {
        if (!CONFIG.url || !CONFIG.csrfToken || !window.fetch) {
            return Promise.reject(new Error('preferences-server-unavailable'));
        }

        var body = new URLSearchParams();
        body.set('type', tipo);
        body.set('value', valor ? '1' : '0');
        body.set('_csrf', String(CONFIG.csrfToken));

        return window.fetch(String(CONFIG.url), {
            method: 'POST',
            body: body,
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-CSRF-Token': String(CONFIG.csrfToken),
                'X-Requested-With': 'XMLHttpRequest'
            }
        }).then(function (response) {
            return response.json().catch(function () {
                return {};
            }).then(function (data) {
                if (
                    !response.ok ||
                    data.success !== true ||
                    !data.preferences ||
                    typeof data.preferences !== 'object' ||
                    !/^[0-9]+$/.test(String(data.revision || ''))
                ) {
                    throw new Error(data.message || 'preferences-sync-failed');
                }

                return {
                    preferences: data.preferences,
                    revision: normalizarRevision(data.revision)
                };
            });
        });
    }

    function sincronizarDesejadoComConfirmado() {
        TIPOS.forEach(function (tipo) {
            if (ultimaSequenciaPorTipo[tipo] === ultimaConclusaoPorTipo[tipo]) {
                estadoDesejado[tipo] = estadoConfirmado[tipo];
            }
        });
    }

    function obter(tipo) {
        return tipoValido(tipo) ? estadoDesejado[tipo] : null;
    }

    function foiEscolhida(tipo) {
        return tipoValido(tipo) && typeof obter(tipo) === 'boolean';
    }

    function estaAtiva(tipo) {
        if (!tipoValido(tipo)) return false;
        if (tipo === 'invisivel') return obter(tipo) === true;

        return obter(tipo) === true;
    }

    function estaInvisivel() {
        return obter('invisivel') === true;
    }

    function aplicar(preferencias) {
        var aplicadas = copiar(preferencias || estadoConfirmado);

        window.disableLocationTracking = aplicadas.localizacao !== true;
        window.disableNotifications = aplicadas.notificacoes !== true;
        window.margotInvisible = aplicadas.invisivel === true;
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
            detail: Object.assign({
                confirmed: true,
                revision: revisaoConfirmada
            }, copiar(preferencias))
        }));
    }

    function confirmarAlteracao(tipo, valor, numeroSequencia) {
        return guardarNoServidor(tipo, valor).then(function (registo) {
            if (aSair) return false;

            ultimaConclusaoPorTipo[tipo] = numeroSequencia;

            if (revisionPosterior(registo.revision, revisaoConfirmada)) {
                estadoConfirmado = normalizarResposta(
                    registo.preferences,
                    estadoConfirmado
                );
                revisaoConfirmada = registo.revision;
                guardar(estadoConfirmado, revisaoConfirmada);
                aplicar(estadoConfirmado);
                emitirAlteracao(estadoConfirmado);
            }

            sincronizarDesejadoComConfirmado();

            return estadoConfirmado[tipo] === valor;
        }).catch(function () {
            if (numeroSequencia === ultimaSequenciaPorTipo[tipo]) {
                ultimaConclusaoPorTipo[tipo] = numeroSequencia;
                estadoDesejado[tipo] = estadoConfirmado[tipo];
            }

            window.dispatchEvent(new CustomEvent('margot:preferencias-sync-error', {
                detail: {
                    type: tipo,
                    confirmedValue: estadoConfirmado[tipo]
                }
            }));

            return false;
        });
    }

    function definir(tipo, valor) {
        if (
            aSair ||
            !tipoValido(tipo) ||
            typeof valor !== 'boolean'
        ) {
            return false;
        }

        estadoDesejado[tipo] = valor;

        if (membroId === '' || !CONFIG.url) {
            estadoConfirmado = copiar(estadoDesejado);

            if (!guardar(estadoConfirmado, revisaoConfirmada)) {
                promessasPorTipo[tipo] = Promise.resolve(false);
                return false;
            }

            aplicar(estadoConfirmado);
            emitirAlteracao(estadoConfirmado);
            promessasPorTipo[tipo] = Promise.resolve(true);
            return true;
        }

        sequencia += 1;
        var numeroSequencia = sequencia;
        ultimaSequenciaPorTipo[tipo] = numeroSequencia;

        var processarAlteracao = function () {
            if (numeroSequencia !== ultimaSequenciaPorTipo[tipo]) {
                return false;
            }

            return confirmarAlteracao(tipo, valor, numeroSequencia);
        };

        filaServidor = filaServidor.then(
            processarAlteracao,
            processarAlteracao
        );
        promessasPorTipo[tipo] = filaServidor;

        return true;
    }

    function quandoConfirmada(tipo) {
        if (!tipoValido(tipo)) return Promise.resolve(false);

        return promessasPorTipo[tipo];
    }

    function alternarInvisivel() {
        var novoEstado = !estaInvisivel();

        return definir('invisivel', novoEstado) ? novoEstado : estaInvisivel();
    }

    function limparParaSaida() {
        aSair = true;

        try {
            window.localStorage.removeItem(CHAVE);
            window.localStorage.removeItem(CHAVE_LEGADA);
            window.sessionStorage.removeItem(CHAVE_ESCOPO_CONVIDADO);
        } catch (erro) {
            console.warn('Não foi possível limpar as preferências locais.', erro);
        }
    }

    aplicarEstadoInicialDoServidor();

    window.MargotPreferencias = {
        obter: obter,
        definir: definir,
        foiEscolhida: foiEscolhida,
        estaAtiva: estaAtiva,
        estaInvisivel: estaInvisivel,
        alternarInvisivel: alternarInvisivel,
        quandoConfirmada: quandoConfirmada,
        todas: function () {
            return copiar(estadoDesejado);
        },
        confirmadas: function () {
            return copiar(estadoConfirmado);
        },
        aplicar: aplicar,
        limparParaSaida: limparParaSaida,
        storageKey: CHAVE
    };

    window.addEventListener('storage', function (evento) {
        if (aSair || evento.key !== CHAVE) return;

        if (evento.newValue === null) {
            estadoConfirmado = preferenciasVazias();
            sincronizarDesejadoComConfirmado();
            aplicar(estadoConfirmado);
            emitirAlteracao(estadoConfirmado);
            return;
        }

        var registo = lerRegistoGuardado();

        if (
            membroId !== '' &&
            !revisionPosterior(registo.revision, revisaoConfirmada)
        ) {
            return;
        }

        estadoConfirmado = registo.preferences;
        revisaoConfirmada = registo.revision;
        sincronizarDesejadoComConfirmado();
        aplicar(estadoConfirmado);
        emitirAlteracao(estadoConfirmado);
    });

    document.addEventListener('submit', function (evento) {
        var formulario = evento.target;

        if (!formulario || typeof formulario.action !== 'string') return;

        try {
            var caminho = new URL(formulario.action, window.location.href)
                .pathname
                .replace(/\/+$/, '');

            if (
                caminho.endsWith('/logout') ||
                caminho.endsWith('/delete-account')
            ) {
                limparParaSaida();
            }
        } catch (erro) {
            return;
        }
    });

    aplicar(estadoConfirmado);
})(window, document);
