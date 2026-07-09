<?php
function redirect($location, $parameters = [], $response_code = 302) {
    $qs = $parameters ? '?' . http_build_query($parameters) : '';
    $location = $location . $qs;
    header('Location: ' . $location, $response_code);
    exit;
}

function create_filename($original) {
    $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    $unique = bin2hex(random_bytes(16)); // 32 chars únicos
    return $unique . '.' . $ext;
}

function create_seo_name($string) {
    $text = mb_strtolower($string);
    $text = trim($text);
    if (function_exists('transliterator_transliterate')) {
        $text = transliterator_transliterate('Latin-ASCII', $text);
    }
    $text = preg_replace('/ /', '-', $text);
    $text = preg_replace('/[^A-z0-9]/', '', $text);
    return $text;
}

function require_login($session) {
    if ($session->id == 0) {
        redirect(DOC_ROOT . 'login/');
    }
}

set_error_handler('handle_error');
function handle_error($type, $message, $file, $line) {
    // Ignora deprecation warnings (PHP 8.2 compatibility)
    if ($type === E_DEPRECATED || $type === E_USER_DEPRECATED) {
        return true; // Não lança exception
    }
    var_dump($message);
    throw new ErrorException($message, 0, $type, $file, $line);
}

set_exception_handler('handle_exception');
function handle_exception($e) {
    var_dump($e);
    error_log($e);
    http_response_code(500);
    echo "<h1>Desculpa, ocurreu um problema</h1>";
}

//register_shutdown_function('handle_shutdown');
function handle_shutdown() {
    $error = error_get_last();
    if ($error) {
        $e = new ErrorException($error['message'], 0, $error['type'], $error['file'], $error['line']);
        var_dump($e);
        handle_exception($e);
    }
}