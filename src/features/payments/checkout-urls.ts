import { InternalServerErrorException } from '@nestjs/common';

export function stripeSecretKey(): string {
  const secret =
    process.env.STRIPE_SECRET_KEY?.trim() ||
    process.env.STIPE_SECRET_KEY?.trim();
  if (!secret)
    throw new InternalServerErrorException('Stripe is not configured');
  return secret;
}

export function checkoutRedirectUrls(ids: {
  orderId?: string;
  requestId?: string;
  paymentId?: string;
}): {
  success_url: string;
  cancel_url: string;
} {
  const params = Object.fromEntries(
    Object.entries(ids).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );
  return {
    success_url: appendCheckoutQuery(
      requiredUrl('FRONTEND_PAYMENT_SUCCESS_URL'),
      {
        ...params,
        session_id: '{CHECKOUT_SESSION_ID}',
      },
    ),
    cancel_url: appendCheckoutQuery(
      requiredUrl('FRONTEND_PAYMENT_CANCEL_URL'),
      params,
    ),
  };
}

export function appendCheckoutQuery(
  base: string,
  params: Record<string, string>,
): string {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new InternalServerErrorException('Payment redirect URL is invalid');
  }
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url
    .toString()
    .replaceAll('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}')
    .replaceAll('%7bCHECKOUT_SESSION_ID%7d', '{CHECKOUT_SESSION_ID}');
}

function requiredUrl(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new InternalServerErrorException(`${name} is required for Checkout`);
  return value.replace(/\/$/, '');
}
