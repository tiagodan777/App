-- phpMyAdmin SQL Dump
-- version 5.2.1deb1+deb12u1
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Tempo de geração: 15-Set-2026 às 20:36
-- Versão do servidor: 10.11.18-MariaDB-0+deb12u1
-- versão do PHP: 8.2.33

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Banco de dados: `app`
--

-- --------------------------------------------------------

--
-- Estrutura da tabela `aceitacoes_legais`
--

CREATE TABLE `aceitacoes_legais` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `membro_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `documento` enum('terms','privacy') NOT NULL,
  `versao` varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `aceite_em` datetime(6) NOT NULL DEFAULT current_timestamp(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `bloqueados`
--

CREATE TABLE `bloqueados` (
  `pessoa_bloqueou_id` uuid NOT NULL,
  `pessoa_bloqueada_id` uuid NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `denuncias`
--

CREATE TABLE `denuncias` (
  `id` uuid NOT NULL DEFAULT uuid(),
  `membro_denuncia` uuid NOT NULL,
  `membro_denunciado` uuid NOT NULL,
  `motivo` varchar(128) DEFAULT NULL,
  `mensagem` varchar(2048) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `estado_app_membro`
--

CREATE TABLE `estado_app_membro` (
  `membro_id` char(36) NOT NULL,
  `em_background` tinyint(1) NOT NULL DEFAULT 0,
  `alerta_proximidade_ativo` tinyint(1) NOT NULL DEFAULT 0,
  `total_proximidade` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `ultima_notificacao_proximidade_em` datetime(6) DEFAULT NULL,
  `atualizado_em` datetime(6) NOT NULL DEFAULT current_timestamp(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `fotos_perfil`
--

CREATE TABLE `fotos_perfil` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `nome_arquivo` varchar(255) NOT NULL,
  `membro_id` char(36) NOT NULL,
  `ordem` smallint(5) UNSIGNED DEFAULT NULL,
  `status` enum('pendente','completo','erro') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `hobbies`
--

CREATE TABLE `hobbies` (
  `id` int(11) NOT NULL,
  `nome` varchar(80) NOT NULL,
  `imagem` char(32) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `ligacoes_membros`
--

CREATE TABLE `ligacoes_membros` (
  `membro_a_id` char(36) NOT NULL,
  `membro_b_id` char(36) NOT NULL,
  `criada_em` datetime(6) NOT NULL DEFAULT current_timestamp(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `localizacao_membro`
--

CREATE TABLE `localizacao_membro` (
  `membro_id` char(36) NOT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `precisao_m` decimal(10,2) DEFAULT NULL,
  `localizacao_ativa` tinyint(1) NOT NULL DEFAULT 1,
  `visivel` tinyint(1) NOT NULL DEFAULT 1,
  `origem` enum('foreground','background') NOT NULL DEFAULT 'foreground',
  `atualizada_em` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `localizacoes`
--

CREATE TABLE `localizacoes` (
  `latitude` varchar(32) NOT NULL,
  `longitude` varchar(32) NOT NULL,
  `membro_id` char(16) DEFAULT NULL,
  `horario` datetime NOT NULL DEFAULT utc_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `membros`
--

CREATE TABLE `membros` (
  `id` char(36) NOT NULL,
  `primeiro_nome` varchar(60) NOT NULL,
  `ultimo_nome` varchar(60) NOT NULL,
  `nascimento` date DEFAULT NULL,
  `genero` enum('M','F','P') NOT NULL,
  `objetivo` varchar(32) DEFAULT NULL,
  `email` varchar(64) NOT NULL,
  `email_verificado_em` datetime DEFAULT NULL,
  `telefone` varchar(16) DEFAULT NULL,
  `password` char(80) NOT NULL,
  `adesao` timestamp NOT NULL DEFAULT current_timestamp(),
  `bio` varchar(1000) DEFAULT NULL,
  `nome_seo` varchar(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Acionadores `membros`
--
DELIMITER $$
CREATE TRIGGER `membros_before_insert` BEFORE INSERT ON `membros` FOR EACH ROW BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Estrutura da tabela `membros_gostos`
--

CREATE TABLE `membros_gostos` (
  `membro_id` char(36) NOT NULL,
  `hobbie_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `membro_hoje`
--

