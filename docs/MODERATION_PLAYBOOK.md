# Playbook de moderação — RASCUNHO

> Beta fechado, apenas 18+. Última revisão: 2026-07-26.
> A denúncia na Margot não é um canal de emergência nem implica cobertura 24/7.

## Princípios

Proteger a pessoa potencialmente afetada, minimizar dados, agir de forma
consistente, registar o motivo, ouvir recurso e limitar o acesso. Uma denúncia é
uma alegação, não prova. Não prometer anonimato absoluto; manter a identidade do
denunciante restrita e não a mostrar ao denunciado.

## Equipa e acesso

- moderador principal: `[POR PREENCHER]`;
- substituto: `[POR PREENCHER]`;
- escalamento jurídico/privacidade: `[POR PREENCHER]`;
- escalamento técnico: `[POR PREENCHER]`.

Usar contas individuais com `role=moderator`/`admin`, nunca partilhadas. Rever
acessos mensalmente. `MODERATOR_MEMBER_IDS` é só recuperação temporária.

## Triagem

| Prioridade | Exemplos | Alvo interno de primeira análise |
|---|---|---|
| P0 | risco físico iminente, ameaça credível, exploração/abuso sexual de criança, sextorsão, conteúdo íntimo sem consentimento | assim que observado; suspender preventivamente se necessário |
| P1 | perseguição, assédio, doxxing, fraude, personificação grave, contorno de bloqueio | até 24 h no beta |
| P2 | spam, perfil enganador, conteúdo ofensivo sem ameaça, conflito comum | até 72 h no beta |

Estes alvos são internos. Se não houver cobertura para os cumprir, pausar
convites e não lançar publicamente.

## Processo

1. Abrir a denúncia e marcar `em_analise`; verificar duplicados e bloqueio.
2. Ver apenas a evidência necessária. Não explorar conversas ou perfis alheios
   sem relação com a alegação.
3. Nos casos P0, pedir segunda revisão quando isso não atrasar proteção.
4. Escolher uma ação: sem ação, rejeitar, registar advertência, suspender ou
   banir. A app não envia a advertência automaticamente: comunicar pelo canal
   operacional aprovado e registar a nota; nunca assumir que a pessoa foi
   avisada apenas porque o botão foi usado.
5. Escrever nota factual: regra, evidência considerada, ação, duração e revisor.
6. Confirmar revogação de sessões/tickets após suspensão/ban.
7. Comunicar decisão e via de recurso sem revelar denunciante ou métodos
   sensíveis.
8. Definir `reter_ate` e fechar; acompanhar possível retaliação/contorno.

## Matriz de decisão

| Situação confirmada | Ação base | Escalamento |
|---|---|---|
| spam/primeira infração leve | advertir ou limitar; reincidência suspende | técnico se automatizado |
| perfil falso/personificação | suspender enquanto verifica; banir se malicioso | suporte/recurso |
| assédio, perseguição, doxxing | suspender/banir; preservar contexto mínimo; reforçar bloqueio | segurança/privacidade |
| ameaça credível ou risco físico | suspensão imediata e plano de segurança | coordenador de incidente/jurídico |
| conteúdo íntimo sem consentimento | retirar acesso, suspender, preservar mínimo | jurídico/privacidade |
| suspeita de menor/conta <18 | suspender imediatamente; não pedir documento por chat | processo de idade `[POR DEFINIR]` |
| exploração/abuso sexual de criança | isolar, suspender, restringir prova e escalar imediatamente | jurídico e canal oficial aplicável |
| denúncia não sustentada | resolver sem ação, explicando limites | segunda revisão se grave |
| denúncia abusiva repetida | limites/advertência; nunca punir uma denúncia de boa-fé só por não ser provada | segunda revisão |

Em suspeita de material de abuso sexual de crianças, não descarregar, reenviar,
duplicar nem investigar informalmente. Restringir o acesso e seguir o processo
legal/especializado definido em `[POR PREENCHER]`.

## Evidência e privacidade

Guardar apenas ID da denúncia, motivo, texto, contexto necessário, snapshot
mínimo, ações e horas. Media probatória deve ficar fora de `public`, cifrada ou
com controlo equivalente, e acessível apenas a pessoas designadas. Não guardar
coordenadas. Casos encerrados expiram normalmente em 12 meses; uma exceção
legal precisa de motivo, decisor e revisão.

Quando uma conta é apagada, pseudonimizar os IDs na denúncia; não apagar o caso
antes de `reter_ate`, nem conservar o perfil/conversa inteira.

## Recursos e qualidade

Canal de recurso: `[POR PREENCHER]`. Um moderador diferente revê decisões P0/P1
quando possível. Registar resultado sem reabrir acesso desnecessário.

Semanalmente no beta, rever: fila envelhecida, decisões por tipo, reincidência,
contorno de bloqueios, falsos positivos e incidentes. Não criar rankings de
pessoas nem métricas públicas com poucos casos. Formação obrigatória antes do
acesso: regras, privacidade, trauma, evidência, incidentes e uso do painel.
