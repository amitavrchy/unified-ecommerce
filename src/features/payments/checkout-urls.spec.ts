import { InternalServerErrorException } from '@nestjs/common';
import {
  appendCheckoutQuery,
  checkoutRedirectUrls,
  stripeSecretKey,
} from './checkout-urls';

describe('Stripe checkout env wiring', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('reads STRIPE_SECRET_KEY and falls back to STIPE_SECRET_KEY', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_correct';
    process.env.STIPE_SECRET_KEY = 'sk_test_typo';
    expect(stripeSecretKey()).toBe('sk_test_correct');

    delete process.env.STRIPE_SECRET_KEY;
    expect(stripeSecretKey()).toBe('sk_test_typo');

    delete process.env.STIPE_SECRET_KEY;
    expect(() => stripeSecretKey()).toThrow(InternalServerErrorException);
  });

  it('builds hosted Checkout redirects from FRONTEND_PAYMENT_* URLs', () => {
    process.env.FRONTEND_PAYMENT_SUCCESS_URL =
      'https://arye-sd.vercel.app/payment/success';
    process.env.FRONTEND_PAYMENT_CANCEL_URL =
      'https://arye-sd.vercel.app/payment/failed';

    expect(checkoutRedirectUrls({ orderId: 'order-1' })).toEqual({
      success_url:
        'https://arye-sd.vercel.app/payment/success?orderId=order-1&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://arye-sd.vercel.app/payment/failed?orderId=order-1',
    });
  });

  it('keeps the Stripe session placeholder unencoded', () => {
    expect(
      appendCheckoutQuery('https://app.example/payment/success', {
        session_id: '{CHECKOUT_SESSION_ID}',
      }),
    ).toBe(
      'https://app.example/payment/success?session_id={CHECKOUT_SESSION_ID}',
    );
  });
});
