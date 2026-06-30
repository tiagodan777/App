<?php
define('DEV', false);
define("ROOT_FOLTER", 'public');
define("DOC_ROOT", '/');
define('DOMAIN', 'http://34.14.62.235/');

$type = 'mysql';
$server = 'localhost';
$db = 'lykrr';
$port = '3306';
$charset = 'utf8mb4';
$username = 'imperador_supremo_do_universo';
$password = 'GUIDAMACAca687172euadorophp';

$dsn = "$type:host=$server;dbname=$db;port=$port;charset=$charset";

define('MEDIA_TYPES', ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic']);
define('FILE_EXTENSIONS', ['jpeg', 'jpg', 'png', 'gif', 'webp', 'heic']);
define('MAX_SIZE', '512000000');