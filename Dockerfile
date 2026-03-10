FROM php:8.2-fpm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git curl unzip libpq-dev libonig-dev libzip-dev zip nginx \
    && docker-php-ext-install pdo pdo_mysql mbstring zip

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

# Copy app files
COPY . .

# Install PHP dependencies
RUN composer install --no-dev --optimize-autoloader

# Create SQLite database file
RUN touch /var/www/database/database.sqlite

# Set permissions
RUN chown -R www-data:www-data /var/www \
    && chmod -R 775 /var/www/storage /var/www/bootstrap/cache /var/www/database

# Clear caches only
RUN php artisan config:clear \
    && php artisan route:clear \
    && php artisan view:clear

# Nginx config — properly serve static files
RUN cat > /etc/nginx/sites-available/default << 'NGINX'
server {
    listen 10000;
    root /var/www/public;
    index index.php index.html;

    # Serve static files directly (CSS, JS, images)
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires max;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass 127.0.0.1:9000;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }
}
NGINX

EXPOSE 10000

# Run migrations at runtime then start nginx + php-fpm
CMD php artisan migrate --force && service nginx start && php-fpm