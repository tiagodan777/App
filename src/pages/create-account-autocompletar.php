<?php
header('Content-Type: application/json; charset=utf-8');

$gosto = $_GET['gosto'] ?? '';

if ($_SERVER['REQUEST_METHOD'] == 'GET') {
    if ($gosto !== '') {
        $autocompletar = $cms->getHobbie()->get($gosto);
        echo json_encode($autocompletar);
        exit;
    }

    echo json_encode([]);
} else {
    if ($gosto !== '') {
        $adicionar = $cms->getHobbie()->create($gosto);
        exit;
    }
}


exit;