-- 1. Resumo por campanha.
SELECT
    campaign_id AS campanha,
    COUNT(*) AS participantes,
    SUM(pumpkins = 10 AND bats = 10) AS concluiram
FROM app.halloween_hunt_players
GROUP BY campaign_id;


-- 2. Progresso de todos, com nome e identificador da conta.
SELECT
    m.id AS id_registo,
    m.primeiro_nome,
    m.ultimo_nome,
    p.campaign_id AS campanha,
    p.pumpkins AS aboboras,
    p.bats AS morcegos,
    GREATEST(0, 10 - p.pumpkins) AS faltam_aboboras,
    GREATEST(0, 10 - p.bats) AS faltam_morcegos,
    p.completed_at AS terminou_em_utc,
    p.updated_at AS atualizado_em_utc
FROM app.halloween_hunt_players p
JOIN app.membros m ON m.id = p.membro_id
ORDER BY p.updated_at DESC;


-- 3. Procurar uma pessoa. Altera os dois nomes nesta consulta.
SELECT
    m.id AS id_registo,
    m.primeiro_nome,
    m.ultimo_nome,
    p.campaign_id AS campanha,
    p.pumpkins AS aboboras,
    p.bats AS morcegos,
    p.completed_at AS terminou_em_utc,
    p.updated_at AS atualizado_em_utc
FROM app.halloween_hunt_players p
JOIN app.membros m ON m.id = p.membro_id
WHERE m.primeiro_nome LIKE '%Tiago%'
  AND m.ultimo_nome LIKE '%Daniel%'
ORDER BY p.updated_at DESC;


-- 4. Vencedor registado e estado do aviso por email.
SELECT
    campaign_id AS campanha,
    winner_name AS nome,
    membro_id AS id_registo,
    completed_at AS terminou_em_utc,
    email_state AS estado_email,
    email_recipient AS destinatario,
    email_attempted_at AS tentativa_em_utc,
    email_sent_at AS aceite_pelo_smtp_em_utc
FROM app.halloween_hunt_awards
ORDER BY completed_at;


-- 5. Primeiras conclusões do evento público.
SELECT
    m.id AS id_registo,
    m.primeiro_nome,
    m.ultimo_nome,
    p.pumpkins AS aboboras,
    p.bats AS morcegos,
    p.completed_at AS terminou_em_utc
FROM app.halloween_hunt_players p
JOIN app.membros m ON m.id = p.membro_id
WHERE p.campaign_id = 'hw26-hunt-v1-public'
  AND p.pumpkins = 10
  AND p.bats = 10
  AND p.completed_at IS NOT NULL
ORDER BY p.completed_at, p.membro_id
LIMIT 20;