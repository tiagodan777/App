# Deploy do beta — RASCUNHO

> Documento operacional, não aprovação jurídica. Última revisão: 2026-07-26.
> Destino atual: beta fechado, por convite, exclusivamente 18+.

## Bloqueios antes de começar

Não abrir inscrições, fazer publicidade pública ou submeter às lojas enquanto
algum destes pontos estiver por preencher:

- `[POR PREENCHER]` nome legal do responsável, contacto de privacidade e morada
  legal;
- `[POR PREENCHER]` inventário dos fornecedores, contratos de tratamento,
  localização dos dados e mecanismo de transferências internacionais;
- backup restaurado com sucesso num ambiente separado;
- HTTPS e WSS válidos, sem acesso público à porta interna `127.0.0.1:8080`;
- migração ensaiada numa cópia da base de dados;
- todas as referências de media da base de dados reconciliadas com ficheiros
  privados reais e autorizados;
- pelo menos um moderador principal e um substituto, ambos adultos, treinados;
- DPIA, ROPA, retenção e resposta a incidentes revistos e aprovados.

O beta é fechado: manter `REGISTRATION_MODE=closed` e preencher
`BETA_INVITE_CODES` com códigos únicos, aleatórios, com pelo menos 96 bits de
entropia e separados por vírgulas (por exemplo, `openssl rand -hex 24`).
Distribuir um código por pequeno grupo, substituir códigos expostos e não os
guardar em tickets, analytics ou logs. **Não mudar para `public`** enquanto não
existirem verificação de email, controlos antiabuso testados e aprovação integral
desta checklist e de `docs/APP_STORES_CHECKLIST.md`.

## 1. Preparação

O deploy automático está **deliberadamente bloqueado**:
`.github/workflows/deploy.yml` termina sempre com erro. É uma proteção contra um
deploy parcial, não uma avaria a “corrigir”. Este beta só pode ser instalado
manualmente, seguindo este runbook. Não remover o bloqueio até existir um
processo automático atómico, testado e com rollback.

1. Escolher e registar o commit/release exato.
2. Confirmar PHP 8.1+, MariaDB 10.11+ e as extensões PHP `fileinfo`, `json`,
   `mbstring`, `openssl`, `pdo_mysql` e `imagick`.
3. Executar:

   ```sh
   composer install --no-dev --prefer-dist --classmap-authoritative
   composer audit
   ```

4. Configurar o `DocumentRoot`/`root` **exatamente** para
   `[APP_ROOT]/public`; nunca descompactar a aplicação inteira na raiz pública.
   Confirmar que `.env`, dumps, logs, backups, `vendor/`, `database/`, `docs/`,
   `var/` e `config/config.local.php` ficam fora do document root.
5. Ativar uma página de manutenção e parar novas escritas.

## 2. Backup obrigatório

Guardar, cifrar e restringir o acesso a:

- dump consistente da base de dados;
- `public/imagens/fotos-perfil/` e, se existirem,
  `public/imagens/fotos-perfil-originais/`;
- media legada em `public/` e toda a árvore `var/private/`;
- configuração do serviço e variáveis de ambiente, separadas do código;
- identificador da release e versões do PHP, base de dados e dependências.

Exemplo, usando um ficheiro de credenciais protegido:

```sh
mysqldump --defaults-extra-file=[MYSQL_CNF_PROTEGIDO] \
  --single-transaction --routines --triggers [DB_NAME] > [BACKUP_PATH]/pre-beta.sql
```

Restaurar o dump numa base isolada e validar pelo menos contagens de membros,
mensagens, fotos, denúncias e tokens. Um dump nunca restaurado não conta como
backup testado.

## 3. Ambiente

Usar `.env.example` como lista de variáveis, não como ficheiro carregado pela
aplicação. Configurar o ambiente do processo/painel e validar:

- `APP_ENV=production`, `APP_DEBUG=false` e `APP_URL` em HTTPS;
- `REGISTRATION_MODE=closed` e pelo menos um convite forte em
  `BETA_INVITE_CODES`;
- `APP_KEY` gerada por `openssl rand -hex 32`, estável e guardada;
- `PHP_CLI_BINARY` com o caminho absoluto devolvido por `command -v php`;
- utilizador da base de dados dedicado, sem permissões administrativas globais;
- contacto legal funcional; se ativares emails automáticos no beta, remetente
  SMTP validado (SMTP e verificação de email são obrigatórios antes do público);
