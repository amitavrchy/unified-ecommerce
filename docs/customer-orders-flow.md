# Customer products and orders flow

Customer shop APIs cover browse → cart or Buy Now → hosted Stripe Checkout → My Orders. All routes below use the global `api` prefix and require `Authorization: Bearer <accessToken>` except the Stripe webhook.

The webhook—not the browser redirect—is what marks an order paid.

---

## Flow at a glance

```text
Store list          GET  /catalog/product-categories
                    GET  /catalog/products
Product details     GET  /catalog/products/:idOrSlug
Add to cart         POST /cart/items
Cart summary        GET  /cart
                    POST /checkout/preview          (optional; no inventory hold)
Addresses           GET  /users/me/addresses
                    POST /users/me/addresses
Pay from cart       POST /checkout/cart
Buy Now             POST /checkout/orders
Open Stripe URL     checkoutUrl from the response
Return to app       FRONTEND_PAYMENT_SUCCESS_URL | FRONTEND_PAYMENT_CANCEL_URL
Confirm payment     GET  /orders/:id
                    GET  /payments/:id
My Orders           GET  /orders?group=all|active|complete
Order details       GET  /orders/:id
Cancel unpaid       POST /orders/:id/cancel
Request return      POST /orders/:id/return
Buy again           POST /orders/:id/reorder
```

Fulfillment after payment is admin-only (`PATCH /admin/orders/:id` and `PATCH /orders/:id/status`). Customers never submit card data or Stripe session IDs to this API.

---

## 1. Browse products

Customer storefront reads live catalog rows. Admin create/update stays on the same controller (`POST` / `PATCH /catalog/products`) and on `/admin/products`.

```
GET /catalog/product-categories
GET /catalog/products
GET /catalog/products/:idOrSlug
```

`GET /catalog/products` query params:

| Param                   | Description                                                         |
| ----------------------- | ------------------------------------------------------------------- |
| `search`                | Name, SKU, description, or category                                 |
| `categories`            | Repeatable category names (also accepts `category`)                 |
| `minPrice` / `maxPrice` | Inclusive price range                                               |
| `inStockOnly`           | `true` keeps `stock > 0`                                            |
| `sort`                  | `popularity` (default), `price_asc`, `price_desc`, `newest`, `name` |
| `page` / `pageSize`     | Pagination (`pageSize` max 100, default 24)                         |

List and detail items include `tagline` (first feature) and `inStock`. Detail also returns up to four `relatedProducts` in the same category. Missing or inactive products return `404`.

---

## 2. Cart

```
GET    /cart
POST   /cart/items            { productId, quantity }
PATCH  /cart/items/:productId { quantity }
DELETE /cart/items/:productId
DELETE /cart
```

Only `CUSTOMER` roles have a cart. Adding the same product merges quantities. Quantity above current stock returns `403`.

`GET /cart` is the cart-page payload:

| Field                             | Description                                   |
| --------------------------------- | --------------------------------------------- |
| `items[].unitPrice` / `lineTotal` | Live catalog price × quantity                 |
| `items[].product.tagline`         | First feature, for the cart line subtitle     |
| `itemCount`                       | Sum of quantities                             |
| `subtotal`                        | Sum of line totals                            |
| `tax`                             | `TAX_RATE` applied only to `taxable` products |
| `shippingFee`                     | Currently `0` (not billed separately)         |
| `total`                           | `subtotal + tax + shippingFee`                |
| `currency`                        | `STRIPE_CURRENCY` (default `cad`)             |

Checkout still re-prices and checks stock. Do not treat cart totals as a locked invoice.

Paid order items are subtracted from the cart when Stripe confirms payment (Buy Now only removes overlapping products).

---

## 3. Addresses

Checkout copies a **saved** address onto the order. Guests cannot pay.

```
GET    /users/me/addresses
POST   /users/me/addresses
PATCH  /users/me/addresses/:id
DELETE /users/me/addresses/:id
```

`GET /users/me` still embeds `addresses`. The dedicated list is for the checkout address picker (primary first).

The first saved address is always primary. Later addresses become primary only when `isPrimary: true`. The primary address cannot be deleted.

Required checkout field: `shippingAddressId` from this list.

---

## 4. Preview totals (no charge, no stock hold)

```
POST /checkout/preview
```

Use this for the sticky order summary before opening Stripe.

| Body                                   | Behavior                                  |
| -------------------------------------- | ----------------------------------------- |
| `{ }` or `{ shippingAddressId }`       | Preview the saved cart                    |
| `{ items: [{ productId, quantity }] }` | Buy Now / explicit items; cart is ignored |

When `shippingAddressId` is omitted, the primary address is returned if one exists (`shippingAddress` may be `null`). Passing an ID that is not the caller’s returns `403`.

Preview does **not** create an order, payment, or Stripe session. Unavailable products return `404`; insufficient stock returns `400`.

---

## 5. Start Stripe Checkout

Two entry points; both create an order in `PAYMENT_PENDING`, decrement stock, and return a hosted Checkout URL.

```
POST /checkout/cart
{
  "shippingAddressId": "...",
  "idempotencyKey": "optional-uuid"
}

POST /checkout/orders
{
  "items": [{ "productId": "...", "quantity": 1 }],
  "shippingAddressId": "...",
  "idempotencyKey": "optional-uuid"
}
```

