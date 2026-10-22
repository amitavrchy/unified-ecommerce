# Central Care backend

NestJS + PostgreSQL backend for the customer app, technician app, and admin
dashboard. Features are organized under `src/features/` by domain.

## Included workflows

- Customer and pending-verification technician registration, profiles, addresses,
  notification preferences, onboarding, and password reset.
- Service request lifecycle, photo/video uploads, quote review/acceptance with
  terms consent, scheduling conflict checks, equipment/inlet counts, reports,
  customer confirmation, cancellation, and audit-style status history.
- Agora call sessions with start/refresh/history/end lifecycle. Tokens use an
  absolute Unix expiry timestamp and never expose the Agora certificate.
- Shop catalog search/product detail, persistent cart, hosted Stripe Checkout,
  inventory reservation/release, order tracking history, and returns.
- Stripe manual-capture PaymentIntents for accepted service quotes. A technician
  report must be submitted before an admin can request capture.
- Signature-verified, raw-body Stripe webhook processing with event-id
  deduplication. Webhooks—not browser redirects—mark orders paid/completed.
- Service-request chat, technician live-location updates, notifications, and an
  admin dashboard/broadcast endpoint.

## Customer frontend flows

Shop orders: [docs/customer-orders-flow.md](docs/customer-orders-flow.md)

Stripe (Checkout, service holds, webhooks):
[docs/stripe-payment.md](docs/stripe-payment.md)

Service requests and quotes:
[docs/customer-service-requests-flow.md](docs/customer-service-requests-flow.md)

```text
Catalog            GET  /api/service-requests/catalog
Address            GET  /api/users/me/addresses
                   POST /api/users/me/addresses
Submit request     POST /api/service-requests          multipart images[] / videos[]
List / detail      GET  /api/service-requests
                   GET  /api/service-requests/:id      opening QUOTE_SENT marks the quote VIEWED
Accept quote       POST /api/service-requests/:id/quotation/accept
Reject quote       POST /api/service-requests/:id/quotation/reject
Counteroffer       POST /api/service-requests/:id/quotation/counteroffers
Authorize hold     POST /api/payments/service-requests/:requestId/authorization
Confirm report     POST /api/service-requests/:id/report/customer-confirm
Cancel             POST /api/service-requests/:id/cancel
```

Statuses the customer UI should show: `NEW` → `UNDER_REVIEW` → `QUOTE_SENT` →
`ACCEPTED` → `SCHEDULED` → `IN_PROGRESS` → `REPORT_SUBMITTED` → `COMPLETED`
(or `CANCELLED`).

Submit a request (do not set `Content-Type`; curl adds the multipart boundary).
There is no `attachments` field — only file uploads.

```bash
curl -X POST 'http://localhost:5000/api/service-requests' \
  -H 'Authorization: Bearer <accessToken>' \
  -F 'categoryId=<category-id>' \
  -F 'issueId=<issue-id>' \
  -F 'addressId=<address-id>' \
  -F 'description=The central vacuum has low suction and makes a rattling sound.' \
  -F 'preferredDate=2026-09-02T09:00:00.000Z' \
  -F 'preferredTime=09:00-12:00' \
  -F 'images=@/path/to/inlet.jpg' \
  -F 'videos=@/path/to/noise.mp4'
```

`201` starts the request at `NEW`. `media[].url` is the Cloudinary URL.

Accept the quote after the office sends it (`status: QUOTE_SENT`):

```bash
curl -X POST 'http://localhost:5000/api/service-requests/<id>/quotation/accept' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{"acceptTerms": true, "termsVersion": "2026-08-17"}'
```

Then create the Stripe Checkout session (empty body) and redirect to `checkoutUrl`:

```bash
curl -X POST 'http://localhost:5000/api/payments/service-requests/<id>/authorization' \
  -H 'Authorization: Bearer <accessToken>'
```

The browser opens Stripe. After pay, Stripe sends the customer to
`FRONTEND_PAYMENT_SUCCESS_URL`. See [docs/stripe-payment.md](docs/stripe-payment.md).

