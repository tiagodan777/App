<?php
declare(strict_types=1);

namespace App\CMS;

use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;
use PDO;
use PDOException;

final class Invitation {
    public function __construct(private PDO $db) {}

    public static function normalize(mixed $value): string {
        if (!is_string($value) || strlen($value) > 32) return '';

        $code = strtolower(str_replace(['-', ' '], '', trim($value)));

        return preg_match('/^[a-f0-9]{16}$/D', $code) === 1 ? $code : '';
    }

    public static function display(string $code): string {
        return strtoupper(implode('-', str_split($code, 4)));
    }

    public function owner(string $code): string {
        $code = self::normalize($code);

        if ($code === '') return '';

        $query = $this->db->prepare(
            'SELECT membro_id FROM membro_convites WHERE codigo = :code'
        );

        $query->execute(['code' => $code]);

        return (string) ($query->fetchColumn() ?: '');
    }

    public function personalCode(string $member): string {
        $query = $this->db->prepare(
            'SELECT codigo FROM membro_convites WHERE membro_id = :member'
        );

        for ($attempt = 0; $attempt < 4; $attempt++) {
            $query->execute(['member' => $member]);

            $existing = $query->fetchColumn();

            if ($existing) return (string) $existing;

            $code = bin2hex(random_bytes(8));

            try {
                $insert = $this->db->prepare(
                    'INSERT INTO membro_convites (membro_id, codigo, criado_em)
                     VALUES (:member, :code, :created)'
                );

                $insert->execute([
                    'member' => $member,
                    'code' => $code,
                    'created' => self::now()
                ]);

                return $code;
            } catch (PDOException $error) {
                // Duas aberturas simultâneas devem obter o mesmo código.
                if ((string) $error->getCode() !== '23000') throw $error;

                if ($attempt === 3) throw $error;
            }
        }

        throw new \RuntimeException('Não foi possível criar o convite.');
    }

    // Chamado exclusivamente durante a transação de criação de uma conta nova.
    public function attribute(
        string $newMember,
        string $code,
        string $source
    ): bool {
        if (!$this->db->inTransaction()) {
            throw new \LogicException('O convite requer uma transação.');
        }

        $host = $this->owner($code);

        if ($host === '') {
            throw new InvalidArgumentException(
                'O código de convite não é válido.'
            );
        }

        if ($host === $newMember) return false;

        if (!in_array($source, ['link', 'codigo'], true)) {
            throw new InvalidArgumentException('Origem inválida.');
        }

        $query = $this->db->prepare(
            'SELECT convidado_id
             FROM convites_registos
             WHERE convidado_id = :member'
        );

        $query->execute(['member' => $newMember]);

        if ($query->fetchColumn()) return false;

        $insert = $this->db->prepare(
            'INSERT INTO convites_registos
                (convidado_id, anfitriao_id, codigo, origem, criado_em)
             VALUES (:member, :host, :code, :source, :created)'
        );

        $insert->execute([
            'member' => $newMember,
            'host' => $host,
            'code' => self::normalize($code),
            'source' => $source,
            'created' => self::now()
        ]);

        return true;
    }

    public function confirmedCount(string $member): int {
        $query = $this->db->prepare(
            'SELECT COUNT(*)
             FROM convites_registos c
             INNER JOIN membros m ON m.id = c.convidado_id
             WHERE c.anfitriao_id = :member
               AND m.email_verificado_em IS NOT NULL'
        );

        $query->execute(['member' => $member]);

        return (int) $query->fetchColumn();
    }

    private static function now(): string {
        return (
            new DateTimeImmutable('now', new DateTimeZone('UTC'))
        )->format('Y-m-d H:i:s');
    }
}