<?php
$data = [];

require_login($session);

echo "<pre>";
var_dump($session);
echo "</pre>";

echo $twig->render('index.html', $data);