Catalog, addresses, reject, counteroffer, cancel, and report-confirm request and
response bodies are in the flow doc.

## Start with Docker

Copy `.env.example` to `.env`, set strong local credentials, then run:

```bash
docker compose up --build
```

The app waits for PostgreSQL health checks, applies Prisma migrations, then listens on `PORT` inside the container (default `5000`).
Compose publishes that as `APP_PORT` on the host (default `5001`):

```text
API:          http://localhost:5001/api
Swagger UI:   http://localhost:5001/api/docs
OpenAPI JSON: http://localhost:5001/api/docs-json
DB health:    http://localhost:5001/api/health/db
```

To work on the API outside the app container (`npm run start:dev` uses `PORT`,
default `5000`, and `DATABASE_URL` pointing at host `POSTGRES_PORT`):

```bash
docker compose up -d postgres
npm install
npm run prisma:generate
npm run start:dev
```

```text
API:        http://localhost:5000/api
Swagger UI: http://localhost:5000/api/docs
```

Do not use `docker compose down --volumes` unless the PostgreSQL data volume is
intentionally disposable.

Published image:

```bash
docker pull souravdebanth/vacuumcare-backend:latest
docker compose up -d
```

`docker-compose.yaml` already references that image. Provide a filled `.env`
next to the compose file so Postgres credentials, `PORT` / `APP_PORT`, and
secrets are injected at runtime.

## Environment variables

Copy `.env.example` to `.env`. Never commit real secrets. Names and purpose:

### Application and Docker

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | Yes | Port Nest listens on inside the process / container. Default `5000`. |
| `APP_PORT` | Docker | Host port mapped to `PORT` (`${APP_PORT}:${PORT}`). Example `5001`. |

### PostgreSQL

| Variable | Required | Description |
| --- | --- | --- |
| `POSTGRES_USER` | Docker | Database user for the Compose Postgres image. |
| `POSTGRES_PASSWORD` | Docker | Database password for the Compose Postgres image. |
| `POSTGRES_DB` | Docker | Database name created in the Compose Postgres image. |
| `POSTGRES_PORT` | Docker | Host port mapped to Postgres `5432`. Example `5433`. |
| `DATABASE_URL` | Yes | Prisma connection string. Local Nest → `localhost:${POSTGRES_PORT}`. Compose overrides this to `postgres:5432` for the app container. |

### Auth

| Variable | Required | Description |
| --- | --- | --- |
| `JWT_SECRET` | Yes | Signs access and refresh tokens. Use at least 32 random characters in production. |

### Agora (video calls)

| Variable | Required | Description |
| --- | --- | --- |
| `AGORA_APP_ID` | For calls | Agora project App ID. Returned to clients with call tokens. |
| `AGORA_APP_CERTIFICATE` | For calls | Agora certificate. Server-only; never sent to clients. |
| `AGORA_TOKEN_TTL_SECONDS` | No | Token lifetime in seconds (60–86400). Default `3600`. |

### Seed users (`prisma db seed`)

| Variable | Required | Description |
| --- | --- | --- |
| `ADMIN_EMAIL` | No | Seeded admin login. Default `admin@vacuumcare.local`. |
| `ADMIN_PASSWORD` | No | Seeded admin password. Override the example before any shared environment. |
| `CUSTOMER_EMAIL` | No | Seeded customer login. Default `customer@vacuumcare.local`. |
| `CUSTOMER_PASSWORD` | No | Seeded customer password. |
| `TECHNICIAN_EMAIL` | No | Seeded technician login. Default `technician@vacuumcare.local`. |
| `TECHNICIAN_PASSWORD` | No | Seeded technician password. |

### Payments and tax

