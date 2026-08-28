# Business Central datastore VPS

This bundle runs only PostgreSQL, SeaweedFS, an Nginx file proxy, and a
Cloudflare Tunnel connector. It is separate from the backend and portal
deployments.

All installation commands in this guide are run directly inside the NAT VPS
after connecting over SSH. The fastest method is to create the small number of
deployment files directly with `vi`; no GitHub clone, Windows `scp` step, or
GitHub Actions workflow is required.

The new VPS is:

```text
SSH:       root@85.155.184.191 port 2320
Internal: 10.5.28.147
OS:       Alpine 3.24.1
RAM:      256 MB
Disk:     6 GB NVMe; no HDD is attached
```

Because this VPS has no HDD, all persistent data is stored on its NVMe disk
under `/data/business-central-datastore`:

```text
/data/business-central-datastore/postgres
/data/business-central-datastore/seaweedfs
```

## Important memory warning

The Compose file sets a hard RAM limit of 80 MB for PostgreSQL and 100 MB for
SeaweedFS. Those limits are extremely small. PostgreSQL or SeaweedFS can be
OOM-killed during startup, migrations, backups, large uploads, or concurrent
requests. The services use conservative settings and allow an additional
amount of swap, but this is suitable only for a very small initial workload.

The host also runs Docker, Nginx, and `cloudflared`. A 512 MB VPS would be a
safer minimum for production. Keep off-host backups even if this deployment
appears healthy.

## 1. Confirm the VPS and disk

From your normal SSH terminal, connect to the NAT VPS:

```sh
ssh root@85.155.184.191 -p 2320
```

From this point onward, run every command in this guide on the VPS.

On the VPS, run:

```sh
free -h
df -h
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT
```

This machine has no separate `/dev/vdb1` HDD. Do not run `mkfs` or format any
disk. The data path used below is on the root NVMe filesystem.

## 2. Add host swap

Check whether swap already exists:

```sh
swapon --show
```

If the command shows an existing swap device or file, keep it and skip the
following creation commands. If it shows nothing, create a 1 GB swap file:

```sh
dd if=/dev/zero of=/swapfile bs=1M count=1024
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
printf '%s\n' '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```

Swap is not a replacement for RAM. It only gives the very small containers a
chance to survive short memory bursts.

## 3. Install Docker on Alpine

Run as root:

```sh
apk update
apk add docker docker-cli-compose openssl
rc-update add docker default
service docker start
docker version
docker compose version
```