- os três campos `LEGAL_*` sem `__REQUIRED_`, `.invalid` ou vazio;
- `WEBSOCKET_ALLOWED_ORIGINS` apenas com hosts reais, sem esquema;
- `WEBSOCKET_BIND=127.0.0.1:8080`;
- `TRUSTED_PROXY_IPS` apenas com IPs de proxies efetivamente controlados;
- `MODERATOR_MEMBER_IDS` vazio no funcionamento normal.

Na configuração efetivamente carregada, parar se `APP_*`, `DB_*`, `LEGAL_*`,
`PHP_CLI_BINARY` ou `WEBSOCKET_*` obrigatórios contiverem `__REQUIRED_`,
`.invalid` ou vazio. SMTP pode ficar totalmente ausente no beta fechado; não
copiar para produção os placeholders SMTP de `.env.example`.

Se o alojamento não permitir definir variáveis de ambiente, criar
`config/config.local.php` com modo `0600`/`0640` durante a configuração e,
quando já não precisar de ser editado, `0400`/`0440`. Este ficheiro **complementa**
`config.php`: deve apenas devolver um array e nunca copiar, substituir ou
`require` o ficheiro principal. As variáveis do processo têm precedência, o que
permite ao serviço substituir com segurança um valor local:

```php
<?php

return [
    'APP_ENV' => 'production',
    'APP_URL' => 'https://[HOST_REAL]',
    'APP_KEY' => '[SEGREDO_ALEATORIO]',
    'DB_USERNAME' => '[UTILIZADOR]',
    'DB_PASSWORD' => '[SEGREDO]',
    'PHP_CLI_BINARY' => '/caminho/absoluto/php',
    'BETA_INVITE_CODES' => '[CODIGO_1],[CODIGO_2]'
];
```

Não guardar esse ficheiro no Git, backup sem cifra ou document root. Todos os
entrypoints (`public`, WebSocket, workers e comandos `bin/`) carregam sempre
`config/config.php`; é o ficheiro principal que lê este array opcional.

## 4. Migração da base de dados

Esta migração não é idempotente. Antes de a executar, verificar se já foi
registada. Executar a segunda consulta apenas se a primeira confirmar que a
tabela existe:

```sql
SHOW TABLES LIKE 'schema_migrations';
SELECT versao, aplicada_em
FROM schema_migrations
WHERE versao = '20260726_security_beta';
```

Se a segunda consulta devolver uma linha, não voltar a executar o ficheiro. Se
a tabela ainda não existir ou a versão estiver ausente, executar primeiro numa
cópia restaurada:

```sh
mysql --defaults-extra-file=[MYSQL_CNF_PROTEGIDO] [DB_NAME] \
  < database/migrations/20260726_security_beta.sql
```

O ficheiro **não usa `START TRANSACTION`**: `ALTER TABLE` e outros DDL fazem
commit implícito em MariaDB. A linha em `schema_migrations` só é escrita no fim.
Se houver uma falha antes dela, não repetir sobre o esquema parcial; restaurar o
backup, corrigir a causa e recomeçar. O rollback real é restaurar o backup.

Antes de produção, confirmar:

- a coluna antiga de bloqueios existe exatamente uma vez;
- não existem tabelas/colunas com nomes já migrados que façam o SQL falhar;
- todas as contas sem prova de 18+ ficam suspensas;
- os tokens antigos podem ser todos invalidados;
- a tabela de localização pode ser eliminada sem perder outra funcionalidade;
- contar e exportar previamente fotos e mensagens de chat órfãs, incluindo os
  nomes técnicos dos anexos. A migração preserva-as em
  `fotos_perfil_orfas_quarentena` e
  `mensagens_chat_orfas_quarentena`;
- exportar e reconciliar `mensagens_legadas_quarentena`. Não apagar nenhuma
  quarentena sem uma decisão documentada e um backup verificável.

