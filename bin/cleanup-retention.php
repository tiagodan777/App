<?php

declare(strict_types=1);

use App\CMS\Database;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}

define('APP_ROOT', dirname(__DIR__));

require APP_ROOT . '/config/config.php';
require APP_ROOT . '/vendor/autoload.php';

$database = new Database($dsn, $username, $password);
unset($dsn, $username, $password);

$cleanupLockName = 'margot:cleanup-retention';
$cleanupLockAcquired = (int) $database->runSQL(
    'SELECT GET_LOCK(:lock_name, 0)',
    ['lock_name' => $cleanupLockName]
)->fetchColumn() === 1;

if (!$cleanupLockAcquired) {
    fwrite(STDOUT, "Já existe uma limpeza de retenção em curso.\n");
    exit(0);
}

$results = [];

$database->beginTransaction();

try {
    $results['tokens_expirados'] = $database->runSQL(
        'DELETE FROM token
         WHERE validade IS NOT NULL
         AND validade <= UTC_TIMESTAMP()'
    )->rowCount();

    $results['bilhetes_websocket_expirados'] = $database->runSQL(
        'DELETE FROM websocket_tickets
         WHERE expira_em <= UTC_TIMESTAMP(6)'
    )->rowCount();

    $results['heys_ocultos_expirados'] = $database->runSQL(
        'DELETE FROM notificacao
         WHERE ocultada_para_emissor_em IS NOT NULL
         AND ocultada_para_destinatario_em IS NOT NULL
         AND GREATEST(
             ocultada_para_emissor_em,
             ocultada_para_destinatario_em
         ) <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)'
    )->rowCount();

    $results['historico_moderacao_expirado'] = $database->runSQL(
        'DELETE ma
         FROM moderacao_acoes AS ma
         INNER JOIN denuncias AS d ON d.id = ma.denuncia_id
         WHERE d.reter_ate IS NOT NULL
         AND d.reter_ate <= UTC_TIMESTAMP(6)'
    )->rowCount();

    $results['evidencia_media_enfileirada'] = $database->runSQL(
        "INSERT INTO ficheiros_a_apagar (tipo, nome_arquivo)
         SELECT 'denuncia', d.evidencia_media_nome
         FROM denuncias d
         WHERE d.reter_ate IS NOT NULL
         AND d.reter_ate <= UTC_TIMESTAMP(6)
         AND d.evidencia_media_nome IS NOT NULL
         ON DUPLICATE KEY UPDATE nome_arquivo = VALUES(nome_arquivo)"
    )->rowCount();

    $results['denuncias_expiradas'] = $database->runSQL(
        'DELETE FROM denuncias
         WHERE reter_ate IS NOT NULL
         AND reter_ate <= UTC_TIMESTAMP(6)'
    )->rowCount();

    $database->commit();
} catch (Throwable $error) {
    if ($database->inTransaction()) {
        $database->rollBack();
    }

    fwrite(STDERR, "A limpeza de retenção falhou.\n");
    error_log('[cleanup-retention] ' . $error->getMessage());
    exit(1);
}

$rateDirectory = APP_ROOT . '/var/rate-limit';
$rateFilesRemoved = 0;
$rateCutoff = time() - (2 * 86400);

foreach (glob($rateDirectory . '/*.json') ?: [] as $file) {
    if (
        is_file($file) &&
        (int) filemtime($file) < $rateCutoff &&
        @unlink($file)
    ) {
        $rateFilesRemoved++;
    }
}

$results['rate_limits_expirados'] = $rateFilesRemoved;

$queuedFiles = $database->runSQL(
    'SELECT id, tipo, nome_arquivo, tentativas
     FROM ficheiros_a_apagar
     WHERE tentativas >= 20
        OR (
            tentativas < 20
            AND (
                ultima_tentativa_em IS NULL
                OR ultima_tentativa_em <= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 15 MINUTE)
            )
        )
     ORDER BY tentativas ASC, COALESCE(ultima_tentativa_em, criada_em) ASC
     LIMIT 500'
)->fetchAll();
$queueRemoved = 0;
$queuePending = 0;

foreach ($queuedFiles as $queuedFile) {
    $queueId = (int) ($queuedFile['id'] ?? 0);
    $type = (string) ($queuedFile['tipo'] ?? '');
    $storedFilename = trim((string) ($queuedFile['nome_arquivo'] ?? ''));
    $filename = basename($storedFilename);
    $attempts = max(0, (int) ($queuedFile['tentativas'] ?? 0));
    $directories = match ($type) {
        'perfil' => [
            PROFILE_PHOTO_THUMB_DIR,
            PROFILE_PHOTO_ORIGINAL_DIR,
            PROFILE_PHOTO_TEMP_DIR,
            APP_ROOT . '/public/imagens/fotos-perfil',
            APP_ROOT . '/public/imagens/fotos-perfil-originais',
            APP_ROOT . '/public/imagens/fotos-perfil-temp'
        ],
        'mensagem' => [
            MESSAGE_MEDIA_DIR,
            APP_ROOT . '/public/media/mensagens'
        ],
        'denuncia' => [
            REPORT_EVIDENCE_DIR
        ],
        default => []
    };
    $failed =
        $queueId < 1 ||
        $filename === '' ||
        $filename !== $storedFilename ||
        preg_match('/\A[A-Za-z0-9][A-Za-z0-9._-]*\z/D', $filename) !== 1 ||
        $directories === [];

    if ($attempts < 20 && !$failed) {
        foreach ($directories as $directory) {
            $path = rtrim($directory, '/') . '/' . $filename;

            try {
                if ((is_file($path) || is_link($path)) && !unlink($path)) {
                    $failed = true;
                }
            } catch (Throwable $error) {
                $failed = true;
            }
        }
    }

    foreach ($directories as $directory) {
        $path = rtrim($directory, '/') . '/' . $filename;
        if (is_file($path) || is_link($path)) $failed = true;
    }

    if (!$failed) {
        $database->runSQL(
            'DELETE FROM ficheiros_a_apagar WHERE id = :id',
            ['id' => $queueId]
        );
        $queueRemoved++;
        continue;
    }

    if ($queueId > 0 && $attempts < 20) {
        $database->runSQL(
            'UPDATE ficheiros_a_apagar
             SET tentativas = tentativas + 1,
                 ultima_tentativa_em = UTC_TIMESTAMP(6),
                 ultimo_erro = :erro
             WHERE id = :id',
            [
                'erro' => 'Falha na repetição automática da eliminação.',
                'id' => $queueId
            ]
        );
    }

    $queuePending++;
}

