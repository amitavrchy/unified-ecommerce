# Token Architecture

This project uses two different token types:

- short-lived JWT access tokens
- long-lived opaque refresh tokens

It also uses OTP-style one-time tokens for email verification and password reset.

## Summary

- Access tokens are signed JWTs created in `src/features/auth/auth.controller.ts`.
- Refresh tokens are random opaque strings generated server-side and stored only as SHA-256 hashes.
- OTP tokens for signup verification and forgot-password flows are also stored only as SHA-256 hashes.
- The backend never stores raw access tokens in the database.

## Access tokens

Access tokens are created by the `session()` helper in `src/features/auth/auth.controller.ts`.

### Payload

The JWT payload contains:

- `sub`: user id
- `email`: user email
- `role`: user role

### Lifetime

The JWT module is configured with:

```ts
JwtModule.register({
  secret: getJwtSecret(),
  signOptions: { expiresIn: '30m' },
});
```

So the access token lifetime is 30 minutes unless that configuration changes.

### Storage

Access tokens are not persisted in the database.

That means:

- the backend does not look them up by row id
- the backend validates them by signature and expiry
- revocation is indirect, through user deactivation or secret rotation

### Request use

Clients send access tokens using:

```http
Authorization: Bearer <accessToken>
```

`JwtAuthGuard` reads that header, and `JwtStrategy` validates the token signature and the current user record.

## Refresh tokens

Refresh tokens are issued by `session()` in `src/features/auth/auth.controller.ts`.

### Generation

Refresh tokens are generated as random opaque strings:

```ts
const refreshToken = randomBytes(48).toString('hex');
```

### Storage model

The database stores only:

- the SHA-256 hash of the refresh token
- `userId`
- `expiresAt`
- `revokedAt`
- `createdAt`

The relevant Prisma model is `RefreshToken` in `prisma/schema.prisma`.

### Why hash them

Hashing refresh tokens means:

- a database leak does not reveal usable refresh tokens
- the server can still compare the presented token by hashing it first

### Lifecycle

1. A session is created on signup or login.
2. A new refresh token row is inserted.
3. The client stores the raw refresh token.
4. When the access token expires, the client sends the refresh token to `POST /auth/refresh`.
5. The backend hashes the presented token and finds the matching database row.
6. If the token is valid, the old row is revoked and a fresh session is issued.

### Rotation

Refresh token refresh is rotating:

- the old refresh token row gets `revokedAt` set
- a new access token is minted
- a new refresh token row is created

This prevents the same refresh token from being reused indefinitely.

### Session management

Each refresh token row represents one device/session.

That means:

- a user can have multiple active sessions at once
- revoking one refresh token does not revoke the others
- logout can be implemented by revoking one row at a time
- global logout can be implemented by revoking all rows for a user

`POST /auth/logout` performs the per-device revocation path by marking the presented refresh token row as revoked.

The refresh token lifetime is 7 days in the current implementation.

### Suggested session operations

Typical session policies:

- device logout: revoke the current refresh token row
- all-device logout: revoke all refresh token rows for `userId`
- idle expiry: remove or ignore rows where `expiresAt` is in the past

## OTP tokens

OTP tokens are used for:

- email verification after signup
- password reset

These tokens are not JWTs. They are one-time random values generated server-side.

### Email verification

When `requireEmailVerification` is true during signup:

- the user is created with `isActive = false`
- an `EmailVerificationToken` row is created
- the raw token is sent by email
- the database stores only the SHA-256 hash
- the token expires after 24 hours

Verification happens at `POST /auth/verify-email`.

If the user needs a fresh signup OTP, `POST /auth/resend-verification` invalidates prior unused verification tokens and creates a new one.

### Password reset

When a password reset is requested:

- existing unused reset tokens for the user are marked used
- a new `PasswordResetToken` row is created
- the raw token is emailed or returned in development
- the database stores only the SHA-256 hash
- the token expires after 15 minutes

Password reset happens at `POST /auth/reset-password`.

## Code references

- [auth.controller.ts](C:/projects/Softvence/aryegrunzweig-server/src/features/auth/auth.controller.ts)
- [auth.module.ts](C:/projects/Softvence/aryegrunzweig-server/src/features/auth/auth.module.ts)
- [auth-response.dto.ts](C:/projects/Softvence/aryegrunzweig-server/src/features/auth/dto/auth-response.dto.ts)
- [auth.dto.ts](C:/projects/Softvence/aryegrunzweig-server/src/features/auth/dto/auth.dto.ts)
- [schema.prisma](C:/projects/Softvence/aryegrunzweig-server/prisma/schema.prisma)

## Operational notes

- Access tokens are not stored in the database.
- Refresh tokens are stored hashed, one row per session/device.
- OTP tokens are stored hashed and are single-use.
- The backend re-checks whether the user is active during JWT validation.
- The backend should revoke refresh tokens on logout, password change, or account disablement if you want immediate session invalidation.

## Token Flow

1. The client signs in with `POST /auth/login` or `POST /auth/customer/signup` / `POST /auth/technician/signup`.
2. The server returns an `accessToken` and a `refreshToken`.
3. The client uses the `accessToken` as `Authorization: Bearer <accessToken>` for protected API calls.
4. After about 30 minutes, the access token expires and protected calls start failing with `401 Unauthorized`.
5. The client sends the stored `refreshToken` to `POST /auth/refresh`.
6. The server validates the refresh token hash, revokes the old refresh token row, and returns a new session with a fresh access token and refresh token.
7. When the user signs out, the client sends the current `refreshToken` to `POST /auth/logout` to revoke that session.

Example request pair:

```http
POST /auth/login
Content-Type: application/json

{
  "email": "alex@example.com",
  "password": "secure-password"
}
```

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "7bc1f1c3b5e44d68a5f4b18a6c2f6b0a..."
}
```
