-- Executar na base app antes de ativar extras_enabled.
-- Preserva os participantes e as contagens existentes.

CREATE TABLE IF NOT EXISTS halloween_hunt_timing (
    round_id char(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    next_round_at datetime(6) NOT NULL,
    PRIMARY KEY (round_id),
    CONSTRAINT fk_hw_timing_round FOREIGN KEY (round_id)
        REFERENCES halloween_hunt_rounds (id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS halloween_hunt_awards (
    campaign_id varchar(96) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    membro_id char(36) DEFAULT NULL,
    winner_name varchar(121) DEFAULT NULL,
    completed_at datetime(6) DEFAULT NULL,
    email_state varchar(16) NOT NULL DEFAULT 'pending',
    email_recipient varchar(254) DEFAULT NULL,
    email_attempted_at datetime(6) DEFAULT NULL,
    email_sent_at datetime(6) DEFAULT NULL,
    PRIMARY KEY (campaign_id),
    CONSTRAINT chk_hw_mail_state CHECK (
        email_state IN ('pending', 'sending', 'sent', 'review')
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_general_ci;