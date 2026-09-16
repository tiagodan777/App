<?php
declare(strict_types=1);

namespace App\CMS;

final class Safety {

    public function __construct(private Database $db) {}

    public function memberExists(string $id): bool {
        return (bool) $this->db->runSQL('SELECT 1 FROM membros WHERE id = :id LIMIT 1', ['id' => $id])->fetchColumn();
    }

    public function block(string $memberId, string $targetId): bool {
        return $this->db->runSQL(
            'INSERT IGNORE INTO bloqueados (pessoa_bloqueou_id, pessoa_bloqueada_id)
                VALUES (:member, :target)',
            ['member' => $memberId, 'target' => $targetId]
        )->rowCount() > 0;
    }

    public function unblock(string $memberId, string $targetId): void {
        $this->db->runSQL(
            'DELETE FROM bloqueados WHERE pessoa_bloqueou_id = :member AND pessoa_bloqueada_id = :target',
            ['member' => $memberId, 'target' => $targetId]
        );
    }

    public function report(string $memberId, string $targetId, string $reason, string $message): void {
        $this->db->runSQL(
            'INSERT INTO denuncias (membro_denuncia, membro_denunciado, motivo, mensagem)
                VALUES (:member, :target, :reason, :message)',
            [
                'member' => $memberId,
                'target' => $targetId,
                'reason' => $reason,
                'message' => $message !== '' ? $message : null
            ]
        );
    }

    public function blockedUsers(string $memberId): array {
        $members = $this->db->runSQL(
            "SELECT m.id, COALESCE(NULLIF(TRIM(CONCAT(COALESCE(m.primeiro_nome, ''), ' ', COALESCE(m.ultimo_nome,
                ''))), ''), 'Utilizador') AS nome, COALESCE((SELECT fp.nome_arquivo
                FROM fotos_perfil fp
                WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = m.id COLLATE utf8mb4_unicode_ci AND (fp.status =
                'completo' OR fp.status IS NULL)
                ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC, fp.id ASC
                LIMIT 1), 'default.webp') AS foto
                FROM bloqueados b
                INNER JOIN membros m ON m.id COLLATE utf8mb4_unicode_ci = b.pessoa_bloqueada_id COLLATE
                utf8mb4_unicode_ci
                WHERE b.pessoa_bloqueou_id = :id
                ORDER BY nome ASC",
            ['id' => $memberId]
        )->fetchAll();
        foreach ($members as &$member) {
            $photo = basename(trim((string) ($member['foto'] ?? 'default.webp'))) ?: 'default.webp';
            $member['foto_url'] = DOC_ROOT . 'imagens/fotos-perfil/' . rawurlencode($photo);
            unset($member['foto']);
        }
        unset($member);
        return $members;
    }
}
