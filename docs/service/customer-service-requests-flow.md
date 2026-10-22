# Customer service request and quote flow

Customer APIs for: pick a service → submit a request with photos/videos → review the
quote → accept, reject, or counteroffer → authorize the card hold → wait for the
appointment → confirm the completed report.

All routes use the global `/api` prefix. Customer routes need:

```
Authorization: Bearer <accessToken>
```

The customer never sends card numbers, Stripe IDs, or a claim that payment succeeded.
Quote creation, technician assignment, scheduling, and final capture are admin steps.
The assigned technician starts the job and submits the report. The app should poll or
refresh `GET /service-requests/:id` when those happen.

Base URL in the examples: `http://localhost:5000`.

---

## Flow at a glance

```text
Login                 POST /auth/login
Catalog               GET  /service-requests/catalog
Addresses             GET  /users/me/addresses
                      POST /users/me/addresses
Submit request        POST /service-requests                 multipart: images[], videos[]
My requests           GET  /service-requests
                      GET  /service-requests?status=QUOTE_SENT
Request details       GET  /service-requests/:id             viewing a QUOTE_SENT request marks the quote VIEWED
Accept quote          POST /service-requests/:id/quotation/accept
Reject quote          POST /service-requests/:id/quotation/reject
Counteroffer          POST /service-requests/:id/quotation/counteroffers
Counteroffer history  GET  /service-requests/:id/quotation/counteroffers
Authorize card        POST /payments/service-requests/:requestId/authorization
                      then window.location = checkoutUrl
Confirm Stripe        Stripe Checkout page (not this API)
Return to app         FRONTEND_PAYMENT_SUCCESS_URL
Payment status        GET  /payments/:id
Cancel                POST /service-requests/:id/cancel      until work starts
Add media             POST /service-requests/:id/media
Confirm report        POST /service-requests/:id/report/customer-confirm
Notifications         GET  /notifications
```

Off-screen (do not call from the customer app, but the request status changes because of them):

```text
Admin list / detail   GET   /admin/service-requests
                      GET   /admin/service-requests/:id
Admin reviews         PATCH /admin/service-requests/:id/status     NEW → UNDER_REVIEW
Admin sends quote     POST  /admin/service-requests/:id/quotation  → QUOTE_SENT
Admin pending offers  GET   /admin/service-requests/pending-counteroffers
Admin offer history   GET   /admin/service-requests/:id/quotation/counteroffers
Admin decides offer   POST  /admin/service-requests/:id/quotation/counteroffers/:offerId/approve
                      POST  /admin/service-requests/:id/quotation/counteroffers/:offerId/reject
Admin schedules       POST  /admin/service-requests/:id/assign     ACCEPTED + authorized → SCHEDULED
Tech list / detail    GET   /technician/service-requests
                      GET   /technician/service-requests/:id
Tech starts           PATCH /technician/service-requests/:id/status  SCHEDULED → IN_PROGRESS
Tech report           POST  /technician/service-requests/:id/report  → REPORT_SUBMITTED
Tech equipment        POST  /technician/service-requests/:id/equipment
Tech media            POST  /technician/service-requests/:id/media
Admin captures        POST  /admin/payments/:id/capture              after customer-confirm
```

---

## Status machines the UI should render

### Service request (`status`)

| Status              | Customer screen                                              |
| ------------------- | ------------------------------------------------------------ |
| `NEW`               | Submitted, waiting for office review                         |
| `UNDER_REVIEW`      | In review (also after the customer rejects a quote)          |
| `QUOTE_SENT`        | Show quote: Accept / Counteroffer / Reject                   |
| `ACCEPTED`          | Quote accepted — collect card authorization, then wait       |
| `SCHEDULED`         | Show technician window (`scheduledStart` / `scheduledEnd`)   |
| `IN_PROGRESS`       | Job in progress                                              |
| `REPORT_SUBMITTED`  | Show report; enable Confirm work                             |
| `COMPLETED`         | Done                                                         |
| `CANCELLED`         | Cancelled; `cancellationReason` set                          |

