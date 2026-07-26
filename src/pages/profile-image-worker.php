<?php

declare(strict_types=1);

use App\CMS\Database;
use App\CMS\Image;
use App\Security\MemberMutex;

if (PHP_SAPI !== 'cli') {
    http_response_code(403);

    exit('Acesso negado.');
}

define('APP_ROOT', dirname(__DIR__, 2));

require APP_ROOT . '/config/config.php';
require APP_ROOT . '/vendor/autoload.php';

$database = new Database($dsn, $username, $password);
$imageService = new Image($database);
$memberMutex = new MemberMutex($database);
unset($dsn, $username, $password);

$membroId = trim(
    (string) (
        $argv[1] ?? ''
    )
);

$uuidValido = preg_match(
    '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
    $membroId
);

if (!$uuidValido) {
    fwrite(
        STDERR,
        "ID de membro inválido.\n"
    );

    exit(1);
}

try {
    if (!$memberMutex->acquire($membroId, 0)) {
        exit(0);
    }

    $imagens = $imageService->getUploadTemp($membroId);

    foreach ($imagens as $imagem) {
        $nomeArquivo =
            $imagem['nome_arquivo']
            ?? '';

        if ($nomeArquivo === '') {
            continue;
        }

        $temp =
            rtrim(PROFILE_PHOTO_TEMP_DIR, '/') .
            '/' .
            basename((string) $nomeArquivo);

        if (!is_file($temp)) {
            $database->runSQL(
                "UPDATE fotos_perfil
                 SET status = 'erro'
                 WHERE id = :foto_id
                 AND membro_id = :membro_id
                 AND nome_arquivo = :nome_arquivo
                 AND status = 'pendente'",
                [
                    'foto_id' => (string) ($imagem['id'] ?? ''),
                    'membro_id' => $membroId,
                    'nome_arquivo' => (string) $nomeArquivo
                ]
            );

            error_log(DEV
                ? '[profile-image-worker] Imagem temporária não encontrada: ' . $temp
                : '[profile-image-worker] Uma imagem temporária não foi encontrada.'
            );

            continue;
        }

        try {
            $imageService->createImage(
                (string) ($imagem['id'] ?? ''),
                $membroId,
                (string) $nomeArquivo,
                $temp,
                'perfil'
            );

        } catch (Throwable $erro) {
            error_log(DEV
                ? '[profile-image-worker] ' . $erro->getMessage()
                : '[profile-image-worker] Não foi possível processar uma fotografia.'
            );
        }
    }

    $memberMutex->release($membroId);

    exit(0);

} catch (Throwable $erro) {
    $memberMutex->release($membroId);

    error_log(DEV
        ? '[profile-image-worker] ' . $erro->getMessage()
        : '[profile-image-worker] O processamento terminou com erro.'
    );

    fwrite(
        STDERR,
        "Não foi possível processar as fotografias.\n"
    );

    exit(1);
}
