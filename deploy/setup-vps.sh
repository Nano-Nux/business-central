#!/bin/sh
set -eu

die() {
  echo "setup-vps: $*" >&2
  exit 1
}

quote_for_shell() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\''/g")"
}

[ "$(id -u)" -eq 0 ] || die "run as root"
: "${CORS_ORIGIN:?set CORS_ORIGIN to the comma-separated portal/admin origins}"

HDD_MOUNT_POINT=${HDD_MOUNT_POINT:-/data}
POSTGRES_MAJOR=${POSTGRES_MAJOR:-17}
SEAWEEDFS_VERSION=${SEAWEEDFS_VERSION:-4.29}
CLOUDFLARED_VERSION=${CLOUDFLARED_VERSION:-latest}
PUBLIC_HTTP_BIND=${PUBLIC_HTTP_BIND:-0.0.0.0}
PUBLIC_HTTP_PORT=${PUBLIC_HTTP_PORT:-5000}
PUBLIC_BASE_URL=${PUBLIC_BASE_URL:-http://127.0.0.1:$PUBLIC_HTTP_PORT}
API_HOSTNAME=${API_HOSTNAME:-}
FILES_HOSTNAME=${FILES_HOSTNAME:-}
HDD_ROOT="$HDD_MOUNT_POINT/business-central"
APP_ROOT=/opt/business-central
CONFIG_ROOT=/etc/business-central
CLOUDFLARED_ROOT=/etc/cloudflared
DB_PASSWORD_FILE="$CONFIG_ROOT/postgres.password"
BACKEND_ENV="$CONFIG_ROOT/backend.env"
STORAGE_ENV="$CONFIG_ROOT/storage.env"

case "$PUBLIC_HTTP_PORT" in
  ""|*[!0-9]*) die "PUBLIC_HTTP_PORT must be a numeric port" ;;
esac
case "$PUBLIC_HTTP_BIND" in
  "") die "PUBLIC_HTTP_BIND must be an IP address or hostname" ;;
  *[!A-Za-z0-9:.-]*) die "PUBLIC_HTTP_BIND must be an IP address or hostname" ;;
esac
case "$API_HOSTNAME" in
  "") ;;
  *[!A-Za-z0-9.-]*) die "API_HOSTNAME contains unsupported characters" ;;
esac
case "$FILES_HOSTNAME" in
  "") ;;
  *[!A-Za-z0-9.-]*) die "FILES_HOSTNAME contains unsupported characters" ;;
esac

case "$(uname -m)" in
  x86_64|amd64) ;;
  *) die "this deployment currently supports only x86_64 Alpine hosts" ;;
esac

requested_hdd_root=$HDD_ROOT
if [ -f "$STORAGE_ENV" ]; then
  . "$STORAGE_ENV"
  [ "${HDD_ROOT:-}" = "$requested_hdd_root" ] || die "existing $STORAGE_ENV points to ${HDD_ROOT:-an empty path}; rerun with the matching HDD_MOUNT_POINT"
  HDD_ROOT=$requested_hdd_root
fi

apk add --no-cache \
  ca-certificates curl e2fsprogs gzip jq nginx openssl tar util-linux \
  "postgresql${POSTGRES_MAJOR}" \
  "postgresql${POSTGRES_MAJOR}-client" \
  "postgresql${POSTGRES_MAJOR}-contrib" \
  "postgresql${POSTGRES_MAJOR}-openrc"
update-ca-certificates

mountpoint -q "$HDD_MOUNT_POINT" || die "$HDD_MOUNT_POINT is not mounted; run mount-hdd.sh first"

addgroup -S business-central 2>/dev/null || true
addgroup -S seaweedfs 2>/dev/null || true
addgroup -S cloudflared 2>/dev/null || true
if ! id business-central >/dev/null 2>&1; then
  adduser -S -D -H -s /sbin/nologin -G business-central business-central
fi
if ! id seaweedfs >/dev/null 2>&1; then
  adduser -S -D -H -s /sbin/nologin -G seaweedfs seaweedfs
fi
if ! id cloudflared >/dev/null 2>&1; then
  adduser -S -D -H -s /sbin/nologin -G cloudflared cloudflared
fi