Customer may cancel while status is `NEW`, `UNDER_REVIEW`, `QUOTE_SENT`, `ACCEPTED`, or `SCHEDULED`. After `IN_PROGRESS`, cancel is rejected.

### Quote (`quotation.status`)

| Status     | Meaning                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `SENT`     | Admin just sent it. First `GET /service-requests/:id` by the customer sets `VIEWED`. |
| `VIEWED`   | Customer opened the request detail                                      |
| `ACCEPTED` | Customer accepted terms. Next step is Stripe authorization              |
| `REJECTED` | Customer rejected; request returns to `UNDER_REVIEW`                    |
| `EXPIRED`  | `validUntil` passed; accept/counteroffer fail                           |
| `CANCELLED`| Request was cancelled after a quote existed                             |

There is always **one** `quotation` per request. A counteroffer is not a second quote.
`totalAmount` is the office list price and is never rewritten. `negotiatedTotal` is
set only after an admin **approves** a counteroffer. Payment always holds
`negotiatedTotal ?? totalAmount`. See [One quotation, two totals](#one-quotation-two-totals).

---

## 1. Login

```bash
curl -X POST 'http://localhost:5000/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "customer@example.com",
    "password": "secure-password"
  }'
```

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clxuser...",
    "email": "customer@example.com",
    "role": "CUSTOMER",
    "firstName": "Alex",
    "lastName": "Morgan"
  }
}
```

Use `user.role === "CUSTOMER"` before showing this flow. Store `accessToken` and send it on every later call.

---

## 2. Service catalog

The create-request form needs a `categoryId` and optional `issueId` that belongs to that category.

```bash
curl -X GET 'http://localhost:5000/api/service-requests/catalog' \
  -H 'Authorization: Bearer <accessToken>'
```

```json
[
  {
    "id": "clxcat01",
    "name": "Central vacuum repair",
    "description": "Power unit, tubing, and inlet service",
    "issues": [
      { "id": "clxiss01", "name": "Low suction" },
      { "id": "clxiss02", "name": "Unit will not start" }
    ]
  }
]
```

---

## 3. Service address

`POST /service-requests` requires an `addressId` owned by the logged-in customer.

```bash
curl -X GET 'http://localhost:5000/api/users/me/addresses' \
  -H 'Authorization: Bearer <accessToken>'
```

```json
[
  {
    "id": "clxaddr01",
    "line1": "123 Main Street",
    "apartment": "Unit 4B",
    "city": "Toronto",
    "state": "ON",
    "zipCode": "M5V 2T6",
    "country": "Canada",
    "isPrimary": true
  }
]
```

Create one if the list is empty:

```bash
curl -X POST 'http://localhost:5000/api/users/me/addresses' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "line1": "123 Main Street",
    "apartment": "Unit 4B",
    "city": "Toronto",
    "state": "ON",
    "zipCode": "M5V 2T6",
    "country": "Canada",
    "isPrimary": true
  }'
