<?php

declare(strict_types=1);

require dirname(__DIR__, 2) . '/src/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Acesso negado.');
}

$membroId = filter_var(
    $argv[1] ?? null,
    FILTER_VALIDATE_INT
);

if (!$membroId) {
    fwrite(STDERR, "ID de membro inválido.\n");
    exit(1);
}

$imagens = $cms
    ->getImage()
    ->getUploadTemp($membroId);

foreach ($imagens as $imagem) {
    $nomeArquivo = $imagem['nome_arquivo'];

    $temp =
        APP_ROOT .
        '/public/imagens/fotos-perfil-temp/' .
        $nomeArquivo;

    if (!is_file($temp)) {
        error_log(
            'Imagem temporária não encontrada: ' .
            $temp
        );

        continue;
    }

    try {
        $cms->getImage()->createImage(
            $membroId,
            $nomeArquivo,
            $temp,
            'perfil'
        );

    } catch (Throwable $erro) {
        error_log(
            sprintf(
                'Erro ao processar foto %s do membro %d: %s',
                $nomeArquivo,
                $membroId,
                $erro->getMessage()
            )
        );
    }
}