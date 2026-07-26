<?php
$cms->getSession()->delete();
$cms->getCookie()->delete();
redirect('index');