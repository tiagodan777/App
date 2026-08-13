<?php

define('DEV', true);
define('ROOT_FOLTER', 'public');
define('DOC_ROOT', '/');
define('DOMAIN', 'https://margot-app.com/');

$type = 'mysql';
$server = 'localhost';
$db = 'app';
$port = '3306';
$charset = 'utf8mb4';
$username = 'admin';
$password = '';

$dsn = "$type:host=$server;dbname=$db;port=$port;charset=$charset";

$email_config = [
    'server' => 'smtp.sendgrid.net',
    'port' => 587,
    'username' => 'apikey',
    'password' => '',
    'security' => 'tls',
    'admin_email' => '',
    'debug' => DEV ? 2 : 0,
];

define('MEDIA_TYPES', [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic'
]);

define('FILE_EXTENSIONS', [
    'jpeg',
    'jpg',
    'png',
    'gif',
    'webp',
    'heic'
]);

define('MAX_SIZE', 15 * 1024 * 1024);