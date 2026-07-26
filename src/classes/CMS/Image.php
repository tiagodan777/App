<?php

namespace App\CMS;

use InvalidArgumentException;
use RuntimeException;
use Throwable;

class Image
{
    private $db;

    public function __construct($db)
    {
        $this->db = $db;
    }

    public function prepareAllImages(string $membroId, array $imagens): void
    {
        foreach ($imagens as $ordem => $imagem) {
            $sql = "
                INSERT INTO fotos_perfil (nome_arquivo, membro_id, ordem, status)
                VALUES (:nome_arquivo, :membro_id, :ordem, :status)
            ";

            $this->db->runSQL($sql, [
                'nome_arquivo' => $imagem,
                'membro_id' => $membroId,
                'ordem' => $ordem,
                'status' => 'pendente'
            ]);
        }
    }

    public function getUploadTemp(string $membroId): array
    {
        $sql = "
            SELECT id, nome_arquivo, membro_id, ordem, status
            FROM fotos_perfil
            WHERE membro_id = :membro_id
            AND (status = 'pendente' OR status IS NULL)
            ORDER BY ordem IS NULL, ordem ASC
        ";

        return $this->db->runSQL($sql, [
            'membro_id' => $membroId
        ])->fetchAll();
    }

    public function updateUploadTemp(string $nomeArquivo): void
    {
        $sql = "UPDATE fotos_perfil SET status = 'completo' WHERE nome_arquivo = :nome_arquivo";

        $this->db->runSQL($sql, [
            'nome_arquivo' => $nomeArquivo
        ]);
    }

    public function deleteUploadTemp(string $id): void
    {
        $sql = "SELECT nome_arquivo FROM fotos_perfil WHERE id = :id";
        $nomeArquivo = $this->db->runSQL($sql, ['id' => $id])->fetchColumn();

        if (!$nomeArquivo) return;

        $temporario = APP_ROOT . '/public/imagens/fotos-perfil-temp/' . $nomeArquivo;
        $final = APP_ROOT . '/public/imagens/fotos-perfil/' . $nomeArquivo;
        $original = APP_ROOT . '/public/imagens/fotos-perfil-originais/' . $nomeArquivo;

        if (is_file($temporario)) unlink($temporario);
        if (is_file($final)) unlink($final);
        if (is_file($original)) unlink($original);

        $sql = "DELETE FROM fotos_perfil WHERE id = :id";
        $this->db->runSQL($sql, ['id' => $id]);
    }

    public function createImage(string $membroId, string $nomeArquivo, string $temp, string $type): void
    {
        $converted = $temp;
        $ficheirosCriados = [];

        try {
            if (!is_file($temp)) {
                throw new RuntimeException('A imagem temporária não foi encontrada.');
            }

            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = finfo_file($finfo, $temp);
            finfo_close($finfo);

            if (in_array($mime, ['image/heic', 'image/heif'], true)) {
                $converted = sys_get_temp_dir() . '/' . uniqid('perfil_', true) . '.jpg';
                $returnVar = -1;
                $output = [];
                $bin = trim((string) shell_exec('command -v magick 2>/dev/null'));

                if (!$bin) {
                    $bin = trim((string) shell_exec('command -v convert 2>/dev/null'));
                }

                if ($bin) {
                    $cmd = escapeshellcmd($bin) . ' ' . escapeshellarg($temp . '[0]') . ' -auto-orient ' . escapeshellarg($converted) . ' 2>&1';
                    exec($cmd, $output, $returnVar);
                }

                if ($returnVar !== 0 || !is_file($converted)) {
                    $output = [];
                    $cmd = '/usr/bin/heif-convert -q 100 ' . escapeshellarg($temp) . ' ' . escapeshellarg($converted) . ' 2>&1';
                    exec($cmd, $output, $returnVar);
                }

                if ($returnVar !== 0 || !is_file($converted)) {
                    $output = [];
                    $cmd = 'ffmpeg -y -i ' . escapeshellarg($temp) . ' -vframes 1 -q:v 2 ' . escapeshellarg($converted) . ' 2>&1';
                    exec($cmd, $output, $returnVar);
                }

                if ($returnVar !== 0 || !is_file($converted)) {
                    throw new RuntimeException('Falha ao converter a imagem HEIC ou HEIF.');
                }
            }

            $basename = pathinfo($nomeArquivo, PATHINFO_FILENAME) . '.webp';

            switch ($type) {
                case 'perfil':
                    $destino = APP_ROOT . '/public/imagens/fotos-perfil/' . $basename;
                    $destinoOriginal = APP_ROOT . '/public/imagens/fotos-perfil-originais/' . $basename;

                    $this->garantirPasta(dirname($destino));
                    $this->garantirPasta(dirname($destinoOriginal));

                    $ficheirosCriados[] = $destino;
                    $ficheirosCriados[] = $destinoOriginal;

                    $this->processProfileImage($converted, 1200, $destino);
                    $this->processOriginalProfileImage($converted, 2400, $destinoOriginal);
                    break;

                case 'receita':
                    $destino = APP_ROOT . '/public/imagens/comida/' . $basename;
                    $this->garantirPasta(dirname($destino));
                    $ficheirosCriados[] = $destino;
                    $this->processImage($converted, 1440, $destino);
                    break;

                case 'publicacao':
                    $destino = APP_ROOT . '/public/posts/' . $basename;
                    $this->garantirPasta(dirname($destino));
                    $ficheirosCriados[] = $destino;
                    $this->processImage($converted, 1440, $destino);
                    break;

                default:
                    throw new InvalidArgumentException('Tipo de imagem inválido.');
            }

            $sql = "
                UPDATE fotos_perfil
                SET nome_arquivo = :nome_arquivo, status = 'completo'
                WHERE membro_id = :membro_id
                AND nome_arquivo = :nome_antigo
            ";

            $this->db->runSQL($sql, [
                'nome_arquivo' => $basename,
                'membro_id' => $membroId,
                'nome_antigo' => $nomeArquivo
            ]);

            if ($converted !== $temp && is_file($converted)) unlink($converted);
            if (is_file($temp)) unlink($temp);
        } catch (Throwable $erro) {
            foreach ($ficheirosCriados as $ficheiro) {
                if (is_file($ficheiro)) unlink($ficheiro);
            }

            if ($converted !== $temp && is_file($converted)) unlink($converted);
            if (is_file($temp)) unlink($temp);

            $sql = "
                UPDATE fotos_perfil
                SET status = 'erro'
                WHERE membro_id = :membro_id
                AND nome_arquivo = :nome_arquivo
            ";

            $this->db->runSQL($sql, [
                'membro_id' => $membroId,
                'nome_arquivo' => $nomeArquivo
            ]);

            throw $erro;
        }
    }