mkdir -p "$APP_ROOT/bin" "$APP_ROOT/releases" "$CONFIG_ROOT" "$CLOUDFLARED_ROOT" \
  "$HDD_ROOT/postgresql/data" \
  "$HDD_ROOT/seaweedfs/master" \
  "$HDD_ROOT/seaweedfs/volume" \
  "$HDD_ROOT/seaweedfs/index" \
  "$HDD_ROOT/seaweedfs/filer"
chown -R postgres:postgres "$HDD_ROOT/postgresql"
chown -R seaweedfs:seaweedfs "$HDD_ROOT/seaweedfs"
chmod 0750 "$CONFIG_ROOT"
chown root:cloudflared "$CLOUDFLARED_ROOT"
chmod 0750 "$CLOUDFLARED_ROOT"

# Nginx is the single HTTP entry point. The current NAT VPS forwards public
# port 5000 to VPS port 5000, so this listener supports direct IP access now.
# The default server routes API and media paths without requiring DNS.
# Optional hostname-specific servers preserve clean API/files host separation
# when Cloudflare is configured later.
mkdir -p /etc/nginx/http.d
cat > /etc/nginx/http.d/business-central.conf <<EOF
server {
  listen ${PUBLIC_HTTP_BIND}:${PUBLIC_HTTP_PORT} default_server;
  server_name _;
  client_max_body_size 50m;

  location /media/ {
    proxy_pass http://127.0.0.1:8889;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF

if [ -n "$API_HOSTNAME" ]; then
  cat >> /etc/nginx/http.d/business-central.conf <<EOF
server {
  listen ${PUBLIC_HTTP_BIND}:${PUBLIC_HTTP_PORT};
  server_name $API_HOSTNAME;
  client_max_body_size 50m;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF
fi

if [ -n "$FILES_HOSTNAME" ]; then
  cat >> /etc/nginx/http.d/business-central.conf <<EOF
server {
  listen ${PUBLIC_HTTP_BIND}:${PUBLIC_HTTP_PORT};
  server_name $FILES_HOSTNAME;
  client_max_body_size 50m;

  location / {
    proxy_pass http://127.0.0.1:8889;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF
fi
nginx -t
rc-update add nginx default >/dev/null

# Alpine's OpenRC service reads data_dir from this file. PostgreSQL data and
# WAL therefore remain on the HDD rather than using the 2 GB fast disk.
cat > /etc/conf.d/postgresql <<EOF
data_dir="$HDD_ROOT/postgresql/data"
auto_setup="no"
EOF

if [ ! -f "$HDD_ROOT/postgresql/data/PG_VERSION" ]; then
  su -s /bin/sh postgres -c "initdb -D '$HDD_ROOT/postgresql/data' --encoding=UTF8 --locale=C"
fi

if ! grep -Fq '# Business Central PostgreSQL settings' "$HDD_ROOT/postgresql/data/postgresql.conf"; then
  cat >> "$HDD_ROOT/postgresql/data/postgresql.conf" <<EOF

# Business Central PostgreSQL settings
listen_addresses = '127.0.0.1'
port = 5432
max_connections = 30
shared_buffers = '32MB'
effective_cache_size = '128MB'
maintenance_work_mem = '16MB'
work_mem = '2MB'
wal_compression = on
checkpoint_timeout = '15min'
EOF
fi
if ! grep -Fq '# Business Central local password access' "$HDD_ROOT/postgresql/data/pg_hba.conf"; then
  cat >> "$HDD_ROOT/postgresql/data/pg_hba.conf" <<EOF

# Business Central local password access
host all all 127.0.0.1/32 scram-sha-256
EOF
fi

rc-update add postgresql default >/dev/null
rc-service postgresql stop >/dev/null 2>&1 || true
rc-service postgresql start
ready=0
for _ in $(seq 1 30); do
  if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[ "$ready" -eq 1 ] || die "PostgreSQL did not become ready"

if [ ! -f "$DB_PASSWORD_FILE" ]; then
  db_password=${BC_DATABASE_PASSWORD:-$(openssl rand -hex 24)}
  printf '%s\n' "$db_password" > "$DB_PASSWORD_FILE"
  chmod 0600 "$DB_PASSWORD_FILE"
else
  db_password=$(cat "$DB_PASSWORD_FILE")
fi
[ -n "$db_password" ] || die "database password is empty"

psql_command="psql -v ON_ERROR_STOP=1 --set=db_password=$(quote_for_shell "$db_password") postgres"
su -s /bin/sh postgres -c "$psql_command" <<'SQL'
SELECT format('CREATE ROLE business_central LOGIN PASSWORD %L', :'db_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'business_central') \gexec
ALTER ROLE business_central WITH LOGIN PASSWORD :'db_password';
SELECT 'CREATE DATABASE business_central OWNER business_central'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'business_central') \gexec
ALTER DATABASE business_central OWNER TO business_central;
ALTER DATABASE business_central SET timezone TO 'UTC';
SQL

if [ ! -f "$BACKEND_ENV" ]; then
  db_password_url=$(jq -nr --arg password "$db_password" '$password|@uri')
  jwt_secret=${JWT_SECRET:-$(openssl rand -hex 32)}
  [ "${#jwt_secret}" -ge 32 ] || die "JWT_SECRET must be at least 32 characters"
  admin_email=${ADMIN_EMAIL:-}
  admin_password=${ADMIN_PASSWORD:-}
  if [ -n "$admin_email" ] && [ -z "$admin_password" ]; then
    die "ADMIN_PASSWORD is required when ADMIN_EMAIL is set"
  fi
  if [ -n "$admin_password" ] && [ -z "$admin_email" ]; then
    die "ADMIN_EMAIL is required when ADMIN_PASSWORD is set"
  fi
  {
    printf 'export DATABASE_URL=%s\n' "$(quote_for_shell "postgres://business_central:$db_password_url@127.0.0.1:5432/business_central?sslmode=disable")"
    printf 'export HOST=%s\n' "$(quote_for_shell 127.0.0.1)"
    printf 'export PORT=%s\n' "$(quote_for_shell 8080)"
    printf 'export APP_ENV=%s\n' "$(quote_for_shell production)"
    printf 'export PUBLIC_BASE_URL=%s\n' "$(quote_for_shell "$PUBLIC_BASE_URL")"
    printf 'export CORS_ORIGIN=%s\n' "$(quote_for_shell "$CORS_ORIGIN")"
    printf 'export SEAWEEDFS_FILER_URL=%s\n' "$(quote_for_shell http://127.0.0.1:8888)"
    printf 'export JWT_SECRET=%s\n' "$(quote_for_shell "$jwt_secret")"
    printf 'export ACCESS_TOKEN_TTL=%s\n' "$(quote_for_shell 24h)"
    printf 'export REFRESH_TOKEN_TTL=%s\n' "$(quote_for_shell 336h)"
    printf 'export BCRYPT_COST=%s\n' "$(quote_for_shell 10)"
    printf 'export AUTO_INIT_SCHEMA=%s\n' "$(quote_for_shell true)"
    printf 'export AUTO_MIGRATE=%s\n' "$(quote_for_shell true)"
    printf 'export ADMIN_EMAIL=%s\n' "$(quote_for_shell "$admin_email")"
    printf 'export ADMIN_PASSWORD=%s\n' "$(quote_for_shell "$admin_password")"
    printf 'export PLATFORM_ADMIN_EMAIL=%s\n' "$(quote_for_shell '')"
    printf 'export PLATFORM_ADMIN_PASSWORD=%s\n' "$(quote_for_shell '')"
  } > "$BACKEND_ENV"
  chmod 0640 "$BACKEND_ENV"
  chown root:business-central "$BACKEND_ENV"
fi
if [ ! -f "$STORAGE_ENV" ]; then
  printf 'export HDD_ROOT=%s\n' "$(quote_for_shell "$HDD_ROOT")" > "$STORAGE_ENV"
  chmod 0640 "$STORAGE_ENV"
  chown root:seaweedfs "$STORAGE_ENV"
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
install -m 0755 "$SCRIPT_DIR/deploy-release.sh" "$APP_ROOT/bin/deploy-release.sh"
install -m 0755 "$SCRIPT_DIR/init.d/business-central-backend" /etc/init.d/business-central-backend
install -m 0755 "$SCRIPT_DIR/init.d/seaweedfs" /etc/init.d/seaweedfs
install -m 0755 "$SCRIPT_DIR/init.d/cloudflared" /etc/init.d/cloudflared

if [ ! -x /usr/local/bin/weed ]; then
  temp_dir=$(mktemp -d)
  trap 'rm -rf "$temp_dir"' EXIT
  seaweed_url="https://github.com/seaweedfs/seaweedfs/releases/download/$SEAWEEDFS_VERSION/linux_amd64.tar.gz"
  curl -fsSL --retry 3 "$seaweed_url" -o "$temp_dir/seaweedfs.tar.gz"
  if curl -fsSL --retry 3 "$seaweed_url.md5" -o "$temp_dir/seaweedfs.md5"; then
    expected_md5=$(awk 'NR == 1 {print $1}' "$temp_dir/seaweedfs.md5")
    actual_md5=$(md5sum "$temp_dir/seaweedfs.tar.gz" | awk '{print $1}')
    [ "$expected_md5" = "$actual_md5" ] || die "SeaweedFS download checksum mismatch"
  fi
  tar -xzf "$temp_dir/seaweedfs.tar.gz" -C "$temp_dir"
  install -m 0755 "$temp_dir/weed" /usr/local/bin/weed
  rm -rf "$temp_dir"
  trap - EXIT
fi

if [ ! -x /usr/local/bin/cloudflared ]; then
  temp_dir=$(mktemp -d)
  trap 'rm -rf "$temp_dir"' EXIT
  if [ "$CLOUDFLARED_VERSION" = latest ]; then
    release_json=$(curl -fsSL --retry 3 https://api.github.com/repos/cloudflare/cloudflared/releases/latest)
    resolved_cloudflared_version=$(printf '%s' "$release_json" | jq -r '.tag_name // empty')
    cloudflared_sha256=$(printf '%s' "$release_json" | jq -r '.body // empty' | sed -n 's/.*cloudflared-linux-amd64: \([0-9a-fA-F]\{64\}\).*/\1/p' | sed -n '1p')
    [ -n "$resolved_cloudflared_version" ] || die "could not resolve the latest cloudflared release"
    [ -n "$cloudflared_sha256" ] || die "could not resolve the latest cloudflared checksum"
    cloudflared_url="https://github.com/cloudflare/cloudflared/releases/download/$resolved_cloudflared_version/cloudflared-linux-amd64"
  else
    cloudflared_url="https://github.com/cloudflare/cloudflared/releases/download/$CLOUDFLARED_VERSION/cloudflared-linux-amd64"
    cloudflared_sha256=${CLOUDFLARED_SHA256:-}
    [ -n "$cloudflared_sha256" ] || die "set CLOUDFLARED_SHA256 when CLOUDFLARED_VERSION is pinned"
  fi
  curl -fsSL --retry 3 "$cloudflared_url" -o "$temp_dir/cloudflared"
  printf '%s  %s\n' "$cloudflared_sha256" "$temp_dir/cloudflared" | sha256sum -c -
  install -m 0755 "$temp_dir/cloudflared" /usr/local/bin/cloudflared
  rm -rf "$temp_dir"
  trap - EXIT
fi

touch /var/log/business-central-backend.log /var/log/business-central-backend.error.log
touch /var/log/seaweedfs.log /var/log/seaweedfs.error.log
touch /var/log/cloudflared.log /var/log/cloudflared.error.log
chown business-central:business-central /var/log/business-central-backend.log /var/log/business-central-backend.error.log
chown seaweedfs:seaweedfs /var/log/seaweedfs.log /var/log/seaweedfs.error.log
chown cloudflared:cloudflared /var/log/cloudflared.log /var/log/cloudflared.error.log
chmod 0640 /var/log/business-central-backend* /var/log/seaweedfs* /var/log/cloudflared*

rc-update add postgresql default >/dev/null
rc-update add seaweedfs default >/dev/null
rc-update add business-central-backend default >/dev/null
rc-service nginx start || rc-service nginx restart
rc-service seaweedfs start

if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  printf '%s\n' "$CLOUDFLARE_TUNNEL_TOKEN" > "$CLOUDFLARED_ROOT/business-central.token"
  chown root:cloudflared "$CLOUDFLARED_ROOT/business-central.token"
  chmod 0640 "$CLOUDFLARED_ROOT/business-central.token"
  rc-update add cloudflared default >/dev/null
  rc-service cloudflared start
else
  echo "Cloudflare token not supplied; configure-cloudflare.sh can install it later."
fi

if [ -L "$APP_ROOT/current" ]; then
  rc-service business-central-backend start || true
else
  echo "VPS services installed. Deploy the first artifact to start business-central-backend."
fi

echo "VPS setup complete. PostgreSQL and SeaweedFS data are under $HDD_ROOT."
