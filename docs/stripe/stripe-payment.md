# Stripe payments (frontend)

The app never collects cards. Call this API, then send the browser to
`checkoutUrl`. Stripe shows the payment page, then redirects to
`FRONTEND_PAYMENT_SUCCESS_URL`. The webhook (not the redirect) marks the
payment complete.

Base URL in the examples: `http://localhost:5000`. Every customer call needs:

```
Authorization: Bearer <accessToken>
```

```text
Pay
  → POST (below)
  → JSON.checkoutUrl
  → window.location.href = checkoutUrl
  → customer pays on Stripe (4242…)
  → https://arye-sd.vercel.app/payment/success?...
  → poll GET until paid / authorized
```

---

## 1. Shop: preview totals (optional)

Does not create an order or open Stripe. Omit `items` to preview the saved cart.

```bash
curl -X POST 'http://localhost:5000/api/checkout/preview' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "shippingAddressId": "clxaddr01"
  }'
```

Buy Now preview:

```bash
curl -X POST 'http://localhost:5000/api/checkout/preview' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "shippingAddressId": "clxaddr01",
    "items": [{ "productId": "clxprod01", "quantity": 1 }]
  }'
```

```json
{
  "source": "cart",
  "itemCount": 1,
  "currency": "cad",
  "subtotal": 299,
  "tax": 44.78,
  "shippingFee": 0,
  "total": 343.78,
  "taxRate": 0.14975,
  "shippingAddress": {
    "id": "clxaddr01",
    "line1": "123 Main Street",
    "apartment": null,
    "city": "Toronto",
    "state": "ON",
    "zipCode": "M5V 2T6",
    "country": "Canada",
    "isPrimary": true
  },
  "items": [
    {
      "productId": "clxprod01",
      "name": "Elite 500 Power Unit",
      "quantity": 1,
      "unitPrice": 299,
      "lineTotal": 299,
      "taxable": true,
      "inStock": true,
      "availableStock": 4,
      "tagline": "Quiet-flow technology",
      "imageUrls": ["https://res.cloudinary.com/demo/elite.jpg"]
    }
  ]
}
```

`403` if the address is not the customer’s. `400` if the cart is empty or stock is
too low.

---

## 2. Shop: pay from cart

Creates the order, reserves stock, and returns the Stripe page URL.

```bash
curl -X POST 'http://localhost:5000/api/checkout/cart' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "shippingAddressId": "clxaddr01",
    "idempotencyKey": "11111111-1111-1111-1111-111111111111"
  }'
```

```json
{
  "paymentId": "clxpay01",
  "orderId": "clxord01",
  "checkoutSessionId": "cs_test_b1C2d3",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_b1C2d3",
  "currency": "cad",
  "amount": 343.78
}
```

```js
const { checkoutUrl, orderId, paymentId } = await response.json();
window.location.href = checkoutUrl;
```

Retry the same `idempotencyKey` to get the same unpaid session. A new key starts
a new order.

---

## 3. Shop: Buy Now

Same response as cart checkout. Body must include `items`.

```bash
curl -X POST 'http://localhost:5000/api/checkout/orders' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "shippingAddressId": "clxaddr01",
    "idempotencyKey": "22222222-2222-2222-2222-222222222222",
    "items": [{ "productId": "clxprod01", "quantity": 1 }]
  }'
```

```json
{
  "paymentId": "clxpay01",
  "orderId": "clxord01",
  "checkoutSessionId": "cs_test_b1C2d3",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_b1C2d3",
  "currency": "cad",
  "amount": 343.78
}
```

---

## 4. Service quote: pay

Call only after `quotation.status === "ACCEPTED"`. Empty body. Amount is
`negotiatedTotal ?? totalAmount` (server-side).

```bash
curl -X POST 'http://localhost:5000/api/payments/service-requests/clxreq01/authorization' \
  -H 'Authorization: Bearer <accessToken>'
```

```json
{
  "paymentId": "clxpay02",
  "requestId": "clxreq01",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_q9R8s7",
  "checkoutSessionId": "cs_test_q9R8s7",
  "amount": 180,
  "currency": "cad"
}
```

If the hold is already in place, `checkoutUrl` is `null` — do not redirect.

```js
const { checkoutUrl, paymentId } = await response.json();
if (checkoutUrl) window.location.href = checkoutUrl;
```

---

## 5. After Stripe (success page)

Stripe sends the customer here. Query params depend on the flow:

```text
Shop
https://arye-sd.vercel.app/payment/success?orderId=clxord01&session_id=cs_test_b1C2d3

Quote
https://arye-sd.vercel.app/payment/success?requestId=clxreq01&paymentId=clxpay02&session_id=cs_test_q9R8s7
```

Cancel:

```text
https://arye-sd.vercel.app/payment/failed?orderId=clxord01
https://arye-sd.vercel.app/payment/failed?requestId=clxreq01&paymentId=clxpay02
```

`session_id` is for display only. Do not POST it to this API. Poll until the
webhook has finished.

### Shop — poll the order

```bash
curl -X GET 'http://localhost:5000/api/orders/clxord01' \
  -H 'Authorization: Bearer <accessToken>'
```

Wait until `status` is `"PAID"` (and payment `SUCCEEDED`).

### Shop or quote — poll the payment

```bash
curl -X GET 'http://localhost:5000/api/payments/clxpay01' \
  -H 'Authorization: Bearer <accessToken>'
```

Shop, after webhook:

```json
{
  "id": "clxpay01",
  "purpose": "ORDER",
  "status": "SUCCEEDED",
  "amount": 343.78,
  "currency": "cad",
  "stripeCheckoutSessionId": "cs_test_b1C2d3",
  "stripePaymentIntentId": "pi_3Nxxxxxxxx"
}
```

Quote, after webhook (card hold, not captured yet):

```json
{
  "id": "clxpay02",
  "purpose": "QUOTATION",
  "status": "AUTHORIZED",
  "amount": 180,
  "currency": "cad",
  "stripeCheckoutSessionId": "cs_test_q9R8s7",
  "stripePaymentIntentId": "pi_3Nxxxxxxxx"
}
```

Show a success screen when shop `SUCCEEDED` or quote `AUTHORIZED`. Admin capture
for the quote is not a customer step.

---

## Errors the UI should handle

| Status | When |
| ------ | ---- |
| `400` | Empty cart, bad stock, quote not `ACCEPTED` / expired |
| `401` | Missing or invalid token |
| `403` | Not a customer, or address / request is not theirs |
| `404` | Product, request, or payment not found |

---

## Test card

`4242 4242 4242 4242`, any future expiry, any CVC, any postal code.

---

## Local webhook (developer)

Keep this running so the poll in section 5 can succeed:

```bash
stripe listen --forward-to localhost:5000/api/webhooks/stripe
```
