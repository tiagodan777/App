<?php
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $gosto = $_GET['gosto'] ?? '';

    if ($gosto !== '') {
        echo json_encode($cms->getHobbie()->get($gosto));
        exit;
    }

    echo json_encode([]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $gosto = $_POST['gosto'] ?? '';

    if ($gosto !== '') {
        $cms->getHobbie()->create($gosto);
        echo json_encode(['sucesso' => true]);
        exit;
    }

    echo json_encode(['sucesso' => false]);
    exit;
}