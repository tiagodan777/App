<?php
declare(strict_types=1);

namespace App\CMS;

final class Notification {

    public function __construct(private Database $db) {}

    public function list(string $memberId): array {
        $heys = array_merge($this->getHeys($memberId, 'recebido'), $this->getHeys($memberId, 'enviado'));
        usort($heys, static function (array $a, array $b): int {
            $date = strcmp((string) $b['criada_em'], (string) $a['criada_em']);
            return $date !== 0 ? $date : (int) $b['id'] <=> (int) $a['id'];
        });
        foreach ($heys as &$hey) {
            $photo = basename(trim((string) ($hey['outro_foto'] ?? 'default.webp'))) ?: 'default.webp';
            $hey['id'] = (int) $hey['id'];
            $hey['lida'] = (bool) $hey['lida'];
            $hey['outro_foto_url'] = DOC_ROOT . 'imagens/fotos-perfil/' . rawurlencode($photo);
            unset($hey['outro_foto']);
        }
        unset($hey);
        return array_slice($heys, 0, 100);
    }

    private function getHeys(string $memberId, string $direction): array {
        $received = $direction === 'recebido';
        $other = $received ? 'emissor_id' : 'destinatario_id';
        $member = $received ? 'destinatario_id' : 'emissor_id';
        $hidden = $received ? 'ocultada_para_destinatario_em' : 'ocultada_para_emissor_em';
        return $this->db->runSQL(
            "SELECT n.id, n.emissor_id, n.destinatario_id, n.tipo, n.lida, n.criada_em, n.lida_em, '{$direction}' AS
                direcao, m.id AS outro_membro_id, COALESCE(NULLIF(TRIM(CONCAT(COALESCE(m.primeiro_nome, ''), ' ',
                COALESCE(m.ultimo_nome, ''))), ''), 'Utilizador') AS outro_nome, COALESCE((SELECT fp.nome_arquivo
                FROM fotos_perfil fp
                WHERE fp.membro_id COLLATE utf8mb4_unicode_ci = m.id COLLATE utf8mb4_unicode_ci AND (fp.status =
                'completo' OR fp.status IS NULL)
                ORDER BY fp.ordem IS NULL ASC, fp.ordem ASC
                LIMIT 1), 'default.webp') AS outro_foto
                FROM notificacao n
                LEFT JOIN membros m ON m.id COLLATE utf8mb4_unicode_ci = n.{$other} COLLATE utf8mb4_unicode_ci
                WHERE n.{$member} = :id AND n.tipo = 'hey' AND n.{$hidden} IS NULL
                ORDER BY n.criada_em DESC, n.id DESC
                LIMIT 100",
            ['id' => $memberId]
        )->fetchAll();
    }

    public function unreadCount(string $memberId): int {
        return (int) $this->db->runSQL(
            "SELECT COUNT(*)
                FROM notificacao
                WHERE destinatario_id = :id AND tipo = 'hey' AND lida = 0 AND ocultada_para_destinatario_em IS NULL",
            ['id' => $memberId]
        )->fetchColumn();
    }

    public function markAllRead(string $memberId): void {
        $this->db->runSQL(
            "UPDATE notificacao
                SET lida = 1, lida_em = COALESCE(lida_em, NOW())
                WHERE destinatario_id = :id AND tipo = 'hey' AND lida = 0 AND ocultada_para_destinatario_em IS NULL",
            ['id' => $memberId]
        );
    }

    public function hide(string $memberId, string $direction, ?int $id = null): void {
        if (!in_array($direction, ['recebido', 'enviado'], true)) {
            throw new \InvalidArgumentException('Direção inválida.');
        }
        $received = $direction === 'recebido';
        $owner = $received ? 'destinatario_id' : 'emissor_id';
        $hidden = $received ? 'ocultada_para_destinatario_em' : 'ocultada_para_emissor_em';
        $sets = "$hidden = COALESCE($hidden, NOW())";
        if ($received) {
            $sets .= ', lida = 1, lida_em = COALESCE(lida_em, NOW())';
        }
        $where = $id === null ? " AND $hidden IS NULL" : ' AND id = :notification';
        $params = ['member' => $memberId];
        if ($id !== null) {
            $params['notification'] = $id;
        }
        $this->db->runSQL("UPDATE notificacao SET $sets WHERE $owner = :member AND tipo = 'hey'" . $where, $params);
    }
}
