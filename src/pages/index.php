<?php
$data = [];
$emojis = [];
// $tokenLogin = $_GET['loginToken'] ?? '';

/*if ($session->id != 0 && empty($tokenLogin)) {
    $tokenLogin = $cms->getToken()->create($session->id, 'login');
}

$pessoas = $cms->getMember()->getPeople($session->id);
shuffle($pessoas);*/

/*$count_contents = $cms->getContent()->count();
$total_pages = ceil($count_contents / 10);
$current_page = ceil($from / 10) + 1;*/

/*$data['count_contents'] = $count_contents;
$data['total_pages'] = $total_pages;
$data['current_page'] = $current_page;*/
$data['tokenLogin'] = $tokenLogin;
//$data['pessoas'] = $pessoas;
//$data['novas_datas'] = $novas_datas;

echo $twig->render('index.html', $data);
?>
