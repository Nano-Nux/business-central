# Business Central deployment guide

This document is the complete deployment procedure for the Business Central
repository. Production releases use the production branch.

## 1. Projects and production architecture

| Project | Purpose | Deployment |
|---|---|---|
| business-central-backend | Go Fiber API, authentication, authorization, business rules, migrations | Built by GitHub Actions and run on the NAT VPS |
| business-central-portal | Merchant dashboard and POS | Vercel |
| business-central-admin | Platform administration | Vercel |
| business_central_mobile | Flutter dashboard/POS application | Android/iOS release process |
| business-central-public-facing | Marketing site; currently deferred | Separate Vercel project only when approved |

The backend is the only main backend and the only owner of business rules and
persistent business data. Portal, admin, and mobile use its APIs.

```text
Vercel portal/admin and Mobile ONLINE
                 |
                 | HTTPS
                 v
       Cloudflare Tunnel
                 |
                 | local HTTP
                 v
             Nginx :5000
          /                 \
  API/health paths       /media paths
          |                   |
 Go backend :8080      SeaweedFS :8889
          |                   |
 PostgreSQL :5432      filer/upload :8888
          |
  /data/business-central/
  (HDD /dev/vdb1)
```

Current VPS:

| Item | Value |
|---|---|
| Public IP | 147.135.16.160 |
| SSH | root@147.135.16.160, port 4998 |
| OS | Alpine Linux 3.24.1 |
| Private IP | 10.5.28.129 |
| Fast disk | /dev/vda, approximately 2 GB |
| HDD | /dev/vdb1 mounted at /data, approximately 10 GB |
| Backend | 127.0.0.1:8080 |
| Nginx | 0.0.0.0:5000 |
| PostgreSQL | 127.0.0.1:5432 |
| SeaweedFS filer | 127.0.0.1:8888 |
| SeaweedFS public read endpoint | 127.0.0.1:8889 |

NAT forwards TCP port 4998 to SSH and TCP port 5000 to Nginx. PostgreSQL is
never exposed through NAT, Nginx, or Cloudflare.

Persistent data is on the HDD:

```text
/data/business-central/postgresql/data
/data/business-central/seaweedfs
```

Application binaries and releases are on the fast disk:

```text
/opt/business-central/current
/opt/business-central/releases
```

Cloudflare Tunnel provides HTTPS without requiring an inbound VPS port 443 or an
SSL certificate on the VPS.

## 2. Accounts and tools needed

Prepare:

- GitHub access with permission to push to production.
- A Cloudflare account with nanonux.com added and active.
- Access to change nanonux.com nameservers at the registrar.
- A Vercel account connected to GitHub.
- PowerShell/OpenSSH with ssh, scp, and ssh-keygen.
- Go for backend checks.
- Node.js/npm for Next.js checks.
- Flutter/Dart for mobile checks.
- A dedicated production SSH key.

The VPS has 512 MB RAM and 1 vCPU. GitHub Actions builds the Go binary. Do not
compile Go or run two Next.js servers on the VPS.

## 3. Branch and secret rules

Use production for all production backend releases:

```powershell
git switch production
git pull origin production
git status
```

Never commit:

- business-central-backend/.env
- /etc/business-central/backend.env
- database passwords
- JWT secrets
- admin passwords
- SSH private keys
- Cloudflare tunnel tokens
- Vercel tokens

Check before every commit:

```powershell
git status --short
```

Public frontend variables beginning with NEXT_PUBLIC_ are visible in the browser.
Never put a secret in one.

## 4. First-time VPS preparation

Skip this section if the VPS is already configured and services are working.
For later application releases, use Section 8. Do not repeatedly rerun
setup-vps.sh on a live production server without reviewing it first.

### 4.1 Verify the HDD

```powershell
ssh -p 4998 root@147.135.16.160 "findmnt /data; df -h / /data; lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT"
```

The expected result includes /dev/vdb1 mounted at /data. If it is not mounted,
stop and investigate. Never format the production HDD.

Safe remount of the existing filesystem only:

