# Margot

A organização segue o mesmo percurso do Lykrr: **URL → página PHP → classe com SQL → template Twig**, com JavaScript e CSS organizados por funcionalidade. A app continua a usar Capacitor, PHP, PDO, Twig e Ratchet. Não foi acrescentada uma framework.

A versão 3 inclui a [correção da navegação entre abas](docs/NAVEGACAO.md) e os [testes e correções de contas, push e localização](docs/TESTES-V3.md).

## Onde mexer

| Quero alterar… | Começar aqui |
| --- | --- |
| Uma rota | `public/index.php` e `src/pages/` |
| Login, registo ou perfil | A página correspondente e `src/classes/CMS/Member.php` |
| Um campo do formulário | `templates/account/` e `public/js/create-account-*.js` |
| Conversas e mensagens | `src/pages/messages.php` e `src/classes/CMS/Message.php` |
| Quem pode conversar | `src/classes/CMS/MessageAccess.php` |
| Fotografias/vídeos de mensagens | `src/classes/CMS/MessageMedia.php` |
| Reações e gestos do chat | `public/js/chat-reactions.js` |
| Heys/notificações | `src/classes/CMS/Notification.php` e `public/js/index-notificacoes.js` |
| Bloqueios e denúncias | `src/classes/CMS/Safety.php` |
| O estado “Hoje” | `src/classes/CMS/TodayStatus.php`, `public/js/today.js` e `today-clothes.js` |
| O aspeto de uma página | O template em `templates/` e o CSS em `public/estilos/` |
| WebSocket | `websocket-server.php`, `src/classes/CMS/WebSocket.php` e `Realtime/` |
| Localização no browser | `public/js/websocket-location.js` |
| Localização em segundo plano | `public/js/background-location.js` e os plugins em `ios/` e `android/` |
| Push | `config/push.php`, `PushNotification.php`, `PushProvider.php` e `push-worker.php` |

## Como acrescentar uma funcionalidade

1. A página em `src/pages/` lê o pedido, valida a sessão/permissões e decide o que devolver.
2. As consultas ficam numa classe em `src/classes/CMS/`. Usa `Database::runSQL($sql, $parametros)` com parâmetros preparados.
3. O HTML fica no template. Para JSON, usa `json_response($dados, $estado)` de `src/http.php`.
4. Coloca o comportamento e os estilos nos ficheiros da funcionalidade. Inclui os módulos auxiliares antes do ficheiro que os usa.

`CMS.php` disponibiliza as classes através de métodos explícitos, como `getMember()` e `getMessage()`. Os três ficheiros de `Realtime/` são partes da classe WebSocket, declaradas como traits; partilham o estado dessa classe e não precisam de ser instanciadas.

Há uma linha em branco entre funções, indentação consistente e expressões curtas na mesma linha. Os ficheiros grandes foram divididos quando continham responsabilidades distintas.

## Base de dados

`database/schema.sql` é uma cópia exata do `app.sql` fornecido, com 22 tabelas. As seis tabelas que o código tentava criar durante pedidos já constam desse esquema. A aplicação deixou de executar `CREATE TABLE` ou `ALTER TABLE` durante consultas e pedidos normais.

Numa base existente, confirma a estrutura com:

```sh
php database/check.php
```

Este comando só lê os nomes das tabelas e colunas. Não verifica tipos, índices ou conteúdo e não corrige nada automaticamente. **O `schema.sql` serve para instalar uma base vazia; não o importes por cima da base em utilização.** Alterações futuras de estrutura devem ser scripts SQL separados, executados uma vez durante a instalação dessa alteração.

## Executar e verificar

Mantém a configuração do teu ambiente em `config/config.local.php`, que tem prioridade sobre `config/config.php`. O servidor web deve apontar para `public/`. Os valores de configuração e os ficheiros de dependências fornecidos foram mantidos.

Com PHP 8.2+ e Composer:

```sh
composer install
composer lint
composer test
```

Os testes PHP completos precisam de `pdo_sqlite`, `mbstring`, `openssl`, `curl`, `fileinfo` e `imagick` com WebP. Usam apenas uma base temporária em memória; não carregam a configuração da base real. A aplicação continua a precisar de `pdo_mysql` e das extensões já utilizadas para imagens, email e push. SQLite é uma aproximação para testar as regras, não uma substituição de MariaDB.

Com Node.js:

```sh
npm test
```

Este teste não precisa de instalar pacotes. Os testes específicos de navegação estão em `tests/navigation.html`; executa `python3 -m http.server 8765 --bind 127.0.0.1` na raiz do projeto e abre `http://127.0.0.1:8765/tests/navigation.html`. São testes isolados, com rede, páginas e animações simuladas; não usam a base real. Para trabalhar nos projetos nativos:

```sh
npm ci
npx cap sync
npx cap open ios
# ou: npx cap open android
```

A configuração Capacitor continua a carregar o site remoto definido em `capacitor.config.json`. A compilação/publicação das apps continua a ser feita no Xcode e no Android Studio.

## Colocar esta versão no servidor

Publica o conjunto completo de ficheiros, incluindo os novos módulos e templates. Mantém a configuração local, as credenciais externas e os ficheiros enviados pelos utilizadores no ambiente atual. Reinicia os processos WebSocket e push depois da atualização, para carregarem as classes novas. Os URLs dos assets nos templates receberam uma nova versão para evitar que o browser misture módulos antigos e novos.

A movimentação de `profile-image-worker.php` já foi refletida em `Image.php`. No iOS, `LocationRelaunchCoordinator.swift` já está incluído no projeto Xcode.

Consulta [a revisão e as limitações dos testes](docs/REVISAO.md) e [o inventário de ficheiros](docs/INVENTARIO.md).
