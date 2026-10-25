-- Apenas leitura. Pode executar antes da migração. Não mostra tokens nem coordenadas.
SELECT VERSION() AS database_version, @@session.time_zone AS session_time_zone,
       UTC_TIMESTAMP(3) AS utc_now, NOW(3) AS session_now;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'localizacao_membro'
        AND COLUMN_NAME IN ('estado_versao','localizacao_ativa','visivel','capturada_em','recebida_em','atualizada_em'))
    OR (TABLE_NAME = 'token' AND COLUMN_NAME IN ('sessao_hash','proposito','validade')))
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT localizacao_ativa AS collection_enabled, visivel AS publicly_visible,
       COUNT(*) AS members,
       SUM(latitude IS NULL OR longitude IS NULL) AS without_coordinates,
       SUM(atualizada_em >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)) AS fresh_presence,
       SUM(capturada_em IS NULL) AS without_capture_time,
       SUM(precisao_m > 100 OR precisao_m <= 0 OR precisao_m IS NULL) AS imprecise_or_unknown
FROM localizacao_membro
GROUP BY localizacao_ativa, visivel;

SELECT proposito AS purpose, COUNT(*) AS grants,
       SUM(validade > UTC_TIMESTAMP()) AS valid_grants,
       SUM(validade <= UTC_TIMESTAMP()) AS expired_grants
FROM token
WHERE proposito IN ('background_location','websocket','websocket_session')
GROUP BY proposito;

SELECT active_grants, COUNT(*) AS members
FROM (
    SELECT membro_id, COUNT(*) AS active_grants
    FROM token
    WHERE proposito = 'background_location' AND validade > UTC_TIMESTAMP()
    GROUP BY membro_id
) AS grants_per_member
GROUP BY active_grants
ORDER BY active_grants;