```powershell
ssh -p 4998 root@147.135.16.160 "HDD_DEVICE=/dev/vdb1 HDD_MOUNT_POINT=/data ALLOW_EXISTING_FILESYSTEM=yes sh /tmp/business-central-deploy/mount-hdd.sh"
```

Do not use FORMAT_HDD=YES on the production disk.

### 4.2 Copy deployment scripts

From the repository root:

```powershell
scp -P 4998 -r deploy root@147.135.16.160:/tmp/business-central-deploy
```

This copies deployment scripts and OpenRC service definitions. It does not copy
source code, database data, SeaweedFS data, or production credentials.

### 4.3 Run initial setup

```powershell
ssh -p 4998 root@147.135.16.160 "HDD_MOUNT_POINT=/data PUBLIC_HTTP_BIND=0.0.0.0 PUBLIC_HTTP_PORT=5000 PUBLIC_BASE_URL=http://147.135.16.160:5000 CORS_ORIGIN='*' sh /tmp/business-central-deploy/setup-vps.sh"
```

setup-vps.sh installs/configures PostgreSQL, SeaweedFS, Nginx, cloudflared, and
the backend OpenRC service. It creates users, directories, generated database
credentials, and the release area.

### 4.4 Verify storage and services

```powershell
ssh -p 4998 root@147.135.16.160 "psql -h 127.0.0.1 -U postgres -d postgres -tAc 'show data_directory;'"
```

The result must be:

```text
/data/business-central/postgresql/data
```

Then:

```powershell
ssh -p 4998 root@147.135.16.160 "rc-service postgresql status; rc-service seaweedfs status; rc-service nginx status; rc-service cloudflared status; df -h / /data"
```

Before the first backend artifact, Nginx may return 502 because the backend is
not listening. That is expected.

## 5. Backend environment

The production backend environment exists only on the VPS:

```text
/etc/business-central/backend.env
```

It contains shell export statements. The important settings are:

```sh
export HOST='127.0.0.1'
export PORT='8080'
export DATABASE_URL='generated-by-setup-vps'
export SEAWEEDFS_FILER_URL='http://127.0.0.1:8888'
export CORS_ORIGIN='*'
export PUBLIC_BASE_URL='https://business-central-backend.nanonux.com'
export JWT_SECRET='random-secret-at-least-32-characters'
export APP_ENV='production'
export AUTO_MIGRATE='true'
export AUTO_INIT_SCHEMA='true'
export ADMIN_EMAIL='admin@example.com'
export ADMIN_PASSWORD='strong-password'
```

Do not replace DATABASE_URL with a guessed value. Do not copy actual passwords or
secrets into this document.

The first successful deployment uses ADMIN_EMAIL and ADMIN_PASSWORD to create the
first platform administrator. After the first successful release,
AUTO_INIT_SCHEMA changes from true to false. AUTO_MIGRATE remains true so
versioned migrations can run.

Inspect variables while hiding secret values:

```powershell
ssh -p 4998 root@147.135.16.160 "sed -E 's/(PASSWORD|SECRET|DATABASE_URL)=.*/REDACTED/' /etc/business-central/backend.env"
```

Validate shell syntax:

```powershell
ssh -p 4998 root@147.135.16.160 "sh -n /etc/business-central/backend.env"
```

Keep HOST=127.0.0.1, PORT=8080, and SEAWEEDFS_FILER_URL pointing to the private
filer. Nginx owns public port 5000.

## 6. SSH key for GitHub Actions

GitHub Actions uses a dedicated key whose public key is authorized on the VPS.

### 6.1 Generate a key on Windows

```powershell
$deployKeyPath = "$env:USERPROFILE/.ssh/business-central-production"
ssh-keygen -t ed25519 -f $deployKeyPath -C "github-actions-business-central-production"
```

The private file has no .pub suffix. The public file ends in .pub. Never print or
commit the private file.

### 6.2 Authorize the public key on the VPS

Display only the public key:

```powershell
Get-Content "$deployKeyPath.pub"
```

Copy its single line, connect to the VPS:

```powershell
ssh -p 4998 root@147.135.16.160
```

