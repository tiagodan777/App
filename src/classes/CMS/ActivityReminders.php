<?php
declare(strict_types=1);
namespace App\CMS;

use PDO;
use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;
use Throwable;

final class ActivityReminders {
    public function __construct(private PDO $db, private PushNotification $push) {}

    public function preferences(string $member): array {
        $query = $this->db->prepare('SELECT fuso_horario, proximidade, roupa FROM preferencias_lembretes WHERE membro_id = :id');
        $query->execute(['id' => $member]);
        $row = $query->fetch(PDO::FETCH_ASSOC) ?: ['fuso_horario' => 'UTC', 'proximidade' => 1, 'roupa' => 1];
        return ['timezone' => $row['fuso_horario'], 'nearby' => (bool) $row['proximidade'], 'clothes' => (bool) $row['roupa']];
    }

    public function save(string $member, array $values): array {
        $timezone = $values['timezone'] ?? 'UTC';
        if (!is_string($timezone) || !in_array($timezone, DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), true)) {
            throw new InvalidArgumentException('Fuso horário inválido.');
        }
        foreach (['nearby', 'clothes'] as $key) {
            if (array_key_exists($key, $values) && !is_bool($values[$key])) {
                throw new InvalidArgumentException('Preferência inválida.');
            }
        }
        $query = $this->db->prepare('INSERT INTO preferencias_lembretes (membro_id, fuso_horario)
            VALUES (:id, :timezone) ON DUPLICATE KEY UPDATE fuso_horario = VALUES(fuso_horario)');
        $query->execute(['id' => $member, 'timezone' => $timezone]);
        foreach (['nearby' => 'proximidade', 'clothes' => 'roupa'] as $key => $column) {
            if (!array_key_exists($key, $values)) continue;
            $query = $this->db->prepare("UPDATE preferencias_lembretes SET $column = :value WHERE membro_id = :id");
            $query->execute(['value' => (int) $values[$key], 'id' => $member]);
        }
        return $this->preferences($member);
    }

    public static function scheduledMinute(string $member, string $day): int {
        // Hora diferente por pessoa e por dia, estável entre reinícios do worker.
        return 12 * 60 + (int) (hexdec(substr(hash('sha256', $member . ':' . $day), 0, 8)) % 600);
    }

    public function clothesDue(string $member, ?DateTimeImmutable $now = null): bool {
        $settings = $this->preferences($member);
        if (!$settings['clothes']) return false;
        $now = ($now ?? new DateTimeImmutable('now', new DateTimeZone('UTC')))->setTimezone(new DateTimeZone($settings['timezone']));
        $minute = (int) $now->format('G') * 60 + (int) $now->format('i');
        if ($minute < self::scheduledMinute($member, $now->format('Y-m-d')) || $minute >= 22 * 60) return false;
        $query = $this->db->prepare('SELECT roupa_json, atualizada_em FROM membro_hoje WHERE membro_id = :id');
        $query->execute(['id' => $member]);
        $today = $query->fetch(PDO::FETCH_ASSOC);
        if (!$today || !json_decode((string) $today['roupa_json'], true)) return true;
        $updated = new DateTimeImmutable($today['atualizada_em'], new DateTimeZone('UTC'));
        return $updated->setTimezone($now->getTimezone())->format('Y-m-d') !== $now->format('Y-m-d');
    }

    public function queue(string $member, string $type, int $count = 0): bool {
        if (!in_array($type, ['nearby', 'clothes'], true) || ($type === 'nearby' && $count <= 5)) return false;
        $this->db->beginTransaction();
        try {
            $query = $this->db->prepare('SELECT * FROM preferencias_lembretes WHERE membro_id = :id FOR UPDATE');
            $query->execute(['id' => $member]);
            $settings = $query->fetch(PDO::FETCH_ASSOC);
            $enabled = $type === 'nearby' ? 'proximidade' : 'roupa';
            if (!$settings || !(bool) $settings[$enabled]) {
                $this->db->rollBack();
                return false;
            }
            $now = new DateTimeImmutable('now', new DateTimeZone($settings['fuso_horario']));
            $day = $now->format('Y-m-d');
            $query = $this->db->prepare('SELECT dia, criado_em FROM lembretes_envios
                WHERE membro_id = :id AND tipo = :type AND (dia = :day OR criado_em > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR))');
            $query->execute(['id' => $member, 'type' => $type, 'day' => $day]);
            $rows = $query->fetchAll(PDO::FETCH_ASSOC);
            $limit = $type === 'nearby' ? 2 : 1;
            $todayCount = count(array_filter($rows, fn($row) => $row['dia'] === $day));
            // A janela móvel também evita avisos extra ao viajar e mudar de fuso horário.
            if (count($rows) >= $limit || $todayCount >= $limit || ($type === 'clothes' && !$this->clothesDue($member, $now))) {
                $this->db->rollBack();
                return false;
            }
            if ($type === 'nearby') {
                foreach ($rows as $row) {
                    if (strtotime($row['criado_em'] . ' UTC') > time() - 14400) {
                        $this->db->rollBack();
                        return false;
                    }
                }
            }
            $slot = $todayCount + 1;
            $key = "$type:$member:$day:$slot";
            $queued = $type === 'nearby'
                ? $this->push->enqueueNearbyPeople($member, $count, $key)
                : $this->push->enqueueClothesReminder($member, $day, $key);
            if (!$queued) {
                $this->db->rollBack();
                return false;
            }
            $query = $this->db->prepare('INSERT INTO lembretes_envios (membro_id, dia, tipo, lugar, criado_em)
                VALUES (:id, :day, :type, :slot, UTC_TIMESTAMP())');
            $query->execute(['id' => $member, 'day' => $day, 'type' => $type, 'slot' => $slot]);
            $this->db->commit();
            return true;
        } catch (Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }

    public function tick(): void {
        $members = $this->db->query('SELECT p.membro_id FROM preferencias_lembretes p
            WHERE p.roupa = 1 AND EXISTS (SELECT 1 FROM push_dispositivos d WHERE d.membro_id = p.membro_id AND d.ativo = 1)');
        foreach ($members->fetchAll(PDO::FETCH_COLUMN) as $member) {
            if ($this->clothesDue($member)) $this->queue($member, 'clothes');
        }
    }
}