$results['media_pendente_eliminada'] = $queueRemoved;
$results['media_ainda_pendente'] = $queuePending;
$results['media_intervencao_manual'] = (int) $database->runSQL(
    'SELECT COUNT(*) FROM ficheiros_a_apagar WHERE tentativas >= 20'
)->fetchColumn();

$worker = APP_ROOT . '/src/pages/profile-image-worker.php';
$pendingMembers = $database->runSQL(
    "SELECT DISTINCT membro_id
     FROM fotos_perfil
     WHERE status = 'pendente'
     LIMIT 50"
)->fetchAll(\PDO::FETCH_COLUMN);
$workersStarted = 0;
$phpCli = trim((string) (
    defined('PHP_CLI_BINARY') ? PHP_CLI_BINARY : ''
));

if (
    is_file($worker) &&
    $phpCli !== '' &&
    str_starts_with($phpCli, '/') &&
    is_file($phpCli) &&
    is_executable($phpCli) &&
    function_exists('exec')
) {
    foreach ($pendingMembers as $pendingMember) {
        $pendingMember = trim((string) $pendingMember);

        if ($pendingMember === '') continue;

        $command = sprintf(
            'nohup %s %s %s >/dev/null 2>&1 &',
            escapeshellarg($phpCli),
            escapeshellarg($worker),
            escapeshellarg($pendingMember)
        );

        exec($command);
        $workersStarted++;
    }
}

$results['workers_fotos_reiniciados'] = $workersStarted;

$removeOrphans = static function (
    string $directory,
    int $minimumAge,
    callable $referenced
): int {
    if (!is_dir($directory) || is_link($directory)) return 0;

    $removed = 0;
    $cutoff = time() - $minimumAge;

    foreach (new DirectoryIterator($directory) as $entry) {
        if (!$entry->isFile() || $entry->isLink()) continue;

        $name = $entry->getFilename();

        if (
            $entry->getMTime() >= $cutoff ||
            $referenced($name)
        ) {
            continue;
        }

        try {
            if (unlink($entry->getPathname())) $removed++;
        } catch (Throwable) {
            // A próxima execução volta a tentar; nunca segue symlinks.
        }
    }

    return $removed;
};

$profileReference = static function (string $name) use ($database): bool {
    if (str_contains($name, '.processing-')) return false;

    return (bool) $database->runSQL(
        'SELECT 1
         FROM fotos_perfil
         WHERE nome_arquivo = :nome
         AND status = :status
         LIMIT 1',
        [
            'nome' => $name,
            'status' => 'completo'
        ]
    )->fetchColumn();
};
$profileTempReference = static function (string $name) use ($database): bool {
    return (bool) $database->runSQL(
        'SELECT 1
         FROM fotos_perfil
         WHERE nome_arquivo = :nome
         AND status = :status
         LIMIT 1',
        [
            'nome' => $name,
            'status' => 'pendente'
        ]
    )->fetchColumn();
};
$messageReference = static function (string $name) use ($database): bool {
    return (bool) $database->runSQL(
        'SELECT 1
         FROM mensagens_chat
         WHERE ficheiro_nome = :nome
         LIMIT 1',
        ['nome' => $name]
    )->fetchColumn();
};
$reportEvidenceReference = static function (string $name) use ($database): bool {
    return (bool) $database->runSQL(
        'SELECT 1
         FROM denuncias
         WHERE evidencia_media_nome = :nome
         LIMIT 1',
        ['nome' => $name]
    )->fetchColumn();
};

$results['temporarios_orfaos_eliminados'] = $removeOrphans(
    PROFILE_PHOTO_TEMP_DIR,
    24 * 3600,
    $profileTempReference
);
$results['perfis_thumb_orfaos_eliminados'] = $removeOrphans(
    PROFILE_PHOTO_THUMB_DIR,
    24 * 3600,
    $profileReference
);
$results['perfis_originais_orfaos_eliminados'] = $removeOrphans(
    PROFILE_PHOTO_ORIGINAL_DIR,
    24 * 3600,
    $profileReference
);
$results['mensagens_media_orfa_eliminada'] = $removeOrphans(
    MESSAGE_MEDIA_DIR,
    24 * 3600,
    $messageReference
);
$results['evidencia_media_orfa_eliminada'] = $removeOrphans(
    REPORT_EVIDENCE_DIR,
    24 * 3600,
    $reportEvidenceReference
);

foreach ($results as $label => $count) {
    fwrite(STDOUT, $label . ': ' . (int) $count . PHP_EOL);
}

$database->runSQL(
    'SELECT RELEASE_LOCK(:lock_name)',
    ['lock_name' => $cleanupLockName]
);
