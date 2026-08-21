<?php

return [
    'production_readiness_enforced' => env('PRODUCTION_READINESS_ENFORCED', true),
    'trusted_proxies' => array_values(array_filter(array_map(
        'trim',
        explode(',', env('TRUSTED_PROXIES', '')),
    ))),
    'trusted_hosts' => array_values(array_filter(array_map(
        'trim',
        explode(',', env('TRUSTED_HOSTS', '')),
    ))),
];