Depois, confirmar a linha `20260726_security_beta` em `schema_migrations`,
validar com `SHOW TABLES`, `SHOW CREATE TABLE` e contagens. Confirmar também que
todos os UUIDs usados em JOIN têm charset, collation e tamanho compatíveis, que
não existem registos órfãos e que as FKs críticas usam `ON DELETE CASCADE` para
conteúdo da conta ou `SET NULL` para denúncias/auditoria que devam ficar
pseudonimizadas. O pré-voo testa estas relações. Não alterar o SQL à pressa em
produção; corrigir e repetir o ensaio. O pré-voo reprova enquanto qualquer das
três quarentenas contiver linhas.

## 5. Migração da media privada

O código novo serve fotos/anexos por rotas autenticadas e lê `var/private/`.
O comando de migração copia fotos de perfil e anexos, compara tamanho e SHA-256
e não apaga a origem por defeito. O pacote de código sanitizado não inclui media
de utilizadores: é obrigatório restaurar apenas media autorizada a partir do
backup. Antes de trocar a release:

1. Inventariar os registos:

   ```sql
   SELECT ficheiro_mime, COUNT(*)
   FROM mensagens_chat
   WHERE ficheiro_nome IS NOT NULL
   GROUP BY ficheiro_mime;
   ```

2. Parar se os anexos de mensagens tiverem tipos diferentes de `image/webp`; é
   necessária uma conversão e atualização de metadados ensaiada, não uma simples
   mudança de pasta.
3. Executar, com o mesmo ambiente seguro do PHP:

   ```sh
   php bin/migrate-private-media.php
   ```

4. Parar se o exit code não for zero, `failed` ou `integrity_issues` forem
   superiores a zero, ou existirem fotos `pendente`. A auditoria compara
   referências BD→disco, MIME, tamanho e hash das provas.
5. Comparar também no sentido disco→BD. Ficheiros/subpastas sem referência,
   nomes inesperados e conteúdo das três tabelas de quarentena devem ser
   exportados para uma área privada de análise; não repetir comandos nem apagar
   às cegas.
6. Garantir que `var/private/` pertence a `[WEB_USER]:[WEB_GROUP]`, com pastas
   `0750` e ficheiros `0640`.
7. Testar fotos/anexos como proprietário/participante, como terceiro autenticado
   e sem sessão.
8. Depois da validação, confirmar que o backup seguro inclui as origens e
   executar ainda em manutenção:

   ```sh
   php bin/migrate-private-media.php --delete-source
   ```

9. Executar uma vez `php bin/cleanup-retention.php` e confirmar novamente que o
   migrador termina com exit code zero, `failed: 0` e `integrity_issues: 0`.
   O comando preserva
   `default.webp`; manter apenas o asset público estritamente necessário. O
   pré-voo percorre recursivamente as pastas legadas e reprova perante media
   dinâmica, subpastas inesperadas ou symlinks públicos. O rollback usa o
   backup, não uma cópia pública.

## 6. HTTPS, WSS e rede

- redirecionar HTTP para HTTPS e usar um certificado válido;
- manter `HSTS_INCLUDE_SUBDOMAINS=false` até confirmar que **todos** os
  subdomínios funcionam em HTTPS; só depois ativar conscientemente;
- o JavaScript liga a `wss://[HOST]/ws/` pela porta HTTPS normal (443); o proxy
  TLS deve encaminhar apenas esse caminho para `127.0.0.1:8080`;
- bloquear a porta interna na firewall e nunca definir
  `WEBSOCKET_BIND=0.0.0.0:8080`;
- preservar e validar o cabeçalho `Origin`; não permitir curingas;
- encaminhar `X-Forwarded-For` apenas de proxies incluídos em
  `TRUSTED_PROXY_IPS`;
- confirmar cookies `Secure`, `HttpOnly` e `SameSite=Lax` em produção;
- configurar access logs sem query string: em Nginx usar `$uri`, nunca
  `$request_uri`/`$request`; em Apache usar `%U`, nunca `%q`. Confirmar o mesmo
  no CDN, load balancer e APM. Os acessos de proximidade são cifrados e curtos,
  mas continuam a ser credenciais e nunca devem ficar em logs.

Configuração mínima de Nginx (adaptar socket PHP e cabeçalhos do fornecedor):

