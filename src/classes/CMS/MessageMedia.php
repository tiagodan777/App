<?php
declare(strict_types=1);

namespace App\CMS;

use Imagick;
use RuntimeException;
use Throwable;
use finfo;

final class MessageMedia {
    public const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
    public const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

    public function convertIphoneImage(string $origem, string $destino): void {
        if (!class_exists(Imagick::class)) {
            throw new RuntimeException('O servidor não consegue converter fotografias HEIC/HEIF.');
        }
        $imagem = null;
        try {
            $imagem = new Imagick($origem);
            if ($imagem->getNumberImages() > 1) {
                $imagem->setIteratorIndex(0);
            }
            $imagem->autoOrient();
            $imagem->transformImageColorspace(Imagick::COLORSPACE_SRGB);
            if ($imagem->getImageWidth() > 2400 || $imagem->getImageHeight() > 2400) {
                $imagem->thumbnailImage(2400, 2400, true, true);
            }
            $imagem->setImageFormat('webp');
            $imagem->setImageCompressionQuality(86);
            $imagem->stripImage();
            if (!$imagem->writeImage($destino)) {
                throw new RuntimeException('Não foi possível converter a fotografia.');
            }
        } catch (Throwable $erro) {
            if (is_file($destino)) {
                @unlink($destino);
            }
            throw new RuntimeException('Não foi possível converter a fotografia HEIC/HEIF.', 0, $erro);
        } finally {
            if ($imagem instanceof Imagick) {
                $imagem->clear();
                $imagem->destroy();
            }
        }
    }

    public function receive(array $ficheiro): array {
        $erro = (int) ($ficheiro['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($erro === UPLOAD_ERR_NO_FILE) {
            return [];
        }
        if ($erro !== UPLOAD_ERR_OK) {
            throw new RuntimeException('O ficheiro não foi enviado completamente.');
        }
        $temporario = (string) ($ficheiro['tmp_name'] ?? '');
        $tamanho = (int) ($ficheiro['size'] ?? 0);
        if ($temporario === '' || !is_uploaded_file($temporario)) {
            throw new RuntimeException('O ficheiro recebido não é válido.');
        }
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($temporario);
        $tipos = [
            'image/jpeg' => ['imagem', 'jpg'],
            'image/png' => ['imagem', 'png'],
            'image/webp' => ['imagem', 'webp'],
            'image/gif' => ['imagem', 'gif'],
            'image/avif' => ['imagem', 'avif'],
            'image/heic' => ['imagem', 'heic'],
            'image/heif' => ['imagem', 'heif'],
            'video/mp4' => ['video', 'mp4'],
            'video/webm' => ['video', 'webm'],
            'video/quicktime' => ['video', 'mov'],
            'video/x-m4v' => ['video', 'm4v']
        ];
        if (!is_string($mime) || !isset($tipos[$mime])) {
            throw new RuntimeException('Só podes enviar fotografias ou vídeos.');
        }
        [$tipo, $extensao] = $tipos[$mime];
        $limite = $tipo === 'imagem' ? self::IMAGE_MAX_BYTES : self::VIDEO_MAX_BYTES;
        if ($tamanho <= 0 || $tamanho > $limite) {
            throw new RuntimeException(
                $tipo === 'imagem' ? 'A fotografia pode ter no máximo 15 MB.' : 'O vídeo pode ter no máximo 100 MB.'
            );
        }
        $pasta = APP_ROOT . '/public/media/mensagens/';
        if (!is_dir($pasta) && !mkdir($pasta, 0775, true) && !is_dir($pasta)) {
            throw new RuntimeException('Não foi possível preparar a pasta das mensagens.');
        }
        $imagemIphone = $mime === 'image/heic' || $mime === 'image/heif';
        if ($imagemIphone) {
            $extensao = 'webp';
            $mime = 'image/webp';
        }
        $nome = bin2hex(random_bytes(20)) . '.' . $extensao;
        $destino = $pasta . $nome;
        if ($imagemIphone) {
            $this->convertIphoneImage($temporario, $destino);
            $tamanho = (int) filesize($destino);
        } elseif (!move_uploaded_file($temporario, $destino)) {
            throw new RuntimeException('Não foi possível guardar o ficheiro.');
        }
        @chmod($destino, 0664);
        return ['tipo' => $tipo, 'nome' => $nome, 'mime' => $mime, 'tamanho' => $tamanho, 'caminho' => $destino];
    }
}
