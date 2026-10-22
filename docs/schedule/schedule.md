# Service schedule

The office sets the appointment. The customer app does not pick a technician or
send a time. After the quote is accepted and the Stripe hold is `AUTHORIZED`,
admin assigns a technician. The request becomes `SCHEDULED`. The customer then
reads `scheduledStart` / `scheduledEnd` from the service-request APIs.

Base URL in the examples: `http://localhost:5000`. Customer and admin calls need:

```
Authorization: Bearer <accessToken>
```

```text
Authorize card        POST /payments/service-requests/:id/authorization
Admin assigns         POST /admin/service-requests/:id/assign
Customer list         GET  /service-requests
Customer detail       GET  /service-requests/:id
Admin calendar        GET  /admin/schedule?from=&to=
Cancel (customer)     POST /service-requests/:id/cancel     until work starts
Tech starts           PATCH /technician/service-requests/:id/status
```

There is **no** `POST /schedules` and **no** customer reschedule endpoint.
A time change is an admin re-assign. The customer can cancel until
`IN_PROGRESS`, or message the office on the request conversation.

---

## Who does what

| Actor | Can set the window | APIs |
| ----- | ------------------ | ---- |
| Customer | No | `GET /service-requests`, `GET /service-requests/:id`, `POST .../cancel` |
| Admin | Yes | `POST /admin/service-requests/:id/assign`, `GET /admin/schedule` |
| Technician | No | `GET /technician/service-requests`, start / report |

---

## Status after payment

| Request `status` | Customer schedule screen |
| ---------------- | ------------------------ |
| `ACCEPTED` | Waiting for the office (hold is in place, no window yet) |
| `SCHEDULED` | Show technician and `scheduledStart` / `scheduledEnd` |
| `IN_PROGRESS` | Job started; hide cancel |
| `REPORT_SUBMITTED` | Show report; confirm work |
| `COMPLETED` | Done |
| `CANCELLED` | Cancelled; `cancellationReason` set |

Customer may cancel while status is `NEW`, `UNDER_REVIEW`, `QUOTE_SENT`,
`ACCEPTED`, or `SCHEDULED`. After `IN_PROGRESS`, cancel is rejected.

---

## 1. Admin: create the appointment

Call only when the request is `ACCEPTED` and the quote payment is `AUTHORIZED`.

```bash
curl -X POST 'http://localhost:5000/api/admin/service-requests/clxreq01/assign' \
  -H 'Authorization: Bearer <adminAccessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "technicianId": "clxtech01",
    "scheduledStart": "2026-09-02T13:00:00.000Z",
    "scheduledEnd": "2026-09-02T15:00:00.000Z"
  }'
```

`200` — request `status` becomes `SCHEDULED`. A conversation is created. The
customer and technician each get a notification.

```json
{
  "id": "clxreq01",
  "requestNumber": "SR-AB12CD34EF",
  "status": "SCHEDULED",
  "technicianId": "clxtech01",
  "scheduledStart": "2026-09-02T13:00:00.000Z",
  "scheduledEnd": "2026-09-02T15:00:00.000Z"
}
```

| Status | When |
| ------ | ---- |
| `400` | Quote not accepted, hold not `AUTHORIZED`, or `scheduledEnd` is not after start |
| `404` | Request or technician not found (must be active, verified, available) |
| `409` | Technician already has a job in that window |

To change the window later, call assign again is **not** supported while
`SCHEDULED` — the request must still be `ACCEPTED`. So a reschedule is an office
workflow, not a customer API.

---

## 2. Customer: list appointments

Same list used for service requests. Filter in the app, or pass `status`.

```bash
curl -X GET 'http://localhost:5000/api/service-requests' \
  -H 'Authorization: Bearer <accessToken>'

curl -X GET 'http://localhost:5000/api/service-requests?status=SCHEDULED' \
  -H 'Authorization: Bearer <accessToken>'
```

Suggested UI buckets:

```text
Upcoming    ACCEPTED (waiting), SCHEDULED, IN_PROGRESS, REPORT_SUBMITTED
Completed   COMPLETED
```

Each item includes `scheduledStart`, `scheduledEnd`, nested `technician`,
`address`, `category`, `issue`, and `quotation`.

How to read the window:

```js
const start = request.scheduledStart; // ISO datetime or null
const end = request.scheduledEnd;
const tech = request.technician
  ? `${request.technician.firstName} ${request.technician.lastName}`
  : null;
```

---

## 3. Customer: appointment detail

```bash
curl -X GET 'http://localhost:5000/api/service-requests/clxreq01' \
  -H 'Authorization: Bearer <accessToken>'
```

When `status` is `SCHEDULED` or later, the payload includes the window and
assigned technician (password omitted):

