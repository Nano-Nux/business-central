# Business Central production deployment

This deployment is designed for the current 512 MB Alpine NAT VPS. GitHub Actions builds the Go binary on an Ubuntu runner; the VPS receives only a compressed runtime artifact and never compiles the application.

The VPS uses native OpenRC services instead of Docker:

```text
Cloudflare Tunnel (outbound) ──┬── 127.0.0.1:8080  Business Central API
                               └── 127.0.0.1:8889  SeaweedFS read-only filer

127.0.0.1:5432  PostgreSQL (never published)
```

PostgreSQL data, WAL, SeaweedFS volume data, filer metadata, and SeaweedFS master metadata are all stored below `/data`, which is the mounted `/dev/vdb1` HDD on the current VPS:

```text
/data/business-central/postgresql/data
/data/business-central/seaweedfs
```

The application binary and release directories use the 2 GB fast disk under `/opt/business-central`.

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

Run setup with the real hostnames and browser origins. The supplied VPS hostname contains `busniess`; use the correctly spelled domain only if that is the DNS name you intend to publish.

```sh
ssh -p 4998 root@147.135.16.160 \
  'HDD_MOUNT_POINT=/data \
   API_HOSTNAME=api.business-central.nanonux.com \
   FILES_HOSTNAME=files.business-central.nanonux.com \
   CORS_ORIGIN=https://admin.example.com,https://portal.example.com \
   sh /tmp/business-central-deploy/setup-vps.sh'
```

`setup-vps.sh` generates a random database password and JWT secret and stores them in root-readable configuration files. It creates the PostgreSQL role/database, tunes PostgreSQL for the small RAM budget, installs SeaweedFS, and creates the services. `AUTO_INIT_SCHEMA=true` is used only until the first successful application deployment, when `deploy-release.sh` changes it to `false`.

If you want first-admin bootstrap on the first release, edit `/etc/business-central/backend.env` before deployment and set both `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Never commit that file.

## 3. Configure Cloudflare and the NAT route

Cloudflare Tunnel is used because the VPS does not have public inbound 80/443. It creates outbound connections, so the listed forwarded web ports are not required. Allow outbound TCP/UDP 7844 from the VPS. The database is not included in the tunnel.

Create a Cloudflare API token with the minimum permissions needed by this script: Cloudflare Tunnel Write and DNS Edit for the target account/zone. Run this from a workstation or WSL, not from the application repository in CI:

```sh
export CLOUDFLARE_API_TOKEN='...'
export CLOUDFLARE_ACCOUNT_ID='...'
export CLOUDFLARE_ZONE_ID='...'
export CLOUDFLARE_ZONE_NAME='nanonux.com'
export API_HOSTNAME='api.business-central.nanonux.com'
export FILES_HOSTNAME='files.business-central.nanonux.com'
export VPS_SSH_TARGET='root@147.135.16.160'
export VPS_SSH_PORT=4998
sh deploy/configure-cloudflare.sh
```

The script creates or reuses a remotely managed tunnel, configures the API and read-only file routes, upserts proxied CNAME records, retrieves the tunnel token, and installs it on the VPS. If `VPS_SSH_TARGET` is omitted, it writes the token to `.cloudflared-tunnel.token`; transfer that file to `/etc/cloudflared/business-central.token` with mode `0640` and owner `root:cloudflared`, then start the `cloudflared` service.

The file hostname points at SeaweedFS's read-only filer listener (`8889`). Backend uploads use the private filer listener (`8888`), so the public file hostname cannot be used as an upload API.

## 4. Configure GitHub Actions

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

## Operations

```sh
rc-service business-central-backend status
rc-service seaweedfs status
rc-service postgresql status
rc-service cloudflared status

tail -f /var/log/business-central-backend.error.log
df -h /data /opt
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/health/db
```

The 10 GB HDD is a single-node storage device, not a backup. Schedule PostgreSQL dumps and copy them off this VPS before treating the service as production data storage.
