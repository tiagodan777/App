<?php
header('Content-Type: application/json; charset=utf-8');

$gosto = $_GET['gosto'] ?? '';

if ($gosto !== '') {
    $autocomplete = $cms->getHobbie()->get($gosto);
    echo json_encode($autocomplete);
    exit;
}

echo json_encode([]);
exit;