-- Execute once BEFORE deploying the PHP files. No rows or historical coordinates are removed.
ALTER TABLE localizacao_membro
    ADD COLUMN capturada_em DATETIME(3) NULL,
    ADD COLUMN recebida_em DATETIME(3) NULL;
-- atualizada_em remains the freshness field read by discovery; upgraded clients use capture time.
-- Existing rows and older clients retain their previous behaviour until their next valid update.
