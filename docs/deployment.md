# Docker and delivery

## Local Docker

Copy `.env.example` to `.env`, configure credentials, then:

```sh
docker compose up --build -d --wait
curl --fail http://localhost:5001/api/health/db
```

`PORT` is the application/container port (5000), `APP_PORT` is the host port
(5001). Postgres is available only on host loopback at `POSTGRES_PORT` (5433).
Docker overrides `DATABASE_URL` to use the internal `postgres:5432` service.
URL-encode special characters in PostgreSQL credentials used in connection URLs.

The image runs as the `node` user. Startup applies committed migrations and then
executes Node directly; signals reach the server through Compose's init process.
Health checks query the real database. Restarting never seeds or resets users.
For a disposable development database, seed explicitly:

```sh
docker compose exec app npm run prisma:seed
```

The imported seed creates demo accounts and updates their passwords. Do not run
it against production unless you intentionally want those changes. `RUN_SEED=true`
is an explicit opt-in alternative; its default is false.

## CI and image publication

Pull requests and pushes to `main` validate Prisma, apply migrations to a fresh
Postgres 17 database, check schema drift, build, run lint and TypeScript checks,
and build/smoke-test the Docker image. Only a passing main-branch image is pushed
to `ghcr.io/amitavrchy/unified-ecommerce:<full-commit-sha>` using `GITHUB_TOKEN`.
No Docker Hub credentials are required. Packages inherit GitHub access settings.

## Production deployment

The `deploy` job is optional until a server is configured. Create these GitHub
repository or `production` environment variables:

| Variable | Value |
| --- | --- |
| `DEPLOY_ENABLED` | `true` for automatic main-branch deployments |
| `DEPLOY_HOST` | Server DNS name or IPv4 address |
| `DEPLOY_USER` | SSH user with Docker access |
| `DEPLOY_PATH` | Absolute app directory, e.g. `/opt/unified-ecommerce` |
| `DEPLOY_PORT` | SSH port, defaults to `22` |

Add secrets `DEPLOY_SSH_KEY` (private SSH key) and `DEPLOY_KNOWN_HOSTS` (the
server's verified OpenSSH known_hosts entry; use `[host]:port` for a custom port).
Host key verification stays enabled. Install Docker Engine and Compose v2 with
`up --wait` support on that server. Create `$DEPLOY_PATH/.env` with production
credentials and service keys beforehand. Environment values are never copied
from CI. For initial account provisioning use your approved administration process;
automated deployments do not create demo users.

The production Compose file pulls the exact tested SHA image, exposes only the
API, preserves the Postgres volume, and waits for database-backed API health.
Deployment does not take the database down or prune other applications' images.
Record `.deployed-image` identifies the last successful image. Keep the same
Compose project name/path to retain the existing volume. Back up an existing
database before introducing new migrations; image rollback does not undo schema
changes.

For a manual deployment run the workflow with `deploy=true` after configuring
the same server values. To deploy an already-published SHA directly on the server:

```sh
docker login ghcr.io
sh scripts/deploy.sh ghcr.io/amitavrchy/unified-ecommerce:FULL_COMMIT_SHA
```

## Upstream synchronization

Imported application updates from `SouravDn-p/VacuumCare-Server` at
`8563b5a691b9fdc0ce0ea7a63193ef639f114618`. Local required checkout idempotency
keys and quote authorization serialization/safe retries are retained and adapted
to upstream's hosted Checkout and negotiated totals.

Excluded upstream's obfuscated `api.js` and executable payload in
`eslint.config.mjs`, including build/start hooks that executed `api.js`.
Also excluded its temporary Cloudinary upload probe, machine-specific deployment
workflow and Makefile. CI/CD targets this repository and its own registry.
