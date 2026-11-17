<?php
declare(strict_types=1);

final class RecoveryTestDatabase extends PDO {
    public $beforeEligibility = null;
    public $beforeUpload = null;

    public function __construct() {
        parent::__construct('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $this->sqliteCreateFunction('UTC_TIMESTAMP', static fn(...$unused) => gmdate('Y-m-d H:i:s'));
        $this->sqliteCreateFunction('IF', static fn($condition, $yes, $no) => $condition ? $yes : $no);
        $this->exec("CREATE TABLE token (token TEXT PRIMARY KEY, membro_id TEXT, validade TEXT, proposito TEXT);
            CREATE TABLE localizacao_membro (membro_id TEXT PRIMARY KEY, latitude REAL, longitude REAL,
                precisao_m REAL, localizacao_ativa INTEGER, visivel INTEGER, origem TEXT,
                capturada_em TEXT, atualizada_em TEXT, recebida_em TEXT);
            CREATE TABLE location_recovery_devices (device_key TEXT PRIMARY KEY, registration_id TEXT UNIQUE,
                membro_id TEXT, token_hash TEXT, apns_token TEXT, environment TEXT, enabled INTEGER DEFAULT 1,
                expires_at INTEGER, next_at INTEGER DEFAULT 0, failures INTEGER DEFAULT 0, attempts_json TEXT,
                last_capture TEXT, request_id TEXT, request_until INTEGER DEFAULT 0, last_error TEXT,
                recovery_version INTEGER DEFAULT 1)");
    }

    public function prepare(string $query, array $options = []): PDOStatement|false {
        if (str_contains($query, 'SELECT d.*, lm.capturada_em AS captured') && $this->beforeEligibility !== null) {
            $hook = $this->beforeEligibility;
            $this->beforeEligibility = null;
            $hook($this);
        }
        if (str_contains($query, "origem = 'background'") && $this->beforeUpload !== null) {
            $hook = $this->beforeUpload;
            $this->beforeUpload = null;
            $hook($this);
        }
        $query = str_replace('FOR UPDATE', '', $query);
        $query = preg_replace('/DATE_SUB\(UTC_TIMESTAMP\(3\), INTERVAL (CASE WHEN d.recovery_version = 2 THEN \d+ ELSE \d+ END) SECOND\)/',
            "datetime('now', '-' || ($1) || ' seconds')", $query);
        $query = str_replace('ON DUPLICATE KEY UPDATE', 'ON CONFLICT(device_key) DO UPDATE SET', $query);
        $query = preg_replace('/VALUES\((\w+)\)/', 'excluded.$1', $query);
        return parent::prepare($query, $options);
    }
}

