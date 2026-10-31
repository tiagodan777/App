CREATE TABLE IF NOT EXISTS halloween_hunt_wave_captures (
    campaign_id varchar(96)
        CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    membro_id char(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,

    wave_id char(32)
        CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    object_id char(32)
        CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    issued_at datetime(6) NOT NULL,
    captured_at datetime(6) DEFAULT NULL,

    PRIMARY KEY (campaign_id, membro_id, object_id),

    KEY idx_hw_wave (campaign_id, membro_id, wave_id),

    CONSTRAINT fk_hw_wave_player
        FOREIGN KEY (campaign_id, membro_id)
        REFERENCES halloween_hunt_players (campaign_id, membro_id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_general_ci;


CREATE TABLE IF NOT EXISTS halloween_hunt_announcements (
    campaign_id varchar(96)
        CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    event_id varchar(32)
        CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    membro_id char(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,

    status varchar(16) NOT NULL,
    attempted_at datetime NOT NULL,

    PRIMARY KEY (campaign_id, event_id, membro_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_general_ci;


CREATE TABLE IF NOT EXISTS halloween_hunt_commands (
    id char(32)
        CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    campaign_id varchar(96)
        CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

    kind varchar(16) NOT NULL,
    payload text NOT NULL,

    created_at_ms bigint NOT NULL,
    starts_at_ms bigint NOT NULL,
    expires_at_ms bigint NOT NULL,

    PRIMARY KEY (id),

    KEY idx_hw_commands (
        campaign_id,
        kind,
        expires_at_ms
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_general_ci;