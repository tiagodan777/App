-- Visitas e contas criadas por dia UTC, espaço e origem.
-- O histórico antigo não distingue visitas ao Provisório de visitas à página inicial.
SELECT dados.dia_utc, dados.espaco, e.nome, dados.origem,
       SUM(dados.visitas) AS visitas, SUM(dados.registos_web) AS registos_web
FROM (
    SELECT espaco, dia_utc, origem, total AS visitas, 0 AS registos_web
    FROM campanha_visita_diaria
    UNION ALL
    SELECT 'provisorio', dia_utc, origem, total, 0
    FROM qr_provisorio_diario
    UNION ALL
    SELECT espaco, DATE(criado_em), origem, 0, COUNT(*)
    FROM campanha_registo
    GROUP BY espaco, DATE(criado_em), origem
) AS dados
JOIN campanha_espaco AS e ON e.slug = dados.espaco
GROUP BY dados.dia_utc, dados.espaco, e.nome, dados.origem
ORDER BY dados.dia_utc DESC, dados.espaco, dados.origem;
