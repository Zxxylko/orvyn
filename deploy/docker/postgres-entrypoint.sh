#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

fail() {
    printf 'PostgreSQL secret initialization refused: %s\n' "$*" >&2
    exit 1
}

[[ "$(id -u)" -eq 0 ]] || fail "secure secret initialization must start as container root"

runtime_dir="/run/orvyn-postgres-secrets"
mkdir -p "${runtime_dir}"
chmod 0700 "${runtime_dir}"

for variable in POSTGRES_PASSWORD POSTGRES_APP_PASSWORD POSTGRES_BACKUP_PASSWORD; do
    source_variable="${variable}_FILE"
    source_file="${!source_variable:-}"
    destination_file="${runtime_dir}/${variable,,}"

    [[ "${source_file}" == /run/secrets/* ]] \
        || fail "${source_variable} must use /run/secrets"
    [[ -f "${source_file}" && -r "${source_file}" && ! -L "${source_file}" ]] \
        || fail "${source_variable} is not a readable regular file"

    cp --no-preserve=mode,ownership,timestamps "${source_file}" "${destination_file}"
    chmod 0400 "${destination_file}"
    chown postgres:postgres "${destination_file}"
    printf -v "${source_variable}" '%s' "${destination_file}"
    export "${source_variable}"
done

chown postgres:postgres "${runtime_dir}"
chmod 0700 "${runtime_dir}"
unset runtime_dir variable source_variable source_file destination_file

exec /usr/local/bin/docker-entrypoint.sh "$@"
