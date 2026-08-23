<?php

declare(strict_types=1);

use App\CMS\EmailVerification;
use App\CMS\Member;
use App\Email\Email;
use App\Validate\Validate;

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$editing = $method === 'POST' ? ($_POST['modo'] ?? '') === 'editar' : ($_GET['editar'] ?? '') === '1';
$memberId = trim((string) ($session->id ?? ''));
$member = $cms->getMember();
$base = rtrim((string) DOC_ROOT, '/') . '/';
$allSections = [
    'nome', 'nascimento', 'sexo', 'gostos',
    'contactos', 'descricao', 'fotos', 'permissoes', 'palavra-passe'
];

$json = static function (array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
};

if ($method !== 'POST') {
    $data = ['gostos' => []];
    $photos = [];

    if ($editing) {
        if ($memberId === '') {
            header('Location: ' . $base . 'login');
            exit;
        }

        $current = $member->get($memberId);
        if (!$current) {
            http_response_code(404);
            exit('Membro não encontrado.');
        }

        $birth = DateTimeImmutable::createFromFormat('!Y-m-d', (string) $current['nascimento']);
        $data = [
            'primeiro_nome' => (string) $current['primeiro_nome'],
            'ultimo_nome' => (string) $current['ultimo_nome'],
            'dia' => $birth ? $birth->format('d') : '',
            'mes' => $birth ? $birth->format('m') : '01',
            'ano' => $birth ? $birth->format('Y') : '',
            'genero' => (string) $current['genero'],
            'gostos' => array_column($current['gostos'] ?? [], 'nome'),
            'telefone' => (string) $current['telefone'],
            'email' => (string) $current['email'],
            'sobre_ti' => (string) $current['bio']
        ];

        foreach ($current['fotos'] ?? [] as $photo) {
            if (empty($photo['id']) || ($photo['nome_arquivo'] ?? '') === 'default.webp') continue;
            $name = basename((string) $photo['nome_arquivo']);
            $photos[] = [
                'id' => (string) $photo['id'],
                'nome' => $name,
                'url' => $base . 'imagens/fotos-perfil-originais/' . rawurlencode($name),
                'fallback' => $base . 'imagens/fotos-perfil/' . rawurlencode($name)
            ];
        }
    }

    echo $twig->render('create-account.html', [
        'modo_edicao' => $editing,
        'membro_id_edicao' => $editing ? $memberId : '',
        'dados_iniciais' => $data,
        'fotos_existentes' => $photos,
        'campos_url' => $base . 'create-account-campos' . ($editing ? '?editar=1' : ''),
        'perfil_url' => $editing ? $base . 'profile/' . rawurlencode($memberId) : '',
        'idade_minima' => Validate::MINIMUM_AGE,
        'versao_termos' => Member::TERMS_VERSION,
        'versao_privacidade' => Member::PRIVACY_VERSION
    ]);
    exit;
}

if ($editing && $memberId === '') {
    $json(['success' => false, 'message' => 'A sessão terminou.'], 401);
}

$section = $editing ? trim((string) ($_POST['secao'] ?? 'tudo')) : 'tudo';
if ($section !== 'tudo' && !in_array($section, $allSections, true)) {
    $json(['success' => false, 'message' => 'A área de edição não é válida.'], 422);
}

$sections = $section === 'tudo' ? $allSections : [$section];
$form = $member->prepareAccountForm($_POST, $sections, !$editing);
if ($form['errors']) $json(['success' => false, 'erros' => $form['errors']], 422);

$image = $cms->getImage();
$editsPhotos = in_array('fotos', $sections, true);
$newPhotos = [];

try {
    if ($editsPhotos) $newPhotos = $image->receiveProfileUploads($_FILES['imagens'] ?? []);

    $photoOrder = $_POST['ordem_fotos'] ?? [];
    $photosToRemove = $_POST['fotos_remover'] ?? [];
    $photosChanged = $editsPhotos && (
        $newPhotos || $photosToRemove || ($_POST['fotos_alteradas'] ?? '') === '1'
    );
    $oldPhotos = [];

    $db->beginTransaction();
    if ($editing) {
        $savedId = $memberId;
        if ($form['changes'] && !$member->update($savedId, $form['changes'])) {
            throw new DomainException('duplicate');
        }
    } else {
        $savedId = $member->create($form['changes']);
        if ($savedId === false) throw new DomainException('duplicate');
        $member->recordLegalAcceptance($savedId);
    }

    if ($photosChanged) {
        $oldPhotos = $image->syncProfilePhotos($savedId, $newPhotos, $photoOrder, $photosToRemove);
    }
    $db->commit();
} catch (LengthException|InvalidArgumentException $error) {
    if ($db->inTransaction()) $db->rollBack();
    $image->discardProfileUploads($newPhotos);
    $json(['success' => false, 'erros' => ['imagens' => $error->getMessage()]], 422);
} catch (Throwable $error) {
    if ($db->inTransaction()) $db->rollBack();
    $image->discardProfileUploads($newPhotos);

    if ($error instanceof DomainException && $error->getMessage() === 'duplicate') {
        $json([
            'success' => false,
            'erros' => ['email' => 'O email ou o número de telefone já está a ser usado.']
        ], 409);
    }

    error_log('[create-account] ' . $error->getMessage());
    $json(['success' => false, 'message' => 'Não foi possível guardar a conta.'], 500);
}

if ($oldPhotos) $image->deleteProfileFiles($oldPhotos);
if ($newPhotos) {
    try {
        $image->startProfileWorker($savedId);
    } catch (Throwable $error) {
        error_log('[create-account-worker] ' . $error->getMessage());
    }
}

if ($editing) {
    $json(['success' => true, 'redirect' => $base . 'profile/' . rawurlencode($savedId)]);
}

try {
    $verification = new EmailVerification($db);
    $request = $verification->createRequest((string) $form['data']['email']);

    if ($request) {
        $link = rtrim((string) DOMAIN, '/') . '/verify-email/?token=' . rawurlencode($request['token']);
        $name = htmlspecialchars($request['primeiro_nome'], ENT_QUOTES, 'UTF-8');
        $safeLink = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');
        $body = "<p>Olá {$name},</p><p>Confirma o teu email para utilizares a Margot.</p>"
            . "<p><a href=\"{$safeLink}\">Confirmar o meu email</a></p>";

        try {
            (new Email($email_config))->sendEmail(
                (string) $email_config['admin_email'],
                $request['email'],
                'Confirma o teu email na Margot',
                $body
            );
        } catch (Throwable $error) {
            $verification->cancelRequest($request['token']);
            error_log('[create-account-email] ' . $error->getMessage());
        }
    }
} catch (Throwable $error) {
    error_log('[create-account-verification] ' . $error->getMessage());
}

$json([
    'success' => true,
    'redirect' => $base . 'login?sucesso=confirma-email',
    'message' => 'A conta foi criada. Confirma o teu email antes de entrares.'
]);