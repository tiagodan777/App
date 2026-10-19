<?php
declare(strict_types=1);

/* Margot — painel temporário e independente. PHP 8.2+, PDO MySQL.
 * Colocar em public/, junto do index.php. Apagar este ficheiro para remover.
 * A chave está nas instruções entregues; apenas a hash fica neste ficheiro.
 * Não inclui o bootstrap da app nem altera tabelas ou membros.
 */
const MP_ACCESS_HASH = 'd0fe54607b45442d90e737b1b43582b3e85bf31eca7fb0e04eec92cfe7b0989c';
const MP_SESSION_SECONDS = 8 * 60 * 60;
const MP_PAGE_SIZE = 12;

function mp_h(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function mp_string(array $input, string $key, string $fallback = ''): string {
    return is_string($input[$key] ?? null) ? trim($input[$key]) : $fallback;
}

function mp_json(array $payload, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR);
    exit;
}

function mp_database(): PDO {
    $config = null;
    $appRoot = null;
    foreach ([dirname(__DIR__), __DIR__] as $root) {
        foreach (['config/config.local.php', 'config/config.php'] as $relative) {
            if (is_file($root . '/' . $relative)) {
                $config = $root . '/' . $relative;
                $appRoot = $root;
                break 2;
            }
        }
    }
    if ($config === null) {
        throw new RuntimeException('Não encontrei a configuração da Margot. Coloca este ficheiro na pasta public, ao lado do index.php; a pasta config deve estar um nível acima.');
    }
    $settings = (static function (string $path, string $root): array {
        if (!defined('APP_ROOT')) define('APP_ROOT', $root);
        ob_start();
        try {
            require $path;
        } finally {
            ob_end_clean();
        }
        if (!is_string($dsn ?? null) || !isset($username, $password)) {
            throw new RuntimeException('A configuração encontrada não define $dsn, $username e $password, como no código da Margot fornecido.');
        }
        return [$dsn, (string) $username, (string) $password];
    })($config, $appRoot);
    try {
        $pdo = new PDO($settings[0], $settings[1], $settings[2], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 8,
        ]);
    } catch (PDOException $error) {
        throw new RuntimeException('Não foi possível ligar à base com a configuração da Margot (código ' . (string) $error->getCode() . '). Confirma que colocaste o ficheiro na mesma instalação da app.');
    } finally {
        unset($settings);
    }
    // Só afeta esta ligação; não muda a configuração do servidor ou das tabelas.
    $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_general_ci");
    $pdo->exec("SET time_zone = '+00:00'");
    $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    return $pdo;
}

function mp_query(PDO $pdo, string $sql, array $params = []): PDOStatement {
    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    return $statement;
}

function mp_date(?string $raw): ?DateTimeImmutable {
    if ($raw === null || $raw === '' || str_starts_with($raw, '0000-')) return null;
    try {
        return new DateTimeImmutable($raw, new DateTimeZone('UTC'));
    } catch (Exception) {
        return null;
    }
}

function mp_iso(?string $raw): ?string {
    return mp_date($raw)?->format('Y-m-d\TH:i:s.v\Z');
}

function mp_epoch_filter(array $input, string $key): ?string {
    $value = mp_string($input, $key);
    if ($value === '') return null;
    if (!ctype_digit($value) || strlen($value) > 12 || (float) $value > 253402300799) {
        throw new InvalidArgumentException('O intervalo de datas não é válido.');
    }
    return gmdate('Y-m-d H:i:s', (int) $value);
}

