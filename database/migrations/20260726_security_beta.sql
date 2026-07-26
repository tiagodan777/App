-- Margot: baseline de segurança e privacidade para o beta fechado.
-- Executar uma única vez, numa cópia de segurança testada, no mesmo deploy do código.
-- MariaDB 10.11+.
-- Atenção: instruções DDL fazem COMMIT implícito em MariaDB. Esta migração não é
-- atómica; em caso de falha, restaura o backup antes de voltar a executá-la.

-- A aplicação deixou de usar esta tabela experimental. É renomeada, nunca
-- apagada às cegas. O pré-voo reprova o beta se a quarentena contiver linhas;
-- nesse caso é obrigatória uma exportação/reconciliação manual.
RENAME TABLE mensagens TO mensagens_legadas_quarentena;

CREATE TABLE IF NOT EXISTS schema_migrations (
    versao VARCHAR(64) NOT NULL,
    aplicada_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (versao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Estas duas relações já existem no dump legado. São recriadas abaixo com
-- eliminação em cascata e uma collation uniforme.
ALTER TABLE fotos_perfil
    DROP FOREIGN KEY fotos_perfil_ibfk_1;

ALTER TABLE membros_gostos
    DROP FOREIGN KEY membros_gostos_ibfk_1;

-- Corrige a coluna que impedia os bloqueios de funcionar.
ALTER TABLE bloqueados
    MODIFY pessoa_bloqueou_id CHAR(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    CHANGE pessoa_bloqueda_id pessoa_bloqueada_id CHAR(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- NULL tinha significados contraditórios no código antigo. É colocado em erro
-- para nunca ser servido nem reprocessado sem o ficheiro temporário original.
UPDATE fotos_perfil SET status = 'erro' WHERE status IS NULL;

ALTER TABLE fotos_perfil
    MODIFY membro_id CHAR(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY status ENUM('pendente', 'completo', 'erro')
        NOT NULL DEFAULT 'pendente',
    ADD COLUMN criada_em DATETIME(6)
        NOT NULL DEFAULT CURRENT_TIMESTAMP(6) AFTER status;

ALTER TABLE membros_gostos
    MODIFY membro_id CHAR(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- Alinha o esquema com os limites validados pelo backend e permite telefone opcional.
ALTER TABLE membros
    MODIFY id CHAR(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY primeiro_nome VARCHAR(60) NOT NULL,
    MODIFY ultimo_nome VARCHAR(60) NOT NULL,
    MODIFY genero ENUM('M', 'F', 'P') NULL,
    MODIFY email VARCHAR(254) NOT NULL,
    MODIFY telefone VARCHAR(32) NULL,
    MODIFY password VARCHAR(255) NOT NULL,
    MODIFY bio VARCHAR(1000) NULL,
    MODIFY nome_seo VARCHAR(128) NOT NULL,
    ADD COLUMN estado ENUM('ativo', 'suspenso', 'banido')
        NOT NULL DEFAULT 'ativo' AFTER nome_seo,
    ADD COLUMN `role` ENUM('member', 'moderator', 'admin')
        NOT NULL DEFAULT 'member' AFTER estado,
    ADD COLUMN auth_version INT UNSIGNED
        NOT NULL DEFAULT 1 AFTER `role`,
    ADD COLUMN moderacao_motivo VARCHAR(255) NULL AFTER auth_version,
    ADD COLUMN estado_alterado_em DATETIME(6) NULL AFTER moderacao_motivo,
    ADD KEY idx_membros_estado (estado);

-- Não inventa uma confirmação de idade para contas antigas.
UPDATE membros
SET estado = 'suspenso',
    moderacao_motivo = 'idade_nao_confirmada',
    estado_alterado_em = UTC_TIMESTAMP(6)
WHERE nascimento IS NULL
   OR nascimento > DATE_SUB(UTC_DATE(), INTERVAL 18 YEAR);

-- Todos os tokens anteriormente exportados ficam inválidos. Novos tokens são guardados por hash.
DELETE FROM token;

ALTER TABLE token
    MODIFY token CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    MODIFY membro_id CHAR(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY validade DATETIME NULL,
    MODIFY proposito VARCHAR(32) NOT NULL,
    ADD UNIQUE KEY ux_token_hash_proposito (token, proposito),
    ADD UNIQUE KEY ux_token_membro_proposito (membro_id, proposito),
    ADD KEY idx_token_expira (validade);

ALTER TABLE mensagens_chat
    MODIFY emissor_id CHAR(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY destinatario_id CHAR(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

ALTER TABLE notificacao
    MODIFY emissor_id CHAR(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY destinatario_id CHAR(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

CREATE TABLE websocket_tickets (
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    membro_id CHAR(36) NOT NULL,
    criado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expira_em DATETIME(6) NOT NULL,
    PRIMARY KEY (token_hash),
    KEY idx_ws_tickets_membro (membro_id, expira_em),
    KEY idx_ws_tickets_expira (expira_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE aceitacoes_legais (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    membro_id CHAR(36) NOT NULL,
    documento ENUM('termos', 'privacidade', 'maior_18') NOT NULL,
    versao VARCHAR(32) NOT NULL,
    documento_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    aceite_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    origem ENUM('registo', 'reaceitacao') NOT NULL DEFAULT 'registo',
    PRIMARY KEY (id),
    KEY idx_aceitacao_membro_documento_versao (
        membro_id,
        documento,
        versao
    ),
    KEY idx_aceitacao_membro (membro_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE preferencias_privacidade (
    membro_id CHAR(36) NOT NULL,
    localizacao_ativa TINYINT(1) NOT NULL DEFAULT 0,
    notificacoes_ativas TINYINT(1) NOT NULL DEFAULT 0,
    invisivel TINYINT(1) NOT NULL DEFAULT 0,
    atualizada_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (membro_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registo append-only das concessões e revogações. O estado corrente continua
-- na tabela anterior para leitura rápida.
CREATE TABLE preferencias_privacidade_eventos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    membro_id CHAR(36) NOT NULL,
    tipo ENUM('localizacao', 'notificacoes', 'invisivel') NOT NULL,
    valor TINYINT(1) NOT NULL,
    estado_json JSON NOT NULL,
    origem VARCHAR(32) NOT NULL,
    versao_aviso VARCHAR(32) NOT NULL,
    criado_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_preferencias_eventos_membro_data (membro_id, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mantém uma fila sem identificadores de membro para repetir eliminações de
-- media que falhem depois de a conta e os respetivos índices serem apagados.
CREATE TABLE ficheiros_a_apagar (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tipo ENUM('perfil', 'mensagem', 'denuncia') NOT NULL,
    nome_arquivo VARCHAR(255) NOT NULL,
    criada_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    tentativas INT UNSIGNED NOT NULL DEFAULT 0,
    ultima_tentativa_em DATETIME(6) NULL,
    ultimo_erro VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ficheiro_a_apagar (tipo, nome_arquivo),
    KEY idx_ficheiros_a_apagar_data (criada_em),
    KEY idx_ficheiros_a_apagar_retentativa (
        tentativas,
        ultima_tentativa_em,
        criada_em
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE denuncias
    MODIFY id CHAR(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY membro_denuncia CHAR(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    MODIFY membro_denunciado CHAR(36)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    ADD COLUMN criada_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    ADD COLUMN estado ENUM('nova', 'em_analise', 'resolvida', 'rejeitada')
        NOT NULL DEFAULT 'nova',
    ADD COLUMN contexto_tipo ENUM('perfil', 'mensagem', 'media')
        NOT NULL DEFAULT 'perfil',
    ADD COLUMN contexto_id VARCHAR(64) NULL,
    ADD COLUMN evidencia_json JSON NULL,
    ADD COLUMN evidencia_media_nome VARCHAR(255) NULL,
    ADD COLUMN evidencia_media_mime VARCHAR(100) NULL,
    ADD COLUMN evidencia_media_tamanho BIGINT UNSIGNED NULL,
    ADD COLUMN evidencia_media_sha256 CHAR(64)
        CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD COLUMN denunciante_pseudonimo CHAR(64)
        CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD COLUMN denunciado_pseudonimo CHAR(64)
        CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD COLUMN resolvida_em DATETIME(6) NULL,
    ADD COLUMN reter_ate DATETIME(6) NULL,
    ADD KEY idx_denuncias_estado_data (estado, criada_em),
    ADD KEY idx_denuncias_denunciado (membro_denunciado);

CREATE TABLE moderacao_acoes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    denuncia_id CHAR(36) NOT NULL,
    moderador_id CHAR(36) NULL,
    moderador_pseudonimo CHAR(64)
        CHARACTER SET ascii COLLATE ascii_bin NULL,
    acao ENUM(
        'abrir',
        'resolver_sem_acao',
        'rejeitar',
        'advertir',
        'suspender',
        'banir'
    ) NOT NULL,
    nota VARCHAR(2000) NULL,
    criada_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_moderacao_denuncia (denuncia_id, criada_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preserva conteúdo/media órfãos numa quarentena antes de ativar integridade
-- referencial. O pré-voo mantém o beta fechado até estas tabelas serem
-- exportadas, reconciliadas e esvaziadas conscientemente.
CREATE TABLE fotos_perfil_orfas_quarentena LIKE fotos_perfil;

INSERT INTO fotos_perfil_orfas_quarentena
SELECT fp.*
FROM fotos_perfil fp
LEFT JOIN membros m ON m.id = fp.membro_id
WHERE m.id IS NULL;

DELETE fp
FROM fotos_perfil fp
LEFT JOIN membros m ON m.id = fp.membro_id
WHERE m.id IS NULL;

DELETE mg
FROM membros_gostos mg
LEFT JOIN membros m ON m.id = mg.membro_id
WHERE m.id IS NULL;

CREATE TABLE mensagens_chat_orfas_quarentena LIKE mensagens_chat;

INSERT INTO mensagens_chat_orfas_quarentena
SELECT msg.*
FROM mensagens_chat msg
LEFT JOIN membros emissor ON emissor.id = msg.emissor_id
LEFT JOIN membros destinatario ON destinatario.id = msg.destinatario_id
WHERE emissor.id IS NULL OR destinatario.id IS NULL;

DELETE msg
FROM mensagens_chat msg
LEFT JOIN membros emissor ON emissor.id = msg.emissor_id
LEFT JOIN membros destinatario ON destinatario.id = msg.destinatario_id
WHERE emissor.id IS NULL OR destinatario.id IS NULL;

DELETE n
FROM notificacao n
LEFT JOIN membros emissor ON emissor.id = n.emissor_id
LEFT JOIN membros destinatario ON destinatario.id = n.destinatario_id
WHERE emissor.id IS NULL OR destinatario.id IS NULL;

DELETE b
FROM bloqueados b
LEFT JOIN membros origem ON origem.id = b.pessoa_bloqueou_id
LEFT JOIN membros destino ON destino.id = b.pessoa_bloqueada_id
WHERE origem.id IS NULL
   OR destino.id IS NULL
   OR b.pessoa_bloqueou_id = b.pessoa_bloqueada_id;

DELETE t
FROM token t
LEFT JOIN membros m ON m.id = t.membro_id
WHERE m.id IS NULL;

UPDATE denuncias d
LEFT JOIN membros m ON m.id = d.membro_denuncia
SET d.denunciante_pseudonimo = COALESCE(
        d.denunciante_pseudonimo,
        SHA2(CONCAT('orphan:', d.membro_denuncia), 256)
    ),
    d.membro_denuncia = NULL
WHERE d.membro_denuncia IS NOT NULL
AND m.id IS NULL;

UPDATE denuncias d
LEFT JOIN membros m ON m.id = d.membro_denunciado
SET d.denunciado_pseudonimo = COALESCE(
        d.denunciado_pseudonimo,
        SHA2(CONCAT('orphan:', d.membro_denunciado), 256)
    ),
    d.membro_denunciado = NULL
WHERE d.membro_denunciado IS NOT NULL
AND m.id IS NULL;

-- Garante que apagar uma conta nunca deixa dados filhos órfãos, mesmo que uma
-- escrita tenha começado ao mesmo tempo noutro pedido.
ALTER TABLE fotos_perfil
    ADD CONSTRAINT fk_fotos_perfil_membro
        FOREIGN KEY (membro_id) REFERENCES membros (id)
        ON DELETE CASCADE;

ALTER TABLE membros_gostos
    ADD CONSTRAINT fk_membros_gostos_membro
        FOREIGN KEY (membro_id) REFERENCES membros (id)
        ON DELETE CASCADE;

ALTER TABLE mensagens_chat
    ADD CONSTRAINT fk_mensagens_chat_emissor
        FOREIGN KEY (emissor_id) REFERENCES membros (id)
        ON DELETE CASCADE,
    ADD CONSTRAINT fk_mensagens_chat_destinatario
        FOREIGN KEY (destinatario_id) REFERENCES membros (id)
        ON DELETE CASCADE;

ALTER TABLE notificacao
    ADD CONSTRAINT fk_notificacao_emissor
        FOREIGN KEY (emissor_id) REFERENCES membros (id)
        ON DELETE CASCADE,
    ADD CONSTRAINT fk_notificacao_destinatario
        FOREIGN KEY (destinatario_id) REFERENCES membros (id)
        ON DELETE CASCADE;

ALTER TABLE bloqueados
    ADD CONSTRAINT fk_bloqueados_origem
        FOREIGN KEY (pessoa_bloqueou_id) REFERENCES membros (id)
        ON DELETE CASCADE,
    ADD CONSTRAINT fk_bloqueados_destino
        FOREIGN KEY (pessoa_bloqueada_id) REFERENCES membros (id)
        ON DELETE CASCADE;

ALTER TABLE token
    ADD CONSTRAINT fk_token_membro
        FOREIGN KEY (membro_id) REFERENCES membros (id)
        ON DELETE CASCADE;

ALTER TABLE websocket_tickets
    ADD CONSTRAINT fk_websocket_tickets_membro
        FOREIGN KEY (membro_id) REFERENCES membros (id)
        ON DELETE CASCADE;

ALTER TABLE aceitacoes_legais
    ADD CONSTRAINT fk_aceitacoes_legais_membro
        FOREIGN KEY (membro_id) REFERENCES membros (id)
        ON DELETE CASCADE;

ALTER TABLE preferencias_privacidade
    ADD CONSTRAINT fk_preferencias_privacidade_membro
        FOREIGN KEY (membro_id) REFERENCES membros (id)
        ON DELETE CASCADE;

ALTER TABLE preferencias_privacidade_eventos
    ADD CONSTRAINT fk_preferencias_eventos_membro
        FOREIGN KEY (membro_id) REFERENCES membros (id)
        ON DELETE CASCADE;

ALTER TABLE denuncias
    ADD CONSTRAINT fk_denuncias_denunciante
        FOREIGN KEY (membro_denuncia) REFERENCES membros (id)
        ON DELETE SET NULL,
    ADD CONSTRAINT fk_denuncias_denunciado
        FOREIGN KEY (membro_denunciado) REFERENCES membros (id)
        ON DELETE SET NULL;

ALTER TABLE moderacao_acoes
    ADD CONSTRAINT fk_moderacao_denuncia
        FOREIGN KEY (denuncia_id) REFERENCES denuncias (id)
        ON DELETE CASCADE,
    ADD CONSTRAINT fk_moderacao_moderador
        FOREIGN KEY (moderador_id) REFERENCES membros (id)
        ON DELETE SET NULL;

-- A aplicação nunca volta a persistir coordenadas.
DROP TABLE IF EXISTS localizacoes;

INSERT INTO schema_migrations (versao)
VALUES ('20260726_security_beta');
