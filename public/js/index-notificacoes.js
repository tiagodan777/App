(function (window, document) {
    'use strict';
    var endpoint = window.heysUrl || '/notifications';
    var estado = {
        aberto: false,
        carregando: false,
        direcao: 'recebido',
        notificacoes: [],
        idsConhecidos: new Set(),
        iniciou: false
    };
    var abrir = document.getElementById('abrir-heys');
    var area = document.getElementById('heys-area');
    var painel = document.getElementById('heys-painel');
    var fundo = document.getElementById('heys-fundo');
    var fechar = document.getElementById('fechar-heys');
    var lista = document.getElementById('heys-lista');
    var carregando = document.getElementById('heys-carregando');
    var vazio = document.getElementById('heys-vazio');
    var erro = document.getElementById('heys-erro');
    var contador = document.getElementById('heys-contador');
    var limparTodos = document.getElementById('limpar-todos-heys');
    var avisos = document.getElementById('heys-avisos');

    if (!abrir || !area || !painel || !lista) {
        return;
    }

    function texto(valor) {
        return String(valor ?? '').trim();
    }

    function numero(valor) {
        var resultado = Number.parseInt(valor, 10);
        return Number.isFinite(resultado) ? resultado : 0;
    }

    function urlFoto(valor) {
        var caminho = texto(valor);

        if (!caminho) {
            caminho = '/imagens/fotos-perfil/default.webp';
        }

        try {
            return new URL(caminho, window.location.href).href;
        } catch (falha) {
            return '/imagens/fotos-perfil/default.webp';
        }
    }

    function urlPerfil(membroId) {
        return (window.profileUrl || '/profile/') + encodeURIComponent(texto(membroId));
    }

    function aplicarFoto(imagem, caminho) {
        imagem.onerror = function () {
            this.onerror = null;
            this.src = urlFoto('/imagens/fotos-perfil/default.webp');
        };

        imagem.src = urlFoto(caminho);
    }

    function definirContador(valor) {
        var total = Math.max(0, numero(valor));

        contador.textContent = total > 99 ? '99+' : String(total);
        contador.hidden = total === 0;
        contador.setAttribute('aria-label', total + (total === 1 ? ' Hey por ler' : ' Heys por ler'));
    }

    function dataLocal(valor) {
        if (!valor) {
            return '';
        }

        var normalizada = String(valor).trim().replace(' ', 'T');

        if (!/[zZ]|[+-]\d\d:\d\d$/.test(normalizada)) {
            normalizada += 'Z';
        }

        var data = new Date(normalizada);

        if (Number.isNaN(data.getTime())) {
            return String(valor);
        }

        return new Intl.DateTimeFormat('pt-PT', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        }).format(data);
    }

    function mostrarEstado(elemento, mostrar, mensagem) {
        if (!elemento) {
            return;
        }

        if (mensagem !== undefined) {
            elemento.textContent = mensagem;
        }

        elemento.hidden = !mostrar;
    }

    function criarElemento(nome, classe, conteudo) {
        var elemento = document.createElement(nome);

        if (classe) {
            elemento.className = classe;
        }

        if (conteudo !== undefined) {
            elemento.textContent = conteudo;
        }

        return elemento;
    }

    function criarItem(item) {
        var artigo = criarElemento('article', 'hey-item');

        if (item.direcao === 'recebido' && !item.lida) {
            artigo.classList.add('nao-lido');
        }

        var perfil = urlPerfil(item.outro_membro_id);
        var nomePessoa = texto(item.outro_nome) || 'Alguém';

        var linkFoto = criarElemento('a', 'hey-item-foto-link');
        linkFoto.href = perfil;
        linkFoto.setAttribute('aria-label', 'Abrir perfil de ' + nomePessoa);

        var imagem = criarElemento('img', 'hey-item-foto');
        imagem.alt = '';
        imagem.loading = 'lazy';
        aplicarFoto(imagem, item.outro_foto_url);
        linkFoto.appendChild(imagem);

        var corpo = criarElemento('div', 'hey-item-corpo');
        var frase = criarElemento('p', 'hey-item-frase');

        var linkNome = criarElemento('a', 'hey-item-nome', nomePessoa);
        linkNome.href = perfil;

        if (item.direcao === 'enviado') {
            frase.append('Enviaste um Hey a ', linkNome, '.');
        } else {
            frase.append(linkNome, ' enviou-te um Hey.');
        }

        var momento = criarElemento('time', 'hey-item-data', dataLocal(item.criada_em));
        momento.dateTime = texto(item.criada_em);
        corpo.append(frase, momento);

        var botaoLimpar = criarElemento('button', 'hey-item-limpar');
        botaoLimpar.type = 'button';
        botaoLimpar.dataset.notificationId = String(numero(item.id));
        botaoLimpar.dataset.direction = item.direcao;
        botaoLimpar.setAttribute('aria-label', 'Limpar este Hey');
        botaoLimpar.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>';

        artigo.append(linkFoto, corpo, botaoLimpar);

        return artigo;
    }

    function renderizar() {
        lista.replaceChildren();

        var filtradas = estado.notificacoes.filter(function (item) {
            return item.direcao === estado.direcao;
        });

        mostrarEstado(vazio, filtradas.length === 0 && !estado.carregando);

        if (limparTodos) {
            limparTodos.hidden = filtradas.length === 0 || estado.carregando;
            limparTodos.textContent = estado.direcao === 'enviado' ? 'Limpar enviados' : 'Limpar recebidos';
        }

        filtradas.forEach(function (item) {
            lista.appendChild(criarItem(item));
        });
    }

    function mostrarAviso(opcoes) {
        if (!avisos) {
            return;
        }

        var dados = Object.assign(
            {
                titulo: 'Hey',
                mensagem: '',
                foto: '',
                url: '',
                tipo: 'hey',
                duracao: 4800
            },
            opcoes || {}
        );

        var aviso = criarElemento(dados.url ? 'a' : 'div', 'hey-aviso hey-aviso-' + dados.tipo);

        if (dados.url) {
            aviso.href = dados.url;
            aviso.classList.add('hey-aviso-link');
            aviso.style.color = 'inherit';
            aviso.style.textDecoration = 'none';
            aviso.style.pointerEvents = 'auto';
        }

        aviso.setAttribute('role', 'status');

        if (dados.foto) {
            var foto = criarElemento('img', 'hey-aviso-foto');
            aplicarFoto(foto, dados.foto);
            foto.alt = '';
            aviso.appendChild(foto);
        } else {
            var simbolo = criarElemento('span', 'hey-aviso-simbolo', dados.tipo === 'erro' ? '!' : '👋');
            aviso.appendChild(simbolo);
        }

        var corpo = criarElemento('div', 'hey-aviso-corpo');
        corpo.append(criarElemento('strong', '', dados.titulo), criarElemento('p', '', dados.mensagem));

        aviso.appendChild(corpo);
        avisos.appendChild(aviso);

        window.requestAnimationFrame(function () {
            aviso.classList.add('visivel');
        });

        window.setTimeout(function () {
            aviso.classList.remove('visivel');

            window.setTimeout(function () {
                aviso.remove();
            }, 260);
        }, dados.duracao);
    }

    async function mostrarNotificacaoSistema(titulo, mensagem, foto, url) {
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }

        var opcoes = {
            body: mensagem,
            icon: urlFoto(foto),
            badge: urlFoto('/imagens/fotos-perfil/default.webp'),
            tag: 'hey-recebido-' + Date.now(),
            renotify: true,
            data: {
                url: url || window.location.href
            }
        };

        try {
            if ('serviceWorker' in navigator) {
                var registo = await navigator.serviceWorker.ready;
                await registo.showNotification(titulo, opcoes);
                return;
            }

            var notificacao = new Notification(titulo, opcoes);

            notificacao.onclick = function () {
                window.focus();

                if (url) {
                    window.location.href = url;
                } else {
                    abrirPainel();
                }

                notificacao.close();
            };
        } catch (falha) {
            console.warn('Não foi possível mostrar a notificação do sistema.', falha);
        }
    }

    async function pedirPermissao() {
        if (!('Notification' in window) || Notification.permission !== 'default') {
            return;
        }

        try {
            await Notification.requestPermission();
        } catch (falha) {
            console.warn('Não foi possível pedir permissão para notificações.', falha);
        }
    }

    function registarServiceWorker() {
        if (!('serviceWorker' in navigator) || !window.isSecureContext) {
            return;
        }

        navigator.serviceWorker.register('/service-worker.js').catch(function (falha) {
            console.warn('Não foi possível iniciar as notificações da app.', falha);
        });
    }

    function prepararPedidoPermissao() {
        var pedirUmaVez = function () {
            pedirPermissao();
            document.removeEventListener('pointerup', pedirUmaVez, true);
            document.removeEventListener('keydown', pedirUmaVez, true);
        };

        document.addEventListener('pointerup', pedirUmaVez, true);
        document.addEventListener('keydown', pedirUmaVez, true);
    }

    async function obterNotificacoes(mostrarCarregamento) {
        if (estado.carregando) {
            return;
        }

        estado.carregando = true;

        if (mostrarCarregamento) {
            mostrarEstado(carregando, true);
        }

        mostrarEstado(erro, false);

        try {
            var resposta = await fetch(endpoint, {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    Accept: 'application/json'
                }
            });

            if (!resposta.ok) {
                var detalhe = '';

                try {
                    var erroHttp = await resposta.json();
                    detalhe = texto(erroHttp.message);
                } catch (ignorar) {
                    detalhe = '';
                }

                throw new Error('Resposta HTTP ' + resposta.status + (detalhe ? ': ' + detalhe : ''));
            }

            var dados = await resposta.json();

            if (!dados.success) {
                throw new Error(dados.message || 'Não foi possível carregar os Heys.');
            }

            var recebidas = Array.isArray(dados.notifications) ? dados.notifications : [];

            if (estado.iniciou) {
                recebidas.forEach(function (item) {
                    var id = numero(item.id);

                    if (item.direcao === 'recebido' && !item.lida && !estado.idsConhecidos.has(id)) {
                        var nome = texto(item.outro_nome) || 'Alguém';
                        var mensagem = nome + ' enviou-te um Hey.';
                        var perfil = urlPerfil(item.outro_membro_id);

                        mostrarAviso({
                            titulo: 'Recebeste um Hey!',
                            mensagem: mensagem,
                            foto: texto(item.outro_foto_url),
                            url: perfil
                        });

                        mostrarNotificacaoSistema('Recebeste um Hey!', mensagem, texto(item.outro_foto_url), perfil);
                    }
                });
            }

            estado.notificacoes = recebidas;

            estado.idsConhecidos = new Set(
                recebidas.map(function (item) {
                    return numero(item.id);
                })
            );

            estado.iniciou = true;
            definirContador(dados.unread_count);
            renderizar();

            return true;
        } catch (falha) {
            console.error(falha);

            if (estado.aberto) {
                mostrarEstado(erro, true, 'Não foi possível carregar os Heys.');
            }

            return false;
        } finally {
            estado.carregando = false;
            mostrarEstado(carregando, false);
            renderizar();
        }
    }

    async function enviarAcao(acao, valores) {
        var corpo = new URLSearchParams();
        corpo.set('action', acao);

        Object.entries(valores || {}).forEach(function (entrada) {
            corpo.set(entrada[0], String(entrada[1]));
        });

        var resposta = await fetch(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body: corpo.toString()
        });

        var dados = null;

        try {
            dados = await resposta.json();
        } catch (ignorar) {
            dados = null;
        }

        if (!resposta.ok || !dados || !dados.success) {
            throw new Error(texto(dados?.message) || 'Não foi possível concluir a ação.');
        }

        return dados;
    }

    async function limparUmHey(notificacaoId, direcao, botao) {
        if (notificacaoId <= 0) {
            return;
        }

        if (botao) {
            botao.disabled = true;
        }

        try {
            var dados = await enviarAcao('hide_one', {
                notification_id: notificacaoId,
                direction: direcao
            });

            estado.notificacoes = estado.notificacoes.filter(function (item) {
                return numero(item.id) !== notificacaoId;
            });

            definirContador(dados.unread_count);
            renderizar();
        } catch (falha) {
            console.error(falha);

            mostrarAviso({
                titulo: 'Não foi possível limpar',
                mensagem: texto(falha.message) || 'Tenta novamente.',
                tipo: 'erro'
            });

            if (botao && botao.isConnected) {
                botao.disabled = false;
            }
        }
    }

    async function limparTodosHeys() {
        if (!limparTodos || limparTodos.disabled) {
            return;
        }

        var direcao = estado.direcao;
        limparTodos.disabled = true;

        try {
            var dados = await enviarAcao('hide_all', {
                direction: direcao
            });

            estado.notificacoes = estado.notificacoes.filter(function (item) {
                return item.direcao !== direcao;
            });

            definirContador(dados.unread_count);
            renderizar();
        } catch (falha) {
            console.error(falha);

            mostrarAviso({
                titulo: 'Não foi possível limpar',
                mensagem: texto(falha.message) || 'Tenta novamente.',
                tipo: 'erro'
            });
        } finally {
            limparTodos.disabled = false;
        }
    }

    async function marcarComoLidas() {
        try {
            var corpo = new URLSearchParams();
            corpo.set('action', 'mark_all_read');

            var resposta = await fetch(endpoint, {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                body: corpo.toString()
            });

            if (!resposta.ok) {
                return;
            }

            estado.notificacoes = estado.notificacoes.map(function (item) {
                if (item.direcao === 'recebido') {
                    return Object.assign({}, item, {
                        lida: true
                    });
                }

                return item;
            });

            definirContador(0);
            renderizar();
        } catch (falha) {
            console.warn('Não foi possível marcar os Heys como lidos.', falha);
        }
    }

    function abrirPainel() {
        estado.aberto = true;
        area.classList.add('aberta');
        area.setAttribute('aria-hidden', 'false');
        abrir.setAttribute('aria-expanded', 'true');
        document.body.classList.add('heys-abertos');

        painel.focus({
            preventScroll: true
        });

        obterNotificacoes(true).then(function (carregou) {
            if (carregou) {
                marcarComoLidas();
            }
        });
    }

    function fecharPainel() {
        estado.aberto = false;
        area.classList.remove('aberta');
        area.setAttribute('aria-hidden', 'true');
        abrir.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('heys-abertos');

        abrir.focus({
            preventScroll: true
        });
    }

    function ativarArrastoPainel() {
        var ativo = false;
        var horizontal = false;
        var ponteiroId = null;
        var inicioX = 0;
        var inicioY = 0;
        var atualX = 0;
        var inicioTempo = 0;

        function limparEstilos() {
            painel.classList.remove('a-arrastar');
            painel.style.removeProperty('transition');
            painel.style.removeProperty('transform');

            if (fundo) {
                fundo.style.removeProperty('transition');
                fundo.style.removeProperty('opacity');
            }
        }

        function libertarPonteiro() {
            if (!painel.releasePointerCapture || ponteiroId === null) {
                return;
            }

            try {
                painel.releasePointerCapture(ponteiroId);
            } catch (falha) {
                /* O navegador pode já ter libertado o ponteiro. */
            }
        }

        function terminarArrasto(evento) {
            if (!ativo || evento.pointerId !== ponteiroId) {
                return;
            }

            var distancia = atualX - inicioX;
            var duracao = Math.max(1, Date.now() - inicioTempo);
            var velocidade = distancia / duracao;
            var deveFechar = horizontal && (distancia < -90 || velocidade < -0.55);

            libertarPonteiro();

            ativo = false;
            horizontal = false;
            ponteiroId = null;

            painel.style.transition = 'transform 220ms cubic-bezier(.4,0,1,1)';
            painel.style.transform = deveFechar ? 'translateX(-104%)' : 'translateX(0)';

            if (fundo) {
                fundo.style.transition = 'opacity 220ms ease';
                fundo.style.opacity = deveFechar ? '0' : '1';
            }

            window.setTimeout(function () {
                if (deveFechar) {
                    fecharPainel();
                }

                limparEstilos();
            }, 220);
        }

        painel.addEventListener('pointerdown', function (evento) {
            if (!estado.aberto || evento.button > 0) {
                return;
            }

            if (evento.target.closest('a, button, input, textarea, select, label')) {
                return;
            }

            ativo = true;
            horizontal = false;
            ponteiroId = evento.pointerId;
            inicioX = atualX = evento.clientX;
            inicioY = evento.clientY;
            inicioTempo = Date.now();
        });

        painel.addEventListener('pointermove', function (evento) {
            if (!ativo || evento.pointerId !== ponteiroId) {
                return;
            }

            var distanciaX = evento.clientX - inicioX;
            var distanciaY = evento.clientY - inicioY;

            if (!horizontal) {
                if (Math.abs(distanciaX) < 8 && Math.abs(distanciaY) < 8) {
                    return;
                }

                if (Math.abs(distanciaY) >= Math.abs(distanciaX)) {
                    ativo = false;
                    ponteiroId = null;
                    return;
                }

                horizontal = true;
                painel.classList.add('a-arrastar');
                painel.style.transition = 'none';

                if (fundo) {
                    fundo.style.transition = 'none';
                }

                if (painel.setPointerCapture) {
                    try {
                        painel.setPointerCapture(evento.pointerId);
                    } catch (falha) {
                        /* Alguns Safari recusam a captura do ponteiro. */
                    }
                }
            }

            atualX = evento.clientX;

            var deslocamento = Math.min(0, distanciaX);
            var progresso = Math.min(1, Math.abs(deslocamento) / painel.offsetWidth);

            painel.style.transform = 'translateX(' + deslocamento + 'px)';

            if (fundo) {
                fundo.style.opacity = String(1 - progresso);
            }

            evento.preventDefault();
            evento.stopPropagation();
        });

        painel.addEventListener('pointerup', terminarArrasto);
        painel.addEventListener('pointercancel', terminarArrasto);
    }

    function selecionarDirecao(botao) {
        estado.direcao = botao.dataset.direcao === 'enviado' ? 'enviado' : 'recebido';

        document.querySelectorAll('.heys-separadores [role="tab"]').forEach(function (separador) {
            var ativo = separador === botao;

            separador.classList.toggle('ativo', ativo);
            separador.setAttribute('aria-selected', String(ativo));
        });

        renderizar();
    }

    function bloquearGestosDoMapa(elemento) {
        if (!elemento) {
            return;
        }

        ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend'].forEach(function (tipo) {
            elemento.addEventListener(
                tipo,
                function (evento) {
                    evento.stopPropagation();
                },
                {
                    passive: tipo !== 'touchmove'
                }
            );
        });
    }

    abrir.addEventListener('click', abrirPainel);

    if (fechar) {
        fechar.addEventListener('click', fecharPainel);
    }

    if (fundo) {
        fundo.addEventListener('click', fecharPainel);
    }

    document.addEventListener('keydown', function (evento) {
        if (evento.key === 'Escape' && estado.aberto) {
            fecharPainel();
        }
    });

    document.querySelectorAll('.heys-separadores [role="tab"]').forEach(function (botao) {
        botao.addEventListener('click', function () {
            selecionarDirecao(botao);
        });
    });

    lista.addEventListener('click', function (evento) {
        var origem = evento.target;

        if (!(origem instanceof Element)) {
            return;
        }

        var botao = origem.closest('.hey-item-limpar');

        if (!botao || !lista.contains(botao)) {
            return;
        }

        evento.preventDefault();
        evento.stopPropagation();

        limparUmHey(
            numero(botao.dataset.notificationId),
            botao.dataset.direction === 'enviado' ? 'enviado' : 'recebido',
            botao
        );
    });

    if (limparTodos) {
        limparTodos.addEventListener('click', function (evento) {
            evento.preventDefault();
            evento.stopPropagation();
            limparTodosHeys();
        });
    }

    window.addEventListener('app:hey-recebido', function (evento) {
        var dados = evento.detail || {};
        var id = numero(dados.notification_id);

        if (id > 0 && estado.idsConhecidos.has(id)) {
            return;
        }

        if (id > 0) {
            estado.idsConhecidos.add(id);
        }

        var nome = texto(dados.from_name) || 'Alguém';
        var mensagem = nome + ' enviou-te um Hey.';
        var perfil = urlPerfil(dados.from_member_id);

        mostrarAviso({
            titulo: 'Recebeste um Hey!',
            mensagem: mensagem,
            foto: texto(dados.from_photo),
            url: perfil
        });

        mostrarNotificacaoSistema('Recebeste um Hey!', mensagem, texto(dados.from_photo), perfil);
        definirContador(numero(contador.textContent) + 1);

        window.setTimeout(function () {
            obterNotificacoes(false);
        }, 250);
    });

    window.addEventListener('app:hey-enviado', function (evento) {
        var dados = evento.detail || {};
        var miniMenu = document.querySelector('.mini-menu');

        var nome = texto(dados.destinatario_nome) || texto(miniMenu?.querySelector('header h1')?.textContent) || 'A outra pessoa';

        var foto =
            texto(dados.destinatario_foto) ||
            texto(miniMenu?.querySelector('header img')?.currentSrc) ||
            texto(miniMenu?.querySelector('header img')?.src);

        mostrarAviso({
            titulo: 'Hey enviado',
            mensagem: nome + ' recebeu o teu Hey.',
            foto: foto,
            tipo: 'sucesso',
            duracao: 2600
        });

        window.setTimeout(function () {
            obterNotificacoes(false);
        }, 250);
    });

    window.addEventListener('app:hey-erro', function (evento) {
        mostrarAviso({
            titulo: 'Não foi possível enviar',
            mensagem: texto(evento.detail?.message) || 'Tenta novamente.',
            tipo: 'erro'
        });
    });

    ativarArrastoPainel();
    bloquearGestosDoMapa(abrir);
    bloquearGestosDoMapa(area);
    bloquearGestosDoMapa(painel);

    window.mostrarMensagemTemporaria = function (mensagem, tipo) {
        var eErro = tipo === 'erro';

        mostrarAviso({
            titulo: eErro ? 'Não foi possível' : 'Tudo certo',
            mensagem: texto(mensagem),
            tipo: eErro ? 'erro' : 'sucesso',
            duracao: eErro ? 4200 : 2600
        });
    };

    registarServiceWorker();
    prepararPedidoPermissao();
    obterNotificacoes(false);

    window.setInterval(function () {
        if (!document.hidden) {
            obterNotificacoes(false);
        }
    }, 10000);
})(window, document);