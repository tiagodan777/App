<?php

declare(strict_types=1);

namespace App\CMS;

final class TodayStatus
{
    private Database $db;
    private bool $tableCreatedThisRequest = false;

    public function __construct(Database $db)
    {
        $this->db = $db;
    }

    private function createTable(): void
    {
        if ($this->tableCreatedThisRequest) {
            return;
        }

        $this->db->runSQL(
            "CREATE TABLE IF NOT EXISTS membro_hoje (
                membro_id VARCHAR(64) NOT NULL,
                nota VARCHAR(160) NULL,
                roupa_json LONGTEXT NULL,
                expira_em DATETIME(6) NOT NULL,

                criada_em DATETIME(6)
                    NOT NULL
                    DEFAULT CURRENT_TIMESTAMP(6),

                atualizada_em DATETIME(6)
                    NOT NULL
                    DEFAULT CURRENT_TIMESTAMP(6)
                    ON UPDATE CURRENT_TIMESTAMP(6),

                PRIMARY KEY (membro_id),

                KEY idx_membro_hoje_expira (
                    expira_em
                )
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
            COLLATE=utf8mb4_unicode_ci"
        );

        $this->tableCreatedThisRequest = true;
    }

    private function withTable(callable $operation): mixed
    {
        try {
            return $operation();
        } catch (\PDOException $error) {
            $mysqlCode = (int) ($error->errorInfo[1] ?? 0);

            if ($mysqlCode !== 1146) {
                throw $error;
            }

            $this->createTable();

            return $operation();
        }
    }

    public function get(string $memberId): ?array
    {
        $memberId = trim($memberId);

        if ($memberId === '') {
            return null;
        }

        $row = $this->withTable(function () use ($memberId) {
            return $this->db->runSQL(
                'SELECT
                    nota,
                    roupa_json,
                    expira_em,
                    atualizada_em
                 FROM membro_hoje
                 WHERE membro_id = :membro_id
                 AND expira_em > UTC_TIMESTAMP(6)
                 LIMIT 1',
                [
                    'membro_id' => $memberId
                ]
            )->fetch();
        });

        if (!$row) {
            return null;
        }

        $clothes = [];
        $raw = trim((string) ($row['roupa_json'] ?? ''));

        if ($raw !== '') {
            try {
                $decoded = json_decode(
                    $raw,
                    true,
                    32,
                    JSON_THROW_ON_ERROR
                );

                if (is_array($decoded)) {
                    $clothes = array_values(
                        array_filter(
                            $decoded,
                            static fn ($item): bool => is_array($item)
                        )
                    );
                }
            } catch (\Throwable) {
                $clothes = [];
            }
        }

        return [
            'note' => trim((string) ($row['nota'] ?? '')),
            'clothes' => $clothes,
            'expires_at' => (string) $row['expira_em'],
            'updated_at' => (string) $row['atualizada_em']
        ];
    }

    public function save(
        string $memberId,
        string $note,
        array $clothes
    ): ?array {
        $memberId = trim($memberId);
        $note = trim($note);

        if ($memberId === '') {
            return null;
        }

        if ($note === '' && $clothes === []) {
            $this->delete($memberId);

            return null;
        }

        $clothesJson = $clothes === []
            ? null
            : json_encode(
                array_values($clothes),
                JSON_UNESCAPED_UNICODE |
                JSON_UNESCAPED_SLASHES |
                JSON_THROW_ON_ERROR
            );

        $this->withTable(function () use ($memberId, $note, $clothesJson): void {
            $this->db->runSQL(
                'INSERT INTO membro_hoje (
                    membro_id,
                    nota,
                    roupa_json,
                    expira_em,
                    criada_em,
                    atualizada_em
                ) VALUES (
                    :membro_id,
                    :nota,
                    :roupa_json,
                    DATE_ADD(
                        UTC_TIMESTAMP(6),
                        INTERVAL 24 HOUR
                    ),
                    UTC_TIMESTAMP(6),
                    UTC_TIMESTAMP(6)
                )
                ON DUPLICATE KEY UPDATE
                    nota = VALUES(nota),
                    roupa_json = VALUES(roupa_json),
                    expira_em = VALUES(expira_em),
                    atualizada_em = UTC_TIMESTAMP(6)',
                [
                    'membro_id' => $memberId,
                    'nota' => $note === '' ? null : $note,
                    'roupa_json' => $clothesJson
                ]
            );
        });

        return $this->get($memberId);
    }

    public function delete(string $memberId): void
    {
        $memberId = trim($memberId);

        if ($memberId === '') {
            return;
        }

        $this->withTable(function () use ($memberId): void {
            $this->db->runSQL(
                'DELETE FROM membro_hoje
                 WHERE membro_id = :membro_id',
                [
                    'membro_id' => $memberId
                ]
            );
        });
    }
}