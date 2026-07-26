<?php

require_login($session);
redirect(DOC_ROOT . 'delete-account', [], 303);
