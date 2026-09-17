<?php
namespace App\Email {
    // Test double de SMTP: os controladores são reais, nenhum email sai deste teste.
    final class Email {
        public function __construct(array $config) {}
        public function sendEmail(string $from, string $to, string $subject, string $body): bool {
            if (($_GET['mail_fail'] ?? '') === '1') throw new \RuntimeException('Falha SMTP simulada');
            return true;
        }
    }
}
namespace {
    if (getenv('MARGOT_ISOLATED_TESTS') !== '1') { http_response_code(404); exit; }
    define('TEST_SOURCE_ROOT', dirname(__DIR__));
    define('APP_ROOT', sys_get_temp_dir().'/margot-http-'.bin2hex(random_bytes(12)));
    define('DOC_ROOT', '/'); define('DOMAIN','https://margot.test');
    mkdir(APP_ROOT, 0700);
    register_shutdown_function(static function () {
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(APP_ROOT, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($files as $file) { $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname()); }
        rmdir(APP_ROOT);
    });
    require TEST_SOURCE_ROOT.'/vendor/autoload.php';
    require TEST_SOURCE_ROOT.'/src/functions.php'; require TEST_SOURCE_ROOT.'/src/http.php'; require TEST_SOURCE_ROOT.'/src/rate-limit.php';
    require __DIR__.'/TestDatabase.php';
    $db = new TestDatabase();
    $cms = new class($db) extends App\CMS\CMS {
        public function __construct($db) { $this->db=$db; }
    };
    $a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; $b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    foreach ([$a,$b] as $i=>$memberId) {
        $db->runSQL('INSERT INTO membros (id,primeiro_nome,ultimo_nome,nascimento,genero,email,password,nome_seo,email_verificado_em)
            VALUES (:id,:name,\'Teste\',\'1990-01-01\',\'M\',:email,:password,\'teste\',:verified)',
            ['id'=>$memberId,'name'=>'Pessoa '.$i,'email'=>"pessoa$i@example.test",'password'=>password_hash('Senha1234',PASSWORD_DEFAULT),
             'verified'=>isset($_GET['unverified'])?null:'2026-01-01']);
    }
    if (!isset($_GET['unconnected'])) $cms->getMemberConnection()->connect($a,$b);
    if (isset($_GET['blocked'])) $cms->getSafety()->block($b,$a);
    $cms->getMessage()->send($b,$a,'Mensagem de teste',[]);
    $session=$cms->getSession(); $session->id=isset($_GET['guest'])?'':$a;
    $_SESSION['id']=$session->id; $_SESSION['csrf_token']=str_repeat('c',64);
    $cookie=$cms->getCookie(); $push_config=[]; $email_config=['admin_email'=>'noreply@example.test'];
    $purpose=$_GET['purpose']??'background_location';
    $db->runSQL('INSERT INTO token (token,membro_id,validade,proposito) VALUES (:token,:id,:expires,:purpose)',
        ['token'=>hash('sha256',str_repeat('a',64)),'id'=>$a,'expires'=>'2099-01-01','purpose'=>$purpose]);
    $twig = new class {
        public function render($template,$data=[]) { return json_encode(['template'=>$template,'data'=>$data]); }
    };
    $page=basename((string)($_GET['route']??''));
    $id=$_GET['target']??null;
    if (!is_file(TEST_SOURCE_ROOT.'/src/pages/'.$page.'.php')) { http_response_code(404); exit; }
    require TEST_SOURCE_ROOT.'/src/request-guards.php';
    require TEST_SOURCE_ROOT.'/src/pages/'.$page.'.php';
}
