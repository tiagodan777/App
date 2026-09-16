<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Acesso negado.');
}
require_once __DIR__ . '/src/bootstrap.php';
$membroId = trim((string) ($argv[1] ?? ''));
$uuidValido = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $membroId);
if (!$uuidValido) {
    fwrite(STDERR, "ID de membro inválido.\n");
    exit(1);
}
try {
    $imagens = $cms->getImage()->getUploadTemp($membroId);
    foreach ($imagens as $imagem) {
        $nomeArquivo = $imagem['nome_arquivo'] ?? '';
        if ($nomeArquivo === '') {
            continue;
        }
        $temp = APP_ROOT . '/public/imagens/fotos-perfil-temp/' . $nomeArquivo;
        if (!is_file($temp)) {
            error_log('Imagem temporária não encontrada: ' . $temp);
            continue;
        }
        try {
            $cms->getImage()->createImage($membroId, $nomeArquivo, $temp, 'perfil');
        } catch (Throwable $erro) {
            error_log(
                sprintf('Erro ao processar a foto %s do membro %s: %s', $nomeArquivo, $membroId, $erro->getMessage())
            );
        }
    }
    exit(0);
} catch (Throwable $erro) {
    error_log('Erro geral no worker de fotos de perfil: ' . $erro->getMessage());
    fwrite(STDERR, $erro->getMessage() . PHP_EOL);
    exit(1);
}
