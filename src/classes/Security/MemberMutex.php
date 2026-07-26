<?php

declare(strict_types=1);

namespace App\Security;

use RuntimeException;
use Throwable;

final class MemberMutex
{
    private $db;
    private array $locks = [];

    public function __construct($db)
    {
        $this->db = $db;
    }

    public function acquire(string $memberId, int $timeoutSeconds = 0): bool
    {
        $memberId = trim($memberId);

        if ($memberId === '') {
            throw new RuntimeException('Não é possível bloquear um membro sem ID.');
        }

        $name = self::name($memberId);

        if (isset($this->locks[$name])) return true;

        $acquired = (int) $this->db->runSQL(
            'SELECT GET_LOCK(:lock_name, :timeout_seconds)',
            [
                'lock_name' => $name,
                'timeout_seconds' => max(0, min(30, $timeoutSeconds))
            ]
        )->fetchColumn() === 1;

        if ($acquired) $this->locks[$name] = true;

        return $acquired;
    }

    public function release(string $memberId): void
    {
        $name = self::name($memberId);

        if (!isset($this->locks[$name])) return;

        try {
            $this->db->runSQL(
                'SELECT RELEASE_LOCK(:lock_name)',
                ['lock_name' => $name]
            );
        } finally {
            unset($this->locks[$name]);
        }
    }

    public function releaseAll(): void
    {
        foreach (array_keys($this->locks) as $name) {
            try {
                $this->db->runSQL(
                    'SELECT RELEASE_LOCK(:lock_name)',
                    ['lock_name' => $name]
                );
            } catch (Throwable) {
                // A ligação à base de dados liberta sempre os locks ao fechar.
            }

            unset($this->locks[$name]);
        }
    }

    public function __destruct()
    {
        $this->releaseAll();
    }

    private static function name(string $memberId): string
    {
        return 'margot:member:' . substr(hash('sha256', trim($memberId)), 0, 40);
    }
}