```

```json
{
  "id": "clxaddr01",
  "line1": "123 Main Street",
  "apartment": "Unit 4B",
  "city": "Toronto",
  "state": "ON",
  "zipCode": "M5V 2T6",
  "country": "Canada",
  "isPrimary": true
}
```

---

## 4. Submit a service request

`multipart/form-data` only. Do **not** set `Content-Type` yourself (the client must include the boundary). There is no `attachments` URL field — send files on `images` and `videos`. At most 10 files total. Photos must be `image/*`, clips `video/*`.

| Field           | Required | Type        | Notes                                      |
| --------------- | -------- | ----------- | ------------------------------------------ |
| `categoryId`    | yes      | string      | From catalog                               |
| `issueId`       | no       | string      | Must belong to `categoryId`                |
| `addressId`     | yes      | string      | Must belong to this customer               |
| `description`   | yes      | string      | Max 4000                                   |
| `preferredDate` | no       | ISO datetime| e.g. `2026-09-02T09:00:00.000Z`            |
| `preferredTime` | no       | string      | e.g. `09:00-12:00`                         |
| `images`        | no       | file(s)     | Repeat the field name once per photo       |
| `videos`        | no       | file(s)     | Repeat the field name once per clip        |

```bash
curl -X POST 'http://localhost:5000/api/service-requests' \
  -H 'Authorization: Bearer <accessToken>' \
  -F 'categoryId=clxcat01' \
  -F 'issueId=clxiss01' \
  -F 'addressId=clxaddr01' \
  -F 'description=The central vacuum has low suction and makes a rattling sound.' \
  -F 'preferredDate=2026-09-02T09:00:00.000Z' \
  -F 'preferredTime=09:00-12:00' \
  -F 'images=@/path/to/inlet.jpg' \
  -F 'images=@/path/to/canister.jpg' \
  -F 'videos=@/path/to/noise.mp4'
```

`201` — request starts as `NEW`. Uploaded files are stored in Cloudinary; the response carries the `secure_url` values on `media`.

```json
{
  "id": "clxreq01",
  "requestNumber": "SR-AB12CD34EF",
  "customerId": "clxuser01",
  "technicianId": null,
  "categoryId": "clxcat01",
  "issueId": "clxiss01",
  "addressId": "clxaddr01",
  "description": "The central vacuum has low suction and makes a rattling sound.",
  "status": "NEW",
  "preferredDate": "2026-09-02T09:00:00.000Z",
  "preferredTime": "09:00-12:00",
  "scheduledStart": null,
  "scheduledEnd": null,
  "cancellationReason": null,
  "media": [
    {
      "id": "clxmedia01",
      "kind": "ISSUE",
      "url": "https://res.cloudinary.com/.../inlet.jpg",
      "mimeType": "image/jpeg"
    },
    {
      "id": "clxmedia02",
      "kind": "ISSUE",
      "url": "https://res.cloudinary.com/.../noise.mp4",
      "mimeType": "video/mp4"
    }
  ],
  "quotation": null,
  "report": null,
  "equipment": [],
  "statusHistory": [
    {
      "status": "NEW",
      "note": "Request submitted",
      "createdAt": "2026-08-21T10:00:00.000Z"
    }
  ]
}
```

Typical errors:

| Status | When                                                      |
| ------ | --------------------------------------------------------- |
| `400`  | `issueId` is not in that category, or a file is the wrong kind |
| `403`  | Not a customer, or `addressId` is not theirs              |
| `404`  | Unknown `categoryId`                                      |
| `409`  | More than 10 files                                        |

Frontend `FormData` example:

```ts
const form = new FormData();
form.append('categoryId', categoryId);
form.append('issueId', issueId);
form.append('addressId', addressId);
form.append('description', description);
form.append('preferredDate', preferredDate);
form.append('preferredTime', preferredTime);
for (const file of imageFiles) form.append('images', file);
for (const file of videoFiles) form.append('videos', file);

await fetch('http://localhost:5000/api/service-requests', {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
  body: form,
});
```

---

## 5. List and open a request

```bash
curl -X GET 'http://localhost:5000/api/service-requests' \
  -H 'Authorization: Bearer <accessToken>'

curl -X GET 'http://localhost:5000/api/service-requests?status=QUOTE_SENT' \
  -H 'Authorization: Bearer <accessToken>'

curl -X GET 'http://localhost:5000/api/service-requests/clxreq01' \
  -H 'Authorization: Bearer <accessToken>'
```

List and detail return the same shape as create (plus nested `customer`, `category`, `issue`, `address`). Filter query: `status` = one `RequestStatus` value.

**Important:** when the customer opens a request whose status is `QUOTE_SENT`, the server marks a `SENT` quote as `VIEWED` and sets `viewedAt`. Open detail only when the user actually views the quote screen.

When a quote exists, `quotation` looks like:

```json
{
  "id": "clxquote01",
  "quoteNumber": "QT-AB12CD34",
  "laborAmount": 125,
  "partsAmount": 45,
  "taxAmount": 22.1,
  "discountAmount": 0,
  "totalAmount": 192.1,
  "negotiatedTotal": null,
  "notes": "Includes replacement filter and installation.",
  "validUntil": "2026-09-09T23:59:59.000Z",
  "status": "VIEWED",
  "acceptedAt": null,
  "counteroffers": []
}
```

Display `laborAmount`, `partsAmount`, `taxAmount`, `discountAmount`, and `totalAmount` as the office breakdown. If `negotiatedTotal` is a number, show it as the **payable** price and still require Accept terms. Do not treat `counteroffers[]` as another quotation.

---

## 6. Quote actions (customer)

All three require an unexpired quote in `SENT` or `VIEWED`, and the request in `QUOTE_SENT`.

### Accept

`acceptTerms` must be `true`. Store the terms document version the UI showed.

```bash
curl -X POST 'http://localhost:5000/api/service-requests/clxreq01/quotation/accept' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "acceptTerms": true,
    "termsVersion": "2026-08-17"
  }'
```

```json
{
  "id": "clxquote01",
  "quoteNumber": "QT-AB12CD34",
  "totalAmount": 192.1,
  "negotiatedTotal": null,
  "status": "ACCEPTED",
  "validUntil": "2026-09-09T23:59:59.000Z",
  "acceptedAt": "2026-08-21T10:12:00.000Z",
  "notes": "Includes replacement filter and installation."
}
```

Request status becomes `ACCEPTED`. Next screen: card authorization.

`400` if terms are not accepted, the quote is not respondable, or it expired (`This quotation has expired`).

### Reject

Returns the request to `UNDER_REVIEW` so admin can send a new quote.

```bash
curl -X POST 'http://localhost:5000/api/service-requests/clxreq01/quotation/reject' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "reason": "Please revise the parts allowance."
  }'
```

```json
{
  "id": "clxquote01",
  "quoteNumber": "QT-AB12CD34",
  "totalAmount": 192.1,
  "negotiatedTotal": null,
  "status": "REJECTED",
  "validUntil": "2026-09-09T23:59:59.000Z",
  "acceptedAt": null,
  "notes": "Please revise the parts allowance."
}
```

`reason` is optional (max 1000).

### Counteroffer

Does **not** accept the quote and does **not** start Stripe. Only one `PENDING` counteroffer per quote.

```bash
curl -X POST 'http://localhost:5000/api/service-requests/clxreq01/quotation/counteroffers' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "requestedTotal": 175,
    "note": "Could you complete the service for this amount?"
  }'
```

```json
{
  "id": "clxoffer01",
  "quotationId": "clxquote01",
  "customerId": "clxuser01",
  "requestedTotal": 175,
  "note": "Could you complete the service for this amount?",
  "status": "PENDING",
  "decidedById": null,
  "decisionNote": null,
  "decidedAt": null,
  "supersededAt": null,
  "createdAt": "2026-08-21T10:15:00.000Z",
  "statusHistory": [
    {
      "status": "PENDING",
      "actorId": "clxuser01",
      "note": "Could you complete the service for this amount?",
      "createdAt": "2026-08-21T10:15:00.000Z"
    }
  ]
}
```

`409` if a pending counteroffer already exists, or an approved one is waiting for the customer to accept.

```bash
curl -X GET 'http://localhost:5000/api/service-requests/clxreq01/quotation/counteroffers' \
  -H 'Authorization: Bearer <accessToken>'
```

Admin lists waiting offers and decides them on the same service-request (body `note` is optional):

```bash
curl -X GET 'http://localhost:5000/api/admin/service-requests/pending-counteroffers' \
  -H 'Authorization: Bearer <adminAccessToken>'

curl -X POST 'http://localhost:5000/api/admin/service-requests/clxreq01/quotation/counteroffers/clxoffer01/approve' \
  -H 'Authorization: Bearer <adminAccessToken>' \
  -H 'Content-Type: application/json' \
  -d '{ "note": "Approved after reviewing the parts allowance." }'

curl -X POST 'http://localhost:5000/api/admin/service-requests/clxreq01/quotation/counteroffers/clxoffer01/reject' \
  -H 'Authorization: Bearer <adminAccessToken>' \
  -H 'Content-Type: application/json' \
  -d '{ "note": "Parts cost does not support that total." }'
```

After admin **approves**, `GET /service-requests/:id` shows `quotation.negotiatedTotal: 175` (or `180` in the live example below) and the counteroffer `status: "APPROVED"`. Labor, parts, tax, discount, and `totalAmount` stay at the original office figures. The customer must still call accept with terms. After admin **rejects**, `negotiatedTotal` stays `null`, the quote stays `SENT`/`VIEWED`, and the customer can accept the original `totalAmount`, reject the quote, or submit another counteroffer.

---

## One quotation, two totals

A request has a single `quotation` row (`QT-77FDF3C2E2` in the live payload). The
`counteroffers` array is negotiation history on that same quote. Accepting after an
approved offer does **not** create a second quotation and does **not** rewrite the
office line items.

| Field | What it is | After the 180 counteroffer |
| ----- | ---------- | -------------------------- |
| `laborAmount` / `partsAmount` / `taxAmount` / `discountAmount` | Office breakdown used to compute the list price | Unchanged (`125 + 45 + 22.10 − 0`) |
| `totalAmount` | Original office list price | `192.1` forever |
| `negotiatedTotal` | Admin-approved customer total, or `null` if nobody negotiated | `180` |
| `quotation.status` | Quote workflow | `ACCEPTED` after the customer accepts terms |
| `counteroffers[].requestedTotal` | What the customer asked for | `180`, `status: "APPROVED"` |
| Payment `amount` | Stripe hold / later capture | `negotiatedTotal ?? totalAmount` → **`180`** |

How the UI and payment API should read the quote:

```text
payable = quotation.negotiatedTotal ?? quotation.totalAmount
```

Worked example from an accepted request after an approved counteroffer:

```text
Office quote          totalAmount      = 192.10   (do not charge this)
Customer asked        requestedTotal   = 180.00
Admin approved        negotiatedTotal  = 180.00
Customer accepted     quotation.status = ACCEPTED
Authorize / capture   payment.amount   = 180.00
```

```json
{
  "quotation": {
    "id": "cmt3wgz5600014tzyh7lsf6rv",
    "quoteNumber": "QT-77FDF3C2E2",
    "laborAmount": 125,
    "partsAmount": 45,
    "taxAmount": 22.1,
    "discountAmount": 0,
    "totalAmount": 192.1,
    "negotiatedTotal": 180,
    "status": "ACCEPTED",
    "counteroffers": [
      {
        "id": "cmt3xm1bw0002y8zy01296is2",
        "requestedTotal": 180,
        "status": "APPROVED"
      }
    ]
  }
}
```

Show the customer: office total **192.10**, agreed price **180.00**, then Accept terms.
`POST /payments/service-requests/:requestId/authorization` creates one `Payment` on
`quotationId` and returns `checkoutUrl`. Redirect the browser there. Stripe is asked
for **180**, not 192.10. After pay, Stripe sends the customer to
`FRONTEND_PAYMENT_SUCCESS_URL` and the webhook marks the hold `AUTHORIZED`.
Admin assign requires that payment `AUTHORIZED` for **180**.
Later `POST /admin/payments/:id/capture` captures that same 180 hold.

If `negotiatedTotal` is `null` (no approved offer, or admin rejected every offer),
authorization and capture use `totalAmount` (192.10).

---

## 7. Authorize the accepted quote (Stripe)

Call only after `quotation.status === "ACCEPTED"`. Empty body. The server picks the
amount itself: `negotiatedTotal ?? totalAmount`. Redirect to `checkoutUrl`.

```bash
curl -X POST 'http://localhost:5000/api/payments/service-requests/clxreq01/authorization' \
  -H 'Authorization: Bearer <accessToken>'
```

```json
{
  "paymentId": "clxpay01",
  "requestId": "clxreq01",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_...",
  "checkoutSessionId": "cs_test_...",
  "amount": 180,
  "currency": "cad"
}
```

```js
const { checkoutUrl } = await response.json();
window.location.href = checkoutUrl;
```

Do not confirm a PaymentIntent in the app. After Stripe, the customer lands on
`FRONTEND_PAYMENT_SUCCESS_URL`. Poll `GET /payments/:paymentId` until `AUTHORIZED`.

---

## 8. After scheduling

When admin assigns a technician, status becomes `SCHEDULED` and `scheduledStart` / `scheduledEnd` are set. A conversation is created automatically.

```bash
curl -X GET 'http://localhost:5000/api/conversations/service-requests/clxreq01' \
  -H 'Authorization: Bearer <accessToken>'
```

Use `POST /conversations/:id/messages` (multipart `body`, `images`, `videos`) for chat. See [file-uploads.md](file-uploads.md).

---

## 9. Confirm the completed report

When status is `REPORT_SUBMITTED`, show `report.repairStatus`, `report.workPerformed`, and `report.technicianNotes`. Confirm with an empty body:

```bash
curl -X POST 'http://localhost:5000/api/service-requests/clxreq01/report/customer-confirm' \
  -H 'Authorization: Bearer <accessToken>'
```

```json
{
  "id": "clxreport01",
  "repairStatus": "Repaired",
  "workPerformed": "Cleaned the unit, replaced the filter, and tested suction.",
  "technicianNotes": "Recommend annual maintenance.",
  "followUpRequired": false,
  "submittedAt": "2026-09-02T16:00:00.000Z",
  "customerConfirmedAt": "2026-09-02T18:30:00.000Z"
}
```

`400` if the report is not in `REPORT_SUBMITTED`.

---

## 10. Cancel

```bash
curl -X POST 'http://localhost:5000/api/service-requests/clxreq01/cancel' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "reason": "The issue has been resolved."
  }'
```

```json
{
  "id": "clxreq01",
  "requestNumber": "SR-AB12CD34EF",
  "status": "CANCELLED",
  "cancellationReason": "The issue has been resolved."
}
```

Any open Stripe authorization on that quote is voided before the status change. `400` once the job is `IN_PROGRESS` or later, or if already cancelled.

---

## 11. Extra issue media

After create, more photos/videos go on `file` (not `images`/`videos`):

```bash
curl -X POST 'http://localhost:5000/api/service-requests/clxreq01/media' \
  -H 'Authorization: Bearer <accessToken>' \
  -F 'kind=ISSUE' \
  -F 'file=@/path/to/extra.jpg'
```

Customers may only add `kind=ISSUE`. Technicians add `BEFORE` / `AFTER` / `OTHER`.

```json
{
  "id": "clxmedia03",
  "kind": "ISSUE",
  "url": "https://res.cloudinary.com/.../extra.jpg",
  "mimeType": "image/jpeg"
}
```

---

## 12. Notifications to drive UI refresh

```bash
curl -X GET 'http://localhost:5000/api/notifications' \
  -H 'Authorization: Bearer <accessToken>'
```

Titles the customer app should handle:

| Title                               | When to refresh                          |
| ----------------------------------- | ---------------------------------------- |
| `Service request received`          | After submit                             |
| `Your service quote is ready`       | Open quote screen                        |
| `Counteroffer approved` / `rejected`| Reload quote + counteroffer history      |
| `Service appointment scheduled`     | Show schedule                            |
| `New message`                       | Open chat                                |

```bash
curl -X PATCH 'http://localhost:5000/api/notifications/clxnotif01/read' \
  -H 'Authorization: Bearer <accessToken>'
```

---

## Suggested customer screens

1. **New request** — catalog picker, address picker, description, preferred window, image/video picker → `POST /service-requests`.
2. **My requests** — `GET /service-requests`, badge by `status`.
3. **Request detail** — `GET /service-requests/:id`. Branch on `status`.
4. **Quote** — amounts, expiry, terms checkbox → Accept / Reject / Counteroffer.
5. **Pay** — `POST .../authorization` → `window.location = checkoutUrl`.
6. **Scheduled job** — technician window, chat.
7. **Report** — confirm work.
8. **Cancelled / completed** — read-only.

Do not expose admin quote create, assign, capture, or technician start/report on the customer app.
