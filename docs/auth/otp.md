# OTP Flow

All one-time verification in this project uses **5-digit numeric OTP codes** sent to the user's email via Brevo. There are two flows: signup email verification and password reset.

---

## How the OTP is generated

```ts
// src/features/auth/auth.controller.ts
function generateOtp(): string {
  // randomBytes avoids Math.random bias.
  // Maps a 3-byte value into [0, 90000) then shifts to [10000, 99999].
  const n = randomBytes(3).readUIntBE(0, 3) % 90000;
  return (10000 + n).toString(); // always exactly 5 digits
}
```

The raw OTP is **never stored**. Only its SHA-256 hash is written to the database:

```ts
tokenHash: createHash('sha256').update(otp).digest('hex')
```

---

## Flow 1 — Signup email verification

### Step 1 · Register

```
POST /auth/customer/signup
POST /auth/technician/signup
```

```json
{
  "email": "alex@example.com",
  "password": "secure-password",
  "firstName": "Alex",
  "lastName": "Morgan",
  "phone": "+1 416 555 0100",
  "address": "123 Main Street",
  "city": "Toronto",
  "state": "ON",
  "zipCode": "M5V 2T6",
  "acceptTerms": true,
  "termsVersion": "2026-08-17"
}
```

The account is created with `isActive = false`. A 5-digit OTP is sent to the email.

**Response (all environments):**
```json
{
  "emailVerificationRequired": true,
  "message": "A 5-digit verification code has been sent to your email."
}
```

**Response (non-production only — `NODE_ENV !== 'production'`):**
```json
{
  "emailVerificationRequired": true,
  "message": "A 5-digit verification code has been sent to your email.",
  "otp": "73920"
}
```

OTP TTL: **10 minutes**.

---

### Step 2 · Submit OTP

```
POST /auth/verify-email
```

```json
{ "otp": "73920" }
```

- Sets `user.isActive = true`.
- Marks the token as used.
- Returns a full auth session immediately — no separate login step needed.

**Response:**
```json
{
  "success": true,
  "accessToken": "eyJ...",
  "refreshToken": "7bc1...",
  "user": { "id": "...", "email": "alex@example.com", "role": "CUSTOMER" }
}
```

---

### Resend OTP

```
POST /auth/resend-verification
```

```json
{ "email": "alex@example.com" }
```

- Invalidates all existing unused verification tokens.
- Issues a fresh 5-digit OTP (10-minute TTL).
- Safe to call for unknown or already-active accounts (returns the same generic message).

---

## Flow 2 — Password reset

### Step 1 · Request OTP

```
POST /auth/forgot-password
```

```json
{ "email": "alex@example.com" }
```

- Returns a generic message regardless of whether the account exists (prevents enumeration).
- If the account exists: invalidates any unused reset tokens and sends a fresh 5-digit OTP.

OTP TTL: **15 minutes**.

**Response (non-production only):**
```json
{
  "message": "If that account exists, a reset code has been sent.",
  "otp": "48271"
}
```

---

### Step 2 · Reset password

```
POST /auth/reset-password
```

```json
{
  "otp": "48271",
  "password": "new-secure-password"
}
```

- Hashes the OTP, finds a matching unused unexpired `PasswordResetToken`.
- Updates the bcrypt password hash (12 rounds).
- Marks the token as used.
- Returns `{ "success": true }`.

---

## Email delivery — Brevo

Both OTP flows use `https://api.brevo.com/v3/smtp/email`.

```ts
// EmailVerificationDeliveryService / PasswordResetDeliveryService
await fetch('https://api.brevo.com/v3/smtp/email', {
  method: 'POST',
  headers: { 'api-key': process.env.BREVO_API_KEY, ... },
  body: JSON.stringify({
    sender: { name: process.env.MAIL_FROM_NAME, email: process.env.MAIL_FROM },
    to: [{ email }],
    subject: '...',
    textContent: `Your code is: ${otp}`,
    htmlContent: `<div>...</div>`,
  }),
});
```

Emails are **only sent in production** (`NODE_ENV === 'production'`). Outside production the services return early and the OTP is returned in the API response.

Required env vars:

| Variable | Description |
|---|---|
| `BREVO_API_KEY` | Brevo transactional email API key |
| `MAIL_FROM` | Verified sender email address in Brevo |
| `MAIL_FROM_NAME` | Display name shown in the email client |

---

## Storage rules

| Rule | Detail |
|---|---|
| Raw OTPs never stored | Only SHA-256 hashes in `EmailVerificationToken` / `PasswordResetToken` |
| Single use | `usedAt` is set on first valid submission |
| Expiry enforced | `expiresAt < now` rejects the code |
| Resend invalidates old codes | `updateMany({ usedAt: null }, { usedAt: new Date() })` before issuing new OTP |
| Non-production only | Raw OTP returned in response body when `NODE_ENV !== 'production'` |

---

## OTP lengths and TTLs

| Flow | Digits | TTL |
|---|---|---|
| Signup email verification | 5 | 10 min |
| Resend verification | 5 | 10 min |
| Password reset | 5 | 15 min |

---

## Code references

- `src/features/auth/auth.controller.ts` — `generateOtp()`, `issueEmailVerificationOtp()`, `verifyEmail()`, `resendVerification()`, `forgotPassword()`, `resetPassword()`
- `src/features/auth/email-verification-delivery.service.ts` — Brevo delivery for signup OTP
- `src/features/auth/password-reset-delivery.service.ts` — Brevo delivery for reset OTP
- `src/features/auth/dto/auth.dto.ts` — `VerifyEmailDto`, `ResetPasswordDto` (5-digit validation)
- `prisma/schema.prisma` — `EmailVerificationToken`, `PasswordResetToken` models
