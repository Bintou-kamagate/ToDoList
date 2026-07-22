FROM composer:2 AS vendor

WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --prefer-dist --no-interaction --no-scripts --optimize-autoloader

FROM php:8.2-cli

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev \
        libzip-dev \
        unzip \
    && docker-php-ext-install pdo pdo_pgsql zip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
COPY --from=vendor /app/vendor ./vendor

RUN php artisan storage:link || true

EXPOSE 8000
CMD php artisan serve --host 0.0.0.0 --port ${PORT:-8000}
