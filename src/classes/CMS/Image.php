<?php

declare(strict_types=1);

namespace App\CMS;

use InvalidArgumentException;
use RuntimeException;
use Throwable;

class Image
{
    private const MAX_PROFILE_PHOTOS = 6;
    private const MAX_WIDTH = 12000;
    private const MAX_HEIGHT = 12000;
    private const MAX_PIXELS = 64_000_000;
    private const PROFILE_TYPES = [
        'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif',
        'image/webp' => 'webp', 'image/heic' => 'heic', 'image/heif' => 'heif',
        'image/heic-sequence' => 'heic', 'image/heif-sequence' => 'heif'
    ];

    private $db;

    public function __construct($db)
    {
        $this->db = $db;
    }

    public function getUploadTemp(string $memberId): array
    {
        return $this->db->runSQL(
            "SELECT id, nome_arquivo, membro_id, ordem, status
             FROM fotos_perfil
             WHERE membro_id = :id AND (status = 'pendente' OR status IS NULL)
             ORDER BY ordem IS NULL, ordem",
            ['id' => $memberId]
        )->fetchAll();
    }

    public function receiveProfileUploads(array $files): array
    {
        if (!isset($files['tmp_name']) || !is_array($files['tmp_name'])) return [];
        if (count($files['tmp_name']) > self::MAX_PROFILE_PHOTOS) {
            throw new \LengthException('Podes adicionar no máximo 6 fotografias.');
        }

        $directory = APP_ROOT . '/public/imagens/fotos-perfil-temp/';
        $this->garantirPasta($directory);
        $maxSize = defined('MAX_SIZE') ? (int) MAX_SIZE : 25 * 1024 * 1024;
        $stored = [];

        try {
            foreach ($files['tmp_name'] as $index => $temporary) {
                $error = (int) ($files['error'][$index] ?? UPLOAD_ERR_NO_FILE);
                if ($error === UPLOAD_ERR_NO_FILE) continue;
                if ($error !== UPLOAD_ERR_OK || !is_string($temporary) || !is_uploaded_file($temporary)) {
                    throw new InvalidArgumentException('Não foi possível receber uma das fotografias.');
                }

                $size = (int) ($files['size'][$index] ?? 0);
                if ($size < 1 || $size > $maxSize) {
                    throw new InvalidArgumentException('Uma das fotografias é demasiado grande ou está vazia.');
                }

                $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($temporary);
                if (!is_string($mime) || !isset(self::PROFILE_TYPES[$mime])) {
                    throw new InvalidArgumentException('Usa fotografias JPEG, PNG, GIF, WebP ou HEIC.');
                }

                $name = basename(\create_filename('foto.' . self::PROFILE_TYPES[$mime]));
                if (!move_uploaded_file($temporary, $directory . $name)) {
                    throw new RuntimeException('Não foi possível guardar uma das fotografias.');
                }
                $stored[] = $name;
            }
        } catch (Throwable $error) {
            $this->discardProfileUploads($stored);
            throw $error;
        }

        return $stored;
    }

