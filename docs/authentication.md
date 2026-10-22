# Authentication

This project uses JWT bearer authentication for all protected routes, opaque refresh tokens, mandatory 5-digit OTP email verification on signup, and a separate 5-digit OTP flow for password resets.

## Overview

- All auth logic lives in `AuthController` under `src/features/auth/`.
- Protected routes use `JwtAuthGuard`, which wraps Passport's `jwt` strategy.
- The authenticated user is injected via the `@CurrentUser()` decorator.
- The JWT secret is read from `JWT_SECRET`, with a safe development fallback.

---

## Session model

A successful login or OTP verification returns:

| Field          | Description                                                       |
| -------------- | ----------------------------------------------------------------- |
| `accessToken`  | Signed JWT — send as `Authorization: Bearer <token>`              |
| `refreshToken` | Opaque 48-byte random string stored server-side as a SHA-256 hash |
| `user`         | `{ id, email, role }`                                             |

JWT payload fields: `sub` (user id), `email`, `role`. Access token TTL: **30 minutes**. Refresh token TTL: **7 days**.
---

## Signup

```
POST /auth/customer/signup
POST /auth/technician/signup
```

Both endpoints:

- Require `acceptTerms: true` — throws `400` if missing.
- Reject duplicate emails with `409 Conflict`.
- Lowercase the email before storage.
- Hash the password with bcrypt (12 rounds).
- Create the user with `isActive: false` and a primary address.
- Immediately issue a **5-digit OTP** to the submitted email address.
- Always respond with `{ emailVerificationRequired: true, message: "..." }` — no session is issued at this stage.

Technician signup additionally creates a `TechnicianProfile` with `serviceArea`, `skills`, and optional `employeeId`, `licenseNumber`, `yearsExperience`, `bio`.

### OTP generation

The OTP is a cryptographically random 5-digit string (10000–99999):

```ts
const n = randomBytes(3).readUIntBE(0, 3) % 90000;
const otp = (10000 + n).toString();
```

Only the **SHA-256 hash** of the OTP is stored in `EmailVerificationToken`. The raw OTP is never persisted. TTL: **10 minutes**.

### Email delivery

In **production**, the OTP is sent via Resend:

```
Subject: Your Central Care verification code
Body:    Your verification code is: 73920
         Enter this code to activate your account. It expires in 10 minutes.
```

In **non-production** environments (`NODE_ENV !== 'production'`) no email is sent; the raw OTP is returned in the signup response body for development convenience.

Required env vars:

| Variable                  | Description                                                     |
| ------------------------- | --------------------------------------------------------------- |
| `RESEND_API_KEY`          | Resend API key                                                  |
| `VERIFICATION_EMAIL_FROM` | From-address for verification emails                            |
| `RESET_EMAIL_FROM`        | Fallback from-address when `VERIFICATION_EMAIL_FROM` is not set |

### Verify email — activates the account

```
POST /auth/verify-email
Body: { "otp": "73920" }
```

- Hashes the submitted OTP and looks up a matching unused, unexpired `EmailVerificationToken`.
- On match: sets `user.isActive = true` and marks the token as used in a single transaction.
- Returns a full auth session (`accessToken`, `refreshToken`, `user`) so the client is immediately logged in.
- Rejects invalid / expired / already-used codes with `401 Unauthorized`.

### Resend verification OTP

```
POST /auth/resend-verification
Body: { "email": "alex@example.com" }
```

- Invalidates all existing unused verification tokens for the account.
- Generates and delivers a fresh 5-digit OTP (10-minute TTL).
- Safe to call for unknown or already-active accounts — always returns the same generic message.
- Outside production, the new OTP is included in the response.

---

## Login

```
POST /auth/login
Body: { "email": "alex@example.com", "password": "secure-password" }
```

- Looks up the user by lowercase email.
- Rejects inactive accounts (not yet verified) with `401`.
- Compares the submitted password with the bcrypt hash.
- Returns a full auth session on success.

---

## Token refresh and logout

```
POST /auth/refresh
Body: { "refreshToken": "<opaque token>" }
```

- Hashes the token and looks for a matching, non-revoked, non-expired row.
- Revokes the old token and issues a new session (rotating refresh tokens).

```
POST /auth/logout
Body: { "refreshToken": "<opaque token>" }
```