function mp_members(PDO $pdo, array $input): array {
    $q = mp_string($input, 'q');
    if (strlen($q) > 400) throw new InvalidArgumentException('A pesquisa é demasiado longa.');
    $source = mp_string($input, 'source', 'all');
    if (!in_array($source, ['all', 'foreground', 'background', 'missing'], true)) {
        throw new InvalidArgumentException('Filtro de localização inválido.');
    }
    $orders = [
        'newest' => 'm.numero DESC',
        'oldest' => 'm.numero ASC',
        'name' => 'm.primeiro_nome ASC, m.ultimo_nome ASC, m.id ASC',
        'location' => 'COALESCE(l.capturada_em, l.atualizada_em) DESC, m.id ASC',
    ];
    $sort = mp_string($input, 'sort', 'newest');
    if (!isset($orders[$sort])) throw new InvalidArgumentException('Ordenação inválida.');
    $pageRaw = mp_string($input, 'page', '1');
    $page = ctype_digit($pageRaw) ? max(1, min(1000000, (int) $pageRaw)) : 1;
    $from = mp_epoch_filter($input, 'from');
    $until = mp_epoch_filter($input, 'until');
    if ($from !== null && $until !== null && $from >= $until) {
        throw new InvalidArgumentException('A data inicial deve ser anterior ou igual à data final.');
    }
    $available = 'l.latitude IS NOT NULL AND l.longitude IS NOT NULL AND l.localizacao_ativa = 1 AND l.visivel = 1';
    $terms = [];
    $params = [];
    if ($q !== '') {
        $terms[] = "(LOCATE(:q_name, CONCAT(m.primeiro_nome, ' ', m.ultimo_nome)) > 0
            OR LOCATE(:q_bio, COALESCE(m.bio, '')) > 0
            OR EXISTS (SELECT 1 FROM membros_gostos mg JOIN hobbies h ON h.id = mg.hobbie_id
                WHERE mg.membro_id = m.id COLLATE utf8mb4_general_ci AND LOCATE(:q_hobby, h.nome) > 0))";
        $params += ['q_name' => $q, 'q_bio' => $q, 'q_hobby' => $q];
    }
    if (in_array($source, ['foreground', 'background'], true)) {
        $terms[] = 'l.origem = :source';
        $params['source'] = $source;
    } elseif ($source === 'missing') {
        $terms[] = "(l.membro_id IS NULL OR l.latitude IS NULL OR l.longitude IS NULL OR l.localizacao_ativa = 0 OR l.visivel = 0)";
    }
    if ($from !== null) { $terms[] = 'm.adesao >= :joined_from'; $params['joined_from'] = $from; }
    if ($until !== null) { $terms[] = 'm.adesao < :joined_until'; $params['joined_until'] = $until; }
    $where = $terms ? implode(' AND ', $terms) : '1 = 1';
    $joins = 'LEFT JOIN localizacao_membro l ON l.membro_id = m.id COLLATE utf8mb4_general_ci';
    $pdo->beginTransaction();
    try {
        $counts = mp_query($pdo, 'SELECT COUNT(*) AS total, COALESCE(SUM(adesao >= :recent), 0) AS recent FROM membros',
            ['recent' => gmdate('Y-m-d H:i:s', time() - 7 * 86400)])->fetch(PDO::FETCH_ASSOC);
        $locationCounts = mp_query($pdo, "SELECT
            COALESCE(SUM(CASE WHEN $available THEN 1 ELSE 0 END), 0) AS located,
            COALESCE(SUM(CASE WHEN l.origem = 'background' THEN 1 ELSE 0 END), 0) AS background
            FROM membros m $joins")->fetch(PDO::FETCH_ASSOC);
        $filtered = (int) mp_query($pdo, "SELECT COUNT(*) FROM membros m $joins WHERE $where", $params)->fetchColumn();
        $page = min($page, max(1, (int) ceil($filtered / MP_PAGE_SIZE)));
        $offset = ($page - 1) * MP_PAGE_SIZE;
        $order = $orders[$sort];
        // A numeração é calculada ANTES dos filtros. Os dois tipos de collation
        // existentes no esquema são explicitados apenas nas comparações.
        $rows = mp_query($pdo, "SELECT m.id, m.numero, m.primeiro_nome, m.ultimo_nome, m.nascimento,
            m.adesao, m.bio, m.genero, m.objetivo,
            l.latitude, l.longitude, l.precisao_m, l.localizacao_ativa, l.visivel, l.origem,
            l.capturada_em, l.recebida_em, l.atualizada_em,
            e.em_background, e.atualizado_em AS app_atualizado_em
            FROM (SELECT id, primeiro_nome, ultimo_nome, nascimento, adesao, bio, genero, objetivo,
                ROW_NUMBER() OVER (ORDER BY adesao ASC, id ASC) AS numero FROM membros) m
            $joins
            LEFT JOIN estado_app_membro e ON e.membro_id = m.id COLLATE utf8mb4_unicode_ci
            WHERE $where ORDER BY $order LIMIT " . MP_PAGE_SIZE . " OFFSET $offset", $params)->fetchAll(PDO::FETCH_ASSOC);
        $photos = [];
        $likes = [];
        if ($rows !== []) {
            $ids = array_column($rows, 'id');
            $in = implode(',', array_fill(0, count($ids), '?'));
            $photoRows = mp_query($pdo, "SELECT membro_id, nome_arquivo FROM fotos_perfil
                WHERE membro_id IN ($in) AND (status = 'completo' OR status IS NULL)
                ORDER BY ordem IS NULL, ordem, id", $ids)->fetchAll(PDO::FETCH_ASSOC);
            foreach ($photoRows as $row) {
                if (count($photos[$row['membro_id']] ?? []) < 6) $photos[$row['membro_id']][] = $row['nome_arquivo'];
            }
            $likeRows = mp_query($pdo, "SELECT DISTINCT mg.membro_id, h.nome FROM membros_gostos mg
                JOIN hobbies h ON h.id = mg.hobbie_id WHERE mg.membro_id IN ($in) ORDER BY h.nome", $ids)->fetchAll(PDO::FETCH_ASSOC);
            foreach ($likeRows as $row) $likes[$row['membro_id']][] = $row['nome'];
        }
        $members = [];
        $today = new DateTimeImmutable('today', new DateTimeZone('UTC'));
        foreach ($rows as $row) {
            $id = (string) $row['id'];
            $born = mp_date($row['nascimento']);
            $age = $born !== null && $born <= $today && $born->format('Y') >= '1900' ? $born->diff($today)->y : null;
            $visibleLocation = (int) $row['localizacao_ativa'] === 1 && (int) $row['visivel'] === 1;
            $members[] = [
                'id' => $id, 'number' => (int) $row['numero'],
                'first' => $row['primeiro_nome'], 'last' => $row['ultimo_nome'], 'age' => $age,
                'joined' => ($joined = mp_date($row['adesao'])) ? $joined->getTimestamp() * 1000 : null,
                'bio' => $row['bio'], 'gender' => $row['genero'], 'objective' => $row['objetivo'],
                'photos' => $photos[$id] ?? [], 'likes' => $likes[$id] ?? [],
                'location' => [
                    'source' => $row['origem'],
                    'lat' => $visibleLocation && $row['latitude'] !== null ? (float) $row['latitude'] : null,
                    'lon' => $visibleLocation && $row['longitude'] !== null ? (float) $row['longitude'] : null,
                    'accuracy' => $row['precisao_m'] !== null ? (float) $row['precisao_m'] : null,
                    'active' => $row['localizacao_ativa'] !== null ? (int) $row['localizacao_ativa'] : null,
                    'visible' => $row['visivel'] !== null ? (int) $row['visivel'] : null,
                    'captured' => mp_iso($row['capturada_em']), 'received' => mp_iso($row['recebida_em']),
                    'updated' => mp_iso($row['atualizada_em']),
                ],
                'app' => [
                    'background' => $row['em_background'] !== null ? (int) $row['em_background'] : null,
                    'updated' => mp_iso($row['app_atualizado_em']),
                ],
            ];
        }
        $pdo->commit();
        return [
            'version' => 2, 'page' => $page,
            'total' => (int) $counts['total'], 'recent' => (int) $counts['recent'],
            'located' => (int) $locationCounts['located'], 'background' => (int) $locationCounts['background'],
            'filtered' => $filtered, 'members' => $members,
        ];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

// HTTP: autenticação independente; a configuração da base só é lida após entrar.
ini_set('display_errors', '0');
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
header('Cache-Control: no-store, no-cache, must-revalidate, private');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header('X-Robots-Tag: noindex, nofollow, noarchive');
$nonce = base64_encode(random_bytes(18));
header("Content-Security-Policy: default-src 'none'; script-src 'nonce-$nonce'; style-src 'nonce-$nonce'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
session_name('MARGOT_TMP_' . substr(hash('sha256', __FILE__), 0, 10));
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
if (!session_start()) {
    http_response_code(503);
    exit('Não foi possível iniciar a sessão do painel. Confirma se o PHP pode guardar sessões.');
}
$_SESSION['mp_csrf'] ??= bin2hex(random_bytes(32));
$method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
$action = mp_string($method === 'POST' ? $_POST : $_GET, 'action');
$authorized = (int) ($_SESSION['mp_until'] ?? 0) > time()
    && hash_equals(MP_ACCESS_HASH, (string) ($_SESSION['mp_key_version'] ?? ''));
$loginError = '';
if ($method === 'POST') {
    if (!hash_equals((string) $_SESSION['mp_csrf'], mp_string($_POST, 'csrf'))) {
        if ($action === 'logout') mp_json(['success' => false, 'message' => 'A sessão expirou. Atualiza a página.'], 403);
        $loginError = 'A página expirou. Tenta novamente.';
        http_response_code(403);
    } elseif ($action === 'login') {
        $now = time();
        $failures = array_values(array_filter((array) ($_SESSION['mp_failures'] ?? []), static fn($t) => is_int($t) && $t > $now - 900));
        if (count($failures) >= 8) {
            $loginError = 'Demasiadas tentativas. Aguarda 15 minutos e tenta novamente.';
            http_response_code(429);
        } elseif (hash_equals(MP_ACCESS_HASH, hash('sha256', mp_string($_POST, 'key')))) {
            session_regenerate_id(true);
            $_SESSION = ['mp_until' => $now + MP_SESSION_SECONDS, 'mp_key_version' => MP_ACCESS_HASH, 'mp_csrf' => bin2hex(random_bytes(32))];
            session_write_close();
            header('Location: ' . rawurlencode(basename(__FILE__)), true, 303);
            exit;
        } else {
            $failures[] = $now;
            $_SESSION['mp_failures'] = $failures;
            $loginError = 'A chave de acesso não está correta.';
            http_response_code(401);
        }
    } elseif ($action === 'logout') {
        $_SESSION = [];
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
        session_destroy();
        mp_json(['success' => true]);
    } else {
        mp_json(['success' => false, 'message' => 'Ação não permitida.'], 405);
    }
} elseif ($method !== 'GET') {
    header('Allow: GET, POST');
    mp_json(['success' => false, 'message' => 'Método não permitido.'], 405);
}

if ($method === 'GET' && $action === 'data') {
    if (!$authorized) mp_json(['success' => false, 'message' => 'A sessão expirou. Reabre esta página e introduz a chave de acesso.'], 401);
    session_write_close();
    try {
        $pdo = mp_database();
        $data = mp_members($pdo, $_GET);
        mp_json(['success' => true, 'data' => $data]);
    } catch (InvalidArgumentException $error) {
        mp_json(['success' => false, 'message' => $error->getMessage()], 422);
    } catch (PDOException $error) {
        $number = (int) ($error->errorInfo[1] ?? 0);
        $detail = in_array($number, [1054, 1146, 1267, 1064], true) ? ' ' . substr((string) ($error->errorInfo[2] ?? ''), 0, 300) : '';
        mp_json(['success' => false, 'message' => 'A base de dados não conseguiu executar a consulta (código ' . ($number ?: $error->getCode()) . ').' . $detail], 500);
    } catch (RuntimeException $error) {
        mp_json(['success' => false, 'message' => $error->getMessage()], 500);
    } catch (Throwable) {
        mp_json(['success' => false, 'message' => 'Não foi possível carregar o painel. Confirma que usas PHP 8.2+ com PDO MySQL e a configuração da Margot.'], 500);
    }
}
$csrf = (string) $_SESSION['mp_csrf'];
session_write_close();
header('Content-Type: text/html; charset=utf-8');
if (!$authorized) {
?>
<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Entrar · Margot membros</title>
<style nonce="<?= mp_h($nonce) ?>">*{box-sizing:border-box}body{margin:0;background:#f4f5f0;color:#244737;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100dvh;display:grid;place-items:center;padding:24px}.box{max-width:430px;width:100%;background:#fff;border:1px solid #dfe5dc;border-radius:18px;padding:36px}.logo{font:bold 40px Georgia,serif;letter-spacing:-2px}.logo span{color:#8a9f44}h1{font:30px Georgia,serif;margin:28px 0 10px}p{color:#6b7865}label{display:block;font-weight:600;font-size:12px;margin:20px 0 7px}input{width:100%;font:inherit;padding:12px;border:1px solid #cad5c5;border-radius:8px}button{margin-top:15px;width:100%;padding:12px;background:#244737;color:white;border:0;border-radius:8px;font:600 15px sans-serif;cursor:pointer}.error{padding:10px 13px;background:#fff0d9;border:1px solid #e8c38c;border-radius:8px;color:#71552a;font-size:13px}small{display:block;font-size:11px;color:#7c8776;margin-top:24px}input:focus-visible,button:focus-visible{outline:3px solid #b8994b;outline-offset:3px}</style></head>
<body><main class="box"><div class="logo">margot<span>.</span></div><h1>Painel de membros.</h1><p>Introduz a chave para consultar a comunidade.</p>
<?php if ($loginError !== ''): ?><p role="alert" class="error"><?= mp_h($loginError) ?></p><?php endif; ?>
<form method="post"><input type="hidden" name="action" value="login"><input type="hidden" name="csrf" value="<?= mp_h($csrf) ?>"><label for="key">Chave de acesso</label><input id="key" name="key" type="password" required maxlength="200" autocomplete="current-password" autofocus><button type="submit">Entrar no painel →</button></form><small>Acesso privado · sessão válida durante 8 horas.</small></main></body></html>
<?php
    exit;
}
$basePath = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/margot-painel.php'))), '/.');
?>
<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="margot-csrf" content="<?= mp_h($csrf) ?>"><meta name="margot-photos" content="<?= mp_h($basePath . '/imagens/fotos-perfil/') ?>"><title>Membros · Margot</title></head><body><noscript>Ativa o JavaScript para abrir o painel.</noscript>
<script nonce="<?= mp_h($nonce) ?>">
(() => {
  'use strict';
  const CONFIG = Object.freeze({
    fotos: document.querySelector('meta[name="margot-photos"]').content,
    intervaloMs: 30000, porPagina: 12
  });
  const csrf = document.querySelector('meta[name="margot-csrf"]').content;
  const nonce = document.currentScript?.nonce || '';
  const endpoint = new URL(location.href);
  endpoint.search = ''; endpoint.hash = '';
  const photoBase = new URL(CONFIG.fotos, location.origin);
  const lifetime = new AbortController();
  const host = document.createElement('div');
  host.id = 'margot-members-console';
  const root = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const on = (el, event, fn) => el.addEventListener(event, fn, { signal: lifetime.signal });
  const $ = id => root.getElementById(id);
  const node = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = String(text);
    if (cls) el.className = cls;
    return el;
  };
  const state = {
    page: 1, q: '', source: 'all', from: '', to: '', sort: 'newest',
    auto: true, busy: false, closed: false, sequence: 0, members: [],
    total: 0, filtered: 0, timer: null, debounce: null, controller: null,
    selected: null, trigger: null
  };

  const style = document.createElement('style');
  style.nonce = nonce;
  style.textContent = `
    :host{all:initial;display:block;position:fixed;inset:0;z-index:2147483647;color:#192b29;background:#f4f5f0;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.5;color-scheme:light}
    *,*::before,*::after{box-sizing:border-box}button,input,select{font:inherit}button,a,input,select{touch-action:manipulation}button{cursor:pointer}button:disabled{cursor:default;opacity:.45}a{color:#24634c}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #bf8126;outline-offset:3px}
    .shell{height:100dvh;overflow:auto}.wrap{max-width:1520px;margin:auto;padding:0 44px}.top{background:#fff;border-bottom:1px solid #dfe5dc}.top-inner{display:flex;justify-content:space-between;align-items:center;gap:16px;min-height:86px}.brand{font-family:Georgia,serif;font-size:35px;font-weight:bold;letter-spacing:-2px;line-height:1}.brand-dot{color:#8a9f44}.brand small{display:inline-block;margin-left:22px;padding-left:22px;border-left:1px solid #d9dfd7;font:11px/1.4 sans-serif;color:#68766a;letter-spacing:1.8px;text-transform:uppercase;vertical-align:middle}.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.button{border:1px solid #d5ded4;border-radius:9px;background:#fff;color:#244737;padding:9px 15px;font-weight:600}.button.primary{background:#244737;color:#fff;border-color:#244737}.button.subtle{background:transparent}.intro{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;padding:32px 0 22px}.eyebrow{text-transform:uppercase;letter-spacing:2px;color:#647260;font-size:10px;font-weight:700;margin:0 0 8px}h1{font-family:Georgia,serif;font-size:42px;letter-spacing:-1.5px;font-weight:normal;line-height:1.1;margin:0 0 9px}p{margin:0}.muted{color:#6c786c}.live{display:flex;align-items:center;gap:8px;font-size:12px;white-space:nowrap}.dot{width:7px;height:7px;border-radius:100%;background:#66865b;flex-shrink:0}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:0 0 24px}.stat{padding:17px 21px;background:#fff;border:1px solid #dfe5dc;border-radius:13px}.stat:first-child{background:#244737;color:#fff;border-color:#244737}.stat span{font-size:11px;letter-spacing:.6px;text-transform:uppercase}.stat strong{display:block;font-family:Georgia,serif;font-size:34px;font-weight:normal;line-height:1.35}.stat small{font-size:11px;opacity:.7}.filters{background:#fff;border:1px solid #dfe5dc;border-radius:13px;padding:18px;display:grid;grid-template-columns:2fr 1.1fr 1fr 1fr 1.3fr auto;gap:12px;align-items:end}.field{display:flex;flex-direction:column;gap:6px;min-width:0}.field label{font-size:10px;letter-spacing:.7px;font-weight:700;text-transform:uppercase;color:#677262}.field input,.field select{width:100%;min-height:41px;border:1px solid #dfe5dc;border-radius:7px;background:#fafbf8;color:#20392d;padding:8px 10px;min-width:0}.filters .button{min-height:41px}.resultbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 0 16px}.resultbar strong{font-size:13px}.resultbar small{color:#6c786c;font-size:11px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;padding-bottom:24px}.card{background:#fff;border:1px solid #dfe5dc;border-radius:14px;overflow:hidden;display:flex;flex-direction:column}.portrait{position:relative;height:190px;background:linear-gradient(135deg,#dce5d5,#efede1);display:grid;place-items:center;overflow:hidden;color:#8b9b80}.portrait img{width:100%;height:100%;object-fit:cover;position:absolute;inset:0}.initials{font:58px Georgia,serif}.photo-note{position:absolute;bottom:11px;right:12px;font-size:10px;padding:3px 8px;border-radius:5px;background:#ffffffed;color:#536344}.number{position:absolute;top:13px;left:13px;padding:3px 10px;border-radius:6px;background:#ffffffed;font-size:11px;font-weight:700;color:#244737}.origin{font-size:10px;font-weight:600;display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:5px;background:#f0f3ee;color:#516449;white-space:nowrap}.origin.bg{background:#f4eddb;color:#806020}.origin.fg{background:#eaf2eb;color:#2a694d}.origin.unknown{background:#f0f0ee;color:#767871}.portrait .origin{position:absolute;top:13px;right:13px}.card-body{padding:17px 17px 13px;flex:1;display:flex;flex-direction:column}.name{font:24px/1.2 Georgia,serif;letter-spacing:-.5px;margin:0 0 6px;overflow-wrap:anywhere}.age{color:#87927f;font-size:19px}.joined{font-size:10px;color:#7a8478}.bio{margin:12px 0;color:#5b675a;font-size:12px;min-height:36px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere}.tags{display:flex;gap:5px;flex-wrap:wrap;margin:0 0 15px}.tag{font-size:10px;color:#56614e;background:#f3f4ee;border-radius:4px;padding:3px 7px;overflow-wrap:anywhere}.location{margin-top:auto;padding-top:12px;border-top:1px solid #edf0e9;font-size:11px;color:#64745d}.location strong{display:block;font-size:11px;font-weight:600;color:#455a3e}.location small{font-size:10px}.card-bottom{display:flex;justify-content:space-between;align-items:center;gap:7px;padding:11px 17px;background:#fcfdf9;border-top:1px solid #edf0e9}.card-bottom a{font-size:10px;text-decoration:none}.detail-button{border:0;background:transparent;padding:2px 0;color:#244737;font-size:11px;font-weight:700}.footer{display:flex;justify-content:space-between;align-items:center;gap:16px;border-top:1px solid #dce3d6;padding:20px 0 30px;font-size:11px;color:#78816f}.pagination{display:flex;align-items:center;gap:12px}.notice{border:1px solid #d9bf88;background:#fff6df;color:#715c2e;padding:12px 16px;border-radius:9px;margin:17px 0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.notice[hidden],.empty[hidden]{display:none}.empty{text-align:center;padding:60px 20px;background:#fff;border:1px dashed #d4ddcf;border-radius:14px;margin-bottom:24px}.empty strong{display:block;font:26px Georgia,serif;margin-bottom:8px}.auto{font-size:11px;color:#64725d;display:flex;gap:6px;align-items:center}.auto input{accent-color:#244737}.fineprint{font-size:10px;max-width:640px;color:#78816f;padding-bottom:18px}.dialog{border:1px solid #d9e1d3;border-radius:18px;padding:0;width:min(820px,94vw);max-height:90dvh;background:#fff;color:#22392d;box-shadow:0 24px 100px #0004}.dialog::backdrop{background:#13291dcc;backdrop-filter:blur(3px)}.detail-header{display:flex;align-items:center;justify-content:space-between;padding:22px 26px;border-bottom:1px solid #e4e9df}.detail-header h2{margin:0;font:29px Georgia,serif}.detail-main{padding:24px 26px}.gallery{display:flex;gap:10px;overflow:auto;margin-bottom:23px}.gallery a{min-width:145px;width:145px;height:165px;display:grid;place-items:center;background:#edf0e8;border-radius:10px;overflow:hidden;font-size:12px}.gallery img{width:100%;height:100%;object-fit:cover}.detail-bio{white-space:pre-wrap;overflow-wrap:anywhere;color:#5e6c56;margin:12px 0 16px}.details{display:grid;grid-template-columns:1fr 1fr;gap:0 24px;margin:20px 0}.details div{padding:13px 0;border-top:1px solid #e9ede5;min-width:0}.details dt{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#79866e}.details dd{font-size:13px;margin:4px 0 0;overflow-wrap:anywhere}.dialog-note{font-size:11px;color:#7a856f;background:#f5f7f0;padding:13px;border-radius:9px}.dialog-links{display:flex;gap:16px;align-items:center;margin-top:18px;font-size:12px}.busy .dot{animation:pulse 1s infinite}@keyframes pulse{50%{opacity:.2}}
    @media(max-width:1200px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}.filters{grid-template-columns:2fr 1fr 1fr}.wrap{padding:0 28px}}
    @media(max-width:800px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.stats{grid-template-columns:repeat(2,1fr)}.filters{grid-template-columns:1fr 1fr}.intro{display:block}.live{margin-top:15px}.brand small{display:none}.wrap{padding:0 18px}.top-inner{min-height:74px}.actions .button{padding:8px 11px}.intro h1{font-size:35px}.footer{flex-direction:column;align-items:flex-start}.resultbar small{max-width:155px;text-align:right}}
    @media(max-width:480px){.grid{grid-template-columns:1fr}.portrait{height:240px}.filters{grid-template-columns:1fr 1fr}.field:first-child{grid-column:1/-1}.actions{gap:6px}.stats{gap:9px}.stat{padding:13px 15px}.stat strong{font-size:29px}.details{grid-template-columns:1fr}.top .button{font-size:11px}.brand{font-size:30px}.detail-main,.detail-header{padding:20px}.resultbar{align-items:flex-start}}
    @media(prefers-reduced-motion:reduce){*{animation:none!important}}
  `;
  root.append(style);
  const shell = node('section', undefined, 'shell');
  shell.setAttribute('aria-label', 'Painel privado de membros da Margot');
  shell.innerHTML = `
    <header class="top"><div class="wrap top-inner"><div class="brand">margot<span class="brand-dot">.</span><small>O teu círculo<br>Painel de membros</small></div><div class="actions"><button id="refresh" class="button primary">↻ Atualizar</button><button id="close" class="button subtle">Sair ×</button></div></div></header>
    <main class="wrap"><section class="intro"><div><p class="eyebrow">Comunidade · painel privado</p><h1>As pessoas da Margot.</h1><p class="muted">Cada rosto, uma história. Todos os membros num só lugar.</p></div><div class="live"><span class="dot"></span><span id="status" role="status" aria-live="polite">A ligar à base de dados…</span></div></section>
    <div class="stats"><div class="stat"><span>Total de membros</span><strong id="total">—</strong><small>Toda a comunidade</small></div><div class="stat"><span>Novos em 7 dias</span><strong id="recent">—</strong><small>Desde há sete dias</small></div><div class="stat"><span>Com localização</span><strong id="located">—</strong><small>Ativa e visível no último registo</small></div><div class="stat"><span>Origem background</span><strong id="background">—</strong><small>Última origem registada</small></div></div>
    <form id="filters" class="filters"><div class="field"><label for="q">Pesquisar pessoas</label><input id="q" type="search" maxlength="100" placeholder="Nome, biografia ou gosto…" autocomplete="off"></div><div class="field"><label for="source">Última localização</label><select id="source"><option value="all">Todas as origens</option><option value="foreground">Foreground</option><option value="background">Background</option><option value="missing">Sem coordenadas disponíveis</option></select></div><div class="field"><label for="from">Adesão desde</label><input type="date" id="from"></div><div class="field"><label for="to">Adesão até</label><input type="date" id="to"></div><div class="field"><label for="sort">Organizar por</label><select id="sort"><option value="newest">Adesão · mais recentes</option><option value="oldest">Adesão · mais antigos</option><option value="name">Nome · A–Z</option><option value="location">Localização · mais recente</option></select></div><button id="clear" type="button" class="button">Limpar</button></form>
    <div id="notice" class="notice" role="alert" hidden></div><div class="resultbar"><strong id="results">A carregar membros…</strong><label class="auto"><input id="auto" type="checkbox" checked> Atualizar a cada 30 s</label></div><div id="grid" class="grid" aria-busy="true"></div><div id="empty" class="empty" hidden><strong>Ninguém por aqui, ainda.</strong><p class="muted">Experimenta alterar os filtros de pesquisa.</p></div>
    <footer class="footer"><span id="page-info">12 membros por página</span><div class="pagination"><button id="previous" class="button" disabled>← Anterior</button><span id="page">Página 1</span><button id="next" class="button" disabled>Seguinte →</button></div></footer><p class="fineprint"># = posição por data de adesão entre os membros existentes. Os filtros mantêm esta posição; eliminar contas antigas pode renumerá-la. Em adesões simultâneas, o ID desempata a ordem. Datas no teu fuso horário. Último registo não significa presença online.</p>
    </main><dialog id="detail" class="dialog" aria-labelledby="detail-title"><div class="detail-header"><h2 id="detail-title">Perfil do membro</h2><button id="detail-close" class="button" aria-label="Fechar perfil">Fechar ×</button></div><div id="detail-main" class="detail-main"></div></dialog>`;
  root.append(shell);

  function localDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
  }
  async function fetchMembers(snapshot, signal) {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({ action: 'data', page: String(snapshot.page),
      q: snapshot.q, source: snapshot.source, sort: snapshot.sort }).toString();
    const from = localDate(snapshot.from), to = localDate(snapshot.to);
    if (snapshot.from && !from || snapshot.to && !to) throw new Error('Indica datas válidas para filtrar a adesão.');
    if (from && to && from > to) throw new Error('A data inicial deve ser anterior ou igual à data final.');
    if (from) url.searchParams.set('from', String(Math.floor(from.getTime() / 1000)));
    if (to) { to.setDate(to.getDate() + 1); url.searchParams.set('until', String(Math.floor(to.getTime() / 1000))); }
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json' }, signal });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('O servidor não devolveu os dados do painel. Confirma que o ficheiro PHP está na pasta public e abre este endereço novamente.');
    }
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || 'Não foi possível carregar os membros.');
    const result = payload.data;
    if (!result || result.version !== 2 || !Array.isArray(result.members)) throw new Error('Resposta inesperada do painel.');
    return result;
  }
  const nf = new Intl.NumberFormat('pt-PT');
  const fullDate = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'medium' });
  const shortDate = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  const validDate = value => {
    if (value === null || value === undefined || value === '') return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  };
  const dateLabel = (value, short = false) => {
    const d = validDate(value);
    return d ? (short ? shortDate : fullDate).format(d) : 'Sem registo';
  };
  const name = m => [m.first, m.last].filter(Boolean).join(' ') || 'Sem nome';
  const initials = m => [m.first, m.last].filter(Boolean).map(t => [...t.trim()][0] || '').join('').toUpperCase();
  const sourceLabel = m => ({ foreground: 'Foreground', background: 'Background' })[m.location.source] || 'Sem origem';
  const sourceClass = m => ({ foreground: 'fg', background: 'bg' })[m.location.source] || 'unknown';
  function coordinates(m) {
    const l = m.location;
    if (l.lat === null || l.lon === null || l.lat === '' || l.lon === '' || Number(l.active) !== 1 || Number(l.visible) !== 1) return null;
    const lat = Number(l.lat), lon = Number(l.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
  }
  function photoURL(filename) {
    if (typeof filename !== 'string' || !filename || /[/\\\u0000-\u001f]/.test(filename) || filename === '.' || filename === '..') return null;
    const url = new URL(encodeURIComponent(filename), photoBase);
    return url.origin === photoBase.origin && url.pathname.startsWith(photoBase.pathname) ? url.href : null;
  }
  function link(label, url) {
    const a = node('a', label);
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.referrerPolicy = 'no-referrer';
    return a;
  }
  function image(url, label, failure) {
    const img = node('img');
    img.alt = label; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { img.remove(); failure?.(); }, { once: true });
    img.src = url;
    return img;
  }
  function mapLink(m) {
    const coords = coordinates(m);
    return coords ? link('Abrir mapa ↗', 'https://www.openstreetmap.org/?mlat=' + coords[0] + '&mlon=' + coords[1] + '#map=16/' + coords[0] + '/' + coords[1]) : null;
  }
  function renderCard(m) {
    const card = node('article', undefined, 'card');
    const portrait = node('div', undefined, 'portrait');
    portrait.append(node('span', initials(m) || 'M', 'initials'));
    const url = photoURL(m.photos[0]);
    const photoNote = node('span', url ? 'Foto indisponível' : 'Sem fotografia', 'photo-note');
    if (url) portrait.append(image(url, 'Fotografia de ' + name(m), () => portrait.append(photoNote)));
    else portrait.append(photoNote);
    portrait.append(node('span', '#' + nf.format(m.number), 'number'), node('span', sourceLabel(m), 'origin ' + sourceClass(m)));
    const body = node('div', undefined, 'card-body');
    const title = node('h2', name(m), 'name');
    if (m.age !== null) title.append(node('span', ', ' + m.age, 'age'));
    body.append(title, node('p', 'Adesão · ' + dateLabel(m.joined, true), 'joined'), node('p', m.bio || 'Ainda sem biografia.', 'bio'));
    const tags = node('div', undefined, 'tags');
    m.likes.slice(0, 3).forEach(h => tags.append(node('span', h, 'tag')));
    if (m.likes.length > 3) tags.append(node('span', '+' + (m.likes.length - 3), 'tag'));
    if (!m.likes.length) tags.append(node('span', 'Gostos por preencher', 'tag'));
    body.append(tags);
    const loc = node('div', undefined, 'location');
    const coords = coordinates(m);
    loc.append(node('strong', coords ? coords.map(c => c.toFixed(5)).join(', ') : 'Sem coordenadas disponíveis'));
    const time = m.location.captured || m.location.updated;
    loc.append(node('small', (m.location.captured ? 'Captura · ' : 'Registo · ') + dateLabel(time)));
    body.append(loc);
    const bottom = node('div', undefined, 'card-bottom');
    const detail = node('button', 'Ver ficha completa →', 'detail-button');
    detail.type = 'button'; detail.dataset.member = m.id;
    bottom.append(detail);
    if (url) bottom.append(link('Abrir foto ↗', url));
    card.append(portrait, body, bottom);
    return card;
  }
  function renderDetail(m) {
    $('detail-title').textContent = '#' + nf.format(m.number) + ' · ' + name(m) + (m.age !== null ? ', ' + m.age : '');
    const content = $('detail-main');
    content.replaceChildren();
    const gallery = node('div', undefined, 'gallery');
    m.photos.forEach((f, i) => {
      const url = photoURL(f);
      if (!url) return;
      const a = link('', url);
      a.append(image(url, 'Foto ' + (i + 1) + ' de ' + name(m), () => { a.textContent = 'Abrir foto ' + (i + 1) + ' ↗'; }));
      gallery.append(a);
    });
    if (gallery.childElementCount) content.append(gallery);
    content.append(node('span', sourceLabel(m), 'origin ' + sourceClass(m)), node('p', m.bio || 'Ainda sem biografia.', 'detail-bio'));
    const tags = node('div', undefined, 'tags');
    m.likes.forEach(h => tags.append(node('span', h, 'tag')));
    if (!m.likes.length) tags.append(node('span', 'Sem gostos preenchidos', 'tag'));
    content.append(tags);
    const coords = coordinates(m);
    const flag = v => v === null || v === undefined ? 'Sem registo' : Number(v) === 1 ? 'Sim' : 'Não';
    const appState = m.app.background === null ? 'Sem registo' : Number(m.app.background) === 1 ? 'Background' : 'Foreground';
    const fields = [
      ['Adesão', dateLabel(m.joined)], ['Número de ordem', '#' + nf.format(m.number)],
      ['Objetivo', m.objective || 'Por preencher'], ['Género', ({ M: 'Masculino', F: 'Feminino', P: 'Personalizado' })[m.gender] || 'Por preencher'],
      ['Últimas coordenadas disponíveis', coords ? coords.map(c => c.toFixed(7)).join(', ') : 'Não disponíveis'],
      ['Precisão da amostra', coords && m.location.accuracy !== null ? nf.format(Number(m.location.accuracy)) + ' m' : 'Sem registo'],
      ['Origem da última localização', sourceLabel(m)], ['Hora de captura', dateLabel(m.location.captured)],
      ['Hora de receção no servidor', dateLabel(m.location.received)], ['Atualização do registo', dateLabel(m.location.updated)],
      ['Localização ativa', flag(m.location.active)], ['Visível', flag(m.location.visible)],
      ['Último estado da app', appState], ['Estado da app atualizado em', dateLabel(m.app.updated)], ['ID da conta', m.id]
    ];
    const dl = node('dl', undefined, 'details');
    fields.forEach(([label, value]) => { const item = node('div'); item.append(node('dt', label), node('dd', value)); dl.append(item); });
    content.append(dl);
    content.append(node('p', 'Estes são os últimos dados guardados, não uma localização em tempo real. A origem da amostra e o estado da app são registos independentes. Coordenadas inativas ou invisíveis não são mostradas. A estrutura fornecida não tem um campo «Aura».', 'dialog-note'));
    const links = node('div', undefined, 'dialog-links');
    const map = mapLink(m);
    if (map) links.append(map, node('span', 'O mapa só abre quando clicas.', 'muted'));
    content.append(links);
  }
  function render(data) {
    state.members = data.members; state.total = data.total; state.filtered = data.filtered;
    ['total', 'recent', 'located', 'background'].forEach(k => { $(k).textContent = nf.format(data[k]); });
    $('grid').replaceChildren(...data.members.map(renderCard));
    $('empty').hidden = data.members.length !== 0;
    $('results').textContent = nf.format(data.filtered) + (data.filtered === 1 ? ' membro encontrado' : ' membros encontrados') + (data.filtered !== data.total ? ' · de ' + nf.format(data.total) : '');
    const pages = Math.max(1, Math.ceil(data.filtered / CONFIG.porPagina));
    $('page').textContent = 'Página ' + state.page + ' de ' + pages;
    $('page-info').textContent = data.members.length ? 'A mostrar ' + ((state.page - 1) * CONFIG.porPagina + 1) + '–' + ((state.page - 1) * CONFIG.porPagina + data.members.length) + ' de ' + nf.format(data.filtered) : 'Sem resultados';
    $('previous').disabled = state.page <= 1;
    $('next').disabled = state.page >= pages;
    if (state.selected) {
      const selected = data.members.find(m => m.id === state.selected);
      if (selected) renderDetail(selected);
      else { $('detail').close(); state.selected = null; }
    }
  }
  function clearPersonalData() {
    state.members = []; state.selected = null;
    $('grid').replaceChildren(); $('detail-main').replaceChildren(); $('detail').close();
    ['total', 'recent', 'located', 'background'].forEach(k => { $(k).textContent = '—'; });
    $('empty').hidden = true; $('results').textContent = 'Não foi possível carregar os dados.';
    $('previous').disabled = true; $('next').disabled = true;
  }
  function schedule() {
    clearTimeout(state.timer);
    if (state.auto && !state.closed && !document.hidden) state.timer = setTimeout(refresh, CONFIG.intervaloMs);
  }
  async function refresh() {
    if (state.closed) return;
    clearTimeout(state.timer);
    state.controller?.abort();
    const controller = new AbortController(); state.controller = controller;
    const sequence = ++state.sequence;
    const snapshot = { ...state };
    state.busy = true; shell.classList.add('busy'); $('grid').setAttribute('aria-busy', 'true');
    $('status').textContent = 'A consultar a base de dados…'; $('notice').hidden = true;
    const timeout = setTimeout(() => controller.abort('timeout'), 25000);
    let retryPage = false;
    try {
      const result = await fetchMembers(snapshot, controller.signal);
      if (state.closed || sequence !== state.sequence) return;
      const pages = Math.max(1, Math.ceil(result.filtered / CONFIG.porPagina));
      if (state.page > pages) { state.page = pages; retryPage = true; return; }
      const expected = Math.min(CONFIG.porPagina, Math.max(0, result.filtered - (state.page - 1) * CONFIG.porPagina));
      if (result.members.length !== expected) throw new Error('O resultado veio incompleto. Clica em Atualizar para voltar a consultar a base.');
      render(result);
      $('status').textContent = 'Atualizado às ' + new Intl.DateTimeFormat('pt-PT', { timeStyle: 'medium' }).format(new Date());
    } catch (error) {
      if (state.closed || sequence !== state.sequence || controller.signal.aborted && controller.signal.reason !== 'timeout') return;
      clearPersonalData();
      state.auto = false; $('auto').checked = false;
      $('notice').textContent = controller.signal.reason === 'timeout' ? 'O pedido demorou demasiado. A atualização automática foi pausada. Clica em Atualizar para tentar novamente.' : (error.message || 'Falha na ligação ao painel.') + '\nA atualização automática foi pausada. Depois de resolveres, clica em Atualizar.';
      $('notice').hidden = false; $('status').textContent = 'Atualização interrompida';
    } finally {
      clearTimeout(timeout);
      if (!state.closed && sequence === state.sequence) {
        state.busy = false; shell.classList.remove('busy'); $('grid').setAttribute('aria-busy', 'false');
        if (retryPage) queueMicrotask(refresh); else schedule();
      }
    }
  }
  function close() {
    if (state.closed) return;
    state.closed = true; ++state.sequence;
    clearTimeout(state.timer); clearTimeout(state.debounce); state.controller?.abort(); lifetime.abort();
    state.members = []; state.selected = null; host.remove();
  }
  function changeFilters() {
    for (const key of ['q', 'source', 'from', 'to', 'sort']) state[key] = $(key).value;
    state.page = 1;
    clearTimeout(state.debounce); clearTimeout(state.timer);
    state.controller?.abort(); ++state.sequence;
    state.debounce = setTimeout(refresh, 350);
  }
  on($('filters'), 'submit', e => { e.preventDefault(); clearTimeout(state.debounce); refresh(); });
  on($('q'), 'input', changeFilters);
  ['source', 'from', 'to', 'sort'].forEach(k => on($(k), 'change', changeFilters));
  on($('clear'), 'click', () => { $('filters').reset(); changeFilters(); });
  on($('refresh'), 'click', () => { clearTimeout(state.debounce); refresh(); });
  on($('close'), 'click', async () => {
    state.auto = false; clearTimeout(state.timer); clearTimeout(state.debounce);
    state.controller?.abort(); ++state.sequence; clearPersonalData();
    try {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        body: new URLSearchParams({ action: 'logout', csrf }) });
      if (!response.ok) throw new Error('Não foi possível terminar a sessão. Atualiza a página e tenta novamente.');
      close(); location.replace(endpoint.href);
    } catch (error) { $('notice').textContent = error.message; $('notice').hidden = false; }
  });
  on($('auto'), 'change', () => { state.auto = $('auto').checked; if (state.auto) refresh(); else schedule(); });
  on($('previous'), 'click', () => { if (state.page > 1) { --state.page; refresh(); shell.scrollTo({ top: 0 }); } });
  on($('next'), 'click', () => { if (state.page * CONFIG.porPagina < state.filtered) { ++state.page; refresh(); shell.scrollTo({ top: 0 }); } });
  on($('grid'), 'click', e => {
    const trigger = e.target.closest('button[data-member]');
    const member = trigger && state.members.find(m => m.id === trigger.dataset.member);
    if (!member) return;
    state.selected = member.id; state.trigger = trigger; renderDetail(member); $('detail').showModal();
  });
  on($('detail-close'), 'click', () => $('detail').close());
  on($('detail'), 'close', () => { state.selected = null; $('detail-main').replaceChildren(); state.trigger?.focus(); state.trigger = null; });
  on(document, 'visibilitychange', () => { clearTimeout(state.timer); if (!document.hidden && state.auto) refresh(); });
  on(window, 'pagehide', close);
  refresh();
})();

</script></body></html>
