# Registo de atividades de tratamento (ROPA) — RASCUNHO

> Modelo de trabalho para o artigo 30 do RGPD. Última revisão: 2026-07-26.
> Não lançar publicamente até preencher responsáveis, destinatários,
> fornecedores, países e prazos pendentes.

## Identificação

| Campo | Valor |
|---|---|
| Responsável | `[POR PREENCHER — NOME LEGAL]` |
| Morada legal | `[POR PREENCHER]` |
| Contacto de privacidade | `[POR PREENCHER]` |
| Representante UE, se aplicável | `[POR PREENCHER OU N/A]` |
| DPO, se aplicável | `[POR PREENCHER OU N/A JUSTIFICADO]` |
| Dono e versão do registo | `[POR PREENCHER]` / `draft-2026-07-26` |

## Atividades

| Atividade/finalidade | Titulares e dados | Fundamento proposto | Destinatários | Prazo | Medidas principais |
|---|---|---|---|---|---|
| Conta e autenticação | adultos candidatos/membros; nome, nascimento, género opcional, objetivo, email, telefone opcional, password hash, aceites | contrato; obrigação/defesa quando aplicável | pessoal autorizado; alojamento/DB `[FORNECEDOR]` | conta ativa; eliminação conforme política | hash, TLS, sessão segura, 18+, acesso mínimo |
| Perfil e descoberta | membros; nome, idade, fotos, bio, gostos, objetivo, presença aproximada | contrato; localização: consentimento proposto `[VALIDAR]` | membros autenticados autorizados | perfil até apagar; descoberta em memória até 30 s | raio 100 m, sem distância/coordenadas no cliente, opt-in |
| Heys e notificações | membros; remetente, destinatário, estado e hora | contrato; permissão do dispositivo | participantes; canal push `[SE EXISTIR/FORNECEDOR]` | conta ativa | limites, bloqueio, previews configuráveis |
| Mensagens e fotos | participantes; texto, foto WebP, metadados mínimos, leitura/hora | contrato; segurança: interesse legítimo | participantes; moderador apenas por denúncia/necessidade | conta ativa; cópia mínima em denúncia até 12 meses | media privada, autorização, sem EXIF, sem E2EE |
| Bloqueios e denúncias | denunciante/denunciado; motivo, descrição, snapshot, decisão, pseudónimo | interesse legítimo; obrigação/defesa quando aplicável | moderadores; autoridades apenas com base válida | caso aberto + 12 meses, salvo retenção legal | segregação, auditoria, acesso por função |
| Suporte, direitos e eliminação | membros/requerentes; contacto, pedido, prova mínima e resposta | obrigação legal; contrato | equipa autorizada; email `[FORNECEDOR]` | `[POR PREENCHER E JUSTIFICAR]` | verificação de identidade, canal restrito |
| Segurança e prevenção de abuso | membros/visitantes; IP pseudonimizado quando possível, última coordenada/precisão aceite, eventos, tokens, falhas | interesse legítimo | operação/segurança; alojamento `[FORNECEDOR]` | âncora de localização só em memória até 10 min; rate limit até 48 h; logs/backups até 30 dias | âncora não visível/não persistida, hashes, menor privilégio, rotação, alertas |
| Email transacional | membros; email, nome quando necessário, tipo de envio | contrato/segurança | SMTP `[FORNECEDOR E PAÍS]` | `[POR PREENCHER]` | TLS, conteúdo mínimo, sem marketing |

## Categorias que exigem atenção

Localização, mensagens, fotos, género, objetivo, bio e padrões de proximidade
podem revelar informação íntima ou permitir inferências de categorias especiais.
Não tratar essas inferências como atributos, não criar segmentos e não as
partilhar para publicidade.

## Subcontratantes e transferências

Preencher antes do público; “usa cloud/email” não é inventário suficiente.

| Serviço | Entidade legal | Dados/local | Subcontratantes | Países | DPA | Transferência/garantias | Retenção |
|---|---|---|---|---|---|---|---|
| alojamento/web/DB | `[POR PREENCHER]` | `[POR PREENCHER]` | `[POR PREENCHER]` | `[POR PREENCHER]` | `[LINK/DATA]` | `[EEE/SCC/OUTRO]` | `[PRAZO]` |
| backups | `[POR PREENCHER]` | `[POR PREENCHER]` | `[POR PREENCHER]` | `[POR PREENCHER]` | `[LINK/DATA]` | `[MECANISMO]` | `máx. 30 dias proposto` |
| email | `[POR PREENCHER]` | email e conteúdo mínimo | `[POR PREENCHER]` | `[POR PREENCHER]` | `[LINK/DATA]` | `[MECANISMO]` | `[PRAZO]` |
| distribuição iOS/Android | Apple/Google apenas quando submetido | `[CONFIRMAR NO PORTAL]` | conforme termos aceites | `[CONFIRMAR]` | termos aplicáveis | `[CONFIRMAR]` | conforme conta de loja |

Se não houver transferência fora do EEE, registar “não” e a evidência. Se
houver, documentar mecanismo, avaliação e medidas suplementares; não assumir.

## Direitos e divulgação

Canal: `[EMAIL/URL POR PREENCHER]`. Dono: `[POR PREENCHER]`. Registar receção,
verificação proporcional, pesquisa, decisão, resposta e eliminação do dossiê.
Pedidos de autoridades são validados quanto a identidade, competência, âmbito e
base; divulgar apenas o mínimo e guardar o registo.

## Manutenção do ROPA

Rever trimestralmente durante o beta e antes de qualquer novo fornecedor,
finalidade, país, categoria de dados ou prazo. Anexar o mapa técnico, contratos,
teste de interesse legítimo, DPIA e evidência das purgas. Aprovação:
`[NOME/FUNÇÃO/DATA]`.
