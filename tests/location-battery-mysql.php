<?php
declare(strict_types=1);
// Integration check: uses only a connection-local temporary table, never real member rows.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$root=dirname(__DIR__);
require $root.'/vendor/autoload.php';
require is_file($root.'/config/config.local.php')?$root.'/config/config.local.php':$root.'/config/config.php';
$db=new App\CMS\Database($dsn,$username,$password);
unset($dsn,$username,$password);
if ($db->getAttribute(PDO::ATTR_DRIVER_NAME)!=='mysql') throw new RuntimeException('Este teste requer MySQL/MariaDB.');
function verifyBattery(bool $condition,string $name):void {
    if (!$condition) throw new RuntimeException('FAIL: '.$name);
    echo 'PASS: '.$name.PHP_EOL;
}
$db->exec('CREATE TEMPORARY TABLE localizacao_membro LIKE localizacao_membro');
try {
    $location=new App\CMS\Location($db);
    $id='00000000-0000-4000-8000-000000000001';
    $base=gmdate('Y-m-d H:i:s',time()-60);
    $row=fn()=>$db->query('SELECT * FROM localizacao_membro')->fetch();
    verifyBattery($location->saveBackground($id,37,-25,5,true,true,$base.'.100'),'primeiro envio');
    $first=$row();
    verifyBattery(!$location->saveBackground($id,39,-27,5,true,true,$base.'.099','foreground') && $row()===$first,'posição antiga não substitui nova');
    verifyBattery(!$location->saveBackground($id,39,-27,5,true,true,$base.'.100') && $row()===$first,'duplicado não renova validade');
    verifyBattery($location->saveBackground($id,37.1,-25.1,5,true,true,$base.'.101') && abs((float)$row()['latitude']-37.1)<0.000001,'milissegundos preservam ordem');
    $location->saveBackground($id,null,null,null,false,false);$hidden=$row();
    verifyBattery(!$location->saveBackground($id,39,-27,5,true,true,$base.'.102') && $row()===$hidden && (int)$hidden['visivel']===0,'invisibilidade vence pedido antigo em voo');
    verifyBattery($location->saveBackground($id,37.2,-25.2,5,true,true) && $row()['capturada_em']===null,'build anterior continua compatível');
    $location->disable($id);verifyBattery((int)$row()['visivel']===0,'desativação');
    echo "OK: integração MySQL/MariaDB. Nenhum registo real foi alterado.\n";
} finally { $db->exec('DROP TEMPORARY TABLE localizacao_membro'); }
