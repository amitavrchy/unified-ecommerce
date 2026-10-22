# Stripe review — 22 October 2026

The code and PostgreSQL integration checks passed with simulated Stripe responses.
No external payment, authorization or refund was created. Real Stripe verification
is incomplete: the local environment has no `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `FRONTEND_PAYMENT_SUCCESS_URL` or
`FRONTEND_PAYMENT_CANCEL_URL` configured.

## Corrections

- Checkout claims are serialized by idempotency key. Retries reuse a stored request
  body and provider key, reserve stock once, and reject different checkout details.
  A network timeout retains stock because it does not prove Stripe rejected the
  request. A retry or signed expiration event can recover the claim. See
  [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests).
- Signed callbacks that arrive before the create response can resolve their local
  payment by metadata. Success and inventory release share a database lock;
  concurrent events cannot pay an order twice or return its stock twice.
- Late create responses and stale failure/expiry events cannot downgrade a
  successful payment. Card declines remain retryable while Checkout is active.
- Quote checkout uses cards with manual capture, the persisted negotiated amount,
  and a stored provider request. Existing authorizations/captures are reused.
  Capture requires a customer-confirmed technician report. Voiding expires an open
  hosted session before releasing its authorization.
- Each return records refund ID, amount, provider status and attempt. Pending
  refunds reserve their balance; success is applied once under the order lock.
  Refund update callbacks reconcile current provider state. Failed attempts can be
  retried with a new key, and a later failed refund reverses local accounting.
  See [Stripe refund lifecycle](https://docs.stripe.com/refunds).
- New orders snapshot tax per item. A non-taxable returned item does not receive a
  share of the taxable items' tax. Existing orders without snapshots retain the
  historical proportional allocation and need review for mixed-tax returns.
- This application supports two-decimal currencies such as CAD/USD. Currencies
  with different minor-unit rules are rejected. Redirect URLs require HTTP(S).

## Verification performed

Temporary checks outside the repository used real PostgreSQL and simulated Stripe
objects with signatures produced by the Stripe SDK. They exercised concurrent
checkout, changed-request rejection, timeout recovery, an early webhook,
concurrent duplicate callbacks, invalid signatures and amounts, expiration stock
release, cancellation, pending/failed refunds, mixed-tax returns, negotiated quote
authorization, report-gated capture and monetary/redirect validation. No spec files
or test framework are retained in the repository.

## Provider configuration still required

Configure real sandbox credentials and frontend redirect URLs through `.env` or
server environment variables, then exercise successful payment, declined card,
3DS authentication, timeout/retry, authorization, capture, expiration and refund in
Stripe's sandbox before treating the production integration as verified.

Register a **snapshot** webhook endpoint at `https://YOUR_API/api/webhooks/stripe`
and configure its signing secret. The application verifies the signature against
the raw body; see [Stripe webhook setup](https://docs.stripe.com/webhooks).
Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `payment_intent.amount_capturable_updated`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `refund.created`
- `refund.updated`
- `refund.failed`

Capture a card authorization before Stripe's authorization window ends; holds are
not indefinite. See [authorization/capture windows](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method).
Refunds created directly in the Stripe Dashboard without this API's return
metadata require operator reconciliation; the API does not guess their return.
