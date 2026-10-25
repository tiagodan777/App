-- Executar uma vez, antes de publicar o PHP/JS desta versão.
-- Não altera coordenadas, preferências ou datas dos membros existentes.
-- Confirmar primeiro que a coluna ainda não existe:
-- SHOW COLUMNS FROM localizacao_membro LIKE 'estado_versao';
ALTER TABLE localizacao_membro
    ADD COLUMN estado_versao BIGINT UNSIGNED NOT NULL DEFAULT 0;

-- Associação do token à sessão: WebSocket e rotações de localização do mesmo aparelho.
-- SHOW COLUMNS FROM token LIKE 'sessao_hash';
ALTER TABLE token
    ADD COLUMN sessao_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;