Alpine provides Docker through its community repository and Compose through
the `docker-cli-compose` package. Docker must be enabled at boot so the
containers restart after a VPS reboot. See the [Alpine Docker
instructions](https://wiki.alpinelinux.org/wiki/Docker).

## If Docker image downloads time out

The VPS has a low-performance network tier, so pulling all images in parallel
can cause a Docker Hub TLS handshake timeout. This does not delete data or
damage the database. Pull images one at a time:

```sh
cd /opt/business-central-datastore
docker compose --parallel 1 pull
```

Docker Compose supports the `--parallel 1` option for sequential image pulls.
If that still fails, test outbound access to Docker Hub:

```sh
wget -S -O /dev/null https://registry-1.docker.io/v2/
```

A `401 Unauthorized` response is acceptable; it proves the registry was
reached. A timeout indicates that the VPS cannot complete the TLS connection.
Check the clock and DNS:

```sh
date -u
cat /etc/resolv.conf
```

If DNS is incorrect, create or edit `/etc/docker/daemon.json` with `vi`:

```json
{
  "dns": ["1.1.1.1", "8.8.8.8"],
  "max-concurrent-downloads": 1,
  "max-download-attempts": 10
}
```

Then restart Docker and retry:

```sh
service docker restart
docker compose --parallel 1 pull
```

Do not overwrite an existing `daemon.json` blindly; preserve any existing
settings and add only the missing keys. Docker documents both the daemon DNS
configuration and the concurrent-download setting in its troubleshooting and
daemon references.

## 4. Create the deployment files directly on the VPS

Create the application and persistent-data directories:

```sh
mkdir -p /opt/business-central-datastore/nginx
mkdir -p /data/business-central-datastore/postgres
mkdir -p /data/business-central-datastore/seaweedfs
mkdir -p /data/business-central-datastore/backups
chmod 700 /data/business-central-datastore
cd /opt/business-central-datastore
```

Create the Compose file:

```sh
vi docker-compose.yml
```

Copy and paste the complete contents of
`datastore/docker-compose.yml` from this repository, then save with `Esc`,
`:wq`, and Enter.

Create the Nginx proxy configuration:

```sh
vi nginx/file-server.conf.template
```

Copy and paste the complete contents of
`datastore/nginx/file-server.conf.template`, then save with `Esc`, `:wq`, and
Enter.

The first line of the template must be:

```nginx
map_hash_bucket_size 128;
```

It must appear before the `map $http_authorization` block. The long Bearer
token makes Nginx's default map hash bucket too small.

Create the environment file:

```sh
vi .env
```

Paste this structure and replace the placeholder values:

```dotenv
DATA_ROOT=/data/business-central-datastore
POSTGRES_DB=business_central
POSTGRES_USER=business_central
POSTGRES_PASSWORD=PASTE_A_LONG_RANDOM_PASSWORD
POSTGRES_PUBLIC_PORT=4999
SEAWEEDFS_AUTH_TOKEN=PASTE_A_LONG_RANDOM_TOKEN
FILE_PUBLIC_PORT=5000
FILER_PUBLIC_PORT=5001
CLOUDFLARE_TUNNEL_TOKEN=PASTE_CLOUDFLARE_TUNNEL_TOKEN
```

Protect the environment file:

```sh
chmod 600 .env
```

Generate the two random values on the VPS, one at a time, without sharing
them in chat:

```sh
openssl rand -hex 24
openssl rand -hex 32
```

Use the first output as `POSTGRES_PASSWORD` and the second as
`SEAWEEDFS_AUTH_TOKEN`. The Cloudflare tunnel token comes from the Cloudflare
dashboard in the next section.

Save `.env` in `vi` with `Esc`, `:wq`, and Enter. Protect it:

```sh
chmod 600 .env
```

## 5. Create the Cloudflare Tunnel token

Do this before starting Docker because the `cloudflared` container needs its
token in `.env`.

The domain `nanonux.com` must already be managed by Cloudflare.

1. Open Cloudflare Dashboard.
2. Go to **Networking > Tunnels**.
3. Choose **Create Tunnel**.
4. Name it `business-central-datastore`.
5. Choose the Docker connector instructions.
6. Copy the tunnel token only into `CLOUDFLARE_TUNNEL_TOKEN` in `/opt/business-central-datastore/.env`.
7. Do not paste the token into GitHub, this repository, or chat.

Do not add the published application routes until the containers are running.
The exact route steps are in Step 8.

## 6. Create the database DNS name

Do this after obtaining the tunnel token and before starting Docker. This step
is independent of the HTTP tunnel routes.

Use a separate DNS-only record for PostgreSQL:

```text
Type:    A
Name:    business-central-db
Target:  85.155.184.191
Proxy:   DNS only / grey cloud
```

This creates `business-central-db.nanonux.com` and points it at the NAT VPS.
It is not a Cloudflare Tunnel route. A normal Render `DATABASE_URL` speaks
PostgreSQL, not HTTP. Cloudflare documents that non-HTTP tunnel protocols
require `cloudflared` on the client side, so a normal database connection
cannot simply use an HTTP published-application route. See [Cloudflare
protocol support](https://developers.cloudflare.com/tunnel/routing/).

The DNS-only database record exposes the VPS IP. Use the long random database
password, keep the NAT port limited to PostgreSQL, and plan to add PostgreSQL
TLS or a private VPN before storing important production data.

## 7. Start the containers

Do this after Steps 5 and 6. Add the Cloudflare published application routes
after the containers are running, as described in Step 8.

On the VPS:

```sh
cd /opt/business-central-datastore
docker compose config
docker compose pull
docker compose up -d
docker compose ps
```

`docker compose config` should complete without an environment-variable
error. If it says a variable is missing, correct `.env` before continuing.

The NAT provider already forwards these TCP ports for this VPS:

| NAT public port | VPS/container function |
|---:|---|
| 2320 | SSH to VPS port 22 |
| 4999 | PostgreSQL container port 5432 |
| 5000 | Public Nginx file proxy |
| 5001 | Bearer-protected Nginx filer proxy |
| 5002+ | Unused by this bundle |

The UDP forwards are not needed for PostgreSQL, HTTP, or Cloudflare Tunnel.
Cloudflare Tunnel makes outbound connections from the VPS.

## 8. Add Cloudflare published application routes and verify

After `docker compose ps` shows `cloudflared` as `Up`, add both routes to the
same tunnel:

1. Open Cloudflare Dashboard.
2. Go to **Networking > Tunnels**.
3. Select `business-central-datastore`.
4. Open the **Routes** tab.
5. Select **Add route > Published application**.
6. Enter the hostname and service URL from the table below, then save it.
7. Repeat for the second route.

| Public hostname | Service URL inside the Compose network | Purpose |
|---|---|---|
| `business-central-file.nanonux.com` | `http://file-proxy:80` | Public `/media/...` reads |
| `business-central-filer.nanonux.com` | `http://file-proxy:81` | Backend-only protected filer API |

These service URLs are correct because `cloudflared` and `file-proxy` share the
`datastore` Docker network. Use `http://file-proxy:80` for public browser
reads and `http://file-proxy:81` for backend requests carrying the Bearer
token. Do not use `localhost` or the NAT public IP as the service URL.

Cloudflare Tunnel maps each public hostname to its local service. When
`nanonux.com` is fully managed by Cloudflare, adding a published route also
creates the corresponding DNS record. Do not create an additional A record for
these two hostnames. See [Cloudflare Tunnel setup](https://developers.cloudflare.com/tunnel/setup/).

The filer hostname is publicly addressable but protected by the shared Bearer
token at Nginx. It is not a browser upload URL. For stronger access control,
add a Cloudflare Access policy as an additional layer.

## 9. Verify the services

Check container state:

```sh
docker compose ps
docker compose logs --tail=50 postgres
docker compose logs --tail=50 seaweedfs
docker compose logs --tail=50 file-proxy
docker compose logs --tail=50 cloudflared
```

PostgreSQL must report ready:

```sh
docker compose exec postgres pg_isready -U business_central -d business_central
```

Check the local proxy endpoints:

```sh
curl -i http://127.0.0.1:5000/healthz
curl -i http://127.0.0.1:5001/healthz
curl -i http://127.0.0.1:5001/media/test.png
```

The first command should return `200`. Port 5001 should return `401` for an
unauthorized request. A nonexistent authorized media object may return `404`;
that still proves the protected filer proxy is reachable.

Check memory limits:

```sh
docker stats --no-stream business-central-postgres business-central-seaweedfs business-central-file-proxy business-central-cloudflared
```

The PostgreSQL limit should show `80MiB` and SeaweedFS should show `100MiB`.
If either container repeatedly restarts, the memory cap is too small for the
workload and the VPS should be upgraded.

Confirm that data is being written to the intended disk:

```sh
du -sh /data/business-central-datastore/postgres
du -sh /data/business-central-datastore/seaweedfs
```

## 10. Configure the Render backend

Set these Render environment variables. Do not commit them to GitHub:

```env
DATABASE_URL=postgres://business_central:POSTGRES_PASSWORD@business-central-db.nanonux.com:4999/business_central?sslmode=disable
SEAWEEDFS_FILER_URL=https://business-central-filer.nanonux.com
SEAWEEDFS_FILER_AUTHORIZATION=Bearer SEAWEEDFS_AUTH_TOKEN
```

Replace `POSTGRES_PASSWORD` with the exact value in the datastore `.env`, and
replace `SEAWEEDFS_AUTH_TOKEN` with the exact value from the datastore `.env`.
Do not include angle brackets or placeholder names in the real values.

The application stores relative `/media/...` paths. Set the portal's public
file URL separately:

```env
NEXT_PUBLIC_FILE_SERVER_URL=https://business-central-file.nanonux.com
```

The backend authorization value must be exactly `Bearer ` followed by the
same token used by the Nginx filer proxy. This deployment uses a static
Nginx-validated service token; it is not a native SeaweedFS JWT.

The current backend upload client sends this header to
`business-central-filer.nanonux.com`. The browser does not receive the
service token.

## 11. First backend connection and schema setup

Deploy the backend from Render with its normal production variables. For a
brand-new database, keep the backend's first-start schema initialization
enabled according to the backend deployment instructions. After the backend
successfully creates the schema and the first administrator, disable one-time
initialization as documented by the backend project.

Then test:

```text
GET https://business-central-backend.nanonux.com/health
GET https://business-central-backend.nanonux.com/health/db
```

Perform one small authenticated image upload from the portal. Check the
backend logs in Render and the filer proxy logs on the VPS:

```sh
docker compose logs --tail=100 file-proxy
docker compose logs --tail=100 seaweedfs
```

## 12. Reboot behavior

Docker is enabled with OpenRC, and all services use `restart: unless-stopped`.
After a reboot, verify instead of assuming:

```sh
reboot
```

Reconnect after the VPS returns:

```sh
ssh root@85.155.184.191 -p 2320
```

```sh
cd /opt/business-central-datastore
docker compose ps
free -h
df -h /data/business-central-datastore
```

The containers should restart automatically. Persistent database and
SeaweedFS data remains under `/data/business-central-datastore`; `docker
compose down` does not remove bind-mounted data. Never run
`docker compose down -v` as part of routine maintenance.

## 13. Backups

The 6 GB NVMe disk is not a backup. At minimum, create PostgreSQL logical
dumps and copy them to another machine:

```sh
cd /opt/business-central-datastore
docker compose exec -T postgres pg_dump -U business_central -d business_central > /data/business-central-datastore/backups/business_central.sql
chmod 600 /data/business-central-datastore/backups/business_central.sql
```

Copy that dump off the VPS. Also back up the SeaweedFS directory or use a
SeaweedFS-aware backup process. Test restoring a dump before treating this
single-node server as production storage.

## 14. Updating the datastore bundle

The datastore does not need GitHub Actions. When you intentionally change the
Compose or proxy files, paste the updated file into the VPS again with `vi`:

```sh
cd /opt/business-central-datastore
vi docker-compose.yml
vi nginx/file-server.conf.template
docker compose up -d
docker compose ps
```

Do not replace `.env` during an update. Persistent data is outside the
deployment files under `/data/business-central-datastore`.