- Revokes only the supplied refresh token.
- Other sessions for the same account remain active (device-specific logout).

---

## Password reset

### Step 1 — request an OTP

```
POST /auth/forgot-password
Body: { "email": "alex@example.com" }
```

- Returns the same generic message regardless of whether the account exists (prevents enumeration).
- If the account exists: invalidates any unused reset tokens, generates a fresh 5-digit OTP (TTL **15 minutes**), and sends it by email.

Email format in production:

```
Subject: Your Central Care password reset code
Body:    Your password reset code is: 48271
         Enter this code to reset your password. It expires in 15 minutes.
```

Outside production the OTP is returned in the response body.

Required env vars:

| Variable           | Description                            |
| ------------------ | -------------------------------------- |
| `RESEND_API_KEY`   | Resend API key                         |
| `RESET_EMAIL_FROM` | From-address for password-reset emails |

### Step 2 — submit OTP and new password

```
POST /auth/reset-password
Body: { "otp": "48271", "password": "new-secure-password" }
```

- Hashes the submitted OTP and looks for a matching unused, unexpired `PasswordResetToken`.
- Rejects invalid / expired / already-used codes with `401`.
- Updates the password hash (bcrypt, 12 rounds) and marks the token as used in a transaction.
- Returns `{ success: true }`.

---

## OTP rules summary

| Flow                      | Length   | TTL    | Stored as    |
| ------------------------- | -------- | ------ | ------------ |
| Signup email verification | 5 digits | 10 min | SHA-256 hash |
| Resend verification       | 5 digits | 10 min | SHA-256 hash |
| Password reset            | 5 digits | 15 min | SHA-256 hash |

Raw OTPs are **never** persisted. In production they are **never** returned in API responses.

---

## Protected requests

JWT strategy: `src/features/auth/jwt.strategy.ts`

1. `JwtAuthGuard` extracts the bearer token from `Authorization`.
2. Passport verifies the signature with `getJwtSecret()`.
3. The strategy loads the user from the database by `payload.sub`.
4. Rejects missing or inactive users.
5. Attaches `{ id, email, role }` to `request.user`.

`@CurrentUser()` reads that object and injects it into controller handlers.

### JWT secret handling

`getJwtSecret()` enforces two modes:

- **Development** — falls back to a local secret so fresh checkouts run without configuration.
- **Production** — requires `JWT_SECRET` to be at least 32 characters and not a placeholder value.

---

## GET /auth/me

Returns the authenticated user's profile (no `passwordHash`), including related `addresses` and `technician` data.

---

## User profile update

```
PATCH /users/me   (multipart/form-data)
```

| Field       | Type          | Notes                                                             |
| ----------- | ------------- | ----------------------------------------------------------------- |
| `firstName` | string        | optional                                                          |
| `lastName`  | string        | optional                                                          |
| `phone`     | string        | optional                                                          |
| `company`   | string        | optional                                                          |
| `avatar`    | file (binary) | optional — uploaded to Cloudinary; only the `secure_url` is saved |

When `avatar` is included the server rejects non-image content types, uploads the file to Cloudinary under `vacuumCare/avatars`, and stores the returned URL as `avatarUrl`. Clients cannot supply a raw URL — the upload always goes through the server. See [file-uploads.md](file-uploads.md) for every upload endpoint.

```bash
curl -X PATCH http://localhost:5000/api/users/me \
  -H "Authorization: Bearer <token>" \
  -F "firstName=Alex" \
  -F "lastName=Morgan" \
  -F "phone=+1 416 555 0100" \
  -F "company=Morgan Home Services" \
  -F "avatar=@/path/to/photo.jpg"
```

---

## Where auth is used

`users` · `cart` · `catalog` · `orders` · `tracking` · `chat` · `calls` · `payments` · `notifications` · `admin` · `service-requests` · `technician`

All protected routes combine `@UseGuards(JwtAuthGuard)` with `@CurrentUser()` and role-aware checks.

---

## Security notes

- Passwords are stored only as bcrypt hashes (12 rounds).
- OTPs and refresh tokens are stored only as SHA-256 hashes.
- In production, raw OTPs are never returned in API responses.
- Every authenticated request rechecks `isActive` — disabling a user blocks access immediately even if their JWT has not expired.
- Avatar uploads always route through the server; clients cannot inject arbitrary Cloudinary URLs.
