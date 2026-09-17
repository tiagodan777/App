# Margot — testes e correções da versão 3

Data: 16 de setembro de 2026. Projeto completo: `Margot-reorganizada-v3.zip`.

**Os testes locais passaram. A entrega real de notificações e a localização em segundo plano em iPhone/Android continuam por validar em dispositivos e no servidor.** Não foi feito deploy, não foram usados dados de produção e não foram enviados emails ou notificações a utilizadores.

## Correções incluídas

1. **Registo com género Personalizado:** formulário, resumo e validação passam a usar `P`, conforme o `enum('M','F','P')` do SQL fornecido. Antes, o formulário enviava `D` e o valor `P` era recusado pela validação. Não é necessária uma migração da estrutura fornecida.
2. **Eliminação de conta:** limpa também ligações, estado “Hoje”, estado da app, localizações antigas, mensagens antigas, conversas ocultas, registos de mensagens apagadas e reações de outros membros às mensagens eliminadas. Preserva conversas entre terceiros. Os testes incluem as chaves estrangeiras com cascata existentes no esquema fornecido.
3. **Paragem da localização durante um pedido pendente:** uma resposta atrasada do pedido de token já não volta a iniciar a localização depois de `stop()`. Testado no controlador JavaScript com plugins iOS e Android simulados. Os controlos de cancelamento também abrangem a espera de permissões, a consulta de estado e o arranque nativo.

Mantém as correções de navegação da versão 2. Os dois scripts alterados nesta versão receberam novos URLs de cache. É necessário publicar os ficheiros e voltar a abrir completamente a app para carregar o JavaScript novo.

## Resultados executados

| Conjunto | Resultado | O que foi realmente executado |
| --- | --- | --- |
| PHP e serviços | 261 verificações passaram | Classes reais, PHP 8.3.33, SQLite em memória, assinaturas criptográficas reais com chaves efémeras e transporte push simulado |
| Controladores HTTP | 71 cenários passaram | Pedidos processados pelo PHP WASM, controladores reais, sessão/CSRF/limites reais, base descartável; SMTP e renderização Twig substituídos por doubles |
| JavaScript base | 93 verificações passaram | Sintaxe e regras de localização, avisos e roupas |
| JavaScript push/background | 54 verificações passaram | Controladores reais com plugins Capacitor e HTTP simulados, para iOS e Android |
| Navegação | 207 verificações passaram | DOM, rede e animações simuladas: abas, recursos, scroll, cliques rápidos e histórico |
| Configuração nativa | 30 verificações passaram | IDs, Firebase, permissões, serviço Android, canais/ícone, entitlement APNs, callbacks e registo dos plugins |
| Sintaxe e templates | Passou | 79 ficheiros PHP próprios analisados, classes CMS carregadas, 31 templates Twig compilados |
| Projeto iOS | Passou na análise de sintaxe | Swift analisado; ficheiro do projeto Xcode válido. Não foi compilado nem assinado |

As quantidades são verificações/cenários concretos, não uma percentagem de cobertura nem uma prova de ausência de outros erros.

## Cobertura por funcionalidade

| Funcionalidade | Confirmado localmente | Ainda falta confirmar |
| --- | --- | --- |
| Criação de conta | Campos válidos/inválidos, adulto/menor, consentimentos, telefone opcional, normalização, hash da password, gostos sem duplicação, género Personalizado, restrição de email duplicado | MariaDB real, concorrência e formulário completo nos telemóveis |
| Email e login | Confirmação, expiração e uso único de tokens; login por email/telefone; recusa de password errada e email pendente no controlador; recuperação de password e revogação de tokens | Entrega SMTP, ligações recebidas no email e abertura na app |
| Edição e eliminação | Edição parcial, ordem/autoria/limite de fotografias, eliminação com token e limpeza de referências | Percurso visual, ficheiros reais do servidor e permissões das pastas |
| Fotografias/media | Uploads inválidos/incompletos recusados; PNG convertido pelo serviço real para WebP quadrado e original; atualização de estado e limpeza de temporários | Upload multipart real, HEIC/HEIF, vídeo, câmara/galeria, orientação EXIF e execução assíncrona do worker no servidor |
| Mensagens e Heys | Envio, histórico, leitura, limites, bloqueios, autoria, reações, ocultação, contadores e autorização | Dois clientes reais, rede instável, anexos e reconexões com a infraestrutura publicada |
| WebSocket | Autenticação, origem, identidade, token de uso único, ligações, descoberta e eventos de chat com ligações simuladas | Proxy/TLS, processo persistente e concorrência de utilizadores reais |
| Push iOS | Registo APNs, payload, assinatura ES256, HTTP/2 solicitado, troca para sandbox após BadDeviceToken, erros transitórios/permanentes e destino ao tocar | Chave/Team ID/topic reais, assinatura da app, worker ativo e entrega APNs ao iPhone |
| Push Android | Registo FCM, OAuth RS256, payload com notification/data, canais, erros e destino ao tocar | Conta de serviço, configuração publicada, token real e entrega FCM ao Android |
| Fila push | Um evento por dispositivo, deduplicação, tentativas/backoff, recuperação de jobs interrompidos, token inválido, logout, troca de conta, cancelamento por leitura/bloqueio | Locks e vários workers em MariaDB, corridas entre logout e um envio já iniciado |
| Background | Token e propósito, bearer/corpo, coordenadas, invisibilidade, expiração, preferência desligada, ordem das permissões Android, paragem enquanto se obtém token | Core Location/serviço Android a funcionar com ecrã bloqueado, app suspensa, rede desligada, poupança de bateria e autorização revogada |
| Alertas por proximidade | Background/foreground, contagem, cooldown, exclusão de posições expiradas, invisíveis e bloqueados | Raio de negócio correto, qualidade do GPS e entrega do alerta no dispositivo |
| Abas | Inicialização única, recursos antes de revelar a página, scroll, cliques rápidos, voltar/avançar e movimento reduzido | Fluidez/FPS e gestos no WebView de um iPhone e de um Android reais |

