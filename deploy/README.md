# Business Central production deployment

This deployment is designed for the current 512 MB Alpine NAT VPS. GitHub Actions builds the Go binary on an Ubuntu runner; the VPS receives only a compressed runtime artifact and never compiles the application.

The VPS uses native OpenRC services instead of Docker:

```text
NAT public 147.135.16.160:5000 -> Nginx 0.0.0.0:5000
                                    |-- /api/...    -> 127.0.0.1:8080
                                    `-- /media/...  -> 127.0.0.1:8889

Cloudflare Tunnel (later) -> Nginx 127.0.0.1:5000

127.0.0.1:5432  PostgreSQL (never published)
```

PostgreSQL data, WAL, SeaweedFS volume data, filer metadata, and SeaweedFS master metadata are all stored below `/data`, which is the mounted `/dev/vdb1` HDD on the current VPS:

```text
/data/business-central/postgresql/data
/data/business-central/seaweedfs
```

The Nginx configuration, application binary, and release directories use the 2 GB fast disk under `/opt`.

## 1. Verify the HDD mount

The current server output shows `/dev/vdb1` already mounted at `/data`. Verify it before setup:

```sh
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT
findmnt /data
```

For the current VPS, do not run a formatting command. If `/data` is ever unmounted, remount the existing filesystem with:

```sh
HDD_DEVICE=/dev/vdb1 HDD_MOUNT_POINT=/data \
  ALLOW_EXISTING_FILESYSTEM=yes sh /tmp/business-central-deploy/mount-hdd.sh
```

`mount-hdd.sh` refuses to format an existing filesystem unless explicitly overridden, and formatting the wrong device would destroy its contents. Only use `FORMAT_HDD=YES` for a confirmed disposable disk.

## 2. Install the VPS services

The setup script needs the deployment directory because it installs the OpenRC service files beside it. From a machine with SSH access:

```sh
scp -P 4998 -r deploy root@147.135.16.160:/tmp/business-central-deploy
```

Run setup in direct-IP mode. The existing NAT rule `5000 -> 5000` reaches Nginx; Nginx then routes API and media paths to the private services. `API_HOSTNAME` and `FILES_HOSTNAME` are optional until DNS is configured.

```sh
ssh -p 4998 root@147.135.16.160 \
  'HDD_MOUNT_POINT=/data \
   PUBLIC_HTTP_BIND=0.0.0.0 \
   PUBLIC_HTTP_PORT=5000 \
   PUBLIC_BASE_URL=http://147.135.16.160:5000 \
   CORS_ORIGIN='*' \
   sh /tmp/business-central-deploy/setup-vps.sh'
```

`CORS_ORIGIN='*'` allows browser clients from any origin. The current portal sends bearer tokens in the `Authorization` header and does not use cookie credentials, so this wildcard configuration is supported. Native mobile clients generally do not enforce browser CORS.

`setup-vps.sh` generates a random database password and JWT secret and stores them in root-readable configuration files. It creates the PostgreSQL role/database, tunes PostgreSQL for the small RAM budget, installs SeaweedFS, installs Nginx, and creates the services. `AUTO_INIT_SCHEMA=true` is used only until the first successful application deployment, when `deploy-release.sh` changes it to `false`.

If you want first-admin bootstrap on the first release, edit `/etc/business-central/backend.env` before deployment and set both `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Never commit that file.

Confirm that PostgreSQL really uses the HDD, not the old default directory:

```sh
ssh -p 4998 root@147.135.16.160 "psql -h 127.0.0.1 -U postgres -d postgres -tAc 'show data_directory;'"
```

The result must be `/data/business-central/postgresql/data`.

Confirm the local services:

```sh
ssh -p 4998 root@147.135.16.160 "rc-service postgresql status; rc-service seaweedfs status; rc-service nginx status; df -h / /data"
```

## 3. Understand the Nginx layer

Nginx listens on VPS port `5000`, which is the port already forwarded by the NAT provider. The default IP-access server routes by URL path:

| URL path | Nginx destination | Purpose |
|---|---|---|
| `/api/...`, `/health`, `/docs` | `127.0.0.1:8080` | Go API |
| `/media/...` | `127.0.0.1:8889` | SeaweedFS public read-only file endpoint |

The backend and SeaweedFS listeners remain private on `127.0.0.1`; only Nginx is reachable through the NAT port. PostgreSQL remains private and is never put in NAT, Cloudflare, or Nginx.

Test direct IP access after the backend and SeaweedFS services are running:

```sh
curl -i http://147.135.16.160:5000/health
curl -i http://147.135.16.160:5000/health/db
```

The existing UDP forwarding rules are not needed for HTTP API or file downloads; TCP port `5000` is the relevant rule.

Before the first backend deployment, the health test may return `502`; that is expected because the API process is not running yet:

```sh
ssh -p 4998 root@147.135.16.160 "nginx -t; curl -i http://127.0.0.1:5000/health"
```

## 4. Configure Cloudflare Tunnel manually

