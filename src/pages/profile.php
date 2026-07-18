<?php

$data = [];

require_login($session);


echo $twig->render('profile.html',$data);