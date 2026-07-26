<?php

declare(strict_types=1);

use App\Security\InteractionPolicy;

require_login($session);

$viewerId = trim((string) $session->id);
$targetId = trim((string) ($id ?? ''));
$proximityToken = trim((string) ($_GET['proximity_token'] ?? ''));
$validUuid = preg_match(
    '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
    $targetId
) === 1;

if (!$validUuid) {
    http_response_code(404);
    echo $twig->render('error-page.html', ['message' => 'Este perfil não está disponível.']);
    exit;
}

$isOwnProfile = hash_equals($viewerId, $targetId);
$policy = new InteractionPolicy($db, APP_KEY);

if (
    !$isOwnProfile &&
    $proximityToken !== '' &&
    InteractionPolicy::validateProximityToken(
        $proximityToken,
        $viewerId,
        $targetId,
        APP_KEY
    )
) {
    InteractionPolicy::grantSessionProximity(
        $viewerId,
        $targetId,
        APP_KEY
    );
    header(
        'Location: ' .
        DOC_ROOT .
        'profile/' .
        rawurlencode($targetId),
        true,
        303
    );
    exit;
}

if (!$isOwnProfile && !$policy->canInteract($viewerId, $targetId, $proximityToken)) {
    http_response_code(404);
    echo $twig->render('error-page.html', ['message' => 'Este perfil não está disponível.']);
    exit;
}

$member = $isOwnProfile
    ? $cms->getMember()->get($targetId)
    : $cms->getMember()->getPublic($targetId);

if (!$member || empty($member['nascimento'])) {
    http_response_code(404);
    echo $twig->render('error-page.html', ['message' => 'Este perfil não está disponível.']);
    exit;
}

$defaultPhotoUrl = DOC_ROOT . 'imagens/fotos-perfil/default.webp';

foreach ($member['fotos'] ?? [] as &$photo) {
    $photoId = trim((string) ($photo['id'] ?? ''));

    if ($photoId === '') {
        $photo['url_thumb'] = $defaultPhotoUrl;
        $photo['url_original'] = $defaultPhotoUrl;
        continue;
    }

    $basePhotoUrl = DOC_ROOT . 'profile-photo/' . rawurlencode($photoId);
    $tokenQuery = $proximityToken === ''
        ? ''
        : '&proximity_token=' . rawurlencode($proximityToken);
    $photo['url_thumb'] = $basePhotoUrl . '?size=thumb' . $tokenQuery;
    $photo['url_original'] = $basePhotoUrl . '?size=original' . $tokenQuery;
}

unset($photo);

echo $twig->render('profile.html', [
    'membro' => $member,
    'primerio_gosto' => (string) ($member['gostos'][0]['nome'] ?? ''),
    'idade' => calcularIdade((string) $member['nascimento']),
    'id' => $targetId,
    'proximity_token' => $proximityToken
]);
