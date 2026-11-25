-- Aplicar antes da publicação. O contador qr_provisorio_diario continua a receber os links antigos.
CREATE TABLE IF NOT EXISTS campanha_espaco (
    slug varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    nome varchar(120) NOT NULL,
    localidade varchar(120) NOT NULL DEFAULT '',
    ativo tinyint(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campanha_visita_diaria (
    espaco varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    dia_utc date NOT NULL,
    origem varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    total bigint unsigned NOT NULL,
    PRIMARY KEY (espaco, dia_utc, origem),
    CONSTRAINT fk_campanha_visita_espaco FOREIGN KEY (espaco) REFERENCES campanha_espaco (slug)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS campanha_registo (
    membro_id char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
    espaco varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    origem varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    criado_em datetime NOT NULL,
    PRIMARY KEY (membro_id),
    KEY idx_campanha_registo_espaco_data (espaco, criado_em),
    CONSTRAINT fk_campanha_registo_espaco FOREIGN KEY (espaco) REFERENCES campanha_espaco (slug),
    CONSTRAINT fk_campanha_registo_membro FOREIGN KEY (membro_id) REFERENCES membros (id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO campanha_espaco (slug, nome, localidade) VALUES
    ('provisorio', 'Provisório', ''),
    ('site-margot', 'Site da Margot', ''),
    ('cafe-pioledo', 'Café Pioledo', 'Vila Real'),
    ('xots', 'XOTS', 'Vila Real')
ON DUPLICATE KEY UPDATE campanha_espaco.slug = campanha_espaco.slug;
