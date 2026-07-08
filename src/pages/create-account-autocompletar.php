<?php
$gosto = $_GET['gosto'] ?? null;
if ($gosto) {
    $autocomple = $cms->getHobbie()->get($gosto);
    echo json_encode($autocomple);
    die();
} else {
    echo '';
}
?>
