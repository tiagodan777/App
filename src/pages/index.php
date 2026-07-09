<?php
$data = [];

echo '<pre>';
var_dump(session_status());
var_dump(session_id());
var_dump($_SESSION);
echo '</pre>';

echo $twig->render('index.html', $data);