CREATE TABLE `membro_hoje` (
  `membro_id` varchar(64) NOT NULL,
  `nota` varchar(160) DEFAULT NULL,
  `roupa_json` longtext DEFAULT NULL,
  `expira_em` datetime(6) NOT NULL,
  `criada_em` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `atualizada_em` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `mensagens`
--

CREATE TABLE `mensagens` (
  `id` char(16) DEFAULT NULL,
  `texto` varchar(2048) NOT NULL,
  `pessoa_enviou` char(16) DEFAULT NULL,
  `pessoa_recebeu` char(16) DEFAULT NULL,
  `status` enum('Enviada','Recebida','Lida') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `mensagens_apagadas`
--

CREATE TABLE `mensagens_apagadas` (
  `mensagem_id` bigint(20) UNSIGNED NOT NULL,
  `emissor_id` varchar(64) NOT NULL,
  `destinatario_id` varchar(64) NOT NULL,
  `apagada_em` datetime(6) NOT NULL DEFAULT current_timestamp(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `mensagens_chat`
--

CREATE TABLE `mensagens_chat` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `emissor_id` varchar(36) NOT NULL,
  `destinatario_id` varchar(36) NOT NULL,
  `texto` varchar(2000) DEFAULT NULL,
  `tipo` enum('texto','imagem','video') NOT NULL DEFAULT 'texto',
  `ficheiro_nome` varchar(255) DEFAULT NULL,
  `ficheiro_mime` varchar(100) DEFAULT NULL,
  `ficheiro_tamanho` bigint(20) UNSIGNED DEFAULT NULL,
  `lida` tinyint(1) NOT NULL DEFAULT 0,
  `criada_em` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `lida_em` datetime(6) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `mensagens_conversas_ocultas`
--

CREATE TABLE `mensagens_conversas_ocultas` (
  `membro_id` varchar(64) NOT NULL,
  `outro_id` varchar(64) NOT NULL,
  `ocultar_ate_id` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `criada_em` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `atualizada_em` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `mensagens_reacoes`
--

CREATE TABLE `mensagens_reacoes` (
  `mensagem_id` bigint(20) UNSIGNED NOT NULL,
  `membro_id` varchar(64) NOT NULL,
  `emoji` varchar(16) NOT NULL,
  `atualizada_em` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `notificacao`
--

CREATE TABLE `notificacao` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `emissor_id` char(36) NOT NULL,
  `destinatario_id` char(36) NOT NULL,
  `tipo` varchar(30) NOT NULL DEFAULT 'hey',
  `lida` tinyint(1) NOT NULL DEFAULT 0,
  `criada_em` datetime NOT NULL DEFAULT current_timestamp(),
  `lida_em` datetime DEFAULT NULL,
  `ocultada_para_emissor_em` datetime DEFAULT NULL,
  `ocultada_para_destinatario_em` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `push_dispositivos`
--

CREATE TABLE `push_dispositivos` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `membro_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `plataforma` enum('ios','android') NOT NULL,
  `ambiente` enum('sandbox','production') NOT NULL DEFAULT 'production',
  `token` text CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `token_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `instalacao_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `sessao_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `versao_app` varchar(32) DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `falhas_consecutivas` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `ultimo_erro` varchar(190) DEFAULT NULL,
  `ultimo_sucesso_em` datetime(6) DEFAULT NULL,
  `ultima_falha_em` datetime(6) DEFAULT NULL,
  `criado_em` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `atualizado_em` datetime(6) NOT NULL DEFAULT current_timestamp(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `push_fila`
--

CREATE TABLE `push_fila` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `dispositivo_id` bigint(20) UNSIGNED NOT NULL,
  `membro_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `tipo` varchar(32) NOT NULL,
  `titulo` varchar(120) NOT NULL,
  `corpo` varchar(240) NOT NULL,
  `url` varchar(500) NOT NULL,
  `dados_json` longtext NOT NULL,
  `chave_unica` varchar(190) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `estado` enum('queued','processing','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
  `tentativas` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `proxima_tentativa_em` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `bloqueado_em` datetime(6) DEFAULT NULL,
  `enviado_em` datetime(6) DEFAULT NULL,
  `ultimo_erro` varchar(190) DEFAULT NULL,
  `criado_em` datetime(6) NOT NULL DEFAULT current_timestamp(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `schema_migrations`
--

CREATE TABLE `schema_migrations` (
  `versao` varchar(64) NOT NULL,
  `aplicada_em` datetime(6) NOT NULL DEFAULT current_timestamp(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura da tabela `token`
--

CREATE TABLE `token` (
  `id` int(11) NOT NULL,
  `token` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `membro_id` char(36) NOT NULL,
  `validade` datetime NOT NULL,
  `proposito` varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Índices para tabelas despejadas
--

--
-- Índices para tabela `aceitacoes_legais`
--
ALTER TABLE `aceitacoes_legais`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_aceitacao_legal_membro_documento_versao` (`membro_id`,`documento`,`versao`),
  ADD KEY `idx_aceitacao_legal_membro_data` (`membro_id`,`aceite_em`);

--
-- Índices para tabela `bloqueados`
--
ALTER TABLE `bloqueados`
  ADD PRIMARY KEY (`pessoa_bloqueou_id`,`pessoa_bloqueada_id`);

--
-- Índices para tabela `denuncias`
--
ALTER TABLE `denuncias`
  ADD PRIMARY KEY (`id`);

--
-- Índices para tabela `estado_app_membro`
--
ALTER TABLE `estado_app_membro`
  ADD PRIMARY KEY (`membro_id`),
  ADD KEY `idx_estado_app_background` (`em_background`,`atualizado_em`);

--
-- Índices para tabela `fotos_perfil`
--
ALTER TABLE `fotos_perfil`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_fotos_perfil_membro` (`membro_id`),
  ADD KEY `idx_fotos_perfil_status` (`status`);

--
-- Índices para tabela `hobbies`
--
ALTER TABLE `hobbies`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `nome` (`nome`);

--
-- Índices para tabela `ligacoes_membros`
--
ALTER TABLE `ligacoes_membros`
  ADD PRIMARY KEY (`membro_a_id`,`membro_b_id`),
  ADD KEY `idx_ligacoes_membros_a` (`membro_a_id`),
  ADD KEY `idx_ligacoes_membros_b` (`membro_b_id`),
  ADD KEY `idx_ligacoes_membros_criada` (`criada_em`);

--
-- Índices para tabela `localizacao_membro`
--
ALTER TABLE `localizacao_membro`
  ADD PRIMARY KEY (`membro_id`),
  ADD KEY `idx_localizacao_estado` (`localizacao_ativa`,`visivel`,`atualizada_em`);

--
-- Índices para tabela `membros`
--
ALTER TABLE `membros`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `telefone` (`telefone`);

--
-- Índices para tabela `membros_gostos`
--
ALTER TABLE `membros_gostos`
  ADD PRIMARY KEY (`membro_id`,`hobbie_id`),
  ADD KEY `hobbie_id` (`hobbie_id`);

--
-- Índices para tabela `membro_hoje`
--
ALTER TABLE `membro_hoje`
  ADD PRIMARY KEY (`membro_id`),
  ADD KEY `idx_membro_hoje_expira` (`expira_em`);

--
-- Índices para tabela `mensagens_apagadas`
--
ALTER TABLE `mensagens_apagadas`
  ADD PRIMARY KEY (`mensagem_id`),
  ADD KEY `idx_mensagens_apagadas_emissor` (`emissor_id`),
  ADD KEY `idx_mensagens_apagadas_destinatario` (`destinatario_id`),
  ADD KEY `idx_mensagens_apagadas_data` (`apagada_em`);

--
-- Índices para tabela `mensagens_chat`
--
ALTER TABLE `mensagens_chat`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_mensagens_conversa_emissor` (`emissor_id`,`destinatario_id`,`id`),
  ADD KEY `idx_mensagens_conversa_destinatario` (`destinatario_id`,`emissor_id`,`id`),
  ADD KEY `idx_mensagens_nao_lidas` (`destinatario_id`,`lida`,`id`);

--
-- Índices para tabela `mensagens_conversas_ocultas`
--
ALTER TABLE `mensagens_conversas_ocultas`
  ADD PRIMARY KEY (`membro_id`,`outro_id`),
  ADD KEY `idx_mensagens_conversas_ocultas_outro` (`outro_id`);

--
-- Índices para tabela `mensagens_reacoes`
--
ALTER TABLE `mensagens_reacoes`
  ADD PRIMARY KEY (`mensagem_id`,`membro_id`),
  ADD KEY `idx_mensagens_reacoes_membro` (`membro_id`),
  ADD KEY `idx_mensagens_reacoes_atualizada` (`atualizada_em`);

--
-- Índices para tabela `notificacao`
--
ALTER TABLE `notificacao`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_notificacao_destinatario` (`destinatario_id`,`lida`,`criada_em`),
  ADD KEY `idx_notificacao_emissor` (`emissor_id`,`criada_em`);

--
-- Índices para tabela `push_dispositivos`
--
ALTER TABLE `push_dispositivos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_push_dispositivo_token` (`token_hash`),
  ADD UNIQUE KEY `uq_push_dispositivo_instalacao` (`plataforma`,`instalacao_id`),
  ADD KEY `idx_push_dispositivo_membro_ativo` (`membro_id`,`ativo`),
  ADD KEY `idx_push_dispositivo_sessao` (`membro_id`,`sessao_hash`);

--
-- Índices para tabela `push_fila`
--
ALTER TABLE `push_fila`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_push_fila_dispositivo_evento` (`dispositivo_id`,`chave_unica`),
  ADD KEY `idx_push_fila_pendente` (`estado`,`proxima_tentativa_em`,`id`),
  ADD KEY `idx_push_fila_membro` (`membro_id`,`criado_em`);

--
-- Índices para tabela `schema_migrations`
--
ALTER TABLE `schema_migrations`
  ADD PRIMARY KEY (`versao`);

--
-- Índices para tabela `token`
--
ALTER TABLE `token`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_token_token` (`token`),
  ADD KEY `idx_token_membro_proposito_validade` (`membro_id`,`proposito`,`validade`);

--
-- AUTO_INCREMENT de tabelas despejadas
--

--
-- AUTO_INCREMENT de tabela `aceitacoes_legais`
--
ALTER TABLE `aceitacoes_legais`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `hobbies`
--
ALTER TABLE `hobbies`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `mensagens_chat`
--
ALTER TABLE `mensagens_chat`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `notificacao`
--
ALTER TABLE `notificacao`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `push_dispositivos`
--
ALTER TABLE `push_dispositivos`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `push_fila`
--
ALTER TABLE `push_fila`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `token`
--
ALTER TABLE `token`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Restrições para despejos de tabelas
--

--
-- Limitadores para a tabela `aceitacoes_legais`
--
ALTER TABLE `aceitacoes_legais`
  ADD CONSTRAINT `fk_aceitacao_legal_membro` FOREIGN KEY (`membro_id`) REFERENCES `membros` (`id`) ON DELETE CASCADE;

--
-- Limitadores para a tabela `fotos_perfil`
--
ALTER TABLE `fotos_perfil`
  ADD CONSTRAINT `fotos_perfil_ibfk_1` FOREIGN KEY (`membro_id`) REFERENCES `membros` (`id`);

--
-- Limitadores para a tabela `localizacao_membro`
--
ALTER TABLE `localizacao_membro`
  ADD CONSTRAINT `fk_localizacao_membro` FOREIGN KEY (`membro_id`) REFERENCES `membros` (`id`) ON DELETE CASCADE;

--
-- Limitadores para a tabela `membros_gostos`
--
ALTER TABLE `membros_gostos`
  ADD CONSTRAINT `membros_gostos_ibfk_1` FOREIGN KEY (`membro_id`) REFERENCES `membros` (`id`),
  ADD CONSTRAINT `membros_gostos_ibfk_2` FOREIGN KEY (`hobbie_id`) REFERENCES `hobbies` (`id`);

--
-- Limitadores para a tabela `push_dispositivos`
--
ALTER TABLE `push_dispositivos`
  ADD CONSTRAINT `fk_push_dispositivo_membro` FOREIGN KEY (`membro_id`) REFERENCES `membros` (`id`) ON DELETE CASCADE;

--
-- Limitadores para a tabela `push_fila`
--
ALTER TABLE `push_fila`
  ADD CONSTRAINT `fk_push_fila_dispositivo` FOREIGN KEY (`dispositivo_id`) REFERENCES `push_dispositivos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_push_fila_membro` FOREIGN KEY (`membro_id`) REFERENCES `membros` (`id`) ON DELETE CASCADE;

--
-- Limitadores para a tabela `token`
--
ALTER TABLE `token`
  ADD CONSTRAINT `fk_token_membro` FOREIGN KEY (`membro_id`) REFERENCES `membros` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
