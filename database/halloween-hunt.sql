-- Margot Halloween 2026: progresso no servidor, com campanhas de piloto e pública separadas.
-- Aplicar antes de disponibilizar o novo JavaScript. Não altera tabelas existentes.
-- Compatível com MariaDB 10.11; membro_id usa a colação de membros.id.

CREATE TABLE IF NOT EXISTS halloween_hunt_players (
    campaign_id varchar(96) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    membro_id char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
    pumpkins tinyint unsigned NOT NULL DEFAULT 0,
    bats tinyint unsigned NOT NULL DEFAULT 0,
    last_round_id char(32) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    last_round_started_at datetime(6) DEFAULT NULL,
    completed_at datetime(6) DEFAULT NULL,
    created_at datetime(6) NOT NULL,
    updated_at datetime(6) NOT NULL,
    PRIMARY KEY (campaign_id, membro_id),
    KEY idx_halloween_hunt_classificacao (campaign_id, completed_at, membro_id),
    CONSTRAINT chk_halloween_hunt_counts CHECK (pumpkins <= 10 AND bats <= 10),
    CONSTRAINT fk_halloween_hunt_member FOREIGN KEY (membro_id)
        REFERENCES membros (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS halloween_hunt_rounds (
    id char(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    campaign_id varchar(96) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    membro_id char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
    started_at datetime(6) NOT NULL,
    pumpkin_issued tinyint unsigned NOT NULL,
    bat_issued tinyint unsigned NOT NULL,
    pumpkin_captured_at datetime(6) DEFAULT NULL,
    bat_captured_at datetime(6) DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_halloween_hunt_round_player (campaign_id, membro_id, started_at),
    CONSTRAINT chk_halloween_hunt_issued CHECK (
        pumpkin_issued IN (0, 1) AND bat_issued IN (0, 1)
        AND (pumpkin_issued = 1 OR bat_issued = 1)
    ),
    CONSTRAINT fk_halloween_hunt_player FOREIGN KEY (campaign_id, membro_id)
        REFERENCES halloween_hunt_players (campaign_id, membro_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
