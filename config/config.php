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
    'port'     => 587,
    'username' => 'apikey', // literal
    'password' => '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', // a tua nova API key
    'security' => 'tls',
    'admin_email' => 'tiagoamdaniel488@gmail.com',
    'debug' => (DEV) ? 2 : 0,
];

define('MEDIA_TYPES', ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic']);
define('FILE_EXTENSIONS', ['jpeg', 'jpg', 'png', 'gif', 'webp', 'heic']);
define('MAX_SIZE', '512000000');