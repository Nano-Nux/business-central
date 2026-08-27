#!/bin/sh
set -eu

die() {
  echo "configure-cloudflare: $*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

urlencode() {
  jq -nr --arg value "$1" '$value|@uri'
}

cf_api() {
  cf_method=$1
  cf_path=$2
  cf_body=${3-}
  if [ -n "$cf_body" ]; then
    cf_response=$(curl -fsS --retry 3 \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -H 'Content-Type: application/json' \
      -X "$cf_method" \
      -d "$cf_body" \
      "https://api.cloudflare.com/client/v4$cf_path") || die "Cloudflare API request failed: $cf_method $cf_path"
  else
    cf_response=$(curl -fsS --retry 3 \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -X "$cf_method" \
      "https://api.cloudflare.com/client/v4$cf_path") || die "Cloudflare API request failed: $cf_method $cf_path"
  fi
  if ! printf '%s' "$cf_response" | jq -e '.success == true' >/dev/null; then
    printf '%s\n' "$cf_response" | jq -c '.errors // .' >&2
    die "Cloudflare API rejected: $cf_method $cf_path"
  fi
  printf '%s' "$cf_response"
}

dns_upsert() {
  dns_name=$1
  dns_content=$2
  encoded_name=$(urlencode "$dns_name")
  dns_records=$(cf_api GET "/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=$encoded_name")
  dns_count=$(printf '%s' "$dns_records" | jq '.result | length')
  [ "$dns_count" -le 1 ] || die "more than one DNS record exists for $dns_name; remove duplicates first"
  dns_id=$(printf '%s' "$dns_records" | jq -r '.result[0].id // empty')
  dns_body=$(jq -nc \
    --arg name "$dns_name" \
    --arg content "$dns_content" \
    '{type:"CNAME",name:$name,content:$content,ttl:1,proxied:true}')
  if [ -n "$dns_id" ]; then
    cf_api PUT "/zones/$CLOUDFLARE_ZONE_ID/dns_records/$dns_id" "$dns_body" >/dev/null
  else
    cf_api POST "/zones/$CLOUDFLARE_ZONE_ID/dns_records" "$dns_body" >/dev/null
  fi
}

need_command curl
need_command jq
need_command openssl
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
: "${CLOUDFLARE_ZONE_ID:?set CLOUDFLARE_ZONE_ID}"
: "${CLOUDFLARE_ZONE_NAME:?set CLOUDFLARE_ZONE_NAME, for example nanonux.com}"
: "${API_HOSTNAME:?set API_HOSTNAME}"
: "${FILES_HOSTNAME:?set FILES_HOSTNAME}"

CLOUDFLARE_TUNNEL_NAME=${CLOUDFLARE_TUNNEL_NAME:-business-central-backend}
API_ORIGIN_SERVICE=${API_ORIGIN_SERVICE:-http://127.0.0.1:8080}
FILES_ORIGIN_SERVICE=${FILES_ORIGIN_SERVICE:-http://127.0.0.1:8889}
CLOUDFLARE_ZONE_NAME=${CLOUDFLARE_ZONE_NAME%.}

case "$API_HOSTNAME" in
  "$CLOUDFLARE_ZONE_NAME"|*."$CLOUDFLARE_ZONE_NAME") ;;
  *) die "$API_HOSTNAME is outside zone $CLOUDFLARE_ZONE_NAME" ;;
esac
case "$FILES_HOSTNAME" in
  "$CLOUDFLARE_ZONE_NAME"|*."$CLOUDFLARE_ZONE_NAME") ;;
  *) die "$FILES_HOSTNAME is outside zone $CLOUDFLARE_ZONE_NAME" ;;
esac

tunnel_id=${CLOUDFLARE_TUNNEL_ID:-}
if [ -z "$tunnel_id" ]; then
  encoded_tunnel_name=$(urlencode "$CLOUDFLARE_TUNNEL_NAME")
  tunnel_list=$(cf_api GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel?name=$encoded_tunnel_name")
  tunnel_id=$(printf '%s' "$tunnel_list" | jq -r --arg name "$CLOUDFLARE_TUNNEL_NAME" \
    '.result[]? | select(.name == $name and (.deleted_at == null)) | .id' | sed -n '1p')
fi

if [ -z "$tunnel_id" ]; then
  tunnel_secret=$(openssl rand -base64 32 | tr -d '\n')
  tunnel_body=$(jq -nc \
    --arg name "$CLOUDFLARE_TUNNEL_NAME" \
    --arg secret "$tunnel_secret" \
    '{name:$name,config_src:"cloudflare",tunnel_secret:$secret}')
  tunnel_response=$(cf_api POST "/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel" "$tunnel_body")
  tunnel_id=$(printf '%s' "$tunnel_response" | jq -r '.result.id')
fi
[ -n "$tunnel_id" ] || die "could not resolve tunnel id"

tunnel_details=$(cf_api GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel/$tunnel_id")
tunnel_source=$(printf '%s' "$tunnel_details" | jq -r '.result.config_src // empty')
[ "$tunnel_source" = cloudflare ] || die "tunnel $tunnel_id is not remotely managed (config_src=$tunnel_source)"

ingress_body=$(jq -nc \
  --arg api_hostname "$API_HOSTNAME" \
  --arg api_service "$API_ORIGIN_SERVICE" \
  --arg files_hostname "$FILES_HOSTNAME" \
  --arg files_service "$FILES_ORIGIN_SERVICE" \
  '{config:{ingress:[
    {hostname:$api_hostname,service:$api_service,originRequest:{}},
    {hostname:$files_hostname,service:$files_service,originRequest:{}},
    {service:"http_status:404"}
  ]}}')
cf_api PUT "/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel/$tunnel_id/configurations" "$ingress_body" >/dev/null

tunnel_target="$tunnel_id.cfargotunnel.com"
dns_upsert "$API_HOSTNAME" "$tunnel_target"
dns_upsert "$FILES_HOSTNAME" "$tunnel_target"

token_response=$(cf_api GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel/$tunnel_id/token")
tunnel_token=$(printf '%s' "$token_response" | jq -r '.result // empty')
[ -n "$tunnel_token" ] || die "Cloudflare returned an empty tunnel token"

if [ -n "${VPS_SSH_TARGET:-}" ]; then
  need_command ssh
  VPS_SSH_PORT=${VPS_SSH_PORT:-4998}
  printf '%s\n' "$tunnel_token" | ssh -p "$VPS_SSH_PORT" "$VPS_SSH_TARGET" \
    "umask 077; mkdir -p /etc/cloudflared; cat > /etc/cloudflared/business-central.token; chown root:cloudflared /etc/cloudflared/business-central.token 2>/dev/null || true; chmod 0640 /etc/cloudflared/business-central.token; if [ -x /etc/init.d/cloudflared ]; then rc-update add cloudflared default >/dev/null; rc-service cloudflared restart || rc-service cloudflared start; fi"
  echo "Cloudflare tunnel and DNS configured; token installed on $VPS_SSH_TARGET."
else
  token_output=${CLOUDFLARE_TOKEN_OUTPUT:-.cloudflared-tunnel.token}
  (umask 077; printf '%s\n' "$tunnel_token" > "$token_output")
  echo "Cloudflare tunnel and DNS configured. Token saved to $token_output; copy it to /etc/cloudflared/business-central.token on the VPS."
fi

echo "Tunnel: $tunnel_id"
echo "API hostname: $API_HOSTNAME"
echo "Files hostname: $FILES_HOSTNAME"
