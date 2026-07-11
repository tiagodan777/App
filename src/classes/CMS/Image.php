<?php

namespace App\CMS;

class Image
{
    private $db;

    public function __construct($db)
    {
        $this->db = $db;
    }

    public function prepareAllImages(
        int $membroId,
        array $imagens
    ): void {
        foreach ($imagens as $ordem => $imagem) {
            $sql = "
                INSERT INTO fotos_perfil (
                    nome_arquivo,
                    membro_id,
                    ordem,
                    status
                )
                VALUES (
                    :nome_arquivo,
                    :membro_id,
                    :ordem,
                    :status
                )
            ";

            $this->db->runSQL($sql, [
                'nome_arquivo' => $imagem,
                'membro_id' => $membroId,
                'ordem' => $ordem,
                'status' => 'pendente'
            ]);
        }
    }

    public function getUploadTemp(int $membroId): array
    {
        $sql = "
            SELECT *
            FROM fotos_perfil
            WHERE status = 'pendente'
            AND membro_id = :membro_id
            ORDER BY ordem ASC
        ";

        return $this->db
            ->runSQL($sql, [
                'membro_id' => $membroId
            ])
            ->fetchAll();
    }

    public function updateUploadTemp(
        string $nomeArquivo
    ): void {
        $sql = "
            UPDATE fotos_perfil
            SET status = 'completo'
            WHERE nome_arquivo = :nome_arquivo
        ";

        $this->db->runSQL($sql, [
            'nome_arquivo' => $nomeArquivo
        ]);
    }

    public function deleteUploadTemp(int $id): void
    {
        $sql = "
            SELECT nome_arquivo
            FROM fotos_perfil
            WHERE id = :id
        ";

        $file = $this->db
            ->runSQL($sql, ['id' => $id])
            ->fetchColumn();

        if (!$file) {
            return;
        }

        $path =
            APP_ROOT .
            '/public/imagens/fotos-perfil-temp/' .
            $file;

        if (is_file($path)) {
            unlink($path);
        }

        $sql = "
            DELETE FROM fotos_perfil
            WHERE id = :id
        ";

        $this->db->runSQL($sql, ['id' => $id]);
    }

