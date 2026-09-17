# Correção da troca de abas — versão 2

O relato refere-se à app no iPhone. O código anterior animava a página durante 220 ms e só depois executava os seus scripts, carregados sequencialmente. Também mostrava o conteúdo após uma espera de apenas 180 ms pelo CSS e mudava o contentor para `position: fixed` durante a animação. Estes pontos podiam produzir conteúdo incompleto, alterações de posição no fim da transição e trabalho adicional no WebView.

## O que mudou

- Os scripts e estilos do destino são pré-carregados em paralelo, mantendo a página atual visível e utilizável. O HTML continua a ser obtido de novo em cada navegação; não foi introduzida cache de dados pessoais.
- O CSS novo fica inativo enquanto carrega e só é aplicado na troca. Se um recurso falhar, a navegação normal do browser serve de recuperação.
- A página anterior sai antes de os inicializadores da nova página correrem, evitando IDs duplicados. O URL de destino já está disponível quando os scripts leem parâmetros como `?etapa=fotos`.
- A animação começa depois da inicialização e do evento `margot:page-ready`. Foi retirada a chamada redundante a `refreshMap()` do navegador; o WebSocket já trata esse evento.
- A mudança de aba usa uma passagem curta de opacidade, com 100 ms, sem deslocar o ecrã inteiro. As páginas internas usam uma entrada direcional de 18 px e 160 ms. A preferência de redução de movimento é respeitada.
- O contentor deixa de mudar para `position: fixed` durante a transição. O menu mantém a sua posição.
- Ao regressar às abas Mensagens e Perfil, a posição de leitura é reposta.
- Toques sucessivos cancelam a preparação ultrapassada ou terminam a animação em curso. Uma página já montada é sempre inicializada, mesmo que outro destino tenha ficado pendente.

Os ficheiros funcionais alterados nesta correção são `public/js/javascript-geral.js` e o bloco de navegação de `public/estilos/style.css`. Os templates passaram a referenciar estas duas versões com `?v=20260916-nav2`.

## Verificação

Passaram 207 verificações de navegação com DOM, rede, scripts de página e animações simulados: carregamento antes da troca, ordem dos scripts, ausência de IDs duplicados, CSS preparado sem afetar a página atual, parâmetros do URL, posição de leitura, último toque durante diferentes fases, voltar/avançar e redução de movimento. Foram novamente executadas as 99 verificações PHP, as 93 verificações JavaScript e a compilação dos templates.

Os testes de navegação podem ser abertos em `tests/navigation.html` através de um servidor local. Esta verificação não mede fluidez, FPS ou comportamento num iPhone real. Não foi feita validação numa app instalada nem na base MariaDB real. Os problemas funcionais já identificados em `REVISAO.md` continuam registados e não foram tratados por esta correção.

## Aplicar

Publica os ficheiros desta versão e fecha completamente a app antes de a voltares a abrir. A navegação interna mantém o JavaScript global em memória; apenas trocar de aba numa sessão já aberta não carrega a versão nova desse código. Esta entrega é um ZIP de código, sem publicação automática no servidor.
