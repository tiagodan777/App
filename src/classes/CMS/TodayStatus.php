<?php
declare(strict_types=1);

namespace App\CMS;

final class TodayStatus {

    public function __construct(private Database $db) {}

    public function get(string $memberId): ?array {
        if (trim($memberId) === '') {
            return null;
        }
        $row = $this->db->runSQL(
            'SELECT nota, roupa_json, expira_em, atualizada_em
                FROM membro_hoje
                WHERE membro_id = :id AND expira_em > UTC_TIMESTAMP(6)
                LIMIT 1',
            ['id' => trim($memberId)]
        )->fetch();
        if (!$row) {
            return null;
        }
        $clothes = json_decode((string) ($row['roupa_json'] ?? ''), true, 32);
        return [
            'note' => trim((string) ($row['nota'] ?? '')),
            'clothes' => is_array($clothes) ? array_values(array_filter($clothes, 'is_array')) : [],
            'expires_at' => (string) $row['expira_em'],
            'updated_at' => (string) $row['atualizada_em']
        ];
    }

    public function save(string $memberId, string $note, array $clothes): ?array {
        $memberId = trim($memberId);
        $note = trim($note);
        if ($memberId === '') {
            return null;
        }
        if ($note === '' && $clothes === []) {
            $this->delete($memberId);
            return null;
        }
        $json =
            $clothes === []
                ? null
                : json_encode(
                    array_values($clothes),
                    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
                );
        $this->db->runSQL(
            'INSERT INTO membro_hoje (membro_id, nota, roupa_json, expira_em, criada_em, atualizada_em)
                VALUES (:id, :nota, :roupa, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 24 HOUR), UTC_TIMESTAMP(6),
                UTC_TIMESTAMP(6))
                ON DUPLICATE KEY UPDATE nota = VALUES(nota), roupa_json = VALUES(roupa_json), expira_em =
                VALUES(expira_em), atualizada_em = UTC_TIMESTAMP(6)',
            ['id' => $memberId, 'nota' => $note === '' ? null : $note, 'roupa' => $json]
        );
        return $this->get($memberId);
    }

    public function delete(string $memberId): void {
        if (trim($memberId) === '') {
            return;
        }
        $this->db->runSQL('DELETE FROM membro_hoje WHERE membro_id = :id', ['id' => trim($memberId)]);
    }

    public function normaliseNote(mixed $valor, int $maximo): string {
        $texto = trim((string) $valor);
        if (mb_strlen($texto) > $maximo) {
            $texto = mb_substr($texto, 0, $maximo);
        }
        return $texto;
    }

    public function normaliseClothes(mixed $valor): array {
        if (!is_array($valor)) {
            return [];
        }
        $pecasPermitidas = [
            'tshirt' => ['icon' => '👕', 'label' => 'T-shirt'],
            'shirt' => ['icon' => '👔', 'label' => 'Camisa'],
            'sweater' => ['icon' => '🧶', 'label' => 'Camisola'],
            'hoodie' => ['icon' => '🧥', 'label' => 'Hoodie'],
            'jacket' => ['icon' => '🧥', 'label' => 'Casaco'],
            'top' => ['icon' => '👚', 'label' => 'Top'],
            'jeans' => ['icon' => '👖', 'label' => 'Jeans'],
            'trousers' => ['icon' => '👖', 'label' => 'Calças'],
            'shorts' => ['icon' => '🩳', 'label' => 'Calções'],
            'skirt' => ['icon' => '👗', 'label' => 'Saia'],
            'dress' => ['icon' => '👗', 'label' => 'Vestido'],
            'sneakers' => ['icon' => '👟', 'label' => 'Sapatilhas'],
            'boots' => ['icon' => '🥾', 'label' => 'Botas'],
            'shoes' => ['icon' => '👞', 'label' => 'Sapatos'],
            'sandals' => ['icon' => '🩴', 'label' => 'Sandálias'],
            'cap' => ['icon' => '🧢', 'label' => 'Boné'],
            'hat' => ['icon' => '👒', 'label' => 'Chapéu'],
            'glasses' => ['icon' => '🕶️', 'label' => 'Óculos'],
            'backpack' => ['icon' => '🎒', 'label' => 'Mochila']
        ];
        $coresPermitidas = [
            'white' => 'Branco',
            'black' => 'Preto',
            'grey' => 'Cinzento',
            'blue' => 'Azul',
            'denim' => 'Ganga',
            'red' => 'Vermelho',
            'green' => 'Verde',
            'yellow' => 'Amarelo',
            'pink' => 'Rosa',
            'purple' => 'Roxo',
            'brown' => 'Castanho',
            'beige' => 'Bege',
            'orange' => 'Laranja',
            'multicolor' => 'Multicolor'
        ];
        $resultado = [];
        $tiposUsados = [];
        foreach ($valor as $item) {
            if (count($resultado) >= 5) {
                break;
            }
            if (!is_array($item)) {
                continue;
            }
            $tipo = strtolower(trim((string) ($item['type'] ?? '')));
            $cor = strtolower(trim((string) ($item['color'] ?? '')));
            if (!isset($pecasPermitidas[$tipo]) || isset($tiposUsados[$tipo])) {
                continue;
            }
            $tiposUsados[$tipo] = true;
            if ($cor !== '' && !isset($coresPermitidas[$cor])) {
                $cor = '';
            }
            $resultado[] = [
                'type' => $tipo,
                'icon' => $pecasPermitidas[$tipo]['icon'],
                'label' => $pecasPermitidas[$tipo]['label'],
                'color' => $cor,
                'color_label' => $cor !== '' ? $coresPermitidas[$cor] : ''
            ];
        }
        return $resultado;
    }
}
