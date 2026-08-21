FROM composer:2.9.8 AS composer

FROM caddy:2.11.4-alpine AS caddy

FROM php:8.3.32-fpm-bookworm

ARG ORVYN_RELEASE_ID=development

LABEL org.opencontainers.image.title="ORVYN backend" \
      org.opencontainers.image.revision="${ORVYN_RELEASE_ID}"

ENV APP_ENV=production \
    COMPOSER_ALLOW_SUPERUSER=1 \
    PATH="/var/www/html/vendor/bin:${PATH}"

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gosu \
        libcurl4-openssl-dev \
        libicu-dev \
        libonig-dev \
        libpq-dev \
        libzip-dev \
        $PHPIZE_DEPS \
        unzip; \
    docker-php-ext-install -j"$(nproc)" \
        bcmath \
        curl \
        intl \
        mbstring \
        opcache \
        pcntl \
        pdo_pgsql \
        zip; \
    pecl install redis-6.2.0; \
    docker-php-ext-enable redis; \
    apt-get purge -y --auto-remove $PHPIZE_DEPS; \
    rm -rf /var/lib/apt/lists/* /tmp/pear

COPY --from=composer /usr/bin/composer /usr/local/bin/composer
COPY --from=caddy /usr/bin/caddy /usr/local/bin/caddy

WORKDIR /var/www/html

COPY backend/composer.json backend/composer.lock ./

RUN composer install \
    --no-dev \
    --no-interaction \
    --no-progress \
    --no-scripts \
    --no-autoloader \
    --prefer-dist

COPY backend/app ./app
COPY backend/bootstrap ./bootstrap
COPY backend/config ./config
COPY backend/database ./database
COPY backend/public ./public
COPY backend/resources ./resources
COPY backend/routes ./routes
COPY backend/artisan ./

COPY deploy/docker/backend-entrypoint.sh /usr/local/bin/orvyn-backend-entrypoint
COPY deploy/docker/backend.Caddyfile /etc/caddy/Caddyfile
COPY deploy/docker/php-fpm.conf /usr/local/etc/php-fpm.conf
COPY deploy/docker/php-www.conf /usr/local/etc/php-fpm.d/www.conf
COPY deploy/docker/php-production.ini /usr/local/etc/php/conf.d/zz-orvyn-production.ini

RUN set -eux; \
    groupadd --gid 10001 orvyn; \
    useradd --uid 10001 --gid 10001 --no-create-home --home-dir /var/www/html --shell /usr/sbin/nologin orvyn; \
    mkdir -p \
        bootstrap/cache \
        storage/app/private \
        storage/app/public \
        storage/framework/cache/data \
        storage/framework/sessions \
        storage/framework/views \
        storage/logs; \
    rm -f public/storage; \
    ln -s ../storage/app/public public/storage; \
    rm -f bootstrap/cache/*.php; \
    composer dump-autoload --no-dev --classmap-authoritative --no-interaction --no-scripts; \
    APP_ENV=local APP_KEY=base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
        php artisan package:discover --ansi; \
    chown -R 10001:10001 bootstrap/cache storage; \
    chmod 0755 /usr/local/bin/orvyn-backend-entrypoint; \
    find bootstrap/cache storage -type d -exec chmod 0700 {} +; \
    find bootstrap/cache storage -type f -exec chmod 0600 {} +

EXPOSE 8080 9000

ENTRYPOINT ["/usr/local/bin/orvyn-backend-entrypoint"]
CMD ["php-fpm", "--nodaemonize"]
