# Retenção e eliminação — RASCUNHO

> Política técnica proposta para o beta fechado. Última revisão: 2026-07-26.
> Prazos jurídicos e contratos de fornecedores ainda exigem validação.

Princípio: guardar apenas o necessário, pelo menor prazo aplicável, e conseguir
demonstrar a eliminação. “Oculto” não significa “eliminado”.

## Calendário

| Dados | Prazo normal | Evento e ação |
|---|---|---|
| coordenadas usadas na descoberta | memória até 30 s sem atualização | expirar automaticamente; nunca gravar em DB/log |
| última âncora de localização antiabuso | memória do processo WebSocket até 10 min | limitar saltos/reconnects; não é mostrada, persistida nem registada; expirar automaticamente |
| bilhete WebSocket | 30 s e utilização única | consumir na autenticação; purgar expirados de hora a hora |
| ficheiros do rate limiter | até 48 h | o job horário remove ficheiros mais antigos |
| cookie/token “lembrar-me” | até 14 dias | apagar no logout, suspensão, ban ou eliminação; purga horária após expiração |
| outros tokens | validade configurada, máximo técnico 30 dias | apagar após uso/expiração e na eliminação da conta |
| conta, perfil, estado atual das preferências e aceites | enquanto existir a conta | apagar com a conta |
| histórico de concessão/revogação de localização e notificações | enquanto existir a conta | registo append-only, apagar com a conta; não contém coordenadas |
| fotos de perfil | enquanto usadas pela conta | apagar ficheiros e metadados com a conta; falhas ficam numa fila sem ID de membro; temporários em 24 h |
| mensagens e anexos | enquanto as contas existirem | apagar quando uma conta participante é eliminada; repetir falhas pela fila, salvo prova mínima numa denúncia |
| Heys/notificações | enquanto a conta existir | se ambos ocultarem, purgar após 30 dias; apagar com a conta |
| bloqueios | enquanto a conta existir | apagar com a conta |
| denúncia aberta | até decisão | acesso só a moderadores |
| denúncia encerrada, ações e cópia mínima de media denunciada | 12 meses após encerramento | purgar metadados e ficheiro privado em `reter_ate`; prolongar apenas com motivo legal registado |
| logs operacionais/segurança | máximo 30 dias | rotação e eliminação; sem conteúdo, coordenadas ou tokens |
| backups | máximo 30 dias | expiração automática, cifrada e testada |
| suporte/pedidos de direitos | `[POR PREENCHER]` | definir após validação jurídica e contrato do canal |
| email no fornecedor | `[POR PREENCHER]` | configurar e verificar no fornecedor real |

## Eliminação de conta

O fluxo exige sessão, palavra-passe, texto de confirmação e CSRF. Deve:

1. terminar sessões e apagar tokens/bilhetes;
2. apagar perfil, contactos, preferências, aceites, fotos, mensagens, anexos,
   Heys e bloqueios;
3. manter apenas denúncias/provas necessárias, substituindo IDs por pseudónimos
   HMAC e removendo a associação direta;
4. deixar o conteúdo sair dos backups por expiração, no máximo em 30 dias;
5. colocar nomes técnicos de media numa fila de repetição antes de apagar os
   índices da conta; remover cada item da fila após confirmar que o ficheiro já
   não existe;
6. registar apenas contagens, sucesso/falha e hora, sem guardar novamente os
   dados apagados ou o ID do membro.

Uma denúncia não é justificação para conservar a conta inteira. A prova deve ser
um snapshot mínimo, privado e com `reter_ate`.

## Retenção legal excecional

Uma suspensão de purga exige: identificador do caso, dados exatos, fundamento,
decisor, início, revisão e fim. Restringir o acesso e não reutilizar os dados.
Na ausência de campo próprio, manter um registo restrito fora deste repositório e
ajustar `reter_ate`; implementar um campo auditável antes do lançamento público.

## Operação

- de hora a hora: executar `php [APP_ROOT]/bin/cleanup-retention.php`, que apaga
  tickets/tokens expirados, Heys ocultos vencidos, rate limits antigos,
  denúncias após `reter_ate` e repete media pendente em
  `ficheiros_a_apagar`; também relança workers de fotos pendentes e elimina
  media privada órfã com mais de 24 horas;
- diariamente: rodar logs e rever itens da fila que atingiram 20 tentativas,
  sem deixar esses itens bloquear os seguintes;
- mensalmente: rever retenções legais e testar uma amostra das purgas;
- mensalmente: confirmar expiração dos backups e do fornecedor de email;
- trimestralmente: comparar tabelas, discos, logs e contratos com este calendário.

O cron e a ordem operacional estão em `docs/DEPLOY_BETA.md`. Cada execução
deve produzir métricas agregadas: categoria, quantidade apagada, data, release e
resultado. Nunca colocar identificadores ou conteúdo no relatório de purga.
Nunca apagar `profile/temp` ou outra media só por idade com `find -delete`: o
job confirma primeiro que o ficheiro não está referenciado. Uma entrada da fila
esgotada só desaparece automaticamente depois de o ficheiro já não existir; se
continuar presente, exige intervenção manual.

## Verificação e falhas

Alerta se um job não correr, se o armazenamento crescer fora do esperado ou se
existirem registos para lá do prazo. Numa falha: parar novas retenções
desnecessárias, corrigir o job, executar a purga em falta, registar o incidente e
avaliar impacto. Dono: `[POR PREENCHER]`; substituto: `[POR PREENCHER]`.