On the VPS:

```sh
mkdir -p /root/.ssh
chmod 0700 /root/.ssh
vi /root/.ssh/authorized_keys
```

In vi, press i, paste the public key on one line, press Esc, type :wq, and press
Enter. Then:

```sh
chmod 0600 /root/.ssh/authorized_keys
exit
```

Test the dedicated key:

```powershell
ssh -o IdentitiesOnly=yes -i $deployKeyPath -p 4998 root@147.135.16.160 "id -u; hostname"
```

The id -u result must be 0.

### 6.3 Add GitHub environment secrets

In GitHub open:

```text
Repository -> Settings -> Environments -> New environment -> production
```

Add:

| Secret | Value |
|---|---|
| DEPLOY_HOST | 147.135.16.160 |
| DEPLOY_PORT | 4998 |
| DEPLOY_USER | root |
| DEPLOY_SSH_KEY | Complete private key file contents |
| DEPLOY_KNOWN_HOSTS | Verified SSH host key line |

Copy the private key without displaying it:

```powershell
Get-Content -Raw $deployKeyPath | Set-Clipboard
```

Generate the known-hosts value:

```powershell
ssh-keyscan -t ed25519 -p 4998 147.135.16.160
```

Copy the complete ssh-ed25519 line into DEPLOY_KNOWN_HOSTS. Verify the server
identity before trusting a changed host key.

## 7. Backend GitHub Actions deployment

The workflow file is:

```text
.github/workflows/deploy-backend.yml
```

The workflow performs:

```text
push to production
  -> checkout
  -> gofmt check
  -> go vet and go test
  -> Linux amd64 build on GitHub
  -> package binary, schema.sql, and Swagger files
  -> copy artifact to VPS over SCP
  -> activate immutable release
  -> restart backend
  -> health check
  -> keep release or roll back
```

A push to production triggers it when these paths change:

