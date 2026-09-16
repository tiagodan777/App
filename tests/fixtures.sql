-- Estrutura SQLite derivada de database/schema.sql apenas para testes locais.

CREATE TABLE "aceitacoes_legais" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "membro_id" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "aceite_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "bloqueados" (
    "pessoa_bloqueou_id" TEXT NOT NULL,
    "pessoa_bloqueada_id" TEXT NOT NULL,
    PRIMARY KEY ("pessoa_bloqueou_id", "pessoa_bloqueada_id")
);

CREATE TABLE "denuncias" (
    "id" TEXT NOT NULL DEFAULT (UUID()),
    "membro_denuncia" TEXT NOT NULL,
    "membro_denunciado" TEXT NOT NULL,
    "motivo" TEXT DEFAULT NULL,
    "mensagem" TEXT DEFAULT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "estado_app_membro" (
    "membro_id" TEXT NOT NULL,
    "em_background" INTEGER NOT NULL DEFAULT 0,
    "alerta_proximidade_ativo" INTEGER NOT NULL DEFAULT 0,
    "total_proximidade" INTEGER NOT NULL DEFAULT 0,
    "ultima_notificacao_proximidade_em" TEXT DEFAULT NULL,
    "atualizado_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("membro_id")
);

CREATE TABLE "fotos_perfil" (
    "id" TEXT NOT NULL DEFAULT (UUID()),
    "nome_arquivo" TEXT NOT NULL,
    "membro_id" TEXT NOT NULL,
    "ordem" INTEGER DEFAULT NULL,
    "status" TEXT DEFAULT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "hobbies" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "imagem" TEXT DEFAULT NULL
);

CREATE TABLE "ligacoes_membros" (
    "membro_a_id" TEXT NOT NULL,
    "membro_b_id" TEXT NOT NULL,
    "criada_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("membro_a_id", "membro_b_id")
);

CREATE TABLE "localizacao_membro" (
    "membro_id" TEXT NOT NULL,
    "latitude" REAL DEFAULT NULL,
    "longitude" REAL DEFAULT NULL,
    "precisao_m" REAL DEFAULT NULL,
    "localizacao_ativa" INTEGER NOT NULL DEFAULT 1,
    "visivel" INTEGER NOT NULL DEFAULT 1,
    "origem" TEXT NOT NULL DEFAULT 'foreground',
    "atualizada_em" TEXT NOT NULL,
    PRIMARY KEY ("membro_id")
);

CREATE TABLE "localizacoes" (
    "latitude" TEXT NOT NULL,
    "longitude" TEXT NOT NULL,
    "membro_id" TEXT DEFAULT NULL,
    "horario" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "membros" (
    "id" TEXT NOT NULL DEFAULT (UUID()),
    "primeiro_nome" TEXT NOT NULL,
    "ultimo_nome" TEXT NOT NULL,
    "nascimento" TEXT DEFAULT NULL,
    "genero" TEXT NOT NULL,
    "objetivo" TEXT DEFAULT NULL,
    "email" TEXT NOT NULL,
    "email_verificado_em" TEXT DEFAULT NULL,
    "telefone" TEXT DEFAULT NULL,
    "password" TEXT NOT NULL,
    "adesao" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bio" TEXT DEFAULT NULL,
    "nome_seo" TEXT NOT NULL,
    PRIMARY KEY ("id")
);

CREATE TABLE "membros_gostos" (
    "membro_id" TEXT NOT NULL,
    "hobbie_id" INTEGER NOT NULL,
    PRIMARY KEY ("membro_id", "hobbie_id")
);

CREATE TABLE "membro_hoje" (
    "membro_id" TEXT NOT NULL,
    "nota" TEXT DEFAULT NULL,
    "roupa_json" TEXT DEFAULT NULL,
    "expira_em" TEXT NOT NULL,
    "criada_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizada_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("membro_id")
);

CREATE TABLE "mensagens" (
    "id" TEXT DEFAULT NULL,
    "texto" TEXT NOT NULL,
    "pessoa_enviou" TEXT DEFAULT NULL,
    "pessoa_recebeu" TEXT DEFAULT NULL,
    "status" TEXT DEFAULT NULL
);

CREATE TABLE "mensagens_apagadas" (
    "mensagem_id" INTEGER NOT NULL,
    "emissor_id" TEXT NOT NULL,
    "destinatario_id" TEXT NOT NULL,
    "apagada_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("mensagem_id")
);

CREATE TABLE "mensagens_chat" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "emissor_id" TEXT NOT NULL,
    "destinatario_id" TEXT NOT NULL,
    "texto" TEXT DEFAULT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'texto',
    "ficheiro_nome" TEXT DEFAULT NULL,
    "ficheiro_mime" TEXT DEFAULT NULL,
    "ficheiro_tamanho" INTEGER DEFAULT NULL,
    "lida" INTEGER NOT NULL DEFAULT 0,
    "criada_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lida_em" TEXT DEFAULT NULL
);

CREATE TABLE "mensagens_conversas_ocultas" (
    "membro_id" TEXT NOT NULL,
    "outro_id" TEXT NOT NULL,
    "ocultar_ate_id" INTEGER NOT NULL DEFAULT 0,
    "criada_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizada_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("membro_id", "outro_id")
);

CREATE TABLE "mensagens_reacoes" (
    "mensagem_id" INTEGER NOT NULL,
    "membro_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "atualizada_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("mensagem_id", "membro_id")
);

CREATE TABLE "notificacao" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "emissor_id" TEXT NOT NULL,
    "destinatario_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'hey',
    "lida" INTEGER NOT NULL DEFAULT 0,
    "criada_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lida_em" TEXT DEFAULT NULL,
    "ocultada_para_emissor_em" TEXT DEFAULT NULL,
    "ocultada_para_destinatario_em" TEXT DEFAULT NULL
);

CREATE TABLE "push_dispositivos" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "membro_id" TEXT NOT NULL,
    "plataforma" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL DEFAULT 'production',
    "token" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "instalacao_id" TEXT NOT NULL,
    "sessao_hash" TEXT NOT NULL,
    "versao_app" TEXT DEFAULT NULL,
    "ativo" INTEGER NOT NULL DEFAULT 1,
    "falhas_consecutivas" INTEGER NOT NULL DEFAULT 0,
    "ultimo_erro" TEXT DEFAULT NULL,
    "ultimo_sucesso_em" TEXT DEFAULT NULL,
    "ultima_falha_em" TEXT DEFAULT NULL,
    "criado_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "push_fila" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "dispositivo_id" INTEGER NOT NULL,
    "membro_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "dados_json" TEXT NOT NULL,
    "chave_unica" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'queued',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proxima_tentativa_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bloqueado_em" TEXT DEFAULT NULL,
    "enviado_em" TEXT DEFAULT NULL,
    "ultimo_erro" TEXT DEFAULT NULL,
    "criado_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "schema_migrations" (
    "versao" TEXT NOT NULL,
    "aplicada_em" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("versao")
);

CREATE TABLE "token" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "membro_id" TEXT NOT NULL,
    "validade" TEXT NOT NULL,
    "proposito" TEXT NOT NULL
);

CREATE UNIQUE INDEX member_email ON membros (email);

CREATE UNIQUE INDEX member_phone ON membros (telefone);

CREATE UNIQUE INDEX hobby_name ON hobbies (nome);

CREATE UNIQUE INDEX token_value ON token (token);
