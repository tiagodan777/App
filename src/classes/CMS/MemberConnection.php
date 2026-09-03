<?php

declare(strict_types=1);

namespace App\CMS;

use PDO;

final class MemberConnection
{
    private PDO $db;
    private bool $schemaReady = false;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function areConnected(string $firstId, string $secondId): bool
    {
        [$firstId, $secondId] = $this->normalisePair($firstId, $secondId);

        if ($firstId === '' || $secondId === '' || hash_equals($firstId, $secondId)) {
            return false;
        }

        $this->ensureSchema();

        $statement = $this->db->prepare(
            'SELECT 1
             FROM ligacoes_membros
             WHERE membro_a_id = :a
             AND membro_b_id = :b
             LIMIT 1'
        );

        $statement->execute([
            'a' => $firstId,
            'b' => $secondId
        ]);

        return (bool) $statement->fetchColumn();
    }

    public function connect(string $firstId, string $secondId): bool
    {
        [$firstId, $secondId] = $this->normalisePair($firstId, $secondId);

        if ($firstId === '' || $secondId === '' || hash_equals($firstId, $secondId)) {
            return false;
        }

        $this->ensureSchema();

        $statement = $this->db->prepare(
            'INSERT IGNORE INTO ligacoes_membros (
                membro_a_id,
                membro_b_id,
                criada_em
             ) VALUES (
                :a,
                :b,
                NOW(6)
             )'
        );

        $statement->execute([
            'a' => $firstId,
            'b' => $secondId
        ]);

        return true;
    }

    public function connectionsFor(string $memberId): array
    {
        $memberId = trim($memberId);

        if ($memberId === '') {
            return [];
        }

        $this->ensureSchema();

        $statement = $this->db->prepare(
            'SELECT
                CASE
                    WHEN membro_a_id = :member_case
                        THEN membro_b_id
                    ELSE membro_a_id
                END AS outro_id,
                criada_em
             FROM ligacoes_membros
             WHERE membro_a_id = :member_a
             OR membro_b_id = :member_b
             ORDER BY criada_em DESC'
        );

        $statement->execute([
            'member_case' => $memberId,
            'member_a' => $memberId,
            'member_b' => $memberId
        ]);

        return $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    private function normalisePair(string $firstId, string $secondId): array
    {
        $firstId = trim($firstId);
        $secondId = trim($secondId);

        if (strcmp($firstId, $secondId) <= 0) {
            return [$firstId, $secondId];
        }

        return [$secondId, $firstId];
    }

    private function ensureSchema(): void
    {
        if ($this->schemaReady) {
            return;
        }

        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS ligacoes_membros (
                membro_a_id CHAR(36) NOT NULL,
                membro_b_id CHAR(36) NOT NULL,
                criada_em DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (membro_a_id, membro_b_id),
                KEY idx_ligacoes_membros_a (membro_a_id),
                KEY idx_ligacoes_membros_b (membro_b_id),
                KEY idx_ligacoes_membros_criada (criada_em)
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $this->schemaReady = true;
    }
}