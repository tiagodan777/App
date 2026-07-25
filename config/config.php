<?php
define('DEV', false);
define("ROOT_FOLTER", 'public');
define("DOC_ROOT", '/');
define('DOMAIN', 'http://34.14.62.235/');

$type = 'mysql';
$server = 'localhost';
$db = 'app';
$port = '3306';
$charset = 'utf8mb4';
$username = 'admin';
$password = 'NovaFaseDaVidaEm2026';

$dsn = "$type:host=$server;dbname=$db;port=$port;charset=$charset";

$email_config = [
    'server'   => 'smtp.sendgrid.net',
    'port'     => 465,
    'username' => 'apikey', // literal
    'password' => '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', // a tua nova API key
    'security' => 'tls',
    'admin_email' => 'tiagoamdaniel.python@gmail.com',
    'debug' => (DEV) ? 2 : 0,
];

define('MEDIA_TYPES', ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic']);
define('FILE_EXTENSIONS', ['jpeg', 'jpg', 'png', 'gif', 'webp', 'heic']);
define('MAX_SIZE', '512000000');