    public function createImage(
        int $id,
        string $nomeArquivo,
        string $temp,
        string $type
    ): void {
        $converted = $temp;
        $ficheirosCriados = [];

        try {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = finfo_file($finfo, $temp);
            finfo_close($finfo);

            if (in_array(
                $mime,
                ['image/heic', 'image/heif'],
                true
            )) {
                $converted =
                    sys_get_temp_dir() .
                    '/' .
                    uniqid('perfil_', true) .
                    '.jpg';

                $returnVar = -1;
                $output = [];

                $bin = trim(
                    shell_exec(
                        'command -v magick 2>/dev/null'
                    )
                );

                if (!$bin) {
                    $bin = trim(
                        shell_exec(
                            'command -v convert 2>/dev/null'
                        )
                    );
                }

                if ($bin) {
                    $cmd =
                        escapeshellcmd($bin) .
                        ' ' .
                        escapeshellarg($temp . '[0]') .
                        ' -auto-orient ' .
                        escapeshellarg($converted) .
                        ' 2>&1';

                    exec($cmd, $output, $returnVar);
                }

                if (
                    $returnVar !== 0 ||
                    !is_file($converted)
                ) {
                    $cmd =
                        '/usr/bin/heif-convert -q 100 ' .
                        escapeshellarg($temp) .
                        ' ' .
                        escapeshellarg($converted) .
                        ' 2>&1';

                    exec($cmd, $output, $returnVar);
                }

                if (
                    $returnVar !== 0 ||
                    !is_file($converted)
                ) {
                    $cmd =
                        'ffmpeg -y -i ' .
                        escapeshellarg($temp) .
                        ' -vframes 1 -q:v 2 ' .
                        escapeshellarg($converted) .
                        ' 2>&1';

                    exec($cmd, $output, $returnVar);
                }

                if (
                    $returnVar !== 0 ||
                    !is_file($converted)
                ) {
                    throw new \RuntimeException(
                        'Falha ao converter imagem HEIC ou HEIF.'
                    );
                }
            }

            if (!is_file($converted)) {
                throw new \RuntimeException(
                    'O ficheiro da imagem não foi encontrado.'
                );
            }

            $basename =
                pathinfo(
                    $nomeArquivo,
                    PATHINFO_FILENAME
                ) .
                '.webp';

            switch ($type) {
                case 'perfil':
                    $destino =
                        APP_ROOT .
                        '/public/imagens/fotos-perfil/' .
                        $basename;

                    $this->processProfileImage(
                        $converted,
                        1200,
                        $destino
                    );

                    $ficheirosCriados[] = $destino;
                    break;

                case 'receita':
                    $destino =
                        APP_ROOT .
                        '/public/imagens/comida/' .
                        $basename;

                    $this->processImage(
                        $converted,
                        1440,
                        $destino
                    );

                    $ficheirosCriados[] = $destino;
                    break;

                case 'publicacao':
                    $destino =
                        APP_ROOT .
                        '/public/posts/' .
                        $basename;

                    $this->processImage(
                        $converted,
                        1440,
                        $destino
                    );

                    $ficheirosCriados[] = $destino;
                    break;

                default:
                    throw new \InvalidArgumentException(
                        'Tipo de imagem inválido.'
                    );
            }

            if (
                $converted !== $temp &&
                is_file($converted)
            ) {
                unlink($converted);
            }

            if (is_file($temp)) {
                unlink($temp);
            }

            $sql = "
                UPDATE fotos_perfil
                SET
                    nome_arquivo = :nome_arquivo,
                    status = 'completo'
                WHERE membro_id = :membro_id
                AND nome_arquivo = :old_file
            ";

            $this->db->runSQL($sql, [
                'nome_arquivo' => $basename,
                'membro_id' => $id,
                'old_file' => $nomeArquivo
            ]);

        } catch (\Throwable $erro) {
            foreach ($ficheirosCriados as $ficheiro) {
                if (is_file($ficheiro)) {
                    unlink($ficheiro);
                }
            }

            if (
                $converted !== $temp &&
                is_file($converted)
            ) {
                unlink($converted);
            }

            if (is_file($temp)) {
                unlink($temp);
            }

            throw $erro;
        }
    }

    private function processProfileImage(
        string $sourcePath,
        int $size,
        string $destination
    ): void {
        $imagick = new \Imagick($sourcePath);

        $imagick->autoOrient();
        $imagick->setIteratorIndex(0);
        $imagick->transformImageColorspace(
            \Imagick::COLORSPACE_SRGB
        );

        /*
         * A foto é cortada para quadrado.
         * Como o utilizador pode adicionar várias fotos,
         * todas ficam consistentes na interface.
         */
        $imagick->cropThumbnailImage($size, $size);

        $imagick->unsharpMaskImage(
            0,
            0.65,
            1.0,
            0.03
        );

        $imagick->setImageFormat('webp');
        $imagick->setImageCompressionQuality(84);
        $imagick->stripImage();
        $imagick->writeImage($destination);

        $imagick->clear();
        $imagick->destroy();
    }

    private function processImage(
        string $sourcePath,
        int $maxSize,
        string $destination
    ): void {
        $imagick = new \Imagick($sourcePath);

        $imagick->autoOrient();
        $imagick->setIteratorIndex(0);
        $imagick->transformImageColorspace(
            \Imagick::COLORSPACE_SRGB
        );

        $width = $imagick->getImageWidth();
        $height = $imagick->getImageHeight();

        if (
            $width > $maxSize ||
            $height > $maxSize
        ) {
            $imagick->thumbnailImage(
                $maxSize,
                $maxSize,
                true,
                true
            );
        }

        $imagick->unsharpMaskImage(
            0,
            0.7,
            1.1,
            0.03
        );

        $imagick->modulateImage(100, 105, 100);
        $imagick->setImageFormat('webp');
        $imagick->setImageCompressionQuality(82);
        $imagick->stripImage();
        $imagick->writeImage($destination);

        $imagick->clear();
        $imagick->destroy();
    }
}