# DPIA da Margot — RASCUNHO

> Avaliação de Impacto sobre a Proteção de Dados (RGPD, artigo 35).
> Não é uma aprovação jurídica. Última revisão: 2026-07-26.

## Estado e aprovação

| Campo | Valor |
|---|---|
| Responsável pelo tratamento | `[POR PREENCHER — NOME LEGAL]` |
| Dono da DPIA | `[POR PREENCHER]` |
| Encarregado/DPO, se aplicável | `[POR PREENCHER OU N/A JUSTIFICADO]` |
| Âmbito | Web, wrapper iOS e wrapper Android |
| Fase | Beta fechado, por convite, apenas 18+ |
| Decisão | **Não aprovado para lançamento público** |
| Próxima revisão | Antes do primeiro utilizador real e antes de cada mudança material |

Bloqueios: identidade do responsável, fornecedores/subcontratantes, países de
tratamento, contratos, mecanismo de transferência, fundamento definitivo para
localização e responsáveis por moderação/incidentes.

## 1. Porque é necessária

A Margot junta localização em tempo real, descoberta de pessoas fisicamente
próximas, perfis sociais e mensagens privadas. Pode permitir inferências sobre
relações, hábitos, sexualidade ou presença num local e cria riscos de assédio,
perseguição e reidentificação. A combinação justifica uma DPIA antes do
tratamento público, mesmo que cada coordenada seja efémera.

## 2. Operação e fluxos

| Fluxo | Dados | Destino/acesso | Duração pretendida |
|---|---|---|---|
| Conta | nome, data de nascimento, género opcional, objetivo, email, telefone opcional, password hash | base de dados; equipa autorizada | enquanto a conta existir |
| Perfil | nome, idade calculada, fotos, objetivo, bio, gostos | pessoas autenticadas e autorizadas | enquanto a conta existir |
| Descoberta | coordenadas e precisão do dispositivo | memória do WebSocket; outros recebem apenas presença autorizada | até 30 s sem atualização |
| Guarda antiabuso | última coordenada/precisão aceite | memória do processo WebSocket; nunca é mostrada | até 10 min |
| Interações | Heys, bloqueios e preferências | base de dados; participantes | enquanto a conta existir |
| Conversas | texto e fotos convertidas para WebP | base de dados/media privada; participantes; acesso restrito em investigação | enquanto a conta existir |
| Denúncias | motivo, texto, snapshot mínimo e decisão | moderadores | caso aberto + até 12 meses |
| Segurança | tokens com hash, bilhetes WebSocket, IP/limites e logs mínimos | sistemas operacionais autorizados | conforme `RETENTION.md` |
| Email | endereço e comunicação transacional | fornecedor ainda não identificado | `[POR PREENCHER]` |

Não existe encriptação ponto a ponto. A localização não deve ser persistida nem
enviada ao browser como coordenada ou distância exata. A guarda de 10 minutos é
volátil, serve apenas para impedir que reconnects reiniciem o limite de
velocidade e deve ser eliminada automaticamente.

## 3. Finalidades e fundamentos propostos

| Finalidade | Fundamento proposto | Decisão pendente |
|---|---|---|
| criar conta, mostrar perfil, Heys e mensagens | execução dos Termos | confirmar necessidade de cada campo |
| localização/descoberta opcional | consentimento específico e revogável | validação jurídica; a permissão do SO não substitui o registo da escolha |
| prevenir fraude, bloqueios e segurança | interesse legítimo | documentar teste de ponderação |
| receber e decidir denúncias | interesse legítimo/defesa de direitos; obrigação quando aplicável | confirmar por categoria |
| cumprir pedidos válidos de autoridades | obrigação legal | processo de validação do pedido |
| marketing futuro | consentimento separado | não implementar no beta |

Dados que revelem ou permitam inferir categorias especiais exigem avaliação
caso a caso e fundamento adicional do artigo 9. Não usar esses dados para
segmentação ou publicidade.

## 4. Necessidade e minimização

Medidas previstas/implementadas:

- acesso apenas 18+, com validação no servidor e contas antigas suspensas;
- localização desligada por defeito, expiração em 30 s, raio fixo de 100 m,
  sem distância exata e funcionamento fechado quando falta localização;
