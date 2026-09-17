<?php
// Interceta só o transporte HTTP do namespace. Não contacta Apple nem Google.
namespace App\CMS {
    final class TestPushTransport {
        public static array $responses = [];
        public static array $requests = [];
    }
    function curl_init($url) { return (object)['url'=>$url, 'options'=>[], 'response'=>null]; }
    function curl_setopt_array($curl, $options) { $curl->options=$options; return true; }
    function curl_exec($curl) {
        TestPushTransport::$requests[]=['url'=>$curl->url, 'options'=>$curl->options];
        $curl->response=array_shift(TestPushTransport::$responses);
        if (!$curl->response) { throw new \RuntimeException('Pedido HTTP inesperado no teste push'); }
        return $curl->response['network_error'] ? false : $curl->response['body'];
    }
    function curl_errno($curl) { return $curl->response['network_error']; }
    function curl_getinfo($curl, $option) { return $curl->response['status']; }
    function curl_close($curl) {}
}
namespace {
    (function () {
        $ec = openssl_pkey_new(['config'=>__DIR__.'/openssl.cnf','private_key_type'=>OPENSSL_KEYTYPE_EC,'curve_name'=>'prime256v1','private_key_bits'=>2048]);
        $rsa = openssl_pkey_new(['config'=>__DIR__.'/openssl.cnf','private_key_type'=>OPENSSL_KEYTYPE_RSA,'private_key_bits'=>2048]);
        check($ec !== false && $rsa !== false, 'Chaves de teste APNs e FCM geradas');
        openssl_pkey_export($ec, $ecPem, null, ['config'=>__DIR__.'/openssl.cnf']);
        openssl_pkey_export($rsa, $rsaPem, null, ['config'=>__DIR__.'/openssl.cnf']);
        $keyFile = tempnam(sys_get_temp_dir(), 'margot-apns-test-');
        $accountFile = tempnam(sys_get_temp_dir(), 'margot-fcm-test-');
        file_put_contents($keyFile,$ecPem);
        file_put_contents($accountFile,json_encode(['project_id'=>'test-project','client_email'=>'test@example.test',
            'private_key'=>$rsaPem,'token_uri'=>'https://oauth2.googleapis.com/token']));
        $config=['enabled'=>true,'apns'=>['team_id'=>'TESTTEAM','key_id'=>'TESTKEY','private_key_file'=>$keyFile,
            'topic'=>'com.margot.app'],'fcm'=>['service_account_file'=>$accountFile]];
        $response=static fn($status,$data=[],$error=0)=>['status'=>$status,'body'=>json_encode($data),'network_error'=>$error];
        $job=['plataforma'=>'ios','ambiente'=>'production','token'=>str_repeat('a',64),'titulo'=>'Teste',
            'corpo'=>'Olá','tipo'=>'message','url'=>'/messages/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'dados'=>['message_id'=>'123','from_member_id'=>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']];
        try {
            $provider=new App\CMS\PushProvider($config);
            App\CMS\TestPushTransport::$responses=[$response(200)];
            check($provider->send($job)['success'],'APNs aceita HTTP 200');
            $request=App\CMS\TestPushTransport::$requests[0];
            $payload=json_decode($request['options'][CURLOPT_POSTFIELDS],true);
            same('Olá',$payload['aps']['alert']['body'],'Payload APNs contém mensagem');
            same($job['url'],$payload['url'],'APNs contém destino');
            check(in_array('apns-topic: com.margot.app',$request['options'][CURLOPT_HTTPHEADER],true),'APNs topic coincide com app');
            check(in_array('apns-push-type: alert',$request['options'][CURLOPT_HTTPHEADER],true),'APNs alerta visível');
            same(CURL_HTTP_VERSION_2_0,$request['options'][CURLOPT_HTTP_VERSION],'APNs usa HTTP/2');
            $jwt=substr($request['options'][CURLOPT_HTTPHEADER][0],22);
            $parts=explode('.',$jwt);
            same('ES256',json_decode(base64_decode(strtr($parts[0],'-_','+/')),true)['alg'],'JWT APNs ES256');
            same(64,strlen(base64_decode(strtr($parts[2],'-_','+/'))),'Assinatura APNs formato JOSE');
            App\CMS\TestPushTransport::$requests=[];
            App\CMS\TestPushTransport::$responses=[$response(400,['reason'=>'BadDeviceToken']),$response(200)];
            same('sandbox',$provider->send($job)['environment'],'Token debug tenta sandbox');
            check(str_starts_with(App\CMS\TestPushTransport::$requests[1]['url'],'https://api.sandbox.push.apple.com/'),'Endpoint sandbox');
            foreach ([[410,['reason'=>'Unregistered'],true], [503,['reason'=>'ServiceUnavailable'],false]] as [$status,$error,$permanent]) {
                App\CMS\TestPushTransport::$responses=[$response($status,$error)];
                same($permanent,$provider->send($job)['permanent'],'Classifica erro APNs '.$status);
            }
            App\CMS\TestPushTransport::$responses=[$response(0,[],28)];
            same(false,$provider->send($job)['permanent'],'Timeout APNs recuperável');
            $job['plataforma']='android'; $job['token']='test-fcm-token';
            App\CMS\TestPushTransport::$requests=[];
            App\CMS\TestPushTransport::$responses=[$response(200,['access_token'=>'test-access','expires_in'=>3600]),$response(200,['name'=>'test-message'])];
            check($provider->send($job)['success'],'FCM autentica e envia');
            $requests=App\CMS\TestPushTransport::$requests;
            parse_str($requests[0]['options'][CURLOPT_POSTFIELDS],$oauth);
            $parts=explode('.',$oauth['assertion']);
            same(1,openssl_verify($parts[0].'.'.$parts[1],base64_decode(strtr($parts[2],'-_','+/')),
                openssl_pkey_get_details($rsa)['key'],OPENSSL_ALGO_SHA256),'Assinatura FCM válida');
            $claims=json_decode(base64_decode(strtr($parts[1],'-_','+/')),true);
            same('https://www.googleapis.com/auth/firebase.messaging',$claims['scope'],'OAuth scope FCM');
            $payload=json_decode($requests[1]['options'][CURLOPT_POSTFIELDS],true)['message'];
            same('margot_message',$payload['android']['notification']['channel_id'],'FCM usa canal nativo de mensagens');
            same('high',$payload['android']['priority'],'Prioridade Android');
            same($job['url'],$payload['data']['url'],'FCM destino ao tocar');
            same('Olá',$payload['notification']['body'],'FCM contém notification para background');
            foreach (['hey'=>'margot_hey','nearby'=>'margot_nearby','other'=>'margot_activity'] as $type=>$channel) {
                $job['tipo']=$type;
                App\CMS\TestPushTransport::$responses=[$response(200)];
                $provider->send($job);
                $last=end(App\CMS\TestPushTransport::$requests);
                same($channel,json_decode($last['options'][CURLOPT_POSTFIELDS],true)['message']['android']['notification']['channel_id'],'Canal '.$type);
            }
            foreach (['UNREGISTERED'=>true,'SENDER_ID_MISMATCH'=>true,'UNAVAILABLE'=>false,'QUOTA_EXCEEDED'=>false] as $code=>$permanent) {
                App\CMS\TestPushTransport::$responses=[$response(400,['error'=>['status'=>'INVALID_ARGUMENT','details'=>[['errorCode'=>$code]]]])];
                same($permanent,$provider->send($job)['permanent'],'Classifica FCM '.$code);
            }
            same([],App\CMS\TestPushTransport::$responses,'Respostas simuladas consumidas');
            try { (new App\CMS\PushProvider())->send($job); check(false,'Push desligado'); }
            catch (RuntimeException) { check(true,'Push desligado impede transporte'); }
        } finally { unlink($keyFile); unlink($accountFile); }
    })();
}
