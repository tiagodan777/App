<?php

declare(strict_types=1);

$cookie->delete();
$session->delete();

redirect(DOC_ROOT . 'create-account/');