- âncora antiabuso separada, apenas em memória até 10 minutos e sem logs;
- bilhete WebSocket curto, de utilização única, e origem permitida explícita;
- mensagens apenas após proximidade autorizada ou relação existente;
- bloqueio bidirecional, rate limits, denúncia e registo de moderação;
- anexos privados, reprocessados para WebP e sem metadados EXIF;
- password e tokens guardados por hash; HTTPS/WSS obrigatório;
- eliminação da conta e pseudonimização de denúncias ainda necessárias;
- aceites legais versionados, sem caixas pré-selecionadas.

Dados a justificar ou remover antes do público: telefone, género, apelido
completo, todas as fotos e qualquer log que inclua identificadores diretos.

## 5. Riscos e medidas

Escala: probabilidade/impacto baixo, médio ou alto após as medidas existentes.

| Risco | P/I | Medidas obrigatórias | Residual |
|---|---|---|---|
| perseguição ou triangulação | M/A | sem distância exata; localização curta; limites; invisível + desligar localização; teste com contas coordenadas | M |
| GPS forjado e scan remoto | M/A | convites fechados; rate limit; âncora de velocidade que sobrevive a reconnect por 10 min; não mostrar coordenadas/distância | **M/A — GPS do cliente não é atestado; bloqueio para lançamento público até decisão/medidas adicionais** |
| inferir presença em local sensível | M/A | explicação clara; raio mínimo necessário; sem histórico; controlo imediato; não enviar notificações de presença | M |
| personificação no WebSocket | B/A | ticket único de 30 s, sessão ativa, `Origin` restrita, WSS e rate limit | B |
| menor criar conta ou contactar adultos | M/A | 18+ no servidor, suspensão de contas antigas, convites conhecidos, denúncia e revisão | M |
| assédio, spam ou conteúdo sexual abusivo | M/A | bloqueio, denúncia, limites, moderadores, escalamento e recurso | M |
| acesso indevido a mensagem/media | B/A | autorização por participante, media fora de `public`, nomes aleatórios, no-store e testes IDOR | B |
| exposição por notificação no ecrã | M/M | opt-in, texto explicativo, opção sem pré-visualização no wrapper | B/M |
| fuga da base, credenciais ou backups | M/A | menor privilégio, segredos fora do Git, rotação, cifragem, backups testados e logs sem conteúdo | M |
| retenção excessiva ou eliminação incompleta | M/M | calendário, cron, backup máximo, prova de purga e exceção legal documentada | B/M |
| decisões de moderação erradas | M/M | dupla revisão nos casos graves, motivos, auditoria e recurso | M |
| fornecedor/transferência desconhecido | A/A | inventário, DPA, países e mecanismo de transferência antes do público | **A — bloqueio** |

## 6. Testes de eficácia

Antes de cada release:

1. tentar observar perfis sem coordenadas recentes, fora do raio e após bloquear;
2. reutilizar/forjar bilhetes WebSocket e alterar `Origin`;
3. tentar obter media como terceiro e por URL direta;
4. manipular a data de nascimento no pedido;
5. apagar uma conta com conversa e denúncia aberta;
6. procurar coordenadas, tokens, passwords, mensagens e emails em logs;
7. medir a purga de tickets, tokens, logs, backups e denúncias;
8. confirmar que invisibilidade e “desligar localização” têm efeitos diferentes
   e estão explicados;
9. forjar coordenadas, provocar um frame inválido, alternar presença e
   reconnectar; confirmar que a âncora não é apagada e que saltos incompatíveis
   continuam bloqueados.

Guardar evidência dos resultados sem dados reais.

## 7. Consulta e decisão residual

No beta, recolher feedback voluntário e anonimizado sobre clareza, sensação de
segurança, localização, bloqueio e denúncia. Não pedir a participantes que criem
situações de risco.

Se, após as medidas, permanecer risco elevado que não possa ser reduzido, obter
aconselhamento especializado e avaliar consulta prévia à CNPD antes do
tratamento (artigo 36). Assinaturas:

- produto/engenharia: `[NOME, DATA, DECISÃO]`;
- privacidade/jurídico: `[NOME, DATA, DECISÃO]`;
- segurança/moderação: `[NOME, DATA, DECISÃO]`.

## 8. Gatilhos de nova DPIA

Rever antes de: aumentar o raio ou guardar histórico; localização em background;
ranking/IA ou reconhecimento; publicidade/analytics; menores; novos países;
novas categorias de conteúdo; novo fornecedor; partilha com terceiros; alteração
material da retenção; incidente grave ou aumento significativo de utilizadores.