```nginx
root [APP_ROOT]/public;
index index.php;

location = /imagens/fotos-perfil/default.webp {
    try_files $uri =404;
}

location ~ ^/(?:imagens/fotos-perfil(?:-originais|-temp)?|media/mensagens)(?:/|$) {
    return 404;
}

location /ws/ {
    proxy_pass http://127.0.0.1:8080/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header Origin $http_origin;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 75s;
    proxy_send_timeout 75s;
    proxy_buffering off;
}

location / {
    try_files $uri $uri/ /index.php?$query_string;
}

location = /index.php {
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root/index.php;
    fastcgi_pass [PHP_FPM_SOCKET];
}

location ~ \.php$ { return 404; }
location ~ /\. { deny all; }
```

Em Apache, definir `DocumentRoot "[APP_ROOT]/public"` e:

```apache
<Directory "[APP_ROOT]/public">
    Options -Indexes
    AllowOverride FileInfo Options
    Require all granted
</Directory>
```

Ativar `mod_rewrite` e `mod_headers`; o `.htaccess` desta pasta faz o routing.
Para WSS em Apache, ativar também `mod_proxy`, `mod_proxy_http` e
`mod_proxy_wstunnel`, e configurar fora do `.htaccess`:

```apache
ProxyPass        "/ws/" "ws://127.0.0.1:8080/"
ProxyPassReverse "/ws/" "ws://127.0.0.1:8080/"
```

Em ambos os servidores, pedidos HTTP a `/config/config.php`,
`/database/migrations/20260726_security_beta.sql`, `/vendor/`, `/docs/` e
`/var/` têm de devolver `403` ou `404`, nunca conteúdo nem listagens.

## 7. Permissões e processos

O utilizador do PHP deve poder escrever apenas em:

- `var/private/message-media/`;
- `var/private/report-evidence/`;
- `var/private/profile/temp/`;
- `var/private/profile/thumb/`;
- `var/private/profile/original/`;
- `var/log/`;
- `var/rate-limit/`;
- nenhum diretório de media legado em `public` após a migração.

Preparar estas pastas com modo `0750`, media com `0640` e propriedade da mesma
conta de serviço dedicada usada por PHP, worker de imagens, WebSocket e cron.
O pré-voo reprova escrita pelo grupo: não usar `0770`/`0660`. Se a plataforma
obriga a separar contas, usar ACLs mínimas ensaiadas e adaptar conscientemente o
pré-voo antes do deploy, sem alargar permissões à árvore inteira.
Não usar symlinks em `var/` nem em nenhum descendente: o pré-voo resolve os
caminhos reais, percorre a árvore privada e reprova escapes, symlinks, ficheiros
executáveis ou permissões para “outros”.
Executar o pré-voo como o mesmo utilizador do PHP; executá-lo como `root` não
prova que a aplicação consegue escrever.

O WebSocket deve correr como serviço não privilegiado, reiniciar após falha e
receber o mesmo ambiente seguro do PHP. Código e configuração pública devem ser
apenas de leitura. Logs e backups devem ser acessíveis apenas às contas
operacionais autorizadas; backups não precisam de ser graváveis pelo PHP.
Confirmar que `PHP_CLI_BINARY` é executável por essa conta, que `exec` está
disponível no PHP web e CLI e que um upload JPEG/PNG/WebP passa de `pendente` a
`completo`. Se o ImageMagick não anunciar HEIC/HEIF, esses uploads são rejeitados
de forma segura; não instalar conversores de shell improvisados.

## 8. Manutenção programada

Executar de hora a hora, com o mesmo ambiente seguro da aplicação:

```sh
php [APP_ROOT]/bin/cleanup-retention.php
```

O comando elimina tokens/bilhetes expirados, Heys ocultos vencidos, rate limits
antigos, denúncias cujo `reter_ate` terminou e media temporária/órfã apenas
depois de confirmar na base de dados que deixou de estar referenciada. Não usar
`find ... -delete` nem outra eliminação apenas por idade: pode destruir um upload
ainda pendente. Rever antes as retenções legais e rodar logs para um máximo de
30 dias.

Testar o job e a sua idempotência em staging, guardar apenas contagens, e
alertar quando o cron falha. Não colocar palavras-passe na linha de comandos.

## 9. Moderadores

Validar a identidade do membro e atribuir a função:

```sql
UPDATE membros
SET `role` = 'moderator'
WHERE id = '[UUID_VALIDADO]' AND estado = 'ativo';
```

