#!/bin/sh
set -eu

die() {
  echo "deploy-release: $*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || die "run as root"
[ "$#" -eq 2 ] || die "usage: deploy-release.sh ARCHIVE RELEASE_ID"

archive=$1
release_id=$2
case "$release_id" in
  *[!A-Za-z0-9._-]*) die "invalid release id" ;;
esac
[ -f "$archive" ] || die "archive not found: $archive"

app_root=/opt/business-central
releases="$app_root/releases"
release="$releases/$release_id"
staging="$releases/.incoming-$release_id-$$"

mkdir -p "$releases"
rm -rf "$staging"
trap 'rm -rf "$staging"' EXIT
mkdir "$staging"
tar -xzf "$archive" -C "$staging"

[ -x "$staging/business-central-backend" ] || die "artifact is missing executable backend"
[ -f "$staging/schema.sql" ] || die "artifact is missing schema.sql"
[ -f "$staging/docs/index.html" ] || die "artifact is missing docs/index.html"
[ -f "$staging/docs/openapi.yaml" ] || die "artifact is missing docs/openapi.yaml"
[ ! -e "$release" ] || die "release already exists: $release_id"

previous_release=$(readlink "$app_root/current" 2>/dev/null || true)

chown -R root:root "$staging"
chmod 0755 "$staging/business-central-backend"
chmod 0644 "$staging/schema.sql" "$staging/docs/index.html" "$staging/docs/openapi.yaml"
mv "$staging" "$release"
ln -sfn "$release" "$app_root/current"

if rc-service business-central-backend restart; then
  :
else
  rc-service business-central-backend start || true
fi

ready=0
for _ in $(seq 1 30); do
  if wget -q -O - http://127.0.0.1:8080/health >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  if [ -n "$previous_release" ]; then
    ln -sfn "$previous_release" "$app_root/current"
    rc-service business-central-backend restart || true
  else
    rc-service business-central-backend stop || true
  fi
  rm -rf "$release"
  die "backend did not become healthy; inspect /var/log/business-central-backend.error.log"
fi

# AUTO_INIT_SCHEMA is needed only for the first boot. The backend itself also
# checks whether the core schema exists, so this is safe if setup is rerun.
if grep -Fq "export AUTO_INIT_SCHEMA='true'" /etc/business-central/backend.env; then
  sed -i "s/^export AUTO_INIT_SCHEMA='true'$/export AUTO_INIT_SCHEMA='false'/" /etc/business-central/backend.env
fi

rm -f "$archive"
# Keep the fast-disk release area bounded. Release IDs are validated above and
# therefore cannot escape this directory.
kept=0
for candidate in $(ls -1dt "$releases"/* 2>/dev/null || true); do
  [ -d "$candidate" ] || continue
  kept=$((kept + 1))
  [ "$kept" -le 5 ] || rm -rf "$candidate"
done
echo "deployed Business Central release $release_id"
