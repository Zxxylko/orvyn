#!/bin/sh
set -eu
umask 077

fail() {
    printf 'Redis secure startup refused: %s\n' "$*" >&2
    exit 1
}

secret_file="${REDIS_PASSWORD_FILE:-}"
config_file="/run/orvyn-redis/redis.conf"

[ -n "${secret_file}" ] || fail "REDIS_PASSWORD_FILE is required"
[ "${secret_file#/run/secrets/}" != "${secret_file}" ] || fail "REDIS_PASSWORD_FILE must use /run/secrets"
[ -f "${secret_file}" ] && [ -r "${secret_file}" ] && [ ! -L "${secret_file}" ] \
    || fail "REDIS_PASSWORD_FILE is not a readable regular file"

password="$(cat "${secret_file}")"
[ "${#password}" -ge 24 ] || fail "Redis password must contain at least 24 characters"

mkdir -p /run/orvyn-redis
{
    printf '%s\n' \
        'bind 0.0.0.0' \
        'protected-mode yes' \
        'port 6379' \
        'appendonly yes' \
        'appendfsync everysec' \
        'save 900 1' \
        'save 300 10' \
        'save 60 10000' \
        'maxmemory 512mb' \
        'maxmemory-policy noeviction' \
        'rename-command FLUSHALL ""' \
        'rename-command FLUSHDB ""' \
        'rename-command CONFIG ""'
    printf 'requirepass %s\n' "${password}"
} > "${config_file}"
chmod 0600 "${config_file}"
unset password

exec /usr/local/bin/docker-entrypoint.sh redis-server "${config_file}"
