<?php

declare(strict_types=1);

namespace App\CMS;

use App\Validate\Validate;

final class ProfileAccess
{
    private Database $db;

    public function __construct(Database $db)
    {
        $this->db = $db;
    }

    public function validId(string $memberId): bool
    {
        return preg_match(
            '/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i',
            trim($memberId)
        ) === 1;
    }

    public function canView(string $viewerId, string $profileId): bool
    {
        $viewerId = trim($viewerId);
        $profileId = trim($profileId);

        if (!$this->validId($viewerId) || !$this->validId($profileId)) {
            return false;
        }

        $members = $this->members($viewerId, $profileId);

        if (!isset($members[$viewerId], $members[$profileId])) {
            return false;
        }

        if (hash_equals($viewerId, $profileId)) {
            return true;
        }

        $viewerAgeGroup = Validate::ageGroup(
            (string) $members[$viewerId]['nascimento']
        );

        $profileAgeGroup = Validate::ageGroup(
            (string) $members[$profileId]['nascimento']
        );

        if (
            $viewerAgeGroup === null ||
            $profileAgeGroup === null ||
            $viewerAgeGroup !== $profileAgeGroup ||
            $this->areBlocked($viewerId, $profileId)
        ) {
            return false;
        }

        return (new MemberConnection($this->db))->areConnected(
            $viewerId,
            $profileId
        )
            || $this->haveConversation($viewerId, $profileId)
            || $this->haveVisibleHey($viewerId, $profileId)
            || $this->hasProximityPass($viewerId, $profileId);
    }

    private function members(string $viewerId, string $profileId): array
    {
        $rows = $this->db->runSQL(
            'SELECT id, nascimento
             FROM membros
             WHERE id = :viewer_id
             OR id = :profile_id',
            [
                'viewer_id' => $viewerId,
                'profile_id' => $profileId
            ]
        )->fetchAll();

        $members = [];

        foreach ($rows as $row) {
            $id = trim((string) ($row['id'] ?? ''));

            if ($id !== '') {
                $members[$id] = $row;
            }
        }

        return $members;
    }

    private function areBlocked(string $firstId, string $secondId): bool
    {
        return (bool) $this->db->runSQL(
            'SELECT 1
             FROM bloqueados
             WHERE (
                 pessoa_bloqueou_id = :first_1
                 AND pessoa_bloqueada_id = :second_1
             ) OR (
                 pessoa_bloqueou_id = :second_2
                 AND pessoa_bloqueada_id = :first_2
             )
             LIMIT 1',
            [
                'first_1' => $firstId,
                'second_1' => $secondId,
                'second_2' => $secondId,
                'first_2' => $firstId
            ]
        )->fetchColumn();
    }

    private function haveConversation(string $firstId, string $secondId): bool
    {
        return (bool) $this->db->runSQL(
            'SELECT 1
             FROM mensagens_chat
             WHERE (
                 emissor_id = :first_1
                 AND destinatario_id = :second_1
             ) OR (
                 emissor_id = :second_2
                 AND destinatario_id = :first_2
             )
             LIMIT 1',
            [
                'first_1' => $firstId,
                'second_1' => $secondId,
                'second_2' => $secondId,
                'first_2' => $firstId
            ]
        )->fetchColumn();
    }

    private function haveVisibleHey(string $viewerId, string $profileId): bool
    {
        return (bool) $this->db->runSQL(
            "SELECT 1
             FROM notificacao
             WHERE tipo = 'hey'
             AND (
                 (
                     emissor_id = :viewer_sender
                     AND destinatario_id = :profile_recipient
                     AND ocultada_para_emissor_em IS NULL
                 ) OR (
                     emissor_id = :profile_sender
                     AND destinatario_id = :viewer_recipient
                     AND ocultada_para_destinatario_em IS NULL
                 )
             )
             LIMIT 1",
            [
                'viewer_sender' => $viewerId,
                'profile_recipient' => $profileId,
                'profile_sender' => $profileId,
                'viewer_recipient' => $viewerId
            ]
        )->fetchColumn();
    }

    private function hasProximityPass(string $viewerId, string $profileId): bool
    {
        return (bool) $this->db->runSQL(
            'SELECT 1
             FROM token
             WHERE membro_id = :profile_id
             AND proposito = :purpose
             AND validade > UTC_TIMESTAMP()
             LIMIT 1',
            [
                'profile_id' => $profileId,
                'purpose' => $this->profilePurpose($viewerId)
            ]
        )->fetchColumn();
    }

    private function profilePurpose(string $viewerId): string
    {
        return 'profile:' . substr(
            hash('sha256', $viewerId),
            0,
            24
        );
    }
}