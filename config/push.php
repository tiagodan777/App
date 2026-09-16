<?php
$envBoolean = static function (string $name, bool $default = false): bool {
    $value = getenv($name);
    if ($value === false || trim($value) === '') {
        return $default;
    }
    return filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $default;
};
$pushDefaults = [
    'enabled' => $envBoolean('MARGOT_PUSH_ENABLED'),
    'apns' => [
        'environment' => getenv('MARGOT_APNS_ENVIRONMENT') ?: 'production',
        'team_id' => getenv('MARGOT_APNS_TEAM_ID') ?: '',
        'key_id' => getenv('MARGOT_APNS_KEY_ID') ?: '',
        'private_key_file' => getenv('MARGOT_APNS_PRIVATE_KEY_FILE') ?: '',
        'topic' => getenv('MARGOT_APNS_TOPIC') ?: 'com.margot.app'
    ],
    'fcm' => [
        'service_account_file' => getenv('MARGOT_FCM_SERVICE_ACCOUNT_FILE') ?: '',
        'project_id' => getenv('MARGOT_FCM_PROJECT_ID') ?: ''
    ]
];
$push_config =
    isset($push_config) && is_array($push_config)
        ? array_replace_recursive($pushDefaults, $push_config)
        : $pushDefaults;
$pushEnvironment = strtolower(trim((string) ($push_config['apns']['environment'] ?? 'production')));
if (!in_array($pushEnvironment, ['sandbox', 'production'], true)) {
    $pushEnvironment = 'production';
}
$push_config['apns']['environment'] = $pushEnvironment;
