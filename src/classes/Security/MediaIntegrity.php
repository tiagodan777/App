<?php

declare(strict_types=1);

namespace App\Security;

use finfo;
use PDO;

final class MediaIntegrity
{
    private const PROFILE_SOURCE_MIME_TYPES = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/heic',
        'image/heif'
    ];

    /**
     * Compara as referências da base de dados com a media privada.
     *
     * O resultado contém apenas contagens agregadas. Não inclui nomes de
     * ficheiros, IDs de membros ou conteúdo de mensagens.
     */
    public static function audit(PDO $database): array
    {
        $result = [
            'records_checked' => 0,
            'pending_profile_photos' => 0,
            'unsafe_profile_names' => 0,
            'missing_pending_profile_sources' => 0,
            'invalid_pending_profile_sources' => 0,
            'missing_complete_profile_files' => 0,
            'invalid_complete_profile_files' => 0,
            'duplicate_profile_names' => 0,
            'unsafe_message_media_names' => 0,
            'missing_message_media_files' => 0,
            'invalid_message_media_files' => 0,
            'message_media_metadata_mismatches' => 0,
            'duplicate_message_media_names' => 0,
            'unsafe_report_media_names' => 0,
            'missing_report_media_files' => 0,
            'invalid_report_media_files' => 0,
            'report_media_metadata_mismatches' => 0,
            'report_media_hash_mismatches' => 0,
            'duplicate_report_media_names' => 0,
            'queued_files_still_referenced' => 0
        ];
        $finfo = new finfo(FILEINFO_MIME_TYPE);

        $photos = $database->query(
            'SELECT nome_arquivo, status
             FROM fotos_perfil'
        );

        foreach ($photos as $photo) {
            $result['records_checked']++;
            $name = trim((string) ($photo['nome_arquivo'] ?? ''));
            $status = (string) ($photo['status'] ?? '');

            if (!self::isSafeStoredName($name)) {
                $result['unsafe_profile_names']++;
                continue;
            }

            if ($status === 'pendente') {
                $result['pending_profile_photos']++;
                $path = rtrim(PROFILE_PHOTO_TEMP_DIR, '/') . '/' . $name;

                if (!self::isSafeRegularFile($path, PROFILE_PHOTO_TEMP_DIR)) {
                    $result['missing_pending_profile_sources']++;
                    continue;
                }

                $size = filesize($path);
                $mime = $finfo->file($path);

                if (
                    $size === false ||
                    $size < 1 ||
                    $size > MAX_SIZE ||
                    !is_string($mime) ||
                    !in_array($mime, self::PROFILE_SOURCE_MIME_TYPES, true)
                ) {
                    $result['invalid_pending_profile_sources']++;
                }

                continue;
            }

            if ($status !== 'completo') continue;

            foreach (
                [PROFILE_PHOTO_THUMB_DIR, PROFILE_PHOTO_ORIGINAL_DIR]
                as $directory
            ) {
                $path = rtrim($directory, '/') . '/' . $name;

                if (!self::isSafeRegularFile($path, $directory)) {
                    $result['missing_complete_profile_files']++;
                    continue;
                }

                $size = filesize($path);
                $mime = $finfo->file($path);

                if (
                    $size === false ||
                    $size < 1 ||
                    $mime !== 'image/webp' ||
                    strtolower((string) pathinfo($name, PATHINFO_EXTENSION)) !== 'webp'
                ) {
                    $result['invalid_complete_profile_files']++;
                }
            }
        }

        $result['duplicate_profile_names'] = self::duplicateNameCount(
            $database,
            'fotos_perfil',
            'nome_arquivo'
        );

        $messageMedia = $database->query(
            "SELECT tipo, ficheiro_nome, ficheiro_mime, ficheiro_tamanho
             FROM mensagens_chat
             WHERE ficheiro_nome IS NOT NULL
                OR ficheiro_mime IS NOT NULL
                OR ficheiro_tamanho IS NOT NULL
                OR tipo IN ('imagem', 'video')"
        );

        foreach ($messageMedia as $media) {
            $result['records_checked']++;
            $name = trim((string) ($media['ficheiro_nome'] ?? ''));

            if (!self::isSafeStoredName($name)) {
                $result['unsafe_message_media_names']++;
                continue;
            }

            $path = rtrim(MESSAGE_MEDIA_DIR, '/') . '/' . $name;

            if (!self::isSafeRegularFile($path, MESSAGE_MEDIA_DIR)) {
                $result['missing_message_media_files']++;
                continue;
            }

            $size = filesize($path);
            $mime = $finfo->file($path);

            if (
                $size === false ||
                $size < 1 ||
                $mime !== 'image/webp' ||
                strtolower((string) pathinfo($name, PATHINFO_EXTENSION)) !== 'webp'
            ) {
                $result['invalid_message_media_files']++;
                continue;
            }

            if (
                (string) ($media['tipo'] ?? '') !== 'imagem' ||
                (string) ($media['ficheiro_mime'] ?? '') !== 'image/webp' ||
                (int) ($media['ficheiro_tamanho'] ?? 0) !== $size
            ) {
                $result['message_media_metadata_mismatches']++;
            }
        }

        $result['duplicate_message_media_names'] = self::duplicateNameCount(
            $database,
            'mensagens_chat',
            'ficheiro_nome'
        );

        $reportMedia = $database->query(
            'SELECT evidencia_media_nome, evidencia_media_mime,
                    evidencia_media_tamanho, evidencia_media_sha256
             FROM denuncias
             WHERE evidencia_media_nome IS NOT NULL
                OR evidencia_media_mime IS NOT NULL
                OR evidencia_media_tamanho IS NOT NULL
                OR evidencia_media_sha256 IS NOT NULL'
        );

        foreach ($reportMedia as $media) {
            $result['records_checked']++;
            $name = trim((string) ($media['evidencia_media_nome'] ?? ''));

            if (!self::isSafeStoredName($name)) {
                $result['unsafe_report_media_names']++;
                continue;
            }

            $path = rtrim(REPORT_EVIDENCE_DIR, '/') . '/' . $name;

            if (!self::isSafeRegularFile($path, REPORT_EVIDENCE_DIR)) {
                $result['missing_report_media_files']++;
                continue;
            }

            $size = filesize($path);
            $mime = $finfo->file($path);

            if (
                $size === false ||
                $size < 1 ||
                $mime !== 'image/webp' ||
                strtolower((string) pathinfo($name, PATHINFO_EXTENSION)) !== 'webp'
            ) {
                $result['invalid_report_media_files']++;
                continue;
            }

            if (
                (string) ($media['evidencia_media_mime'] ?? '') !== 'image/webp' ||
                (int) ($media['evidencia_media_tamanho'] ?? 0) !== $size
            ) {
                $result['report_media_metadata_mismatches']++;
            }

            $expectedHash = strtolower(trim((string) (
                $media['evidencia_media_sha256'] ?? ''
            )));
            $actualHash = hash_file('sha256', $path);

            if (
                preg_match('/\A[0-9a-f]{64}\z/D', $expectedHash) !== 1 ||
                !is_string($actualHash) ||
                !hash_equals($expectedHash, $actualHash)
            ) {
                $result['report_media_hash_mismatches']++;
            }
        }

        $result['duplicate_report_media_names'] = self::duplicateNameCount(
            $database,
            'denuncias',
            'evidencia_media_nome'
        );
        $result['queued_files_still_referenced'] = (int) $database->query(
            "SELECT COUNT(*)
             FROM ficheiros_a_apagar AS fila
             WHERE (
                 fila.tipo = 'perfil'
                 AND EXISTS (
                     SELECT 1
                     FROM fotos_perfil AS foto
                     WHERE foto.nome_arquivo = fila.nome_arquivo
                        OR CONCAT(
                            SUBSTRING_INDEX(foto.nome_arquivo, '.', 1),
                            '.webp'
                        ) = fila.nome_arquivo
                 )
             ) OR (
                 fila.tipo = 'mensagem'
                 AND EXISTS (
                     SELECT 1
                     FROM mensagens_chat AS mensagem
                     WHERE mensagem.ficheiro_nome = fila.nome_arquivo
                 )
             ) OR (
                 fila.tipo = 'denuncia'
                 AND EXISTS (
                     SELECT 1
                     FROM denuncias AS denuncia
                     WHERE denuncia.evidencia_media_nome = fila.nome_arquivo
                 )
             )"
        )->fetchColumn();

        return $result;
    }

    public static function issueCount(array $result): int
    {
        $ignored = ['records_checked', 'pending_profile_photos'];
        $total = 0;

        foreach ($result as $key => $count) {
            if (in_array($key, $ignored, true)) continue;

            $total += max(0, (int) $count);
        }

        return $total;
    }

    private static function isSafeStoredName(string $name): bool
    {
        return $name !== '' &&
            $name !== '.' &&
            $name !== '..' &&
            strlen($name) <= 255 &&
            basename($name) === $name &&
            preg_match('/\A[A-Za-z0-9][A-Za-z0-9._-]*\z/D', $name) === 1;
    }

    private static function isSafeRegularFile(
        string $path,
        string $directory
    ): bool {
        if (!is_file($path) || is_link($path)) return false;

        $realDirectory = realpath($directory);
        $realPath = realpath($path);

        if ($realDirectory === false || $realPath === false) return false;

        $prefix = rtrim(str_replace('\\', '/', $realDirectory), '/') . '/';
        $normalizedPath = str_replace('\\', '/', $realPath);

        return str_starts_with($normalizedPath, $prefix);
    }

    private static function duplicateNameCount(
        PDO $database,
        string $table,
        string $column
    ): int {
        $allowed = [
            'fotos_perfil.nome_arquivo',
            'mensagens_chat.ficheiro_nome',
            'denuncias.evidencia_media_nome'
        ];

        if (!in_array($table . '.' . $column, $allowed, true)) {
            throw new \InvalidArgumentException('Relação de media desconhecida.');
        }

        $statement = $database->query(sprintf(
            'SELECT COALESCE(SUM(duplicados - 1), 0)
             FROM (
                 SELECT COUNT(*) AS duplicados
                 FROM `%s`
                 WHERE `%s` IS NOT NULL
                 GROUP BY `%s`
                 HAVING COUNT(*) > 1
             ) AS nomes_duplicados',
            $table,
            $column,
            $column
        ));

        return (int) $statement->fetchColumn();
    }
}
