<?php
$data = [];

if ($session->id == 0) {
    redirect(DOC_ROOT . 'index');
}

echo $twig->render('index.html', $data);