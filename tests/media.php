<?php
(function () {
    $db = new TestDatabase();
    $member = new App\CMS\Member($db);
    $image = new App\CMS\Image($db);
    $ids = [];

    foreach (['a', 'b'] as $name) {
        $ids[] = $member->create([
            'primeiro_nome' => $name,
            'ultimo_nome' => 'Media',
            'nascimento' => '1990-01-01',
            'genero' => 'M',
            'email' => $name . '@media.test',
            'password' => 'Senha1234',
            'sobre_ti' => '',
            'nome_seo' => $name
        ]);
    }

    [$a, $b] = $ids;

    $image->syncProfilePhotos($a, ['one.png', 'two.png'], ['nova:1', 'nova:0'], []);
    $rows = $image->getUploadTemp($a);

    same(
        ['two.png', 'one.png'],
        array_column($rows, 'nome_arquivo'),
        'Ordenar novas fotografias'
    );

    $image->syncProfilePhotos($b, ['other.png'], [], []);
    $other = $image->getUploadTemp($b)[0];

    $image->syncProfilePhotos(
        $a,
        [],
        ['existente:' . $other['id']],
        [$other['id']]
    );

    same(1, count($image->getUploadTemp($b)), 'Não apaga fotografias de outra conta');

    $deleted = $image->syncProfilePhotos(
        $a,
        [],
        ['existente:' . $rows[1]['id']],
        [$rows[0]['id']]
    );

    same(['two.png'], $deleted, 'Remoção devolve apenas ficheiros próprios');

    same(
        ['one.png'],
        array_column($image->getUploadTemp($a), 'nome_arquivo'),
        'Ordem após remoção'
    );

    try {
        $image->syncProfilePhotos($a, array_fill(0, 6, 'extra.png'), [], []);
        check(false, 'Limite fotografias');
    } catch (LengthException) {
        same(1, count($image->getUploadTemp($a)), 'Excesso de fotos faz rollback');
    }

    same([], $image->receiveProfileUploads([]), 'Registo sem fotografias aceite');

    try {
        $image->receiveProfileUploads([
            'tmp_name' => ['fake'],
            'error' => [UPLOAD_ERR_PARTIAL]
        ]);
        check(false, 'Upload parcial');
    } catch (InvalidArgumentException) {
        check(true, 'Fotografia incompleta recusada');
    }

    $media = new App\CMS\MessageMedia();

    same([], $media->receive([]), 'Mensagem de texto dispensa media');

    try {
        $media->receive([
            'tmp_name' => __FILE__,
            'error' => UPLOAD_ERR_OK,
            'size' => 100
        ]);
        check(false, 'Upload forjado');
    } catch (InvalidArgumentException) {
        check(true, 'Caminho local não é upload HTTP');
    }

    try {
        $media->receive(['error' => UPLOAD_ERR_INI_SIZE]);
        check(false, 'Upload excedeu limite PHP');
    } catch (InvalidArgumentException) {
        check(true, 'Erro de upload tratado');
    }

    $name = 'margot-test-' . bin2hex(random_bytes(8));
    $temp = tempnam(sys_get_temp_dir(), 'margot-image-test-');

    $files = [
        APP_ROOT . '/public/imagens/fotos-perfil/' . $name . '.webp',
        APP_ROOT . '/public/imagens/fotos-perfil-originais/' . $name . '.webp'
    ];

    try {
        $source = new Imagick();
        $source->newImage(40, 20, 'white', 'png');
        $source->writeImage($temp);
        $source->clear();

        $image->syncProfilePhotos($a, [$name . '.png'], [], []);
        $image->createImage($a, $name . '.png', $temp, 'perfil');

        foreach ($files as $path) {
            check(is_file($path), 'Worker produz WebP');

            same(
                'image/webp',
                (new finfo(FILEINFO_MIME_TYPE))->file($path),
                'Ficheiro convertido para WebP'
            );
        }

        $square = getimagesize($files[0]);

        same(
            [1200, 1200],
            [$square[0], $square[1]],
            'Fotografia quadrada de perfil'
        );

        $original = getimagesize($files[1]);

        same(
            [40, 20],
            [$original[0], $original[1]],
            'Original mantém proporções'
        );

        $photo = $db->runSQL(
            'SELECT status FROM fotos_perfil WHERE nome_arquivo=:name',
            ['name' => $name . '.webp']
        )->fetchColumn();

        same('completo', $photo, 'Worker marca fotografia concluída');
        same(false, is_file($temp), 'Worker limpa temporário');
    } finally {
        foreach (array_merge($files, [$temp]) as $path) {
            if (is_file($path)) {
                unlink($path);
            }
        }
    }
})();