Do this after Nginx is installed. No Cloudflare API token or `configure-cloudflare.sh` is required for this manual method.

1. Sign in to Cloudflare and open the `nanonux.com` zone.
2. Open **Networking > Tunnels** and create one remotely-managed tunnel named `business-central`.
3. Select the Linux connector instructions. Copy the tunnel token shown by Cloudflare, but do not run the Docker command shown there.
4. Install the token on the VPS. Replace only the placeholder before running the command:

   ```sh
   ssh -p 4998 root@147.135.16.160 "printf '%s\\n' 'PASTE-TUNNEL-TOKEN-HERE' > /etc/cloudflared/business-central.token && chown root:cloudflared /etc/cloudflared/business-central.token && chmod 0640 /etc/cloudflared/business-central.token && rc-update add cloudflared default && rc-service cloudflared restart"
   ```

   The token is a secret. Do not commit it to GitHub or put it in a normal chat message.

5. In that tunnel, choose **Routes > Add route > Published application** and add the following two routes:

   | Public hostname | Service URL |
   |---|---|
   | `business-central-backend.nanonux.com` | `http://127.0.0.1:5000` |
   | `business-central-file.nanonux.com` | `http://127.0.0.1:5000` |

   Cloudflare creates the DNS records for these tunnel hostnames. Do not manually create A records pointing at `147.135.16.160`; that is the NAT gateway address, not a direct web origin.

6. Verify the connector:

   ```sh
   ssh -p 4998 root@147.135.16.160 "rc-service cloudflared status; tail -n 50 /var/log/cloudflared.error.log"
   ```

Cloudflare's current dashboard workflow is described in [Cloudflare's Tunnel setup guide](https://developers.cloudflare.com/tunnel/setup/). A single tunnel can publish multiple hostnames, and both hostnames can point to the same local Nginx service.

The file hostname uses Nginx's `/media/...` route to reach SeaweedFS's read-only filer listener (`8889`). Backend uploads use the private filer listener (`8888`), so the public file hostname is for downloads, not an upload API. The `configure-cloudflare.sh` defaults already target port `5000`.

## 5. Configure GitHub Actions

Create a GitHub Actions `production` environment and add these secrets:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | `147.135.16.160` |
| `DEPLOY_PORT` | `4998` |
| `DEPLOY_USER` | `root` (the installed release script requires UID 0) |
| `DEPLOY_SSH_KEY` | Private key whose public key is authorized on the VPS |
| `DEPLOY_KNOWN_HOSTS` | Verified `ssh-keyscan -p 4998 147.135.16.160` output |

The workflow at `.github/workflows/deploy-backend.yml` runs `gofmt` verification, `go vet`, `go test`, and a static `linux/amd64` build on GitHub. It uploads `business-central-backend`, `schema.sql`, and the Swagger files, copies the archive over SSH, activates an immutable release directory, restarts the backend, and checks `/health`.

Pushes changing the backend or deployment files on `production` deploy automatically. `workflow_dispatch` provides a manual redeploy of the current commit.

## 6. Frontend hostnames

The current workflow deploys only the backend. The portal and admin hostnames are separate frontend deployments:

| Hostname | Current status |
|---|---|
| `business-central-portal.nanonux.com` | frontend domain; not served by the backend workflow |
| `business-central-admin.nanonux.com` | frontend domain; not served by the backend workflow |

If these Next.js applications are deployed to Cloudflare Pages or another frontend host, `CORS_ORIGIN='*'` already allows them. If they are later served by this VPS, they must either be exported as static files for Nginx or run as separate Node.js services; the 512 MB VPS is not a good place to run two Next.js servers.

For the portal build before DNS is configured, use the shared NAT port:

```dotenv
NEXT_PUBLIC_API_URL=http://147.135.16.160:5000/api/v1
NEXT_PUBLIC_FILE_SERVER_URL=http://147.135.16.160:5000
```

After DNS and HTTPS are configured, rebuild the portal with:

```dotenv
NEXT_PUBLIC_API_URL=https://business-central-backend.nanonux.com/api/v1
NEXT_PUBLIC_FILE_SERVER_URL=https://business-central-file.nanonux.com
```

`NEXT_PUBLIC_FILE_SERVER_URL` is used only to render stored `/media/...`
paths. It is not written to PostgreSQL.

## Operations

```sh
rc-service nginx status
rc-service business-central-backend status
rc-service seaweedfs status
rc-service postgresql status
rc-service cloudflared status

tail -f /var/log/business-central-backend.error.log
tail -f /var/log/nginx/error.log
df -h /data /opt
curl -fsS http://127.0.0.1:5000/health
curl -fsS http://127.0.0.1:5000/health/db
```

To test Nginx path routing without Cloudflare:

```sh
curl -i http://127.0.0.1:5000/health
curl -i http://127.0.0.1:5000/media/<stored-relative-path>
```

The 10 GB HDD is a single-node storage device, not a backup. Schedule PostgreSQL dumps and copy them off this VPS before treating the service as production data storage. Deployment releases do not delete `/data`.
