const INSECURE_OR_PLACEHOLDER_SECRETS = new Set([
  'change-me-in-production',
  'local-development-secret-change-in-production',
  'replace-with-at-least-32-random-characters',
]);

/**
 * Development gets an isolated fallback so a fresh checkout can run locally.
 * A production process must receive a non-placeholder, 32+ character secret
 * through its deployment environment.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  const valid =
    Boolean(secret) &&
    secret!.length >= 32 &&
    !INSECURE_OR_PLACEHOLDER_SECRETS.has(secret!);
  if (process.env.NODE_ENV === 'production' && !valid) {
    throw new Error(
      'JWT_SECRET must be a unique, non-placeholder secret of at least 32 characters in production',
    );
  }
  return secret || 'local-development-secret-change-this-before-deployment';
}
