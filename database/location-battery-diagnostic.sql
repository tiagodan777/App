-- Replace both UUIDs. Read-only snapshots: run while phones stay locked; do not reopen Margot.
SET @membro_a = 'UUID-DA-CONTA-DO-IPHONE';
SET @membro_b = 'UUID-DA-CONTA-DO-ANDROID';
SELECT lm.membro_id, UTC_TIMESTAMP(3) AS agora_utc,
       lm.capturada_em, lm.recebida_em, lm.atualizada_em,
       TIMESTAMPDIFF(SECOND,lm.atualizada_em,UTC_TIMESTAMP()) AS idade_posicao_s,
       lm.precisao_m, lm.origem AS caminho_ultimo_envio,
       ea.em_background AS ultimo_estado_comunicado_background,
       ea.atualizado_em AS estado_comunicado_em,
       lm.localizacao_ativa, lm.visivel
FROM localizacao_membro lm
LEFT JOIN estado_app_membro ea
 ON ea.membro_id COLLATE utf8mb4_unicode_ci = lm.membro_id COLLATE utf8mb4_unicode_ci
WHERE lm.membro_id IN (@membro_a,@membro_b);
-- origem identifies the sender, not the operating-system foreground/background state.
-- A new recebida_em must not hide an old capturada_em. Neither is a battery measurement.