- business-central-backend/**
- deploy/**
- .github/workflows/deploy-backend.yml

A frontend-only commit does not trigger this backend workflow. Use GitHub ->
Actions -> Build and deploy backend -> Run workflow for a manual redeploy.

For a backend change:

```powershell
git switch production
git pull origin production
cd business-central-backend
gofmt -l .
go vet ./...
go test ./...
cd ..
git add business-central-backend deploy .github/workflows/deploy-backend.yml
git commit -m "Describe the backend change"
git push origin production
```

Do not stage business-central-backend/.env.

The release script deploy/deploy-release.sh:

1. Validates the archive.
2. Extracts a new release under /opt/business-central/releases.
3. Switches /opt/business-central/current to that release.
4. Restarts business-central-backend.
5. Waits for http://127.0.0.1:8080/health.
6. Restores the previous release if health fails.
7. Removes only the failed release artifact, not /data.

After Actions succeeds:

```powershell
ssh -p 4998 root@147.135.16.160 "rc-service business-central-backend status; wget -qO- http://127.0.0.1:8080/health; df -h / /data"
```

The backend root path may return JSON 404. Use /health for liveness.

## 8. Cloudflare Tunnel and HTTPS

Use one remotely managed Cloudflare Tunnel for both HTTPS subdomains. This is
the easiest option for this NAT VPS because it does not require inbound port
443 or an SSL certificate on the VPS.

Official documentation:
https://developers.cloudflare.com/tunnel/setup/

### 8.1 Activate the Cloudflare zone

1. Add nanonux.com to Cloudflare.
2. Change the registrar nameservers to the Cloudflare nameservers.
3. Wait until Cloudflare reports the zone active.
4. Do not create A records for the tunnel hostnames pointing at the VPS IP.

### 8.2 Create the tunnel

1. Sign in to Cloudflare.
2. Select nanonux.com.
3. Open Networking -> Tunnels.
4. Click Create a tunnel.
5. Select Cloudflared.
6. Name it business-central-production.
7. Save the tunnel.
8. Select the Linux connector instructions.
9. Copy the tunnel token and keep it secret.

setup-vps.sh installs cloudflared and its OpenRC service. The service can remain
stopped until the token is installed.

### 8.3 Install the tunnel token

Replace only the placeholder:

```powershell
ssh -p 4998 root@147.135.16.160 "mkdir -p /etc/cloudflared && printf '%s\n' 'PASTE-TUNNEL-TOKEN-HERE' > /etc/cloudflared/business-central.token && chown root:cloudflared /etc/cloudflared/business-central.token && chmod 0640 /etc/cloudflared/business-central.token && rc-update add cloudflared default && rc-service cloudflared restart"
```

Check the service:

```powershell
ssh -p 4998 root@147.135.16.160 "rc-service cloudflared status; tail -n 50 /var/log/cloudflared.error.log"
```

The token must never be committed or pasted into normal documentation.

### 8.4 Add the backend route

In the tunnel dashboard select Routes -> Add route -> Published application:

```text
Hostname: business-central-backend
Domain:   nanonux.com
Service:  http://127.0.0.1:5000
```

The resulting hostname is business-central-backend.nanonux.com.

### 8.5 Add the file route

Add a second published application:

```text
Hostname: business-central-file
Domain:   nanonux.com
Service:  http://127.0.0.1:5000
```

The resulting hostname is business-central-file.nanonux.com.

Both routes use Nginx. Nginx sends API and health paths to Go and /media paths
to SeaweedFS. Uploads use the private filer on 8888; the public file hostname
reads stored /media paths.

### 8.6 Test HTTPS

```powershell
Invoke-WebRequest "https://business-central-backend.nanonux.com/health"
Invoke-WebRequest "https://business-central-backend.nanonux.com/health/db"
```

Swagger:

```text
https://business-central-backend.nanonux.com/swagger
```

The root / may return JSON 404. That is normal because / is not an application
route.

### 8.7 Update the backend public URL

After HTTPS works:

```powershell
ssh -p 4998 root@147.135.16.160 "sed -i '/^export PUBLIC_BASE_URL=/d' /etc/business-central/backend.env && printf '%s\n' \"export PUBLIC_BASE_URL='https://business-central-backend.nanonux.com'\" >> /etc/business-central/backend.env && sh -n /etc/business-central/backend.env && rc-service business-central-backend restart"
```

Do not change the backend listener from 8080 to 5000.

## 9. Deploy the portal to Vercel

The portal directory is business-central-portal.

### 9.1 Create the project

1. In Vercel select Add New -> Project.
2. Import the GitHub repository.
3. Name the project business-central-portal.
4. Set Root Directory to business-central-portal.
5. Set the production branch to production.
6. Use npm ci for install if not detected.
7. Use npm run build for build.
8. Leave output directory empty.
9. Deploy.

### 9.2 Add portal environment variables

In Project Settings -> Environment Variables, add these for Production:

```env
NEXT_PUBLIC_API_URL=https://business-central-backend.nanonux.com/api/v1
NEXT_PUBLIC_FILE_SERVER_URL=https://business-central-file.nanonux.com
```

The API value includes /api/v1. The file value does not. The file value
prefixes stored relative /media paths only at render time and is not stored in
PostgreSQL.

Do not add PORT=3001 to Vercel. PORT is for local development.

### 9.3 Add the portal domain

In Project -> Settings -> Domains add:

```text
business-central-portal.nanonux.com
```

Vercel will show the DNS record. Add that record in Cloudflare exactly as shown
by Vercel. Do not point it to the VPS IP. Redeploy after saving variables.

## 10. Deploy the admin app to Vercel

The admin directory is business-central-admin.

### 10.1 Create the project

1. Create a second Vercel project from the same GitHub repository.
2. Set Root Directory to business-central-admin.
3. Set the production branch to production.
4. Use npm ci for install.
5. Use npm run build for build.
6. Leave output directory empty.
7. Deploy.

### 10.2 Add admin environment variable

For Production add:

```env
NEXT_PUBLIC_API_URL=https://business-central-backend.nanonux.com/api/v1
```

Do not add PORT=3000 to Vercel.

### 10.3 Add the admin domain

Add:

```text
business-central-admin.nanonux.com
```

Create the DNS record Vercel provides in Cloudflare, then redeploy.

## 11. Verify portal and admin

1. Open https://business-central-portal.nanonux.com.
2. Log in with a valid backend user.
3. Confirm browser requests use
   https://business-central-backend.nanonux.com/api/v1.
4. Confirm images load from
   https://business-central-file.nanonux.com/media/....
5. Open https://business-central-admin.nanonux.com.
6. Verify platform-admin login and merchant administration.

If the browser reports mixed content, a Vercel variable still uses
http://147.135.16.160:5000. Replace it with the HTTPS hostname and redeploy.

CORS currently uses CORS_ORIGIN='*' so Vercel domains and future mobile clients
are allowed. Restrict it later only after testing every client.

## 12. Mobile production release

Mobile is not deployed to Vercel or the VPS. It is built with Flutter.

### 12.1 ONLINE production

In business_central_mobile/.env:

```env
APPLICATION_NETWORK_ENVIRONMENT=ONLINE
APPLICATION_ENVIRONMENT=production
APPLICATION_BACKEND_URL=https://business-central-backend.nanonux.com/api/v1
APPLICATION_IS_WEBVIEW=false
APPLICATION_WEBVIEW_URL=https://business-central-portal.nanonux.com
```

Production ONLINE mode requires HTTPS and the backend URL includes /api/v1.

### 12.2 ONLINE WebView production

Use this when the native app renders the deployed portal:

```env
APPLICATION_NETWORK_ENVIRONMENT=ONLINE
APPLICATION_ENVIRONMENT=production
APPLICATION_BACKEND_URL=https://business-central-backend.nanonux.com/api/v1
APPLICATION_IS_WEBVIEW=true
APPLICATION_WEBVIEW_URL=https://business-central-portal.nanonux.com
```

### 12.3 FULLY_OFFLINE production

```env
APPLICATION_NETWORK_ENVIRONMENT=FULLY_OFFLINE
APPLICATION_ENVIRONMENT=production
APPLICATION_IS_WEBVIEW=false
APPLICATION_WEBVIEW_URL=
```

FULLY_OFFLINE must make zero backend requests and must not synchronize. The
backend URL is ignored in this mode.

### 12.4 Validate and build

```powershell
cd business_central_mobile
flutter pub get
dart run build_runner build
dart format lib test
flutter analyze
flutter test
flutter build apk --release
flutter build appbundle --release
```

Build and sign iOS releases on macOS with Xcode. Keep signing keys and store
credentials outside Git.

Test ONLINE login, reconnect/synchronization, duplicate operations,
temporary-offline behavior, secure token storage, SQLite migrations, backup and
restore, printer/scanner, and WebView behavior. Test FULLY_OFFLINE with network
access disabled and verify no request is made.

## 13. Public-facing site

business-central-public-facing is currently deferred. It is a marketing site,
not an authenticated dashboard. Do not add merchant operations to it.

When approved, create a separate Vercel project with Root Directory:

```text
business-central-public-facing
```

It currently has no backend API environment variable. Before deploying:

```powershell
cd business-central-public-facing
npm ci
npm run lint
npm run build
```

Use a separate marketing hostname. Do not use the portal or admin hostname.

## 14. Local pre-release checks

Backend:

```powershell
cd business-central-backend
gofmt -l .
go vet ./...
go test ./...
```

Portal:

```powershell
cd business-central-portal
npm ci
npm run lint
npm run test
npm run build
```

Admin:

```powershell
cd business-central-admin
npm ci
npm run lint
npm run build
```

Mobile:

```powershell
cd business_central_mobile
flutter analyze
flutter test
```

Run each command from its project directory.

## 15. Production monitoring

```powershell
ssh -p 4998 root@147.135.16.160 "rc-service nginx status"
ssh -p 4998 root@147.135.16.160 "rc-service business-central-backend status"
ssh -p 4998 root@147.135.16.160 "rc-service seaweedfs status"
ssh -p 4998 root@147.135.16.160 "rc-service postgresql status"
ssh -p 4998 root@147.135.16.160 "rc-service cloudflared status"
ssh -p 4998 root@147.135.16.160 "df -h / /data"
ssh -p 4998 root@147.135.16.160 "wget -qO- http://127.0.0.1:8080/health"
ssh -p 4998 root@147.135.16.160 "wget -qO- http://127.0.0.1:5000/health"
```

Logs:

```powershell
ssh -p 4998 root@147.135.16.160 "tail -n 100 /var/log/business-central-backend.error.log"
ssh -p 4998 root@147.135.16.160 "tail -n 100 /var/log/nginx/error.log"
ssh -p 4998 root@147.135.16.160 "tail -n 100 /var/log/cloudflared.error.log"
ssh -p 4998 root@147.135.16.160 "tail -n 100 /var/log/seaweedfs.error.log"
```

For direct local Nginx testing:

```powershell
ssh -p 4998 root@147.135.16.160 "wget -S -O - http://127.0.0.1:5000/health"
```

## 16. Backups and data-loss prevention

A deployment failure does not delete /data. The release script changes application
release directories and the current symlink. A failed release is rolled back
when possible.

The HDD is one storage device, not a backup. Production needs:

- Scheduled PostgreSQL logical dumps.
- SeaweedFS volume and filer backups.
- Copies stored outside this VPS.
- Encryption and restricted permissions.
- Retention and rotation.
- A tested restore procedure.

Never use these as routine troubleshooting:

```text
DROP DATABASE
DROP TABLE
ALTER TABLE ... DISABLE ROW LEVEL SECURITY
rm -rf /data/business-central
FORMAT_HDD=YES
```

If the initial admin reports an RLS error, deploy the corrected versioned
migration and inspect logs. Do not disable RLS or delete the database.

## 17. Rollback

If a backend artifact fails its health check, deploy-release.sh attempts to
restore the previous release. Check:

```powershell
ssh -p 4998 root@147.135.16.160 "readlink /opt/business-central/current; rc-service business-central-backend status; wget -qO- http://127.0.0.1:8080/health"
```

If unhealthy:

1. Read the backend error log.
2. Check PostgreSQL, SeaweedFS, Nginx, and /data.
3. Check the active release symlink.
4. Stop making schema or data changes.
5. Redeploy the last known-good production commit.
6. Do not delete /data.

## 18. Normal production checklist

- [ ] Work is on production.
- [ ] No secret or local .env file is staged.
- [ ] Backend tests pass.
- [ ] Portal checks pass when portal code changed.
- [ ] Admin checks pass when admin code changed.
- [ ] Mobile checks pass when mobile code changed.
- [ ] API/schema changes are documented and tested.
- [ ] Backend commit is pushed.
- [ ] GitHub Actions succeeds.
- [ ] Backend /health and /health/db succeed.
- [ ] PostgreSQL, SeaweedFS, Nginx, and cloudflared are started.
- [ ] /data is mounted and has free space.
- [ ] Vercel variables use HTTPS hostnames.
- [ ] Portal and admin deployments succeed.
- [ ] Portal and admin domains load over HTTPS.
- [ ] Login works.
- [ ] A known image loads through the file hostname.
- [ ] A recent off-server backup exists.

## 19. Final production URLs

Backend health:

```text
https://business-central-backend.nanonux.com/health
```

Database health:

```text
https://business-central-backend.nanonux.com/health/db
```

Swagger:

```text
https://business-central-backend.nanonux.com/swagger
```

File server:

```text
https://business-central-file.nanonux.com/media/<relative-path>
```

Portal:

```text
https://business-central-portal.nanonux.com
```

Admin:

```text
https://business-central-admin.nanonux.com
```

Portal Vercel variables:

```env
NEXT_PUBLIC_API_URL=https://business-central-backend.nanonux.com/api/v1
NEXT_PUBLIC_FILE_SERVER_URL=https://business-central-file.nanonux.com
```

Admin Vercel variable:

```env
NEXT_PUBLIC_API_URL=https://business-central-backend.nanonux.com/api/v1
```

