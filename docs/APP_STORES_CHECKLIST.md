# Checklist App Store / Google Play — RASCUNHO

> Verificar novamente os requisitos oficiais na data da submissão; políticas,
> SDKs alvo e formulários mudam. Última revisão: 2026-07-26.
> A versão web pode ser testada sem que o wrapper móvel esteja pronto.

## Bloqueios comuns

- `[ ]` responsável legal, morada/contacto aplicável e conta de programador;
- `[ ]` Política de Privacidade, Termos, Regras da Comunidade, Normas de
  Segurança Infantil e suporte em URLs HTTPS públicas e estáveis;
- `[ ]` eliminação da conta dentro da app e URL web funcional;
- `[ ]` inventário real de SDKs/fornecedores e países, sem copiar respostas
  genéricas;
- `[ ]` DPIA/ROPA aprovados, 18+ aplicado no servidor e moderação operacional;
- `[ ]` HTTPS/WSS, media privada, bloqueio/denúncia e teste de segurança;
- `[ ]` nome, ícone, screenshots e descrições sem prometer distância exata,
  anonimato, segurança total ou notificações em background ainda inexistentes;
- `[ ]` conta de revisão adulta, dados fictícios e instruções para demonstrar
  proximidade sem expor pessoas reais.

Localização enviada ao servidor conta como recolhida mesmo sendo efémera. Mensagens
“privadas” não são encriptadas ponto a ponto. Declarar ambos honestamente.

## iOS / App Store Connect

- `[ ]` Bundle ID, assinatura, perfis e versão/build coerentes;
- `[ ]` wrapper usa apenas APIs públicas e oferece valor/experiência suficiente,
  não apenas um WebView quebrado;
- `[ ]` `NSLocationWhenInUseUsageDescription` explica descoberta a 100 m e que
  outras pessoas podem inferir proximidade;
- `[ ]` não pedir localização “Always”/background; se isso mudar, nova DPIA e
  justificação à revisão;
- `[ ]` pedir notificações só em contexto e permitir continuar sem aceitar;
- `[ ]` `PrivacyInfo.xcprivacy` inclui APIs de motivo obrigatório e SDKs reais;
- `[ ]` App Privacy declara, conforme a build: contacto, identificadores,
  localização precisa, fotos/conteúdo do utilizador, mensagens, dados sensíveis
  ou inferíveis, diagnósticos/uso se algum SDK os recolher;
- `[ ]` marcar dados ligados ao utilizador quando associados à conta; marcar
  “tracking” apenas se houver seguimento entre apps/sites — não adicionar SDKs
  de tracking no beta;
- `[ ]` eliminação iniciada na app, sem exigir email/telefone desnecessário;
- `[ ]` classificação etária e questionário respondidos para interação social,
  conteúdo gerado, temas sexuais e localização; não escolher categoria infantil;
- `[ ]` fluxo de conteúdo gerado inclui termos, denúncia, bloqueio, contacto e
  resposta de moderação;
- `[ ]` notas de revisão explicam WebSocket, permissões, conta teste e como
  simular duas pessoas próximas;
- `[ ]` responder às perguntas de exportação de criptografia segundo o uso real
  de TLS e bibliotecas da build;
- `[ ]` se for adicionado login social de terceiros, reavaliar a obrigação de
  oferecer Sign in with Apple.

## Android / Google Play

- `[ ]` package name definitivo, App Signing, AAB e target SDK exigido na data;
- `[ ]` `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` apenas em foreground;
  não declarar `ACCESS_BACKGROUND_LOCATION`;
- `[ ]` `POST_NOTIFICATIONS` quando aplicável e pedido contextual;
- `[ ]` WebView concede geolocalização apenas à origem HTTPS da Margot e não
  ignora erros de certificado;
- `[ ]` formulário Data safety corresponde ao tráfego observado e inclui
  contacto, localização, conteúdo/mensagens, fotos, identificadores e
  diagnósticos reais;
- `[ ]` indicar cifragem em trânsito e possibilidade de eliminação apenas se
  ambos estiverem efetivamente testados;
- `[ ]` Target audience apenas adultos e classificação IARC honesta;
- `[ ]` por ser uma app de encontros/conexões entre pessoas, ativar no Play
  Console a funcionalidade **Restrict Minor Access** e testar que contas
  identificadas como menores pelo Google Play não conseguem instalar/usar;
- `[ ]` página de eliminação web acessível fora da app e link preenchido no
  Play Console;
- `[ ]` política de conteúdo gerado, denúncia de perfil e de mensagem,
  bloqueio numa conversa 1:1 e moderação testadas;
- `[ ]` normas públicas contra exploração/abuso sexual de crianças, contacto
  designado e processo interno de comunicação a entidades competentes;
- `[ ]` secção App content completa: privacidade, acesso de revisão, anúncios
  (nenhuns no beta, se verdadeiro), permissões, conteúdo e segurança infantil;
- `[ ]` usar closed testing antes de produção e responder ao feedback;
- `[ ]` se vender bens digitais no futuro, reavaliar faturação da loja antes de
  implementar pagamentos.

## Wrapper e QA móvel

- `[ ]` cookies/sessão persistem apenas como pretendido e são removidos no logout;
- `[ ]` links de Termos, Privacidade, suporte e eliminação abrem corretamente;
- `[ ]` back/deep links não contornam login ou aceites;
- `[ ]` bloqueio de screenshots/previews é avaliado para ecrãs sensíveis, sem
  prometer proteção absoluta;
- `[ ]` photo picker limita formatos/tamanho e a imagem final perde EXIF;
- `[ ]` notificações não mostram conteúdo sensível por defeito;
- `[ ]` a app funciona com localização/notificações recusadas e explica como
  reativar;
- `[ ]` testes em dispositivo real, rede lenta, suspensão/retoma, mudança de
  conta, perda de sessão e WebSocket reconectado;
- `[ ]` inventário final da build lista todos os SDKs; comparar com os
  formulários antes de cada submissão.

## Registo da submissão

| Campo | iOS | Android |
|---|---|---|
| versão/build | `[POR PREENCHER]` | `[POR PREENCHER]` |
| URL privacidade | `[POR PREENCHER]` | `[POR PREENCHER]` |
| URL eliminação | `[POR PREENCHER]` | `[POR PREENCHER]` |
| formulário revisto por | `[NOME/DATA]` | `[NOME/DATA]` |
| inventário de SDKs | `[ARTEFACTO/DATA]` | `[ARTEFACTO/DATA]` |
| decisão de lançamento | `[APROVADO/BLOQUEADO]` | `[APROVADO/BLOQUEADO]` |
