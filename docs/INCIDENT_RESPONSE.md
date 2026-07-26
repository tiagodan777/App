# Resposta a incidentes — RASCUNHO

> Runbook do beta fechado. Última revisão: 2026-07-26.
> Não promete monitorização 24/7; essa capacidade tem de existir antes do público.

## Contactos e autoridade

| Função | Pessoa/canal |
|---|---|
| coordenador do incidente | `[POR PREENCHER]` |
| engenharia/infraestrutura | `[POR PREENCHER]` |
| privacidade/jurídico | `[POR PREENCHER]` |
| moderação/segurança de pessoas | `[POR PREENCHER]` |
| fornecedor de alojamento | `[POR PREENCHER — ENTIDADE E CANAL]` |
| fornecedor de email | `[POR PREENCHER — ENTIDADE E CANAL]` |
| contacto público | `[POR PREENCHER]` |

O coordenador pode colocar a aplicação em manutenção, parar o WebSocket, revogar
tokens/credenciais e suspender funcionalidades. Só o responsável designado
decide comunicações externas, com aconselhamento jurídico.

## Severidade

- **S0 crítica:** localização, mensagens, credenciais ou base expostas; controlo
  de contas; risco físico; exploração sexual de menores; serviço comprometido.
- **S1 alta:** acesso indevido limitado, bypass de bloqueio/media, abuso grave,
  perda parcial ou indisponibilidade de controlos de segurança.
- **S2 média/baixa:** falha sem acesso confirmado, spam contido, erro operacional
  sem dados sensíveis.

Na dúvida entre níveis, começar pelo mais alto e reduzir com evidência.

## Primeira hora

1. Abrir um registo com hora UTC, relator, sintoma e decisor; não copiar conteúdo
   pessoal para chats ou tickets inseguros.
2. Conter: manutenção, parar WSS/rota afetada, bloquear conta/IP quando
   proporcional, revogar sessões e chaves comprometidas.
3. Preservar logs e artefactos mínimos em armazenamento restrito, com hashes,
   origem, hora e cadeia de acesso. Não “investigar” alterando o original.
4. Confirmar se o risco para pessoas exige ação imediata; a Margot não é um
   serviço de emergência.
5. Contactar fornecedores relevantes pelos canais contratuais já validados.

## Até 24 horas

- determinar início/fim, sistemas, vulnerabilidade, dados/categorias, quantidade
  aproximada, titulares e países;
- separar facto, hipótese e desconhecido;
- corrigir ou manter isolado; rodar segredos pela dependência correta;
- avaliar confidencialidade, integridade, disponibilidade e risco físico/social;
- identificar medidas já tomadas e plano de recuperação;
- envolver privacidade/jurídico e preparar a decisão de notificação.

## Notificação e registo

Se uma violação de dados pessoais puder criar risco para direitos e liberdades,
avaliar notificação à autoridade competente, incluindo a CNPD quando aplicável,
sem demora indevida e, quando exigido pelo RGPD, até 72 horas após conhecimento.
Se o risco for elevado, comunicar também aos titulares sem demora indevida, salvo
exceção legal aplicável.

Documentar todas as violações, mesmo quando se decide não notificar: factos,
efeitos, avaliação, decisão, medidas e aprovador. Se a informação ainda não
estiver completa, não atrasar indevidamente a notificação inicial; complementar.

Nunca usar este documento como substituto de avaliação jurídica do caso real.

## Playbooks Margot

| Situação | Contenção imediata | Verificação |
|---|---|---|
| segredo no Git/log | revogar e substituir; remover acesso; preservar commit/log | procurar uso indevido e todas as cópias/backups |
| personificação WebSocket | parar proxy/processo; revogar tickets/sessões; restringir origem | testar ticket único, expiração, membro ativo e WSS |
| fuga/inferência de localização | parar descoberta/WSS; reiniciar para limpar memória | logs, clientes afetados, ausência de persistência e distância |
| acesso indevido a media | desativar rota; retirar media pública; preservar amostra mínima | autorização de ambos os participantes, URLs e caches |
| extração da base/backups | isolar DB, rodar credenciais, preservar auditoria | tabelas/campos, janela, downloads e terceiros |
| abuso/ameaça grave | suspender conta, preservar prova mínima, acionar playbook de moderação | segurança do alvo, bloqueios, decisão e obrigação de reporte |

## Recuperação

Restaurar apenas uma versão corrigida, a partir de artefacto conhecido, depois de
smoke tests de autenticação, WSS, proximidade, media, bloqueio e eliminação.
Monitorizar recorrência e efeitos colaterais. Informar pessoas afetadas com
linguagem clara: o que aconteceu, dados, risco, medidas e contacto, sem revelar
dados de terceiros ou detalhes que aumentem o ataque.

## Encerramento

Dentro de `[PRAZO INTERNO A DEFINIR]`, fazer revisão sem culpabilização:
causa, linha temporal, controlos que falharam, impacto, decisões, ações com dono
e data. Atualizar DPIA, ROPA, testes, retenção e formação. Realizar um exercício
de mesa antes do beta e semestralmente durante operação pública.