    private function garantirPasta(string $pasta): void
    {
        if (is_dir($pasta)) return;

        if (!mkdir($pasta, 0775, true) && !is_dir($pasta)) {
            throw new RuntimeException('Não foi possível criar a pasta das imagens.');
        }
    }

    private function processProfileImage(string $sourcePath, int $size, string $destination): void
    {
        $inicio = microtime(true);
        $imagick = new \Imagick($sourcePath);

        if ($imagick->getNumberImages() > 1) {
            $imagick->setIteratorIndex(0);
        }

        $imagick->autoOrient();
        $imagick->transformImageColorspace(\Imagick::COLORSPACE_SRGB);
        $imagick->cropThumbnailImage($size, $size);
        $imagick->unsharpMaskImage(0, 0.65, 1.0, 0.03);
        $imagick->setImageFormat('webp');
        $imagick->setImageCompressionQuality(84);
        $imagick->setOption('webp:method', '6');
        $imagick->stripImage();

        if (!$imagick->writeImage($destination)) {
            throw new RuntimeException('Não foi possível escrever a imagem WebP.');
        }

        $imagick->clear();
        $imagick->destroy();

        error_log(
            'Foto de perfil ' .
            basename($destination) .
            ' processada em ' .
            round(microtime(true) - $inicio, 3) .
            ' segundos.'
        );
    }

    private function processOriginalProfileImage(string $sourcePath, int $maxSize, string $destination): void
    {
        $inicio = microtime(true);
        $imagick = new \Imagick($sourcePath);

        if ($imagick->getNumberImages() > 1) {
            $imagick->setIteratorIndex(0);
        }

        $imagick->autoOrient();
        $imagick->transformImageColorspace(\Imagick::COLORSPACE_SRGB);

        $largura = $imagick->getImageWidth();
        $altura = $imagick->getImageHeight();

        if ($largura > $maxSize || $altura > $maxSize) {
            $imagick->thumbnailImage($maxSize, $maxSize, true);
            $imagick->unsharpMaskImage(0, 0.55, 0.9, 0.02);
        }

        $imagick->setImageFormat('webp');
        $imagick->setImageCompressionQuality(90);
        $imagick->setOption('webp:method', '6');
        $imagick->stripImage();

        if (!$imagick->writeImage($destination)) {
            throw new RuntimeException('Não foi possível escrever a fotografia proporcional.');
        }

        $imagick->clear();
        $imagick->destroy();

        error_log(
            'Foto de perfil proporcional ' .
            basename($destination) .
            ' processada em ' .
            round(microtime(true) - $inicio, 3) .
            ' segundos.'
        );
    }

    private function processImage(string $sourcePath, int $maxSize, string $destination): void
    {
        $imagick = new \Imagick($sourcePath);

        if ($imagick->getNumberImages() > 1) {
            $imagick->setIteratorIndex(0);
        }

        $imagick->autoOrient();
        $imagick->transformImageColorspace(\Imagick::COLORSPACE_SRGB);

        $largura = $imagick->getImageWidth();
        $altura = $imagick->getImageHeight();

        if ($largura > $maxSize || $altura > $maxSize) {
            $imagick->thumbnailImage($maxSize, $maxSize, true, true);
        }

        $imagick->unsharpMaskImage(0, 0.7, 1.1, 0.03);
        $imagick->modulateImage(100, 105, 100);
        $imagick->setImageFormat('webp');
        $imagick->setImageCompressionQuality(82);
        $imagick->setOption('webp:method', '6');
        $imagick->stripImage();

        if (!$imagick->writeImage($destination)) {
            throw new RuntimeException('Não foi possível escrever a imagem.');
        }

        $imagick->clear();
        $imagick->destroy();
    }
}