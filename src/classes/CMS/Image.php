<?php

namespace App\CMS;

use App\Security\MemberMutex;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

class Image
{
    private const PROFILE_MAX_PIXELS = 40_000_000;
    private const PROFILE_MAX_WIDTH = 12_000;
    private const PROFILE_MAX_HEIGHT = 12_000;

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
            AND status = 'pendente'
            ORDER BY ordem IS NULL, ordem ASC
        ";

        return $this->db->runSQL($sql, [
            'membro_id' => $membroId
        ])->fetchAll();
    }

    public function updateUploadTemp(string $nomeArquivo): void
    {
        $sql = "UPDATE fotos_perfil SET status = 'completo' WHERE nome_arquivo = :nome_arquivo AND status = 'pendente'";

        $this->db->runSQL($sql, [
            'nome_arquivo' => $nomeArquivo
        ]);
    }

    public function deleteUploadTemp(string $id): void
    {
        $foto = $this->db->runSQL(
            'SELECT nome_arquivo, membro_id
             FROM fotos_perfil
             WHERE id = :id
             LIMIT 1',
            ['id' => $id]
        )->fetch();

        if (!$foto) return;

        $membroId = trim((string) $foto['membro_id']);
        $mutex = new MemberMutex($this->db);

        if (!$mutex->acquire($membroId, 10)) {
            throw new RuntimeException('A fotografia está a ser processada.');
        }

        try {
            $this->db->beginTransaction();
            $lockedPhoto = $this->db->runSQL(
                'SELECT nome_arquivo
                 FROM fotos_perfil
                 WHERE id = :id
                 AND membro_id = :membro_id
                 LIMIT 1
                 FOR UPDATE',
                [
                    'id' => $id,
                    'membro_id' => $membroId
                ]
            )->fetch();

            if (!$lockedPhoto) {
                $this->db->rollBack();

                return;
            }

            $nomeArquivo = basename(trim((string) $lockedPhoto['nome_arquivo']));

            foreach (array_unique([
                $nomeArquivo,
                pathinfo($nomeArquivo, PATHINFO_FILENAME) . '.webp'
            ]) as $nomeEnfileirado) {
                if ($nomeEnfileirado === '' || $nomeEnfileirado === 'default.webp') continue;

                $this->db->runSQL(
                    'INSERT INTO ficheiros_a_apagar (tipo, nome_arquivo)
                     VALUES (:tipo, :nome)
                     ON DUPLICATE KEY UPDATE nome_arquivo = VALUES(nome_arquivo)',
                    [
                        'tipo' => 'perfil',
                        'nome' => $nomeEnfileirado
                    ]
                );
            }

            $this->db->runSQL(
                'DELETE FROM fotos_perfil WHERE id = :id AND membro_id = :membro_id',
                [
                    'id' => $id,
                    'membro_id' => $membroId
                ]
            );
            $this->db->commit();
        } catch (Throwable $erro) {
            if ($this->db->inTransaction()) $this->db->rollBack();

            throw $erro;
        } finally {
            $mutex->release($membroId);
        }
    }

    public function createImage(
        string $fotoId,
        string $membroId,
        string $nomeArquivo,
        string $temp,
        string $type
    ): void
    {
        if ($this->db->inTransaction()) {
            throw new RuntimeException(
                'O processamento de fotografias exige uma transação própria.'
            );
        }

        $ficheirosTemporarios = [];
        $ficheirosPromovidos = [];
        $gerirTransacao = false;
        $publicacaoConfirmada = false;

        try {
            if (!is_file($temp)) {
                throw new RuntimeException('A imagem temporária não foi encontrada.');
            }

            if ($type === 'perfil') {
                $this->validateProfileImageFile($temp);
            }

            $basename = pathinfo($nomeArquivo, PATHINFO_FILENAME) . '.webp';

            switch ($type) {
                case 'perfil':
                    $destino = rtrim(PROFILE_PHOTO_THUMB_DIR, '/') . '/' . $basename;
                    $destinoOriginal = rtrim(PROFILE_PHOTO_ORIGINAL_DIR, '/') . '/' . $basename;

                    $this->garantirPasta(dirname($destino));
                    $this->garantirPasta(dirname($destinoOriginal));

                    $sufixoTemporario = '.processing-' . bin2hex(random_bytes(8)) . '.webp';
                    $destinoTemporario = $destino . $sufixoTemporario;
                    $destinoOriginalTemporario = $destinoOriginal . $sufixoTemporario;
                    $ficheirosTemporarios[] = $destinoTemporario;
                    $ficheirosTemporarios[] = $destinoOriginalTemporario;

                    $this->processProfileImage($temp, 1200, $destinoTemporario);
                    $this->processOriginalProfileImage(
                        $temp,
                        2400,
                        $destinoOriginalTemporario
                    );
                    @chmod($destinoTemporario, 0640);
                    @chmod($destinoOriginalTemporario, 0640);
                    break;

                case 'receita':
                    $destino = APP_ROOT . '/public/imagens/comida/' . $basename;
                    $this->garantirPasta(dirname($destino));
                    $destinoTemporario = $destino . '.processing-' . bin2hex(random_bytes(8));
                    $ficheirosTemporarios[] = $destinoTemporario;
                    $this->processImage($temp, 1440, $destinoTemporario);
                    break;

                case 'publicacao':
                    $destino = APP_ROOT . '/public/posts/' . $basename;
                    $this->garantirPasta(dirname($destino));
                    $destinoTemporario = $destino . '.processing-' . bin2hex(random_bytes(8));
                    $ficheirosTemporarios[] = $destinoTemporario;
                    $this->processImage($temp, 1440, $destinoTemporario);
                    break;

                default:
                    throw new InvalidArgumentException('Tipo de imagem inválido.');
            }

            $gerirTransacao = !$this->db->inTransaction();

            if ($gerirTransacao) $this->db->beginTransaction();

            $foto = $this->db->runSQL(
                'SELECT nome_arquivo, status
                 FROM fotos_perfil
                 WHERE id = :foto_id
                 AND membro_id = :membro_id
                 LIMIT 1
                 FOR UPDATE',
                [
                    'foto_id' => $fotoId,
                    'membro_id' => $membroId
                ]
            )->fetch();

            if (
                !$foto ||
                (string) ($foto['status'] ?? '') !== 'pendente' ||
                !hash_equals((string) $foto['nome_arquivo'], $nomeArquivo)
            ) {
                throw new RuntimeException('A fotografia deixou de estar disponível para processamento.');
            }

            $promocoes = $type === 'perfil'
                ? [
                    [$destinoTemporario, $destino],
                    [$destinoOriginalTemporario, $destinoOriginal]
                ]
                : [[$destinoTemporario, $destino]];

            foreach ($promocoes as [$origemPromocao, $destinoPromocao]) {
                if (!is_file($origemPromocao) || !rename($origemPromocao, $destinoPromocao)) {
                    throw new RuntimeException('Não foi possível publicar a fotografia processada.');
                }

                $ficheirosPromovidos[] = $destinoPromocao;
            }

            $statement = $this->db->runSQL(
                "
                UPDATE fotos_perfil
                SET nome_arquivo = :nome_arquivo, status = 'completo'
                WHERE id = :foto_id
                AND membro_id = :membro_id
                AND nome_arquivo = :nome_antigo
                AND status = 'pendente'
                ",
                [
                    'nome_arquivo' => $basename,
                    'foto_id' => $fotoId,
                    'membro_id' => $membroId,
                    'nome_antigo' => $nomeArquivo
                ]
            );

            if ($statement->rowCount() !== 1) {
                throw new RuntimeException('A fotografia não foi confirmada na base de dados.');
            }

            if ($gerirTransacao) {
                $this->db->commit();
                $gerirTransacao = false;
            }
            $publicacaoConfirmada = true;
        } catch (Throwable $erro) {
            if ($gerirTransacao && $this->db->inTransaction()) {
                $this->db->rollBack();
            }

            if (!$publicacaoConfirmada) {
                foreach (
                    array_merge($ficheirosTemporarios, $ficheirosPromovidos)
                    as $ficheiro
                ) {
                    if (is_file($ficheiro)) @unlink($ficheiro);
                }
            }

            if (is_file($temp)) @unlink($temp);

            $sql = "
                UPDATE fotos_perfil
                SET status = 'erro'
                WHERE id = :foto_id
                AND membro_id = :membro_id
                AND nome_arquivo = :nome_arquivo
                AND status = 'pendente'
            ";

            $this->db->runSQL($sql, [
                'foto_id' => $fotoId,
                'membro_id' => $membroId,
                'nome_arquivo' => $nomeArquivo
            ]);

            throw $erro;
        }

        /*
         * A base de dados e os dois ficheiros finais já estão confirmados. A
         * limpeza da fonte é apenas best-effort: uma falha aqui nunca pode
         * apagar a fotografia publicada nem voltar a resposta para erro.
         */
        try {
            if (is_file($temp)) {
                @unlink($temp);
            }
        } catch (Throwable) {
            error_log('[profile-image] A fonte temporária será removida pelo cron.');
        }
    }

    public function validateProfileImageFile(string $path): void
    {
        if (!is_file($path) || is_link($path)) {
            throw new RuntimeException('A fotografia recebida não é válida.');
        }

        if (!class_exists(\Imagick::class)) {
            throw new RuntimeException('O servidor não consegue validar fotografias em segurança.');
        }

        $this->configureImageMagickLimits();
        $probe = new \Imagick();

        try {
            if (!$probe->pingImage($path)) {
                throw new RuntimeException('Não foi possível validar a fotografia.');
            }

            if ($probe->getNumberImages() !== 1) {
                throw new RuntimeException('Fotografias animadas ou com várias páginas não são permitidas.');
            }

            $width = $probe->getImageWidth();
            $height = $probe->getImageHeight();

            if (
                $width < 1 ||
                $height < 1 ||
                $width > self::PROFILE_MAX_WIDTH ||
                $height > self::PROFILE_MAX_HEIGHT ||
                ($width * $height) > self::PROFILE_MAX_PIXELS
            ) {
                throw new RuntimeException('A fotografia tem dimensões demasiado grandes.');
            }
        } catch (RuntimeException $error) {
            throw $error;
        } catch (Throwable $error) {
            throw new RuntimeException('Não foi possível validar a fotografia em segurança.', 0, $error);
        } finally {
            $probe->clear();
            $probe->destroy();
        }
    }

    private function configureImageMagickLimits(): void
    {
        $limits = [
            'RESOURCETYPE_MEMORY' => 256 * 1024 * 1024,
            'RESOURCETYPE_MAP' => 512 * 1024 * 1024,
            'RESOURCETYPE_DISK' => 1024 * 1024 * 1024,
            'RESOURCETYPE_AREA' => 128 * 1024 * 1024,
            'RESOURCETYPE_THREAD' => 1,
            'RESOURCETYPE_TIME' => 30
        ];

        foreach ($limits as $constantName => $limit) {
            $constant = \Imagick::class . '::' . $constantName;

            if (defined($constant)) {
                $configured = \Imagick::setResourceLimit(
                    (int) constant($constant),
                    $limit
                );

                if (!$configured) {
                    throw new RuntimeException(
                        'O servidor não conseguiu aplicar os limites de processamento de imagem.'
                    );
                }
            }
        }
    }

    private function garantirPasta(string $pasta): void
    {
        if (is_dir($pasta)) return;

        if (!mkdir($pasta, 0750, true) && !is_dir($pasta)) {
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

        $duration = round(microtime(true) - $inicio, 3);
        error_log(DEV
            ? 'Foto de perfil ' . basename($destination) . ' processada em ' . $duration . ' segundos.'
            : 'Foto de perfil processada em ' . $duration . ' segundos.'
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

        $duration = round(microtime(true) - $inicio, 3);
        error_log(DEV
            ? 'Foto de perfil proporcional ' . basename($destination) . ' processada em ' . $duration . ' segundos.'
            : 'Foto de perfil proporcional processada em ' . $duration . ' segundos.'
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