## Pontos ainda abertos

- **Raio de descoberta:** o código original continua com `ProximityConfig::RADIUS_METRES = 1600000` (1 600 km), embora a interface diga 100 m. Foi preservado por poder ser uma configuração intencional de testes. Precisa de decisão antes de validar resultados de proximidade.
- **Localização antiga no Android:** a leitura do serviço mostra que o heartbeat pode reenviar `lastUsableLocation` sem voltar a verificar a idade. O endpoint atual marca a receção como recente e não usa o `timestamp` enviado. A idade real da posição precisa de ser testada com GPS interrompido; não foi alterada a política de presença nesta versão.
- **Pedidos nativos em voo:** a correção JavaScript não prova o cancelamento de pedidos já enviados pelo Swift/Java. No iOS, `stopMonitoring` limpa o estado de envio/ocultação enquanto o HTTP pode continuar; no Android, `finishSend` chama `stopSelf()` num 401 mesmo quando `expireAuthorization` rejeita a expiração de um token antigo. São pontos encontrados na leitura que exigem reprodução e correção com testes nativos, ainda não executados.
- **Mudança de email numa conta confirmada:** `Member::update()` altera o endereço sem limpar `email_verificado_em` nem iniciar uma confirmação do novo endereço. O registo e a confirmação inicial foram testados; a política de reconfirmação de alterações continua por resolver.

## Particularidades das plataformas

No Android, este projeto usa um serviço de localização em primeiro plano, com notificação persistente. Declara `FOREGROUND_SERVICE_LOCATION` e permissões de localização, mas não `ACCESS_BACKGROUND_LOCATION`. Isso não impede, por si só, a continuação de um serviço iniciado com a app visível; o arranque de um serviço a partir do background está sujeito a restrições. Não está validado o reinício após o sistema terminar o processo. [Documentação Android](https://developer.android.com/develop/background-work/services/fgs/service-types#location).

No iOS, o código ativa as atualizações de background no ramo `authorizedAlways`. Existem as descrições de permissões, o modo `location`, os callbacks APNs e o entitlement. Isto confirma a configuração no código, não a autorização concedida no telefone, a assinatura final ou a execução pelo sistema. A autorização e o estado de execução condicionam as atualizações. [Documentação Apple](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background).

O plugin push exige integração APNs no iOS e Firebase no Android; o Android 13+ exige autorização de notificações. Os testes simulados cobrem autorização concedida/recusada, mas não apresentam o diálogo real do sistema. [Documentação Capacitor](https://capacitorjs.com/docs/apis/push-notifications).

## Limites do ambiente usado

Este Mac não tem Xcode completo, SDK Android, emuladores ou MariaDB disponíveis. `xcrun --find xcodebuild` falhou por a ferramenta não existir. Os projetos nativos não foram compilados nem instalados. O Node usado foi 24.19.0; o PHP foi executado localmente em WASM, sem transporte de rede.

SQLite recebeu uma adaptação explícita de algumas expressões MariaDB, índices únicos e chaves estrangeiras do esquema. Continua sem reproduzir integralmente os tipos, collation, códigos de erro do driver, locking e concorrência de MariaDB. O código HTTP foi executado sem servidor web/proxy; os GET de páginas são testes de resposta/controlador, não testes visuais.

Não foram usados os segredos de produção. `PushProvider` foi exercitado com chaves geradas no teste, respostas APNs/FCM simuladas e zero pedidos externos. Ainda não foi recebido um servidor de testes nem acesso a dispositivos.

## Repetir os testes

```sh
composer lint
composer test
npm test
python3 tests/native-config.py
```

Para os testes PHP completos: PHP 8.2+, `pdo_sqlite`, `mbstring`, `openssl`, `curl`, `fileinfo`, `imagick` com WebP. Nenhum teste acima carrega a configuração da base de produção.

Para os controladores, numa cópia local do projeto, iniciar PHP num terminal:

```sh
MARGOT_ISOLATED_TESTS=1 php -S 127.0.0.1:8765
```

Noutro terminal:

```sh
node tests/http.mjs http://127.0.0.1:8765/tests/http-fixture.php
```

A fixture recusa pedidos sem a variável de teste, usa dados fictícios e uma pasta temporária própria para os limites de pedidos. Não deve ser ativada no servidor público. Para navegação, abrir `tests/navigation.html` pelo mesmo servidor local.

## Validação final em ambiente real — pendente

Instalar builds de teste em iPhone e Android e utilizar duas contas fictícias. Verificar registo/confirmar email/login, upload JPEG e HEIC, Hey/mensagem em ambos os sentidos, push com app visível/em background e abertura pelo alerta. Confirmar também recusa/revogação de permissões, logout e troca de conta.

Para localização, comparar os registos do servidor com posição e hora do dispositivo durante movimento, imobilidade, ecrã bloqueado, perda/retorno de rede, invisibilidade e preferência desligada. Distinguir app em background, processo terminado pelo sistema e encerramento forçado pelo utilizador. Repetir com token renovado e um pedido antigo ainda em voo.

No servidor, confirmar o esquema com `php database/check.php`, as extensões, os workers WebSocket/push/imagens e as configurações SMTP/APNs/FCM. O check da base só lê tabelas e colunas; não confirma índices/tipos nem o funcionamento dos workers.
