# Margot — resumo das correções do beta fechado

> Estado em 2026-07-26. Este documento descreve a release corrigida; não
> substitui aconselhamento jurídico individual nem o ensaio obrigatório em
> staging.

## Resultado

O código foi preparado para um **beta fechado, por convite e apenas 18+**. Não
deve ser publicado diretamente: primeiro aplica a migração numa cópia da base,
preenche a configuração real e obtém um resultado sem falhas de
`bin/preflight-beta.php`.

O lançamento público e as lojas continuam deliberadamente bloqueados até
estarem concluídos os itens manuais no fim deste documento.

## O que foi corrigido, por ordem

1. **Configuração e sessões**
   - segredos saíram do código e passam a vir do ambiente ou de um
     `config.local.php` não versionado;
   - cookies/sessões são `Secure`, `HttpOnly`, `SameSite=Lax`, com rotação de ID;
   - tokens persistentes são aleatórios, guardados por hash e rodados depois de
     restaurarem uma sessão;
   - mudar a palavra-passe incrementa uma versão de autenticação e termina
     outras sessões web/WebSocket e bilhetes pendentes;
   - CSRF, CSP com nonce, HSTS em produção, erros genéricos e rate limits
     privados foram aplicados.

2. **Localização e WebSocket**
   - coordenadas ficam apenas em memória por um período curto;
   - só aparecem pessoas com localização autorizada, precisão aceitável e
     distância calculada até 100 m;
   - o browser autentica por bilhete de utilização única e origem permitida;
   - tokens de proximidade ficam vinculados ao par e expiram rapidamente;
   - esses tokens passaram a ser cifrados; ao abrir um perfil são trocados por
     uma autorização curta de sessão e a URL fica limpa;
   - desligar localização ou ativar invisibilidade é persistido primeiro na
     base e propagado a todas as ligações da conta;
   - fechar/desligar o dispositivo que forneceu a posição invalida-a mesmo
     quando existe outra ligação, e uma âncora volátil de 10 minutos impede que
     reconnects limpem o controlo de velocidade.

3. **Perfis, mensagens e media**
   - fotos e anexos saíram do document root e só são servidos por endpoints com
     autorização;
   - imagens são validadas, limitadas, recodificadas para WebP e ficam sem EXIF;
   - imagens animadas/multi-frame e dimensões abusivas são rejeitadas;
   - workers de fotos usam lock por membro, ficheiros temporários e promoção
     atómica;
   - o PHP CLI do worker é configurável e testado no pré-voo;
   - media órfã e temporários são reconciliados pela rotina de retenção;
   - uma auditoria BD↔disco reprova ficheiros em falta, MIME/tamanho incorretos,
     hashes de prova alterados e colisões com a fila de eliminação.

4. **Bloqueio, denúncia e moderação**
   - bloquear funciona nos dois sentidos para descoberta, perfil, Heys,
     mensagens e media;
   - é possível bloquear/denunciar no mapa, no perfil direto e no chat, e
     denunciar uma mensagem recebida;
   - media denunciada recebe uma cópia privada mínima, acessível apenas a
     moderadores, verificada por SHA-256 e eliminada com a denúncia;
   - existe fila de moderação, histórico de decisões, suspensão/ban e recurso.

5. **Privacidade, idade e eliminação**
   - data de nascimento e confirmação 18+ são validadas no servidor;
   - género deixou de ser obrigatório; a finalidade/necessidade de o conservar
     continua a ter de ser decidida antes do público;
   - contas antigas sem 18+ válido ficam suspensas pela migração;
   - Termos/Privacidade têm versão, hash canónico e registo append-only;
   - concessões/revogações de localização e notificações têm histórico;
   - apagar conta exige palavra-passe, `APAGAR` e CSRF;
   - chaves estrangeiras e uma fila de ficheiros impedem órfãos durante escritas
     concorrentes; denúncias necessárias ficam pseudonimizadas e minimizadas.

