(function () {
    'use strict';

    // Classificação dos nomes existentes na base de dados.
    var temas = [
        ['Música', /\b(musica|cantar|canto|guitarra|piano|concertos?|festivais?|rock|pop|jazz|rap|hip hop|techno|metal|dj|fado|bateria|violino)\b/],
        ['Cinema e séries', /\b(cinema|filmes?|series?|anime|netflix|documentarios?|marvel)\b/],
        ['Desporto e movimento', /\b(desporto|futebol|futsal|basquetebol|basket|tenis|padel|ginasio|fitness|corrida|correr|natacao|nadar|surf|yoga|pilates|danca|dancar|ciclismo|bicicleta|voleibol|boxe|skate|escalada)\b/],
        ['Jogos e tecnologia', /\b(jogos?|gaming|videojogos?|xadrez|playstation|nintendo|xbox|tecnologia|programacao|informatica|computadores?)\b/],
        ['Viagens e natureza', /\b(viagens?|viajar|praia|mar|natureza|caminhadas?|trilhos?|campismo|acampar|montanha|animais|caes|gatos|jardinagem|aventura)\b/],
        ['Arte e cultura', /\b(arte|pintura|pintar|desenho|desenhar|fotografia|ler|leitura|livros?|escrita|escrever|teatro|museus?|poesia|moda|design|artesanato)\b/],
        ['Comida e convívio', /\b(cozinhar|cozinha|culinaria|comida|gastronomia|restaurantes?|cafe|vinho|sushi|pizza|pastelaria|amigos|conversar|festas?|sair)\b/]
    ];

    var catalogo;
    var pedidoCatalogo;
    var pesquisaTimer;
    var pesquisaVersao = 0;
    var painelAtual;

    function chave(valor) {
        return String(valor || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function agrupar(lista) {
        var grupos = temas.map(function (tema) {
            return { nome: tema[0], gostos: [] };
        });

        grupos.push({ nome: 'Outros', gostos: [] });

        var vistos = new Set();

        lista.forEach(function (item) {
            var nome = String(item.nome || '').trim();
            var key = chave(nome);

            if (
                !key ||
                Array.from(nome).length > 80 ||
                vistos.has(key)
            ) {
                return;
            }

            vistos.add(key);

            var indice = temas.findIndex(function (tema) {
                return tema[1].test(key);
            });

            if (indice < 0) {
                indice = temas.length;
            }

            if (grupos[indice].gostos.length < 5) {
                grupos[indice].gostos.push(nome);
            }
        });

        return grupos.filter(function (grupo) {
            return grupo.gostos.length;
        });
    }

    function dados() {
        var valor = window.createAccountDados;

        return valor && Array.isArray(valor.gostos)
            ? valor
            : null;
    }

    function selecionado(nome) {
        return Boolean(
            dados()?.gostos.some(function (item) {
                return chave(item) === chave(nome);
            })
        );
    }

    function aviso(texto) {
        var el = painelAtual?.querySelector('[data-gostos-aviso]');
        if (!el) return;

        el.textContent = texto;
        el.hidden = !texto;
    }

    function criarBotao(nome, atributo) {
        var botao = document.createElement('button');

        botao.type = 'button';
        botao.setAttribute(atributo, nome);
        botao.textContent = nome;

        return botao;
    }

    function atualizarSelecionados() {
        if (!painelAtual || !dados()) return;

        var lista = painelAtual.querySelector('#meus-gostos');
        lista.replaceChildren();

        dados().gostos.forEach(function (nome) {
            var botao = criarBotao(nome, 'data-remover-gosto');

            botao.className = 'meu-hobbie';
            botao.textContent = nome + ' ×';
            botao.setAttribute('aria-label', 'Remover ' + nome);

            lista.appendChild(botao);
        });

        painelAtual.querySelectorAll('[data-sugerir-gosto]')
            .forEach(function (botao) {
                botao.setAttribute(
                    'aria-pressed',
                    String(selecionado(botao.dataset.sugerirGosto))
                );
            });
    }

    function limparPesquisa() {
        clearTimeout(pesquisaTimer);
        pesquisaVersao++;

        painelAtual.querySelector('#hobbie').value = '';
        painelAtual.querySelector('#lista').replaceChildren();
        painelAtual.querySelector('#recomendacoes').style.display = 'none';
    }

    function toqueGosto() {
        try {
            var capacitor = window.Capacitor;

            if (capacitor?.isNativePlatform?.()) {
                var plugin = capacitor.Plugins?.MargotHaptics
                    || capacitor.registerPlugin?.('MargotHaptics');

                Promise.resolve(
                    plugin?.play({ type: 'interaction' })
                ).catch(function () {});
            } else if (typeof navigator.vibrate === 'function') {
                navigator.vibrate(15);
            }
        } catch (_) {}
    }

    function adicionar(nome) {
        nome = String(nome || '').trim();

        if (!nome || !dados()) return;

        if (Array.from(nome).length > 80) {
            return aviso('Usa até 80 caracteres por gosto.');
        }

        if (!selecionado(nome)) {
            if (dados().gostos.length >= 30) {
                return aviso('Podes escolher até 30 gostos.');
            }

            dados().gostos.push(nome);
            toqueGosto();
        }

        // Os gostos novos são guardados ao concluir o formulário.
        window.guardarCamposCreateAccount();

        aviso('');
        limparPesquisa();
        atualizarSelecionados();
    }

    function remover(nome) {
        if (!dados() || !selecionado(nome)) return;

        dados().gostos = dados().gostos.filter(function (item) {
            return chave(item) !== chave(nome);
        });

        toqueGosto();
        window.guardarCamposCreateAccount();

        aviso('');
        atualizarSelecionados();
    }

    async function obter(url) {
        var resposta = await fetch(url, {
            credentials: 'same-origin'
        });

        if (!resposta.ok) {
            throw new Error('Não foi possível carregar os gostos.');
        }

        var lista = await resposta.json();

        if (!Array.isArray(lista)) {
            throw new Error('Resposta inválida.');
        }

        return lista;
    }

    async function carregarSugestoes(painel) {
        var estado = painel.querySelector('[data-sugestoes-estado]');
        var repetir = painel.querySelector('[data-sugestoes-repetir]');

        estado.hidden = false;
        estado.textContent = 'A carregar sugestões…';
        repetir.hidden = true;

        try {
            if (!catalogo) {
                if (!pedidoCatalogo) {
                    pedidoCatalogo = obter(
                        painel.dataset.gostosUrl + '?sugestoes=1'
                    )
                        .then(function (lista) {
                            catalogo = lista;
                            return lista;
                        })
                        .finally(function () {
                            pedidoCatalogo = null;
                        });
                }

                await pedidoCatalogo;
            }

            if (!painel.isConnected || painel !== painelAtual) {
                return;
            }

            var grupos = agrupar(catalogo);
            var area = painel.querySelector('[data-sugestoes-grupos]');

            area.replaceChildren();

            grupos.forEach(function (grupo) {
                var secao = document.createElement('section');
                secao.className = 'gostos-tema';

                var titulo = document.createElement('h2');
                titulo.textContent = grupo.nome;

                var opcoes = document.createElement('div');
                opcoes.className = 'gostos-opcoes';

                grupo.gostos.forEach(function (nome) {
                    var botao = criarBotao(nome, 'data-sugerir-gosto');
                    botao.className = 'gosto-sugestao';
                    opcoes.appendChild(botao);
                });

                secao.append(titulo, opcoes);
                area.appendChild(secao);
            });

            estado.hidden = grupos.length > 0;
            estado.textContent =
                'Ainda não há sugestões. Pesquisa ou escreve um gosto.';

            atualizarSelecionados();
        } catch (_) {
            if (!painel.isConnected) return;

            estado.textContent =
                'Não foi possível carregar as sugestões. Podes continuar pela pesquisa.';

            repetir.hidden = false;
        }
    }

    function pesquisar(input) {
        clearTimeout(pesquisaTimer);

        var versao = ++pesquisaVersao;
        var painel = painelAtual;
        var termo = input.value.trim();

        painel.querySelector('#lista').replaceChildren();
        painel.querySelector('#recomendacoes').style.display = 'none';

        aviso('');

        if (!termo) return;

        pesquisaTimer = setTimeout(async function () {
            try {
                var resultados = await obter(
                    painel.dataset.gostosUrl
                    + '?gosto='
                    + encodeURIComponent(termo)
                );

                if (
                    versao !== pesquisaVersao ||
                    !input.isConnected ||
                    painel !== painelAtual
                ) {
                    return;
                }

                var lista = painel.querySelector('#lista');

                resultados.forEach(function (item) {
                    var nome = String(item.nome || '').trim();
                    if (!nome) return;

                    var linha = document.createElement('li');

                    linha.appendChild(
                        criarBotao(nome, 'data-resultado-gosto')
                    );

                    lista.appendChild(linha);
                });

                painel.querySelector('#recomendacoes').style.display =
                    lista.children.length ? 'block' : 'none';
            } catch (_) {
                if (versao === pesquisaVersao && input.isConnected) {
                    aviso(
                        'A pesquisa não está disponível. Podes escrever o gosto e tocar em Adicionar.'
                    );
                }
            }
        }, 200);
    }

    function iniciarPainel() {
        var painel = document.querySelector(
            '#create-account-form > #gostos'
        );

        if (painel === painelAtual) return;

        painelAtual = painel;
        clearTimeout(pesquisaTimer);
        pesquisaVersao++;

        if (!painel) return;

        atualizarSelecionados();
        carregarSugestoes(painel);
    }

    document.addEventListener('click', function (event) {
        var botao = event.target.closest('#gostos button');

        if (!botao || !painelAtual) return;

        if (botao.hasAttribute('data-sugerir-gosto')) {
            var nome = botao.dataset.sugerirGosto;

            if (selecionado(nome)) {
                remover(nome);
            } else {
                adicionar(nome);
            }
        } else if (botao.hasAttribute('data-remover-gosto')) {
            remover(botao.dataset.removerGosto);
        } else if (botao.hasAttribute('data-resultado-gosto')) {
            adicionar(botao.dataset.resultadoGosto);
        } else if (botao.id === 'adicionar-gosto') {
            adicionar(painelAtual.querySelector('#hobbie').value);
        } else if (botao.hasAttribute('data-sugestoes-repetir')) {
            carregarSugestoes(painelAtual);
        }
    });

    document.addEventListener('input', function (event) {
        if (event.target.id === 'hobbie' && painelAtual) {
            pesquisar(event.target);
        }
    });

    document.addEventListener('keydown', function (event) {
        if (
            event.target.id === 'hobbie' &&
            event.key === 'Enter' &&
            !event.isComposing
        ) {
            event.preventDefault();
            adicionar(event.target.value);
        }
    });

    function iniciar() {
        var form = document.getElementById('create-account-form');
        if (!form) return;

        new MutationObserver(iniciarPainel).observe(form, {
            childList: true
        });

        iniciarPainel();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar, {
            once: true
        });
    } else {
        iniciar();
    }
})();