| Variable | Required | Description |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | For checkout | Stripe secret key (`sk_test_…` locally). Server-only. |
| `STRIPE_WEBHOOK_SECRET` | For webhooks | Stripe webhook signing secret (`whsec_…`). Server-only. |
| `STRIPE_CURRENCY` | No | Charge currency. Default `cad`. |
| `STRIPE_WEBHOOK_TOLERANCE_SECONDS` | No | Allowed clock skew for webhook signatures. Default `300`. |
| `TAX_RATE` | No | Decimal tax applied to shop and service totals. Example `0.14975` (Quebec). |
| `FRONTEND_PAYMENT_SUCCESS_URL` | For Checkout | Absolute URL Stripe redirects to after a successful payment. |
| `FRONTEND_PAYMENT_CANCEL_URL` | For Checkout | Absolute URL Stripe redirects to if the customer cancels. |

### Client / CORS

| Variable | Required | Description |
| --- | --- | --- |
| `CORS_ORIGIN` | Yes for browsers | Comma-separated allowed origins, e.g. `http://localhost:3000`. |
| `CLIENT_APP_URL` | No | Storefront origin for operators and docs. Not read by Nest at runtime. |

### Email (Brevo)

Transactional mail for signup verification, password-reset OTPs, and the public
contact form. Create an API key at [Brevo](https://www.brevo.com).

| Variable | Required | Description |
| --- | --- | --- |
| `BREVO_API_KEY` | For email | Brevo transactional API key. |
| `MAIL_FROM` | For email | From-address. Must be a verified sender in Brevo. |
| `MAIL_FROM_NAME` | No | Display name in the inbox. Default `Central Care`. |
| `MAIL_TO` | No | Fallback recipient for contact-form mail when business support email is unset. |

### Cloudinary

Used for avatars, product images, service/chat media, equipment photos, the
business logo, the landing hero image, and return labels.

| Variable | Required | Description |
| --- | --- | --- |
| `CLOUDINARY_CLOUD_NAME` | For uploads | Cloudinary cloud name. |
| `CLOUDINARY_API_KEY` | For signed uploads | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | For signed uploads | Cloudinary API secret. Server-only. |
| `CLOUDINARY_UPLOAD_PRESET` | No | Unsigned preset name. Leave blank to use signed uploads. |

## Stripe configuration

Set these server-only values in `.env` (never ship the secret key or webhook
secret to a mobile/web client):

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CURRENCY=cad
STRIPE_WEBHOOK_TOLERANCE_SECONDS=300
FRONTEND_PAYMENT_SUCCESS_URL=http://localhost:3000/payment/success
FRONTEND_PAYMENT_CANCEL_URL=http://localhost:3000/payment/failed
TAX_RATE=0.14975
CORS_ORIGIN=http://localhost:3000
```

For local webhook testing, install the Stripe CLI, authenticate it, then run:

```bash
stripe listen --forward-to localhost:5000/api/webhooks/stripe
```

Copy the CLI-provided `whsec_...` value to `STRIPE_WEBHOOK_SECRET`. Use Stripe
test cards only in hosted Checkout or the Stripe client SDK. This API never
accepts raw card data, a client-supplied provider reference, or a client claim
that a payment succeeded.

Main payment endpoints:

```text
POST /api/checkout/orders
POST /api/checkout/cart
POST /api/payments/service-requests/:requestId/authorization
POST /api/payments/:id/capture                 # admin, after submitted report
GET  /api/payments/:id
POST /api/webhooks/stripe                      # Stripe signature required
```

## Agora configuration

Set `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, and a token TTL (60–86400 seconds):

```env
AGORA_TOKEN_TTL_SECONDS=3600
```

The customer, assigned technician, or an office administrator can obtain a call
token. The response returns a `callId` for token refresh and end operations.

## Verification

```bash
npx prisma validate
npm run prisma:generate
npm run build
npm run typecheck
npm run lint:check
```

Spec files and Jest/Supertest dependencies have been removed. CI validates lint,
TypeScript, build, database migrations, OpenAPI availability and Docker health.
See [Stripe verification notes](docs/stripe/review.md) for payment review results
and the remaining provider-side configuration.

## Docker and CI/CD

See [deployment instructions](docs/deployment.md) for verified Docker startup,
GitHub Actions image publishing, server variables/secrets and upstream sync notes.
Docker startup applies migrations; run development seeding explicitly with
`docker compose exec app npm run prisma:seed`.
