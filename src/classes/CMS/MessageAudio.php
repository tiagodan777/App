<?php
declare(strict_types=1);

namespace App\CMS;

use InvalidArgumentException;
use RuntimeException;

// PCM/WAV mono: reproduzível em iOS e Android, sem conversores externos.
final class MessageAudio {
    public const MAX_SECONDS = 180;
    public const MAX_BYTES = 35 * 1024 * 1024;

    public function validate(string $path): void {
        $size = filesize($path);
        $header = file_get_contents($path, false, null, 0, 44);

        if ($size < 46 || $size > self::MAX_BYTES || strlen($header) !== 44) {
            throw new InvalidArgumentException('A gravação está vazia ou excede o tamanho permitido.');
        }

        $fields = unpack(
            'Vriff/a4wave/a4fmt/VfmtSize/vcodec/vchannels/Vrate/VbytesPerSecond/valign/vbits/a4data/VdataSize',
            substr($header, 4)
        );

        if (
            substr($header, 0, 4) !== 'RIFF'
            || $fields['wave'] !== 'WAVE'
            || $fields['fmt'] !== 'fmt '
            || $fields['data'] !== 'data'
            || $fields['fmtSize'] !== 16
            || $fields['codec'] !== 1
            || $fields['channels'] !== 1
            || $fields['bits'] !== 16
            || $fields['align'] !== 2
            || $fields['rate'] < 8000
            || $fields['rate'] > 96000
            || $fields['bytesPerSecond'] !== $fields['rate'] * 2
            || $fields['riff'] !== $size - 8
            || $fields['dataSize'] !== $size - 44
            || $fields['dataSize'] % 2 !== 0
            || $fields['dataSize'] / $fields['bytesPerSecond'] > self::MAX_SECONDS
        ) {
            throw new InvalidArgumentException(
                'A gravação não é válida. Grava novamente (máximo de 3 minutos).'
            );
        }
    }

    public function receive(string $temporary): array {
        $this->validate($temporary);

        $folder = APP_ROOT . '/public/media/mensagens/';
        if (!is_dir($folder) && !mkdir($folder, 0775, true) && !is_dir($folder)) {
            throw new RuntimeException('Não foi possível preparar a pasta das mensagens.');
        }

        $name = bin2hex(random_bytes(20)) . '.wav';
        $destination = $folder . $name;

        if (!move_uploaded_file($temporary, $destination)) {
            throw new RuntimeException('Não foi possível guardar o áudio.');
        }

        chmod($destination, 0664);

        return [
            'tipo' => 'audio',
            'nome' => $name,
            'mime' => 'audio/wav',
            'tamanho' => filesize($destination),
            'caminho' => $destination
        ];
    }
}