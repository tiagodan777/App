<?php
declare(strict_types=1);

namespace App\CMS;

/** Presentation-only language selection; never changes identity, tokens or URLs. */
final class Locale {
    private const ENGLISH = [
        'Tu: ' => 'You: ',
        'Fotografia' => 'Photo',
        'Vídeo' => 'Video',
        'Mensagem de voz' => 'Voice message',
        'Mensagem' => 'Message',
        'Ligados na Margot' => 'Connected on Margot',
        'Atualizar' => 'Refresh',
        '📷 Fotografia' => '📷 Photo',
        '🎥 Vídeo' => '🎥 Video',
        '🎙️ Mensagem de voz' => '🎙️ Voice message',
        'A página expirou.' => 'The page has expired.',
        'A tua conta Margot e os dados associados foram eliminados definitivamente.' => 'Your Margot account and associated data have been permanently deleted.',
        'A tua conta Margot foi eliminada' => 'Your Margot account has been deleted',
        'Abre a app e manda-lhes um Hey.' => 'Open the app and send them a Hey.',
        'Alterar a minha password' => 'Change my password',
        'Alterar a password da Margot' => 'Change your Margot password',
        'Atualiza a página e tenta novamente.' => 'Refresh the page and try again.',
        'Atualiza a roupa na Margot para ser mais fácil reconhecer-te.' => 'Update your outfit on Margot so people can recognise you more easily.',
        'Confirma o teu email na Margot' => 'Confirm your email on Margot',
        'Confirma o teu email para utilizares a Margot.' => 'Confirm your email to use Margot.',
        'Confirma o teu endereço de email para começares a utilizar a Margot.' => 'Confirm your email address to start using Margot.',
        'Confirmar eliminação da conta' => 'Confirm account deletion',
        'Confirmar eliminação da conta Margot' => 'Confirm deletion of your Margot account',
        'Confirmar o meu email' => 'Confirm my email',
        'Desculpa, ocorreu um problema.' => 'Sorry, something went wrong.',
        'Esta ligação é válida durante 20 minutos e só pode ser utilizada uma vez.' => 'This link is valid for 20 minutes and can only be used once.',
        'Esta ligação é válida durante 24 horas e só pode ser utilizada uma vez.' => 'This link is valid for 24 hours and can only be used once.',
        'Nova mensagem' => 'New message',
        'O que vestes hoje?' => 'What are you wearing today?',
        'Obrigado pelo tempo que passaste connosco.' => 'Thank you for the time you spent with us.',
        'Ocorreu um problema' => 'Something went wrong',
        'Página expirada' => 'Page expired',
        'Recebemos um pedido para alterares a password da tua conta Margot.' => 'We received a request to change your Margot account password.',
        'Recebemos um pedido para eliminar definitivamente a tua conta Margot.' => 'We received a request to permanently delete your Margot account.',
        'Se não criaste uma conta na Margot, ignora este email.' => 'If you did not create a Margot account, ignore this email.',
        'Se não fizeste este pedido, ignora este email. A tua conta não será eliminada.' => 'If you did not make this request, ignore this email. Your account will not be deleted.',
        'Se não fizeste este pedido, ignora este email. A tua password continuará igual.' => 'If you did not make this request, ignore this email. Your password will remain unchanged.',
        'Tenta novamente dentro de alguns instantes.' => 'Try again in a few moments.',
        'Toca para ver o perfil.' => 'Tap to view the profile.'
    ];

    public static function normalise(string $language): string {
        return preg_match('/^pt(?:[-_]|$)/i', trim($language)) === 1 ? 'pt' : 'en';
    }

    public static function current(): string {
        $cookie = $_COOKIE['margot_language'] ?? null;
        if ($cookie === 'pt' || $cookie === 'en') return $cookie;
        $preferred = '';
        $highest = -1.0;
        foreach (explode(',', (string) ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')) as $item) {
            $parts = explode(';', trim($item));
            $quality = 1.0;
            foreach (array_slice($parts, 1) as $parameter) {
                if (preg_match('/^q=([0-9.]+)$/i', trim($parameter), $match)) {
                    $quality = (float) $match[1];
                }
            }
            if ($quality > 0 && $quality <= 1 && $quality > $highest) {
                $highest = $quality;
                $preferred = trim($parts[0]);
            }
        }
        return self::normalise($preferred);
    }

    public static function text(string $text, ?string $language = null): string {
        return ($language ?? self::current()) === 'pt' ? $text : (self::ENGLISH[$text] ?? $text);
    }

    /** Only the app's transactional email templates; escaped recipient names stay intact. */
    public static function emailBody(string $html, string $language): string {
        if ($language === 'pt') return $html;
        return preg_replace_callback('/>([^<>]*)</s', static function (array $match): string {
            $text = $match[1];
            if (str_starts_with($text, 'Olá ') && str_ends_with($text, ',')) {
                $text = 'Hello ' . substr($text, strlen('Olá '));
            } elseif (str_starts_with($text, 'Ligação: ')) {
                $text = 'Link: ' . substr($text, strlen('Ligação: '));
            } else {
                $text = self::text($text, 'en');
            }
            return '>' . $text . '<';
        }, $html) ?? $html;
    }

    /** A message body is translated only when it was generated by the application. */
    public static function pushText(
        string $language, string $type, string $title, string $body, array $data, bool $systemBody
    ): array {
        if ($language === 'pt') return [$title, $body];
        if ($type === 'message' && isset($data['reaction_emoji'])) {
            return [$title, 'Reacted with ' . (string) $data['reaction_emoji'] . ' to your message.'];
        }
        if ($type === 'hey') {
            $title = (string) ($data['from_name'] ?? '') . ' sent you a Hey!';
        } elseif ($type === 'nearby') {
            $title = 'There are ' . (int) ($data['nearby_count'] ?? 0) . ' people using Margot nearby 👀';
        } elseif ($type === 'clothes') {
            $title = self::text($title, 'en');
        }
        if ($type !== 'message' || $systemBody) $body = self::text($body, 'en');
        return [$title, $body];
    }
}