    public function syncProfilePhotos(
        string $memberId,
        array $newPhotos,
        $requestedOrder,
        $requestedRemovals
    ): array {
        $order = $this->normalizarLista($requestedOrder);
        $remove = array_fill_keys($this->normalizarLista($requestedRemovals), true);
        $managesTransaction = !$this->db->inTransaction();

        try {
            if ($managesTransaction) $this->db->beginTransaction();
            $rows = $this->db->runSQL(
                'SELECT id, nome_arquivo, status FROM fotos_perfil
                 WHERE membro_id = :id ORDER BY ordem IS NULL, ordem, id FOR UPDATE',
                ['id' => $memberId]
            )->fetchAll();

            $existing = [];
            foreach ($rows as $row) {
                $id = (string) $row['id'];
                $existing[$id] = $row;
                if (($row['status'] ?? '') === 'erro') $remove[$id] = true;
            }

            $items = [];
            $usedExisting = [];
            $usedNew = [];

            foreach ($order as $token) {
                if (str_starts_with($token, 'existente:')) {
                    $id = substr($token, 10);
                    if (isset($existing[$id]) && !isset($remove[$id]) && !isset($usedExisting[$id])) {
                        $items[] = ['existing', $id];
                        $usedExisting[$id] = true;
                    }
                } elseif (preg_match('/^nova:(\d+)$/', $token, $match)) {
                    $index = (int) $match[1];
                    if (isset($newPhotos[$index]) && !isset($usedNew[$index])) {
                        $items[] = ['new', $newPhotos[$index]];
                        $usedNew[$index] = true;
                    }
                }
            }

            foreach ($existing as $id => $_) {
                if (!isset($remove[$id]) && !isset($usedExisting[$id])) $items[] = ['existing', $id];
            }
            foreach ($newPhotos as $index => $name) {
                if (!isset($usedNew[$index])) $items[] = ['new', $name];
            }
            if (count($items) > self::MAX_PROFILE_PHOTOS) {
                throw new \LengthException('Podes manter no máximo 6 fotografias.');
            }

            $deletedFiles = [];
            foreach ($remove as $id => $_) {
                if (!isset($existing[$id])) continue;
                $deletedFiles[] = (string) $existing[$id]['nome_arquivo'];
                $this->db->runSQL(
                    'DELETE FROM fotos_perfil WHERE id = :photo AND membro_id = :member',
                    ['photo' => $id, 'member' => $memberId]
                );
            }

            $this->db->runSQL(
                'UPDATE fotos_perfil SET ordem = COALESCE(ordem, 0) + 1000 WHERE membro_id = :id',
                ['id' => $memberId]
            );

            foreach ($items as $position => [$type, $value]) {
                if ($type === 'existing') {
                    $this->db->runSQL(
                        'UPDATE fotos_perfil SET ordem = :position WHERE id = :photo AND membro_id = :member',
                        ['position' => $position, 'photo' => $value, 'member' => $memberId]
                    );
                } else {
                    $this->db->runSQL(
                        "INSERT INTO fotos_perfil (nome_arquivo, membro_id, ordem, status)
                         VALUES (:name, :member, :position, 'pendente')",
                        ['name' => $value, 'member' => $memberId, 'position' => $position]
                    );
                }
            }

            if ($managesTransaction) $this->db->commit();
            return $deletedFiles;
        } catch (Throwable $error) {
            if ($managesTransaction && $this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }

    public function discardProfileUploads(array $filenames): void
    {
        $this->deleteFiles($filenames, [APP_ROOT . '/public/imagens/fotos-perfil-temp/']);
    }

    public function deleteProfileFiles(array $filenames): void
    {
        $this->deleteFiles($filenames, [
            APP_ROOT . '/public/imagens/fotos-perfil-temp/',
            APP_ROOT . '/public/imagens/fotos-perfil/',
            APP_ROOT . '/public/imagens/fotos-perfil-originais/'
        ]);
    }

    public function startProfileWorker(string $memberId): void
    {
        $worker = APP_ROOT . '/src/pages/profile-image-worker.php';
        $log = APP_ROOT . '/var/log/profile-image-worker.log';
        if (!is_file($worker)) throw new RuntimeException('O worker das fotografias não existe.');

        $this->garantirPasta(dirname($log));
        $php = is_executable('/usr/bin/php') ? '/usr/bin/php' : PHP_BINARY;
        $command = sprintf(
            'nohup %s %s %s >> %s 2>&1 < /dev/null &',
            escapeshellarg($php), escapeshellarg($worker),
            escapeshellarg($memberId), escapeshellarg($log)
        );
        exec($command, $output, $code);
        if ($code !== 0) throw new RuntimeException('Não foi possível iniciar o worker das fotografias.');
    }

    public function createImage(
        string $memberId,
        string $filename,
        string $temporary,
        string $type
    ): void {
        if (!is_file($temporary)) throw new RuntimeException('A imagem temporária não foi encontrada.');

        $source = $temporary;
        $created = [];

        try {
            $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($temporary);
            if (in_array($mime, ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'], true)) {
                $source = $this->convertHeic($temporary);
            }

            $this->validarImagemEntrada($source);
            $basename = pathinfo($filename, PATHINFO_FILENAME) . '.webp';

            if ($type === 'perfil') {
                $square = APP_ROOT . '/public/imagens/fotos-perfil/' . $basename;
                $original = APP_ROOT . '/public/imagens/fotos-perfil-originais/' . $basename;
                $created = [$square, $original];
                $this->writeWebp($source, $square, 1200, true, 84);
                $this->writeWebp($source, $original, 2400, false, 90);
            } elseif ($type === 'receita' || $type === 'publicacao') {
                $directory = $type === 'receita' ? '/public/imagens/comida/' : '/public/posts/';
                $destination = APP_ROOT . $directory . $basename;
                $created = [$destination];
                $this->writeWebp($source, $destination, 1440, false, 82, true);
            } else {
                throw new InvalidArgumentException('Tipo de imagem inválido.');
            }

            $this->db->runSQL(
                "UPDATE fotos_perfil SET nome_arquivo = :new_name, status = 'completo'
                 WHERE membro_id = :member AND nome_arquivo = :old_name",
                ['new_name' => $basename, 'member' => $memberId, 'old_name' => $filename]
            );
        } catch (Throwable $error) {
            foreach ($created as $path) if (is_file($path)) @unlink($path);
            $this->db->runSQL(
                "UPDATE fotos_perfil SET status = 'erro'
                 WHERE membro_id = :member AND nome_arquivo = :name",
                ['member' => $memberId, 'name' => $filename]
            );
            throw $error;
        } finally {
            if ($source !== $temporary && is_file($source)) @unlink($source);
            if (is_file($temporary)) @unlink($temporary);
        }
    }

    private function convertHeic(string $source): string
    {
        $destination = sys_get_temp_dir() . '/' . uniqid('perfil_', true) . '.jpg';
        $magick = trim((string) shell_exec('command -v magick 2>/dev/null'));
        if ($magick === '') $magick = trim((string) shell_exec('command -v convert 2>/dev/null'));

        $commands = [];
        if ($magick !== '') {
            $commands[] = escapeshellcmd($magick) . ' ' . escapeshellarg($source . '[0]')
                . ' -auto-orient ' . escapeshellarg($destination);
        }
        $commands[] = '/usr/bin/heif-convert -q 100 ' . escapeshellarg($source) . ' ' . escapeshellarg($destination);
        $commands[] = 'ffmpeg -y -i ' . escapeshellarg($source) . ' -vframes 1 -q:v 2 ' . escapeshellarg($destination);

        foreach ($commands as $command) {
            exec($command . ' 2>&1', $output, $code);
            if ($code === 0 && is_file($destination) && filesize($destination) > 0) return $destination;
            $output = [];
        }

        if (is_file($destination)) @unlink($destination);
        throw new RuntimeException('Não foi possível converter a fotografia HEIC.');
    }

    private function writeWebp(
        string $source,
        string $destination,
        int $size,
        bool $crop,
        int $quality,
        bool $enhance = false
    ): void {
        $this->garantirPasta(dirname($destination));
        $this->aplicarLimitesImagick();
        $image = new \Imagick($source . '[0]');

        try {
            $image->autoOrient();
            $image->transformImageColorspace(\Imagick::COLORSPACE_SRGB);
            if ($crop) {
                $image->cropThumbnailImage($size, $size);
            } elseif ($image->getImageWidth() > $size || $image->getImageHeight() > $size) {
                $image->thumbnailImage($size, $size, true);
            }
            $image->unsharpMaskImage(0, 0.65, 1.0, 0.03);
            if ($enhance) $image->modulateImage(100, 105, 100);
            $image->setImageFormat('webp');
            $image->setImageCompressionQuality($quality);
            $image->setOption('webp:method', '6');
            $image->stripImage();
            if (!$image->writeImage($destination)) throw new RuntimeException('Não foi possível escrever a imagem.');
        } finally {
            $image->clear();
            $image->destroy();
        }
    }

    private function validarImagemEntrada(string $path): void
    {
        $this->aplicarLimitesImagick();
        $image = new \Imagick();

        try {
            $image->pingImage($path . '[0]');
            $width = $image->getImageWidth();
            $height = $image->getImageHeight();
            if ($width < 1 || $height < 1 || $width > self::MAX_WIDTH
                || $height > self::MAX_HEIGHT || $width * $height > self::MAX_PIXELS) {
                throw new RuntimeException('A fotografia tem dimensões demasiado grandes.');
            }
        } catch (RuntimeException $error) {
            throw $error;
        } catch (Throwable $error) {
            throw new RuntimeException('A fotografia recebida não é válida.', 0, $error);
        } finally {
            $image->clear();
            $image->destroy();
        }
    }

    private function aplicarLimitesImagick(): void
    {
        $limits = [
            \Imagick::RESOURCETYPE_MEMORY => 256 * 1024 * 1024,
            \Imagick::RESOURCETYPE_MAP => 512 * 1024 * 1024,
            \Imagick::RESOURCETYPE_DISK => 1024 * 1024 * 1024,
            \Imagick::RESOURCETYPE_AREA => self::MAX_PIXELS,
            \Imagick::RESOURCETYPE_THREAD => 1
        ];
        foreach ($limits as $type => $value) \Imagick::setResourceLimit($type, $value);
    }

    private function normalizarLista($values): array
    {
        if (!is_array($values)) return [];
        $result = [];
        foreach ($values as $value) {
            if (!is_scalar($value)) continue;
            $value = trim((string) $value);
            if ($value !== '') $result[$value] = $value;
        }
        return array_values($result);
    }

    private function deleteFiles(array $filenames, array $directories): void
    {
        foreach (array_unique($filenames) as $filename) {
            $filename = basename((string) $filename);
            if ($filename === '' || $filename === 'default.webp') continue;
            foreach ($directories as $directory) {
                $path = $directory . $filename;
                if (is_file($path) && !@unlink($path)) error_log('Não foi possível apagar: ' . $path);
            }
        }
    }

    private function garantirPasta(string $directory): void
    {
        if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
            throw new RuntimeException('Não foi possível criar a pasta das imagens.');
        }
    }
}