```json
{
  "id": "clxreq01",
  "requestNumber": "SR-AB12CD34EF",
  "status": "SCHEDULED",
  "description": "The central vacuum has low suction.",
  "scheduledStart": "2026-09-02T13:00:00.000Z",
  "scheduledEnd": "2026-09-02T15:00:00.000Z",
  "technicianId": "clxtech01",
  "technician": {
    "id": "clxtech01",
    "firstName": "Marcus",
    "lastName": "Reed",
    "email": "marcus@example.com",
    "avatarUrl": null,
    "technician": {
      "skills": ["Central vacuum repair"],
      "bio": "Senior field technician",
      "yearsExperience": 8
    }
  },
  "address": {
    "line1": "123 Main Street",
    "city": "Toronto",
    "state": "ON",
    "zipCode": "M5V 2T6",
    "country": "Canada"
  },
  "category": { "id": "clxcat01", "name": "Central vacuum repair" },
  "issue": { "id": "clxiss01", "name": "Low suction" },
  "quotation": {
    "status": "ACCEPTED",
    "negotiatedTotal": 180,
    "totalAmount": 192.1,
    "payments": [{ "status": "AUTHORIZED", "amount": 180 }]
  },
  "statusHistory": [
    { "status": "NEW", "note": "Request submitted", "createdAt": "2026-08-21T10:00:00.000Z" },
    { "status": "ACCEPTED", "createdAt": "2026-08-22T05:38:12.000Z" },
    { "status": "SCHEDULED", "note": "Assigned to Marcus Reed", "createdAt": "2026-08-22T15:00:00.000Z" }
  ]
}
```

Do not invent a schedule if `scheduledStart` is `null`. Show “waiting for the
office” while status is `ACCEPTED`.

Chat after scheduling:

```bash
curl -X GET 'http://localhost:5000/api/conversations/service-requests/clxreq01' \
  -H 'Authorization: Bearer <accessToken>'
```

---

## 4. Customer: cancel

```bash
curl -X POST 'http://localhost:5000/api/service-requests/clxreq01/cancel' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "reason": "I need a different day."
  }'
```

`reason` is required (max 1000). Any open Stripe authorization is voided, then
status becomes `CANCELLED`. `400` once the job is `IN_PROGRESS` or later.

---

## 5. Admin: calendar

```bash
curl -X GET 'http://localhost:5000/api/admin/schedule?from=2026-09-01&to=2026-09-30&timezone=America/Toronto' \
  -H 'Authorization: Bearer <adminAccessToken>'
```

| Query | Required | Notes |
| ----- | -------- | ----- |
| `from` | yes | `YYYY-MM-DD`, inclusive local start |
| `to` | yes | `YYYY-MM-DD`, inclusive local end |
| `timezone` | no | IANA zone, default `UTC` |
| `technicianId` | no | Limit to one technician |
| `status` | no | Repeat or comma-separated `RequestStatus` values |

Default statuses: `SCHEDULED`, `IN_PROGRESS`, `REPORT_SUBMITTED`, `COMPLETED`.

```json
[
  {
    "id": "clxreq01",
    "requestNumber": "SR-AB12CD34EF",
    "status": "SCHEDULED",
    "scheduledStart": "2026-09-02T13:00:00.000Z",
    "scheduledEnd": "2026-09-02T15:00:00.000Z",
    "customer": { "firstName": "Alex", "lastName": "Morgan" },
    "technician": { "firstName": "Marcus", "lastName": "Reed" },
    "category": { "name": "Central vacuum repair" },
    "address": {
      "line1": "123 Main Street",
      "city": "Toronto",
      "state": "ON",
      "zipCode": "M5V 2T6"
    }
  }
]
```

---

## 6. Technician: assigned jobs

Admin assign is what puts a job on the technician list. The technician does not
set the window.

```bash
curl -X GET 'http://localhost:5000/api/technician/service-requests' \
  -H 'Authorization: Bearer <technicianAccessToken>'

curl -X PATCH 'http://localhost:5000/api/technician/service-requests/clxreq01/status' \
  -H 'Authorization: Bearer <technicianAccessToken>' \
  -H 'Content-Type: application/json' \
  -d '{ "status": "IN_PROGRESS" }'
```

Start is only valid from `SCHEDULED` → `IN_PROGRESS`.

---

## Frontend screens

1. **My Schedule** — `GET /service-requests`. Upcoming vs completed.
2. **Appointment** — `GET /service-requests/:id`. Window, technician, address,
   payment hold, timeline from `statusHistory`.
3. **Cancel** — `POST /service-requests/:id/cancel` while still `SCHEDULED`.
4. Do not show a working Reschedule button. There is no customer reschedule API.

Related: [customer-service-requests-flow.md](../service/customer-service-requests-flow.md),
[stripe-payment.md](../stripe/stripe-payment.md).