| Response              | Description                                         |
| --------------------- | --------------------------------------------------- |
| `paymentId`           | Poll with `GET /payments/:id`                       |
| `orderId`             | Poll with `GET /orders/:id`                         |
| `checkoutSessionId`   | Stripe session id (do not send it back to this API) |
| `checkoutUrl`         | Open this URL in the browser / in-app webview       |
| `amount` / `currency` | Charged total (subtotal + tax)                      |

Retry the same `idempotencyKey` to recover an existing unpaid session. A new key starts a new reservation.

Stripe success/cancel URLs (from `FRONTEND_PAYMENT_SUCCESS_URL` and
`FRONTEND_PAYMENT_CANCEL_URL`):

```text
{FRONTEND_PAYMENT_SUCCESS_URL}?orderId={orderId}&session_id={CHECKOUT_SESSION_ID}
{FRONTEND_PAYMENT_CANCEL_URL}?orderId={orderId}
```

The `session_id` query param is for the client’s own logging only. Payment completion is webhook-driven.

---

## 6. After Stripe

1. Customer finishes or abandons Checkout.
2. Stripe sends `POST /webhooks/stripe` (raw body + `stripe-signature`).
3. On success the order becomes `PAID`, `paidAt` is set, inventory stays reserved, and matching cart lines are removed.
4. The app should poll `GET /orders/:id` (or `GET /payments/:id`) until `status` is `PAID` / payment `SUCCEEDED`, or until cancel/failure.

If the customer hits cancel:

```
POST /orders/:id/cancel
```

This expires an open Stripe session (when possible), sets the order to `CANCELLED`, and releases reserved stock. If Stripe already collected payment, the API returns `409` and the order is marked paid instead.

---

## 7. My Orders

```
GET /orders?group=all|active|complete&status=&search=&page=1&pageSize=25
```

Customers only see their own orders. `search` matches `orderNumber` or product name.

| `group`         | Statuses                                                     |
| --------------- | ------------------------------------------------------------ |
| `all` (default) | No status filter                                             |
| `active`        | `PAYMENT_PENDING`, `PLACED`, `PAID`, `PROCESSING`, `SHIPPED` |
| `complete`      | `DELIVERED`, `CANCELLED`, `PAYMENT_FAILED`, `REFUNDED`       |

Each list item is the same shape as order details: `shippingFee`, `paymentStatus`, five-step `timeline`, `canCancel`, `canReturn`, `shippingAddress`, items, and return requests.

---

## 8. Order details, cancel, return, reorder

`:id` accepts the database id **or** the human `orderNumber` (`CC-…`).

```
GET  /orders/:id
POST /orders/:id/cancel
POST /orders/:id/return
POST /orders/:id/reorder
GET  /orders/:id/returns
GET  /orders/returns
```

### Timeline

Steps: Order Placed → Payment Confirmed → Processing → Shipped → Delivered. Each step has `completed`, `current`, and `at`.

### Actions

| Flag / route               | When                                                |
| -------------------------- | --------------------------------------------------- |
| `canCancel`                | `PAYMENT_PENDING` only                              |
| `canReturn`                | `DELIVERED` and no non-rejected return exists       |
| `POST /orders/:id/return`  | `{ reason, comments?, orderItemId? }`               |
| `POST /orders/:id/reorder` | Merges lines into the cart, capped at current stock |

`GET /orders/returns` is the customer’s return history (`orderNumber` + `orderStatus` included). `GET /orders/:id/returns` is the same data scoped to one order.

Admin review is `PATCH /orders/returns/:id/status`. Refunds are `POST /orders/:id/refund` (admin) so Stripe performs the refund.

---

## Status map

| Order status                           | Meaning                                               |
| -------------------------------------- | ----------------------------------------------------- |
| `PAYMENT_PENDING`                      | Inventory reserved; waiting on Stripe                 |
| `PAID`                                 | Webhook confirmed Checkout                            |
| `PROCESSING` / `SHIPPED` / `DELIVERED` | Admin fulfillment                                     |
| `CANCELLED`                            | Unpaid session cancelled or failed order closed       |
| `PAYMENT_FAILED`                       | Stripe did not collect payment; stock released        |
| `REFUNDED`                             | Admin Stripe refund after an approved/received return |

Shipping fee on stored orders is `total - subtotal - tax` (currently `0` unless a future total includes shipping).

---

## Client checklist

1. Customer JWT from `/auth/customer/signup` + `/auth/verify-email` (see [authentication.md](./authentication.md)).
2. Store uses `/catalog/*`; never admin product writes.
3. Cart page: `GET /cart` (or `POST /checkout/preview` for Buy Now).
4. Require a saved `shippingAddressId` before `POST /checkout/cart` or `/checkout/orders`.
5. Open `checkoutUrl`. Do not confirm payment from the success redirect alone.
6. Poll `GET /orders/:id` until `PAID`, `CANCELLED`, or `PAYMENT_FAILED`.
7. My Orders tabs: `group=all|active|complete`.
8. Track / details: `GET /orders/:id` (`timeline`, `carrier`, `trackingNumber`).
9. Returns and reorder as above.

Required env (server only): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CURRENCY`, `STRIPE_WEBHOOK_TOLERANCE_SECONDS`, `FRONTEND_PAYMENT_SUCCESS_URL`, `FRONTEND_PAYMENT_CANCEL_URL`, `TAX_RATE`. Forward webhooks with `stripe listen --forward-to localhost:5000/api/webhooks/stripe`. See [stripe-payment.md](stripe-payment.md).
