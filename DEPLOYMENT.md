# 🚀 StudVote - Руководство по развертыванию

## 📋 Содержание

1. [Требования к серверу](#требования-к-серверу)
2. [Подготовка сервера](#подготовка-сервера)
3. [Установка зависимостей](#установка-зависимостей)
4. [Конфигурация](#конфигурация)
5. [Развертывание](#развертывание)
6. [Мониторинг](#мониторинг)
7. [Резервное копирование](#резервное-копирование)
8. [Troubleshooting](#troubleshooting)

---

## 💻 Требования к серверу

### Минимальные требования (до 1000 пользователей)

| Компонент | Требования |
|-----------|------------|
| **ОС** | Ubuntu 20.04+ / CentOS 8+ / Debian 11+ |
| **CPU** | 2 cores (2.0 GHz+) |
| **RAM** | 4 GB |
| **Диск** | 50 GB SSD |
| **Сеть** | 100 Mbps |

### Рекомендуемые требования (до 5000 пользователей)

| Компонент | Требования |
|-----------|------------|
| **ОС** | Ubuntu 22.04 LTS |
| **CPU** | 4 cores (2.5 GHz+) |
| **RAM** | 8 GB |
| **Диск** | 100 GB SSD |
| **Сеть** | 1 Gbps |

### Высоконагруженные системы (20000+ пользователей)

| Компонент | Требования |
|-----------|------------|
| **ОС** | Ubuntu 22.04 LTS |
| **CPU** | 8-16 cores (3.0 GHz+) |
| **RAM** | 16-32 GB |
| **Диск** | 500 GB NVMe SSD |
| **Сеть** | 10 Gbps |
| **Load Balancer** | Nginx / HAProxy |
| **MongoDB** | Replica Set (3 nodes) |
| **Redis** | Cluster mode (3+ nodes) |

---

## 🔧 Подготовка сервера

### 1. Обновление системы

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

### 2. Установка базовых утилит

```bash
# Ubuntu/Debian
sudo apt install -y curl wget git build-essential software-properties-common

# CentOS/RHEL
sudo yum install -y curl wget git gcc gcc-c++ make
```

### 3. Настройка файрвола

```bash
# UFW (Ubuntu/Debian)
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable

# Firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 4. Создание пользователя

```bash
# Создание пользователя для приложения
sudo adduser studvote
sudo usermod -aG sudo studvote

# Переключение на нового пользователя
su - studvote
```

---

## 📦 Установка зависимостей

### 1. Node.js

```bash
# Установка Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка
node --version  # v18.x.x
npm --version   # 9.x.x
```

### 2. MongoDB

```bash
# Импорт публичного ключа
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -

# Добавление репозитория
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# Установка
sudo apt update
sudo apt install -y mongodb-org

# Запуск и автостарт
sudo systemctl start mongod
sudo systemctl enable mongod

# Проверка
sudo systemctl status mongod
```

### 3. Redis

```bash
# Установка
sudo apt install -y redis-server

# Настройка
sudo nano /etc/redis/redis.conf
# Измените:
# bind 127.0.0.1 ::1
# requirepass YOUR_STRONG_PASSWORD

# Перезапуск
sudo systemctl restart redis-server
sudo systemctl enable redis-server

# Проверка
redis-cli ping  # PONG
```

### 4. Nginx (веб-сервер)

```bash
# Установка
sudo apt install -y nginx

# Запуск
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 5. PM2 (менеджер процессов)

```bash
# Установка глобально
sudo npm install -g pm2

# Автостарт при загрузке системы
pm2 startup systemd
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u studvote --hp /home/studvote
```

### 6. Certbot (SSL сертификаты)

```bash
# Установка
sudo apt install -y certbot python3-certbot-nginx
```

---

## ⚙️ Конфигурация

### 1. Клонирование репозитория

```bash
cd /home/studvote
git clone https://github.com/your-org/studvote.git
cd studvote
```

### 2. Backend конфигурация

```bash
cd server

# Установка зависимостей
npm ci --production

# Создание .env файла
cat > .env << EOF
# Server
PORT=5000
NODE_ENV=production

# Database
MONGODB_URI=mongodb://localhost:27017/studvote

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=YOUR_REDIS_PASSWORD

# JWT
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRATION=7d

# Frontend
FRONTEND_URL=https://studvote.fa.ru

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=StudVote <noreply@studvote.fa.ru>

# GigaChat
GIGACHAT_AUTH_KEY=YOUR_GIGACHAT_KEY

# Features
ENABLE_AI_GENERATION=true
ENABLE_EMAIL_NOTIFICATIONS=true
ENABLE_SCHEDULE_INTEGRATION=true

# Security
FORCE_HTTPS=true
TRUST_PROXY=true

# Logging
LOG_LEVEL=info
EOF

# Права доступа
chmod 600 .env
```

### 3. Frontend конфигурация

```bash
cd ../client

# Установка зависимостей
npm ci

# Создание .env.production
cat > .env.production << EOF
REACT_APP_API_URL=https://studvote.fa.ru/api
REACT_APP_WS_URL=https://studvote.fa.ru
REACT_APP_NAME=StudVote
REACT_APP_VERSION=1.0.0
REACT_APP_ENV=production
REACT_APP_ENABLE_AI=true
REACT_APP_ENABLE_GAMIFICATION=true
REACT_APP_ENABLE_WS=true
EOF

# Сборка
npm run build
```

### 4. Nginx конфигурация

```bash
sudo nano /etc/nginx/sites-available/studvote
```

```nginx
# HTTP → HTTPS редирект
server {
    listen 80;
    listen [::]:80;
    server_name studvote.fa.ru www.studvote.fa.ru;
    
    return 301 https://$host$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name studvote.fa.ru www.studvote.fa.ru;

    # SSL сертификаты (будут созданы Certbot)
    ssl_certificate /etc/letsencrypt/live/studvote.fa.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/studvote.fa.ru/privkey.pem;
    
    # SSL параметры
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Логи
    access_log /var/log/nginx/studvote_access.log;
    error_log /var/log/nginx/studvote_error.log;

    # Сжатие
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Таймауты
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend (React build)
    location / {
        root /home/studvote/studvote/client/build;
        index index.html;
        try_files $uri $uri/ /index.html;
        
        # Кэширование статики
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
}
```

Активация конфигурации:

```bash
# Создание симлинка
sudo ln -s /etc/nginx/sites-available/studvote /etc/nginx/sites-enabled/

# Проверка конфигурации
sudo nginx -t

# Перезапуск Nginx
sudo systemctl restart nginx
```

### 5. SSL сертификат (Let's Encrypt)

```bash
# Получение сертификата
sudo certbot --nginx -d studvote.fa.ru -d www.studvote.fa.ru

# Автопродление (уже настроено в cron)
sudo certbot renew --dry-run
```

### 6. MongoDB безопасность

```bash
# Подключение к MongoDB
mongosh

# Создание пользователя для приложения
use admin
db.createUser({
  user: "studvote",
  pwd: "YOUR_STRONG_PASSWORD",
  roles: [
    { role: "readWrite", db: "studvote" }
  ]
})

# Выход
exit
```

Обновление MongoDB конфигурации:

```bash
sudo nano /etc/mongod.conf
```

```yaml
security:
  authorization: enabled

net:
  bindIp: 127.0.0.1
  port: 27017
```

```bash
sudo systemctl restart mongod
```

Обновление `.env` в backend:

```env
MONGODB_URI=mongodb://studvote:YOUR_STRONG_PASSWORD@localhost:27017/studvote?authSource=admin
```

---

## 🚀 Развертывание

### 1. Запуск Backend с PM2

```bash
cd /home/studvote/studvote/server

# Запуск
pm2 start src/server.js --name studvote-api --instances 2 --exec-mode cluster

# Сохранение конфигурации
pm2 save

# Автозагрузка
pm2 startup
```

### 2. Мониторинг PM2

```bash
# Статус процессов
pm2 status

# Логи
pm2 logs studvote-api

# Мониторинг ресурсов
pm2 monit

# Перезапуск
pm2 restart studvote-api

# Остановка
pm2 stop studvote-api
```

### 3. Проверка работоспособности

```bash
# Health check
curl https://studvote.fa.ru/api/health

# Ожидаемый ответ:
# {"status":"OK","message":"StudVote работает!"}
```

---

## 📊 Мониторинг

### 1. Логи приложения

```bash
# Backend логи (PM2)
pm2 logs studvote-api --lines 100

# Nginx логи
sudo tail -f /var/log/nginx/studvote_access.log
sudo tail -f /var/log/nginx/studvote_error.log

# MongoDB логи
sudo tail -f /var/log/mongodb/mongod.log

# Redis логи
sudo tail -f /var/log/redis/redis-server.log
```

### 2. Мониторинг ресурсов

```bash
# Использование CPU и памяти
htop

# Дисковое пространство
df -h

# PM2 мониторинг
pm2 monit

# MongoDB статистика
mongosh --eval "db.serverStatus()"
```

### 3. Автоматический мониторинг (опционально)

**PM2 Plus** (платно):

```bash
pm2 link YOUR_SECRET_KEY YOUR_PUBLIC_KEY
```

**Prometheus + Grafana** (бесплатно, требует настройки):

```bash
# Установка Node Exporter
wget https://github.com/prometheus/node_exporter/releases/download/v1.5.0/node_exporter-1.5.0.linux-amd64.tar.gz
tar xvfz node_exporter-*.*-amd64.tar.gz
cd node_exporter-*.*-amd64
./node_exporter &
```

---

## 💾 Резервное копирование

### 1. MongoDB бэкап

**Ежедневный бэкап**:

```bash
# Создание скрипта
sudo nano /usr/local/bin/backup-mongodb.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/backup/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)

# Создание директории
mkdir -p $BACKUP_DIR

# Бэкап
mongodump --uri="mongodb://studvote:PASSWORD@localhost:27017/studvote?authSource=admin" --out="$BACKUP_DIR/backup_$DATE"

# Сжатие
tar -czf "$BACKUP_DIR/backup_$DATE.tar.gz" -C "$BACKUP_DIR" "backup_$DATE"

# Удаление несжатой копии
rm -rf "$BACKUP_DIR/backup_$DATE"

# Удаление старых бэкапов (старше 30 дней)
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: backup_$DATE.tar.gz"
```

```bash
# Права на выполнение
sudo chmod +x /usr/local/bin/backup-mongodb.sh

# Добавление в cron (каждый день в 02:00)
sudo crontab -e
```

```cron
0 2 * * * /usr/local/bin/backup-mongodb.sh >> /var/log/mongodb-backup.log 2>&1
```

### 2. Восстановление из бэкапа

```bash
# Распаковка
tar -xzf /backup/mongodb/backup_20260114_020000.tar.gz -C /tmp

# Восстановление
mongorestore --uri="mongodb://studvote:PASSWORD@localhost:27017/studvote?authSource=admin" /tmp/backup_20260114_020000/studvote

# Очистка
rm -rf /tmp/backup_20260114_020000
```

### 3. Резервное копирование кода

```bash
# Git push в репозиторий
cd /home/studvote/studvote
git add .
git commit -m "Production deployment $(date +%Y%m%d)"
git push origin main
```

---

## 🔄 Обновление приложения

### 1. Обновление Backend

```bash
cd /home/studvote/studvote

# Резервная копия
cp -r server server.backup.$(date +%Y%m%d)

# Получение изменений
git pull origin main

# Backend
cd server
npm ci --production

# Перезапуск PM2
pm2 restart studvote-api
pm2 save
```

### 2. Обновление Frontend

```bash
cd /home/studvote/studvote/client

# Резервная копия
cp -r build build.backup.$(date +%Y%m%d)

# Установка зависимостей
npm ci

# Сборка
npm run build

# Nginx автоматически подхватит новые файлы
```

### 3. Откат (rollback)

```bash
# Backend
cd /home/studvote/studvote
rm -rf server
mv server.backup.YYYYMMDD server
pm2 restart studvote-api

# Frontend
cd client
rm -rf build
mv build.backup.YYYYMMDD build
```

---

## 🐛 Troubleshooting

### Проблема: Backend не запускается

**Проверка**:

```bash
cd /home/studvote/studvote/server
node src/server.js
```

**Возможные причины**:
1. MongoDB не запущен: `sudo systemctl status mongod`
2. Redis не запущен: `sudo systemctl status redis`
3. Неправильный `.env`: проверьте переменные
4. Порт 5000 занят: `sudo lsof -i :5000`

### Проблема: 502 Bad Gateway

**Проверка**:

```bash
# Проверка Nginx
sudo nginx -t
sudo systemctl status nginx

# Проверка Backend
pm2 status
curl http://localhost:5000/api/health
```

**Решение**:
- Убедитесь, что Backend запущен
- Проверьте `proxy_pass` в Nginx конфигурации

### Проблема: SSL сертификат не работает

**Проверка**:

```bash
sudo certbot certificates
```

**Продление**:

```bash
sudo certbot renew
sudo systemctl reload nginx
```

### Проблема: Высокая нагрузка на CPU

**Проверка**:

```bash
htop
pm2 monit
```

**Решение**:
- Увеличьте количество инстансов PM2: `pm2 scale studvote-api +2`
- Проверьте медленные запросы в MongoDB
- Оптимизируйте индексы

### Проблема: Нехватка памяти

**Проверка**:

```bash
free -h
```

**Решение**:
- Увеличьте swap: `sudo fallocate -l 4G /swapfile`
- Оптимизируйте Node.js memory: `pm2 delete studvote-api && pm2 start src/server.js --name studvote-api --max-memory-restart 1G`

---

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи (см. раздел "Мониторинг")
2. Проверьте статусы сервисов:
```bash
sudo systemctl status mongod
sudo systemctl status redis
sudo systemctl status nginx
pm2 status
```
3. Свяжитесь с техподдержкой: support@studvote.fa.ru

---

## ✅ Checklist перед продакшн деплоем

- [ ] Обновлена система и установлены все зависимости
- [ ] Настроен файрвол (порты 22, 80, 443)
- [ ] MongoDB защищен паролем
- [ ] Redis защищен паролем
- [ ] Генерирован сильный `JWT_SECRET`
- [ ] Настроен SSL сертификат (HTTPS)
- [ ] Backend запущен через PM2 в cluster mode
- [ ] Frontend собран в production режиме
- [ ] Nginx правильно проксирует запросы
- [ ] Настроено автоматическое резервное копирование
- [ ] Проверен health check endpoint
- [ ] Настроен мониторинг логов
- [ ] Протестировано создание и прохождение опросов
- [ ] Проверена работа WebSocket уведомлений

---

**Успешного деплоя! 🚀**
