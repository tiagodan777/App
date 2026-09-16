<?php
declare(strict_types=1);

namespace App\CMS;

use PDO;

final class MemberConnection {
    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    public function areConnected(string $firstId, string $secondId): bool {
        [$firstId, $secondId] = $this->normalisePair($firstId, $secondId);
        if ($firstId === '' || $secondId === '' || hash_equals($firstId, $secondId)) {
            return false;
        }
        $statement = $this->db->prepare('SELECT 1
            FROM ligacoes_membros
            WHERE membro_a_id = :a AND membro_b_id = :b
            LIMIT 1');
        $statement->execute(['a' => $firstId, 'b' => $secondId]);
        return (bool) $statement->fetchColumn();
    }

    public function connect(string $firstId, string $secondId): bool {
        [$firstId, $secondId] = $this->normalisePair($firstId, $secondId);
        if ($firstId === '' || $secondId === '' || hash_equals($firstId, $secondId)) {
            return false;
        }
        $statement = $this->db->prepare('INSERT IGNORE INTO ligacoes_membros ( membro_a_id, membro_b_id, criada_em )
            VALUES ( :a, :b, NOW(6) )');
        $statement->execute(['a' => $firstId, 'b' => $secondId]);
        return true;
    }

    public function disconnect(string $firstId, string $secondId): bool {
        [$firstId, $secondId] = $this->normalisePair($firstId, $secondId);
        if ($firstId === '' || $secondId === '' || hash_equals($firstId, $secondId)) {
            return false;
        }
        $statement = $this->db->prepare('DELETE
            FROM ligacoes_membros
            WHERE membro_a_id = :a AND membro_b_id = :b');
        $statement->execute(['a' => $firstId, 'b' => $secondId]);
        return $statement->rowCount() > 0;
    }

    public function connectionsFor(string $memberId): array {
        $memberId = trim($memberId);
        if ($memberId === '') {
            return [];
        }
        $statement = $this->db->prepare('SELECT CASE WHEN membro_a_id = :member_case THEN membro_b_id ELSE membro_a_id END AS outro_id, criada_em
            FROM ligacoes_membros
            WHERE membro_a_id = :member_a OR membro_b_id = :member_b
            ORDER BY criada_em DESC');
        $statement->execute(['member_case' => $memberId, 'member_a' => $memberId, 'member_b' => $memberId]);
        return $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    private function normalisePair(string $firstId, string $secondId): array {
        $firstId = trim($firstId);
        $secondId = trim($secondId);
        if (strcmp($firstId, $secondId) <= 0) {
            return [$firstId, $secondId];
        }
        return [$secondId, $firstId];
    }
}
