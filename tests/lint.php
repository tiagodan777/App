<?php
$root = dirname(__DIR__);
$files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root));
$count = 0;
foreach ($files as $file) {
    $path = $file->getPathname();
    if ($file->getExtension() !== 'php' || str_contains($path, '/vendor/')) continue;
    token_get_all(file_get_contents($path), TOKEN_PARSE);
    $count++;
}
echo "PHP parsed: $count files\n";
define('APP_ROOT', $root);
define('DOC_ROOT', '/');
require $root . '/vendor/autoload.php';
foreach (glob($root . '/src/classes/CMS/*.php') as $file) {
    $name = 'App\\CMS\\' . basename($file, '.php');
    if (!class_exists($name)) throw new Exception("Class not found: $name");
    new ReflectionClass($name);
}
echo "All CMS classes loaded\n";
$twig = new Twig\Environment(new Twig\Loader\FilesystemLoader($root . '/templates'));
$twig->addExtension(new Twig\Extension\DebugExtension());
$count=0;
foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root.'/templates')) as $file) {
    if($file->getExtension() !== 'html') continue;
    $name=substr($file->getPathname(),strlen($root.'/templates/'));
    $twig->load($name); $count++;
}
echo "Twig compiled: $count templates\n";

foreach (glob($root . '/src/pages/*.php') as $file) {
    if (preg_match('/(?:->runSQL|->prepare|->query)\s*\(/', file_get_contents($file))) {
        throw new Exception('SQL direto numa página: ' . basename($file));
    }
}
foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root . '/src')) as $file) {
    if ($file->getExtension() === 'php' && preg_match('/\b(?:CREATE|ALTER|DROP)\s+TABLE\b/i', file_get_contents($file->getPathname()))) {
        throw new Exception('DDL no código da aplicação: ' . $file->getPathname());
    }
}
echo "Arquitetura: páginas sem SQL e aplicação sem criação de tabelas.\n";
