<?php
declare(strict_types=1);
namespace App\CMS;

use PDO;
use InvalidArgumentException;
use Throwable;

final class Daylie {
    public function __construct(private PDO $db) {}

    public static function folder(): string {
        return APP_ROOT . '/var/daylies/';
    }

    public function list(string $member): array {
        $query = $this->db->prepare('SELECT id, tipo, legenda, criada_em, expira_em FROM membro_daylies
            WHERE membro_id = :member AND expira_em > UTC_TIMESTAMP() ORDER BY id');
        $query->execute(['member' => $member]);
        return $query->fetchAll(PDO::FETCH_ASSOC);
    }

    public function publish(string $member, array $upload, string $caption): int {
        if (mb_strlen($caption) > 160) throw new InvalidArgumentException('A legenda pode ter até 160 caracteres.');
        $file = (new MessageMedia())->receive($upload, false, false, self::folder());
        if (!$file) throw new InvalidArgumentException('Escolhe uma fotografia ou um vídeo.');
        try {
            $this->db->beginTransaction();
            // Serializa publicações da mesma pessoa, incluindo pedidos simultâneos.
            $lock = $this->db->prepare('SELECT id FROM membros WHERE id = :id FOR UPDATE');
            $lock->execute(['id' => $member]);
            if (count($this->list($member)) >= 20) {
                throw new InvalidArgumentException('Podes ter até 20 Daylies nas últimas 24 horas.');
            }
            $query = $this->db->prepare('INSERT INTO membro_daylies
                (membro_id, ficheiro, tipo, mime, legenda, criada_em, expira_em)
                VALUES (:member, :file, :type, :mime, :caption, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR))');
            $query->execute(['member' => $member, 'file' => $file['nome'], 'type' => $file['tipo'],
                'mime' => $file['mime'], 'caption' => trim($caption)]);
            $id = (int) $this->db->lastInsertId();
            $this->db->commit();
            return $id;
        } catch (Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            @unlink($file['caminho']);
            throw $error;
        }
    }

    public function find(int $id): ?array {
        $query = $this->db->prepare('SELECT * FROM membro_daylies WHERE id = :id AND expira_em > UTC_TIMESTAMP()');
        $query->execute(['id' => $id]);
        return $query->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function delete(int $id, string $owner): void {
        $row = $this->find($id);
        if (!$row || $row['membro_id'] !== $owner) throw new InvalidArgumentException('Daylie indisponível.');
        $query = $this->db->prepare('DELETE FROM membro_daylies WHERE id = :id AND membro_id = :owner');
        $query->execute(['id' => $id, 'owner' => $owner]);
        @unlink(self::folder() . basename($row['ficheiro']));
    }

    public function cleanup(): void {
        $query = $this->db->query('SELECT id, ficheiro FROM membro_daylies WHERE expira_em <= UTC_TIMESTAMP() LIMIT 500');
        $delete = $this->db->prepare('DELETE FROM membro_daylies WHERE id = :id');
        foreach ($query->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $path = self::folder() . basename($row['ficheiro']);
            if (is_file($path) && !unlink($path)) continue;
            $delete->execute(['id' => $row['id']]);
        }
        // Também remove ficheiros órfãos de contas apagadas ou uploads interrompidos.
        foreach (glob(self::folder() . '*') ?: [] as $path) {
            if (is_file($path) && filemtime($path) < time() - 90000) @unlink($path);
        }
    }
}