<?php

// Base temporária para testar regras e resultados. Não substitui a validação em MariaDB.

final class TestDatabase extends App\CMS\Database {
    public array $statements = [];

    public function __construct() {
        parent::__construct('sqlite::memory:', null, null);
        $this->sqliteCreateFunction('CONCAT', static fn(...$parts) => implode('', $parts));
        $this->sqliteCreateFunction('GREATEST', static fn(...$parts) => max($parts));
        $this->sqliteCreateFunction('CHAR_LENGTH', static fn($text) => mb_strlen($text));
        $this->sqliteCreateFunction('NOW', static fn(...$args) => gmdate('Y-m-d H:i:s'));
        $this->sqliteCreateFunction('UTC_TIMESTAMP', static fn(...$args) => gmdate('Y-m-d H:i:s'));
        $this->sqliteCreateFunction('UNIX_TIMESTAMP', static fn($date) => strtotime($date . ' UTC'));
        $this->sqliteCreateFunction('UUID', static fn() => 'aaaaaaaa-aaaa-4aaa-8aaa-' . bin2hex(random_bytes(6)));
        $this->sqliteCreateCollation(
            'utf8mb4_unicode_ci',
            static fn($a, $b) => strcmp(mb_strtolower($a), mb_strtolower($b))
        );
        $this->sqliteCreateCollation(
            'utf8mb4_general_ci',
            static fn($a, $b) => strcmp(mb_strtolower($a), mb_strtolower($b))
        );
        parent::exec('PRAGMA foreign_keys = ON');
        parent::exec(file_get_contents(__DIR__ . '/fixtures.sql'));
    }

    private function translate(string $sql): string {
        if (preg_match('/\b(CREATE|ALTER|DROP)\s+TABLE/i', $sql)) {
            throw new RuntimeException('DDL durante uma operação normal.');
        }
        $this->statements[] = $sql;
        $sql = preg_replace('/:(permanent|finished) = 1/', 'CAST(:$1 AS INTEGER) = 1', $sql);
        $sql = preg_replace('/DATE_SUB\(UTC_DATE\(\),\s*INTERVAL (\d+) YEAR\)/i', "date('now', '-$1 years')", $sql);
        $sql = preg_replace(
            '/DATE_ADD\(\s*UTC_TIMESTAMP\(6\),\s*INTERVAL 24 HOUR\s*\)/i',
            "datetime('now', '+24 hours')",
            $sql
        );
        $sql = preg_replace('/DATE_SUB\(\s*UTC_TIMESTAMP\(\),\s*INTERVAL (\d+) SECOND\s*\)/i', "datetime('now', '-$1 seconds')", $sql);
        $sql = preg_replace_callback('/DATE_SUB\(\s*UTC_TIMESTAMP\(6?\),\s*INTERVAL (\d+) (SECOND|MINUTE|DAY)\s*\)/i',
            static fn($m) => "datetime('now', '-" . $m[1] . ' ' . strtolower($m[2]) . "s')", $sql);
        // UPDATE ... JOIN de MariaDB, equivalente apenas para este cancelamento.
        if (str_contains($sql, 'UPDATE push_fila AS q') && str_contains($sql, 'INNER JOIN push_dispositivos')) {
            $sql = "UPDATE push_fila SET estado='cancelled', bloqueado_em=NULL, ultimo_erro='device_unregistered'
                WHERE membro_id=:member_id AND estado IN ('queued','processing')
                AND dispositivo_id IN (SELECT id FROM push_dispositivos WHERE ativo=0)";
        }
        $sql = str_ireplace(['INSERT IGNORE', 'FOR UPDATE'], ['INSERT OR IGNORE', ''], $sql);
        if (preg_match('/ON DUPLICATE KEY UPDATE/i', $sql)) {
            preg_match('/INSERT(?: OR IGNORE)? INTO (\w+)/i', $sql, $match);
            $keys = [
                'mensagens_conversas_ocultas' => 'membro_id, outro_id',
                'mensagens_reacoes' => 'mensagem_id, membro_id',
                'mensagens_apagadas' => 'mensagem_id',
                'membro_hoje' => 'membro_id',
                'localizacao_membro' => 'membro_id',
                'estado_app_membro' => 'membro_id'
            ];
            $sql = preg_replace(
                '/ON DUPLICATE KEY UPDATE/i',
                'ON CONFLICT (' . $keys[$match[1]] . ') DO UPDATE SET',
                $sql
            );
            $sql = preg_replace('/VALUES\((\w+)\)/i', 'excluded.$1', $sql);
        }
        return $sql;
    }

    public function prepare(string $query, array $options = []): PDOStatement|false {
        return parent::prepare($this->translate($query), $options);
    }

    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false {
        $query = $this->translate($query);
        return $fetchMode === null ? parent::query($query) : parent::query($query, $fetchMode, ...$fetchModeArgs);
    }

    public function exec(string $statement): int|false {
        return parent::exec($this->translate($statement));
    }
}