Testar que um membro normal recebe `403` em `/admin/reports`, que cada decisão
fica em `moderacao_acoes` e que suspender/banir revoga tokens e acesso. Remover
a função quando a pessoa deixa a equipa. Não usar contas partilhadas. A beta
exige dois membros adultos, ativos e distintos com `role=moderator`/`admin`;
`MODERATOR_MEMBER_IDS` tem de ficar vazio e não conta como equipa real.

## 10. Pré-voo, smoke tests e decisão

Depois da configuração, migração, media, permissões, moderador e cron, executar
na raiz da release, com o ambiente de produção e como utilizador do PHP:

```sh
php bin/preflight-beta.php
```

É obrigatório obter exit code `0` antes de retirar a manutenção. Qualquer
`[FALHA]` mantém o ambiente fechado; fotos pendentes, referências sem ficheiro,
media adulterada, colisões com a fila e quarentenas com linhas são falhas.
Rever também todos os `[AVISO]`. O pré-voo técnico não aprova por si só a parte
jurídica, SMTP, TLS externo nem os testes funcionais. Guardar o resultado sem
segredos ou dados pessoais.

O comando é deliberadamente estrito: só aprova `APP_ENV=production`,
`APP_DEBUG=false`, uma origem HTTPS pública, segredos sem defaults de
desenvolvimento, convites com forma aleatória, duas contas reais de moderação,
media privada canónica e o esquema relacional completo. Não usar um resultado
de `staging` como aprovação de produção.

Executar em desktop e nos wrappers móveis:

- registo de uma pessoa exatamente com 18 anos; rejeição de menor e de alteração
  manipulada no browser; convite ausente, inválido, reutilizado/exposto e válido;
- aceitação versionada dos Termos/Privacidade e bloqueio de versões antigas;
- login, logout e invalidação do cookie;
- alteração de password a terminar as restantes sessões web e tokens;
- bilhete WebSocket único, expirado, reutilizado e com origem não permitida;
- localização desligada por defeito, descoberta só com localização recente,
  raio de 100 m e invisibilidade; com duas ligações da mesma conta, fechar ou
  desligar o dispositivo que forneceu a posição tem de invalidar imediatamente
  esse ponto e pedir um novo fix ao dispositivo restante;
- spoofing/reconnect: um salto incompatível não pode limpar a âncora antiabuso;
  a âncora fica apenas em memória até 10 minutos. GPS do cliente não é prova
  forte da posição: antes do lançamento público é obrigatória uma decisão de
  risco e controlos adicionais/limitação de descoberta;
- Hey, mensagem e anexo só entre pessoas autorizadas;
- bloqueio bidirecional e denúncia tanto no mapa/chat como no perfil direto,
  fila e ação de moderação;
- adulterar ou remover uma foto/anexo/prova privada e confirmar que a auditoria
  reprova; confirmar também colisões com `ficheiros_a_apagar`;
- eliminação de conta, ficheiros e sessões, preservando a denúncia pseudonimizada;
- falha de SMTP sem expor segredos e logs sem coordenadas, tokens ou conteúdo;
- pedidos a `/config/config.php`, `/database/`, `/vendor/`, `/docs/` e `/var/`
  devolvem `403`/`404`; access logs não contêm query strings;
- restauro do backup e reinício do WebSocket.

Registar pré-voo, resultado dos testes, testador, data e release. Só retirar a
manutenção com exit code `0`, avisos decididos e todos os testes críticos
aprovados. A falha esperada do workflow de deploy automático não substitui nem
invalida este pré-voo manual.

## 11. Rollback

1. Reativar manutenção e parar PHP/WebSocket da release nova.
2. Preservar logs do incidente sem copiar conteúdo desnecessário.
3. Voltar o código para a release anterior.
4. Se a migração chegou a executar DDL, restaurar base e media do backup
   pré-deploy; não tentar “desfazer” manualmente em produção.
5. Reconciliar separadamente dados criados após o backup, se existirem, com
   decisão documentada.
6. Rodar credenciais se a causa envolver exposição e repetir os smoke tests.

Responsável pela decisão: `[POR PREENCHER]`. Janela de rollback:
`[POR PREENCHER]`. Local dos backups: `[POR PREENCHER — NÃO NESTE REPOSITÓRIO]`.