6. **Beta controlado**
   - registo fechado com códigos fortes;
   - router por allowlist, endpoints internos fora da web e deploy parcial
     automático bloqueado;
   - a migração preserva conteúdo legado/órfão em quarentenas e o pré-voo
     mantém a beta fechada enquanto houver linhas por reconciliar;
   - documentos de DPIA, ROPA, retenção, incidentes, moderação, stores e deploy
     foram preparados como rascunhos executáveis.

7. **Operação e validação**
   - `bin/preflight-beta.php` reprova ambientes sem produção HTTPS, segredos
     fortes, identidade legal, duas pessoas de moderação, esquema coerente,
     PHP CLI/worker, media privada íntegra e permissões seguras;
   - `bin/cleanup-retention.php` é serializado, aplica retentativas com limite,
     purga retenções e reconcilia media;
   - a migração exigida está em
     `database/migrations/20260726_security_beta.sql`.

## Passos obrigatórios antes de convidar amigos

1. Manter o repositório privado e rodar todas as credenciais que alguma vez
   estiveram no ZIP/Git: base de dados, SMTP, alojamento e outras.
2. Criar backup cifrado e restaurá-lo num ambiente separado.
3. Ensaiar a migração MariaDB 10.11+ nesse ambiente. Como contém DDL com commits
   implícitos, uma falha exige restaurar o backup antes de repetir.
4. Preencher `LEGAL_OPERATOR_NAME`, `LEGAL_ADDRESS`,
   `LEGAL_CONTACT_EMAIL`, `APP_URL`, `APP_KEY`, base de dados, origens WSS e
   convites.
5. Atribuir `role=moderator` ou `role=admin` a duas contas adultas e treinar
   ambas com `docs/MODERATION_PLAYBOOK.md`.
6. Rever e fechar `docs/legal/DPIA_DRAFT.md`, `docs/legal/ROPA_DRAFT.md`,
   fornecedores/subcontratantes, transferências e prazos.
7. Migrar media privada, configurar proxy WSS/cron e executar:

   ```sh
   php bin/preflight-beta.php
   ```

8. Só convidar pessoas quando o comando terminar com código `0`; testar em dois
   dispositivos as jornadas listadas em `docs/DEPLOY_BETA.md`.

O dump recebido referencia media que não veio no ZIP: há 5 fotografias
pendentes e 11 completas sem os respetivos conjuntos de ficheiros. Isto é uma
falha esperada do pré-voo, não algo a contornar. Restaurar media autorizada em
`var/private/` ou reconciliar/remover conscientemente as contas/registos de
teste antes do beta.

## Antes de publicidade pública ou lojas

- abrir atividade/constituir a entidade adequada e confirmar obrigações fiscais;
- implementar e testar verificação de email e recuperação de conta;
- concluir wrappers iOS/Android, manifests de privacidade, permissões e
  formulários reais das lojas;
- no Google Play, configurar **Restrict Minor Access** para a app 18+;
- testar resposta de moderação, pedidos de direitos e incidente/data breach;
- decidir e testar uma mitigação adicional para GPS forjado/scan remoto; o
  servidor limita saltos, mas não consegue atestar que o GPS do cliente é real;
- remover a recolha/conservação de género ou aprovar uma finalidade necessária,
  transparente e efetivamente implementada;
- fazer revisão jurídica final dos textos e DPIA;
- remover fotos/segredos do histórico Git antes de tornar o repositório público.

O repositório analisado contém apenas a aplicação web/PWA; não contém um projeto
Xcode ou Android/Gradle. Por isso, assinatura, binaries, permissões nativas e
submissões às lojas não fazem parte desta release.

## Limites da validação feita

- JavaScript passou `node --check`;
- PHP não-vendor passou um parser AST independente;
- `git diff --check` passou;
- o pacote foi inspecionado para excluir dumps, segredos locais, `.git`, logs,
  media privada e fotografias reais;
- este ambiente não tem executável PHP nem MariaDB, por isso a migração e os
  fluxos HTTP/WebSocket têm de ser executados em staging antes do beta.

Consulta `docs/DEPLOY_BETA.md` para a ordem completa, testes e rollback.
