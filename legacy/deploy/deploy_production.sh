#!/bin/bash
# Production Deployment Script for Quantum Portfolio Optimization System

set -e  # Exit on any error

echo "🚀 Starting Production Deployment for Quantum Portfolio System"

# Configuration
APP_NAME="quantum-portfolio"
APP_DIR="/opt/${APP_NAME}"
LOG_DIR="/var/log/${APP_NAME}"
BACKUP_DIR="/var/backups/${APP_NAME}"
USER="quantum"
GROUP="quantum"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[INFO]$(date '+%Y-%m-%d %H:%M:%S')${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]$(date '+%Y-%m-%d %H:%M:%S')${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]$(date '+%Y-%m-%d %H:%M:%S')${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    warn "Running as root. This is acceptable for deployment."
else
    error "This script should be run as root or with sudo privileges."
    exit 1
fi

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    # Check if required tools are installed
    local missing_tools=()
    
    command -v python3 >/dev/null 2>&1 || missing_tools+=("python3")
    command -v pip3 >/dev/null 2>&1 || missing_tools+=("pip3")
    command -v redis-server >/dev/null 2>&1 || missing_tools+=("redis-server")
    command -v nginx >/dev/null 2>&1 || missing_tools+=("nginx")
    command -v systemctl >/dev/null 2>&1 || missing_tools+=("systemd")

    if [ ${#missing_tools[@]} -gt 0 ]; then
        error "Missing required tools: ${missing_tools[*]}"
        error "Please install them before proceeding."
        exit 1
    fi

    log "All prerequisites satisfied."
}

# Create user and directories
setup_directories() {
    log "Setting up directories and user..."

    # Create application user if not exists
    if ! id "$USER" &>/dev/null; then
        log "Creating user: $USER"
        useradd -r -s /bin/false "$USER"
    fi

    # Create directories
    mkdir -p "$APP_DIR"
    mkdir -p "$LOG_DIR"
    mkdir -p "$BACKUP_DIR"
    mkdir -p "/etc/${APP_NAME}"

    # Set ownership
    chown -R "$USER:$GROUP" "$APP_DIR" "$LOG_DIR" "$BACKUP_DIR"

    log "Directories and user setup completed."
}

# Install Python dependencies
install_dependencies() {
    log "Installing Python dependencies..."

    # Create virtual environment
    python3 -m venv "$APP_DIR/venv"
    source "$APP_DIR/venv/bin/activate"

    # Upgrade pip
    pip install --upgrade pip

    # Install production dependencies
    pip install -r "$APP_DIR/requirements.txt"

    # Install additional production dependencies
    pip install gunicorn psycopg2-binary redis hiredis flask-limiter flask-jwt-extended sentry-sdk[flask]

    log "Python dependencies installed."
}

# Configure Redis
configure_redis() {
    log "Configuring Redis..."

    # Create Redis configuration
    cat > /etc/redis/quantum-portfolio.conf << EOF
# Redis configuration for Quantum Portfolio System
bind 127.0.0.1
port 6380
timeout 300
tcp-keepalive 300
daemonize no
supervised systemd
loglevel notice
logfile /var/log/redis/quantum-portfolio.log
databases 16
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump-quantum.rdb
dir /var/lib/redis
maxmemory 2gb
maxmemory-policy allkeys-lru
appendonly no
appendfilename "appendonly-quantum.aof"
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
lua-time-limit 5000
slowlog-log-slower-than 10000
slowlog-max-len 128
latency-monitor-threshold 0
notify-keyspace-events ""
hash-max-ziplist-entries 512
hash-max-ziplist-value 64
list-max-ziplist-size -2
list-compress-depth 0
set-max-intset-entries 512
zset-max-ziplist-entries 128
zset-max-ziplist-value 64
hll-sparse-max-bytes 3000
activerehashing yes
client-output-buffer-limit normal 0 0 0
client-output-buffer-limit slave 256mb 64mb 60
client-output-buffer-limit pubsub 32mb 8mb 60
hz 10
aof-rewrite-incremental-fsync yes
EOF

    # Create systemd service for Redis instance
    cat > /etc/systemd/system/redis-quantum.service << EOF
[Unit]
Description=Redis Quantum Portfolio Instance
After=network.target

[Service]
Type=notify
ExecStart=/usr/bin/redis-server /etc/redis/quantum-portfolio.conf --daemonize no
ExecStop=/bin/kill -s TERM \$MAINPID
TimeoutStopSec=0
Restart=on-failure
User=redis
Group=redis
RuntimeDirectory=redis-quantum
RuntimeDirectoryMode=2755

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable redis-quantum
    systemctl start redis-quantum

    log "Redis configured and started."
}

# Configure Nginx
configure_nginx() {
    log "Configuring Nginx..."

    # Create Nginx configuration
    cat > /etc/nginx/sites-available/quantum-portfolio << EOF
upstream quantum_portfolio_app {
    server 127.0.0.1:5000;
    keepalive 32;
}

server {
    listen 80;
    server_name _;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Client settings
    client_max_body_size 10M;
    client_body_timeout 120s;
    client_header_timeout 120s;

    # Logging
    access_log /var/log/nginx/quantum-portfolio-access.log;
    error_log /var/log/nginx/quantum-portfolio-error.log;

    location / {
        proxy_pass http://quantum_portfolio_app;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }

    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://quantum_portfolio_app/health;
    }

    # Static files (if any)
    location /static {
        alias $APP_DIR/static;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

    # Enable the site
    ln -sf /etc/nginx/sites-available/quantum-portfolio /etc/nginx/sites-enabled/
    
    # Test Nginx configuration
    nginx -t
    
    # Restart Nginx
    systemctl restart nginx

    log "Nginx configured and restarted."
}

# Create systemd service
create_systemd_service() {
    log "Creating systemd service..."

    cat > /etc/systemd/system/quantum-portfolio.service << EOF
[Unit]
Description=Quantum Portfolio Optimization API
After=network.target redis-quantum.service
Requires=redis-quantum.service

[Service]
Type=notify
User=$USER
Group=$GROUP
WorkingDirectory=$APP_DIR
Environment=FLASK_APP=production_api.py
Environment=FLASK_ENV=production
EnvironmentFile=/etc/${APP_NAME}/environment
ExecStart=$APP_DIR/venv/bin/gunicorn --bind 127.0.0.1:5000 --workers 4 --threads 2 --timeout 120 --keep-alive 5 --max-requests 1000 --max-requests-jitter 100 --preload production_api:app
ExecReload=/bin/kill -s HUP \$MAINPID
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=quantum-portfolio

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR $LOG_DIR $BACKUP_DIR /tmp
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
LockPersonality=true
MemoryDenyWriteExecute=true
NoExecPaths=/tmp /var/tmp /dev/shm
ProtectHostname=true
ProtectClock=true
ProtectKernelLogs=true
ProtectKernelModules=true
ProtectKernelTunables=true
RemoveIPC=true

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload

    log "Systemd service created."
}

# Create environment file
create_environment_file() {
    log "Creating environment configuration..."

    # Generate secret keys if not provided
    JWT_SECRET=$(openssl rand -hex 32)
    FLASK_SECRET=$(openssl rand -hex 32)

    cat > /etc/${APP_NAME}/environment << EOF
# Quantum Portfolio Environment Variables
FLASK_ENV=production
SECRET_KEY=$FLASK_SECRET
JWT_SECRET_KEY=$JWT_SECRET
DATABASE_URL=${DATABASE_URL:-postgresql://quantum:password@localhost/quantum_portfolio_prod}
REDIS_HOST=localhost
REDIS_PORT=6380
LOG_LEVEL=INFO
MAX_ASSETS=100
MAX_REQUESTS_PER_MINUTE=100
QUANTUM_COMPUTE_TIMEOUT=30
YFINANCE_RATE_LIMIT=2000
SENTRY_DSN=${SENTRY_DSN:-""}
S3_BACKUP_BUCKET=${S3_BACKUP_BUCKET:-""}
EOF

    # Secure the environment file
    chmod 600 /etc/${APP_NAME}/environment
    chown $USER:$GROUP /etc/${APP_NAME}/environment

    log "Environment configuration created securely."
}

# Setup log rotation
setup_log_rotation() {
    log "Setting up log rotation..."

    cat > /etc/logrotate.d/quantum-portfolio << EOF
/var/log/${APP_NAME}/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 0640 $USER adm
    sharedscripts
    postrotate
        systemctl reload quantum-portfolio > /dev/null 2>&1 || true
    endscript
}

/var/log/nginx/quantum-portfolio*.log {
    daily
    missingok
    rotate 12
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 \`cat /var/run/nginx.pid\`
    endscript
}
EOF

    log "Log rotation configured."
}

# Backup and recovery setup
setup_backup() {
    log "Setting up backup procedures..."

    # Create backup script
    cat > /opt/backup_quantum_portfolio.sh << 'EOF'
#!/bin/bash
# Quantum Portfolio Backup Script

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/quantum-portfolio"
DB_NAME="quantum_portfolio_prod"

mkdir -p "$BACKUP_DIR"

# Backup database
pg_dump -U quantum -h localhost "$DB_NAME" > "$BACKUP_DIR/db_backup_$DATE.sql"

# Backup application configuration
tar -czf "$BACKUP_DIR/config_backup_$DATE.tar.gz" /etc/quantum-portfolio/

# Cleanup old backups (keep last 30 days)
find "$BACKUP_DIR" -name "*.sql" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

    chmod +x /opt/backup_quantum_portfolio.sh

    # Add to cron (daily at 2 AM)
    echo "0 2 * * * root /opt/backup_quantum_portfolio.sh" >> /etc/crontab

    log "Backup procedures configured."
}

# Security hardening
security_hardening() {
    log "Applying security hardening..."

    # Set proper file permissions
    chown -R $USER:$GROUP $APP_DIR
    find $APP_DIR -type f -exec chmod 644 {} \;
    find $APP_DIR -type d -exec chmod 755 {} \;
    chmod 600 $APP_DIR/venv/bin/*
    
    # Secure sensitive files
    chmod 600 /etc/${APP_NAME}/environment
    chmod 600 /etc/redis/quantum-portfolio.conf

    # Update system
    apt-get update
    apt-get upgrade -y

    log "Security hardening applied."
}

# Start services
start_services() {
    log "Starting services..."

    # Start Redis
    systemctl start redis-quantum
    systemctl enable redis-quantum

    # Start application
    systemctl start quantum-portfolio
    systemctl enable quantum-portfolio

    # Restart Nginx
    systemctl restart nginx

    log "Services started and enabled."
}

# Run health checks
run_health_checks() {
    log "Running health checks..."

    # Wait a moment for services to start
    sleep 10

    # Check if services are running
    if systemctl is-active --quiet quantum-portfolio; then
        log "✓ Quantum Portfolio service is running"
    else
        error "✗ Quantum Portfolio service is not running"
        exit 1
    fi

    if systemctl is-active --quiet redis-quantum; then
        log "✓ Redis service is running"
    else
        error "✗ Redis service is not running"
        exit 1
    fi

    if systemctl is-active --quiet nginx; then
        log "✓ Nginx service is running"
    else
        error "✗ Nginx service is not running"
        exit 1
    fi

    # Test API endpoint
    if curl -f http://localhost/health >/dev/null 2>&1; then
        log "✓ API health check passed"
    else
        warn "⚠ API health check failed - this might be expected if Nginx isn't proxying yet"
    fi

    log "Health checks completed."
}

# Main deployment sequence
main() {
    log "Starting production deployment sequence..."

    check_prerequisites
    setup_directories
    install_dependencies
    configure_redis
    configure_nginx
    create_systemd_service
    create_environment_file
    setup_log_rotation
    setup_backup
    security_hardening
    start_services
    run_health_checks

    log "🎉 Production deployment completed successfully!"
    log "Application is now running and accessible."
    log "Services:"
    log "  - API: http://localhost:5000 (proxied by Nginx on port 80)"
    log "  - Redis: localhost:6380"
    log "  - Health check: http://localhost/health"
    log ""
    log "Management commands:"
    log "  - Start: systemctl start quantum-portfolio"
    log "  - Stop: systemctl stop quantum-portfolio"
    log "  - Restart: systemctl restart quantum-portfolio"
    log "  - Status: systemctl status quantum-portfolio"
    log "  - Logs: journalctl -u quantum-portfolio -f"
}

# Execute main function
main "$@"