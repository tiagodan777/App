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
<!DOCTYPE html>
<html lang="pt-pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Autocompletar</title>
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <header>
        <form action="index.php" method="get">
            <div id="searchBox">
                <input type="search" name="search" id="search" placeholder="Pesquisa" autocomplete="off">
                <input type="submit" value="Pesquisar">
            </div>
            <div id="recomendationsBox">
                <ul id="list">
                    
                </ul>
            </div>
        </form>
    </header>
    <script src="js/jquery-4.0.0.js"></script>
    <script src="js/index.js"></script>
</body>
</html>