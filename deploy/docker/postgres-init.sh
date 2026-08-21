#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

fail() {
    printf 'PostgreSQL secure initialization refused: %s\n' "$*" >&2
    exit 1
}

read_secret() {
    local path="$1"
    local label="$2"
    local value

    [[ "${path}" == /run/orvyn-postgres-secrets/* ]] \
        || fail "${label} must use the protected PostgreSQL runtime secret directory"
    [[ -f "${path}" && -r "${path}" && ! -L "${path}" ]] || fail "${label} is not a readable regular file"
    value="$(< "${path}")"
    [[ "${value}" != *$'\n'* && "${value}" != *$'\r'* ]] || fail "${label} must contain one line"
    (( ${#value} >= 24 )) || fail "${label} must contain at least 24 characters"
    printf '%s' "${value}"
}

app_password="$(read_secret "${POSTGRES_APP_PASSWORD_FILE:?}" POSTGRES_APP_PASSWORD_FILE)"
backup_password="$(read_secret "${POSTGRES_BACKUP_PASSWORD_FILE:?}" POSTGRES_BACKUP_PASSWORD_FILE)"
export ORVYN_POSTGRES_APP_PASSWORD="${app_password}"
export ORVYN_POSTGRES_BACKUP_PASSWORD="${backup_password}"

if psql --username "${POSTGRES_USER}" --dbname postgres --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --command="SELECT 1 FROM pg_roles WHERE rolname = 'orvyn_app'" | grep -qx 1; then
    psql --username "${POSTGRES_USER}" --dbname postgres --set=ON_ERROR_STOP=1 <<'SQL'
\getenv app_password ORVYN_POSTGRES_APP_PASSWORD
ALTER ROLE orvyn_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'app_password';
SQL
else
    psql --username "${POSTGRES_USER}" --dbname postgres --set=ON_ERROR_STOP=1 <<'SQL'
\getenv app_password ORVYN_POSTGRES_APP_PASSWORD
CREATE ROLE orvyn_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'app_password';
SQL
fi

if psql --username "${POSTGRES_USER}" --dbname postgres --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --command="SELECT 1 FROM pg_roles WHERE rolname = 'orvyn_backup'" | grep -qx 1; then
    psql --username "${POSTGRES_USER}" --dbname postgres --set=ON_ERROR_STOP=1 <<'SQL'
\getenv backup_password ORVYN_POSTGRES_BACKUP_PASSWORD
ALTER ROLE orvyn_backup WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'backup_password';
SQL
else
    psql --username "${POSTGRES_USER}" --dbname postgres --set=ON_ERROR_STOP=1 <<'SQL'
\getenv backup_password ORVYN_POSTGRES_BACKUP_PASSWORD
CREATE ROLE orvyn_backup WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'backup_password';
SQL
fi

psql --username "${POSTGRES_USER}" --dbname postgres --set=ON_ERROR_STOP=1 \
    --command="ALTER DATABASE orvyn OWNER TO orvyn_app;"
psql --username "${POSTGRES_USER}" --dbname orvyn --set=ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
ALTER SCHEMA public OWNER TO orvyn_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE orvyn TO orvyn_backup;
GRANT USAGE ON SCHEMA public TO orvyn_backup;
GRANT pg_read_all_data TO orvyn_backup;
SQL

unset app_password backup_password
unset ORVYN_POSTGRES_APP_PASSWORD ORVYN_POSTGRES_BACKUP_PASSWORD
