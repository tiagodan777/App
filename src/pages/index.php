<?php
$data = [];

require_login($session);

echo $twig->render('index.html', $data);