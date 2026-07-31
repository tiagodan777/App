<?php

declare(strict_types=1);

namespace App\Email;

use InvalidArgumentException;
use PHPMailer\PHPMailer\PHPMailer;

final class Email
{
    private PHPMailer $phpmailer;

    public function __construct(array $emailConfig)
    {
        $camposObrigatorios = [
            'server',
            'port',
            'username',
            'password',
            'security'
        ];

        foreach ($camposObrigatorios as $campo) {
            if (
                !isset($emailConfig[$campo]) ||
                trim((string) $emailConfig[$campo]) === ''
            ) {
                throw new InvalidArgumentException(
                    'A configuração de email está incompleta.'
                );
            }
        }

        $this->phpmailer = new PHPMailer(true);
        $this->phpmailer->isSMTP();
        $this->phpmailer->SMTPAuth = true;
        $this->phpmailer->Host =
            trim((string) $emailConfig['server']);
        $this->phpmailer->Port =
            (int) $emailConfig['port'];
        $this->phpmailer->Username =
            trim((string) $emailConfig['username']);
        $this->phpmailer->Password =
            (string) $emailConfig['password'];
        $this->phpmailer->SMTPSecure =
            trim((string) $emailConfig['security']);

        $this->phpmailer->SMTPDebug = max(
            0,
            (int) ($emailConfig['debug'] ?? 0)
        );

        $this->phpmailer->Debugoutput = 'error_log';
        $this->phpmailer->Timeout = 15;
        $this->phpmailer->Timelimit = 20;
        $this->phpmailer->CharSet =
            PHPMailer::CHARSET_UTF8;
        $this->phpmailer->Encoding =
            PHPMailer::ENCODING_BASE64;
        $this->phpmailer->isHTML(true);
    }

    public function sendEmail(
        string $from,
        string $to,
        string $subject,
        string $message
    ): bool {
        $from = trim($from);
        $to = trim($to);
        $subject = trim($subject);

        if (
            !filter_var(
                $from,
                FILTER_VALIDATE_EMAIL
            )
        ) {
            throw new InvalidArgumentException(
                'O endereço do remetente não é válido.'
            );
        }

        if (
            !filter_var(
                $to,
                FILTER_VALIDATE_EMAIL
            )
        ) {
            throw new InvalidArgumentException(
                'O endereço do destinatário não é válido.'
            );
        }

        if ($subject === '') {
            throw new InvalidArgumentException(
                'O assunto do email não pode estar vazio.'
            );
        }

        $this->phpmailer->clearAllRecipients();
        $this->phpmailer->clearReplyTos();
        $this->phpmailer->clearAttachments();

        $this->phpmailer->setFrom(
            $from,
            'Margot'
        );

        $this->phpmailer->addAddress($to);
        $this->phpmailer->Subject = $subject;

        $this->phpmailer->Body =
            $this->criarDocumentoHtml($message);

        $this->phpmailer->AltBody =
            $this->criarTextoSimples($message);

        try {
            return $this->phpmailer->send();
        } finally {
            $this->phpmailer->clearAllRecipients();
            $this->phpmailer->clearReplyTos();
            $this->phpmailer->clearAttachments();
        }
    }

    private function criarDocumentoHtml(
        string $message
    ): string {
        return '<!DOCTYPE html>' .
            '<html lang="pt-PT">' .
            '<head>' .
            '<meta charset="UTF-8">' .
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">' .
            '<title>Margot</title>' .
            '</head>' .
            '<body>' .
            $message .
            '</body>' .
            '</html>';
    }

    private function criarTextoSimples(
        string $message
    ): string {
        $texto = preg_replace(
            '/<br\s*\/?>/i',
            "\n",
            $message
        );

        $texto = preg_replace(
            '/<\/p>/i',
            "\n\n",
            (string) $texto
        );

        $texto = strip_tags(
            (string) $texto
        );

        $texto = html_entity_decode(
            $texto,
            ENT_QUOTES | ENT_HTML5,
            'UTF-8'
        );

        return trim($texto);
    }
}