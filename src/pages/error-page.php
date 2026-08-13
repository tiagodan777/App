<?php

declare(strict_types=1);

http_response_code(404);

header(
    'Cache-Control: no-store, no-cache, must-revalidate'
);

header(
    'X-Robots-Tag: noindex, nofollow'
);

echo $twig->render(
    'error-page.html'
);