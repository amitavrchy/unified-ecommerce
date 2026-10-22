# Technician role and job flow

The technician is a **field worker**. They do not quote, schedule, take payment, or
pick jobs from a pool. Admin assigns them after the customer accepts the quote and
authorizes the Stripe hold. The technician then runs the visit, records equipment,
uploads photos, and submits the service report. The office reviews the report and
captures payment. The customer confirms the work.

Figma source (mobile Technician App on the **customer & Technician App** page):
[aryegrunzweig || Code tribe](https://www.figma.com/design/iefawp5uBuQ8EfPxfCmGs2/aryegrunzweig-%7C%7C-Code-tribe?node-id=0-1).

The web app already ships the **customer storefront** and **admin dashboard**.
The Figma technician screens are a **mobile app**. Every screen there is already
backed by existing APIs. Do not add a second schedule, quote, or assign API.

All routes use the global `/api` prefix. Technician calls need:

```
Authorization: Bearer <accessToken>
```

The JWT `role` must be `TECHNICIAN`. Routes under `/technician/*` also use
`TechnicianGuard` and reject any other role.

Base URL in the examples: `http://localhost:5000`.

Related docs: [authentication](../authentication.md), [OTP](../auth/otp.md),
[customer service requests](../service/customer-service-requests-flow.md),
[schedule](../schedule/schedule.md).

Technician job writes are split into Nest modules. HTTP paths are unchanged.

```text
src/features/technician/
  home/                         GET  /technician/home-stats
  service-requests/             GET  /technician/service-requests
                                GET  /technician/service-requests/:id
                                PATCH /technician/service-requests/:id/status
    note/                       GET/POST/PATCH /technician/service-requests/:id/note
    report/                     GET/POST/PATCH /technician/service-requests/:id/report
    equipment/                  GET/POST /technician/service-requests/:id/equipment
                                PATCH /technician/service-requests/:id/equipment/:equipmentId
    media/                      POST /technician/service-requests/:id/media
```

---
---



## What a technician is allowed to do


| Work                                               | Technician                                               |
| -------------------------------------------------- | -------------------------------------------------------- |
| Register and verify email                          | Yes — `POST /auth/technician/signup`, then OTP           |
| Sign in / reset password                           | Yes — same login and OTP reset as other roles            |
| See only **assigned** jobs                         | Yes — list is filtered by `technicianId = me`            |
| Start a scheduled visit                            | Yes — `SCHEDULED` → `IN_PROGRESS`                        |
| Call or message the customer                       | Yes — Agora call + request conversation                  |
| Share live location while travelling or on site    | Yes — only for `SCHEDULED` / `IN_PROGRESS` jobs they own |
| Upload before / after / equipment / inlet media    | Yes                                                      |
| Record unit and inlet counts                       | Yes                                                      |
| Add or update a job note                           | Yes — `{ "text" }` on the assigned request               |
| Submit or update the service report                | Yes — while `IN_PROGRESS` or `REPORT_SUBMITTED`          |
| Edit own profile, availability, notification prefs | Yes                                                      |
| Create quotes, assign jobs, or set the appointment | **No** — admin only                                      |
| Cancel a customer request                          | **No**                                                   |
| Capture or refund Stripe                           | **No** — admin after the customer confirms the report    |


Admin still owns: review new requests, send quotes, decide counteroffers, assign
`POST /admin/service-requests/:id/assign`, calendar `GET /admin/schedule`, and
payment capture.

---



## Flow at a glance

```text
Signup                POST /auth/technician/signup
Verify email          POST /auth/verify-email
Login                 POST /auth/login
Me                    GET  /users/me
Update profile        PATCH /users/me
                      PATCH /users/me/technician
Prefs                 PATCH /users/me/preferences

My jobs               GET  /technician/service-requests
                      GET  /technician/service-requests?status=SCHEDULED
Home stats            GET  /technician/home-stats
Job detail            GET  /technician/service-requests/:id
Job note              GET  /technician/service-requests/:id/note
                      POST /technician/service-requests/:id/note
                      PATCH /technician/service-requests/:id/note
Start job             PATCH /technician/service-requests/:id/status
                      body { "status": "IN_PROGRESS" }
Live location         POST /tracking/service-requests/:id/location
Call customer         POST /calls/service-request/:id/token
Chat                  GET  /conversations
                      POST /conversations/:id/messages
Job media             POST /technician/service-requests/:id/media
Equipment             POST /technician/service-requests/:id/equipment
Report                POST /technician/service-requests/:id/report
Alerts                GET  /notifications
                      GET  /notifications/stream   SSE
Logout                POST /auth/logout            (refresh token)
```

Off-screen (the technician does not call these; status still changes because of them):

```text
Admin assigns         POST /admin/service-requests/:id/assign   → SCHEDULED + notification
Customer confirms     POST /service-requests/:id/report/customer-confirm
Admin captures        POST /admin/payments/:id/capture          → COMPLETED
```

---



## Status machine the technician UI should render


| Request `status`            | Technician screen                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| anything before `SCHEDULED` | Hidden — not assigned yet                                                                      |
| `SCHEDULED`                 | Upcoming job. Actions: view details, call, directions, **Mark as in progress**, share location |
| `IN_PROGRESS`               | Open job. Upload photos, notes, equipment, **Complete service report**                         |
| `REPORT_SUBMITTED`          | Report is with the office. Technician may still update the report                              |
| `COMPLETED`                 | Done — show in Completed                                                                       |
| `CANCELLED`                 | Do not start or report                                                                         |


Home KPI cards come from `GET /technician/home-stats`. Pass `timezone` so today,
this-week (Monday–Sunday), and this-month counts match the device. The payload
includes `jobsToday`, `inProgress`, `weeklyTasks`, `completedThisWeek`,
`completedThisMonth`, `totalCompleted`, `upcoming`, and `averageRating`.

My Jobs tabs:


| Tab       | How to build it                                                    |
| --------- | ------------------------------------------------------------------ |
| Today     | Assigned jobs whose `scheduledStart` falls on the device local day |
| Upcoming  | `SCHEDULED` (and future `IN_PROGRESS` if you want “still open”)    |
| Completed | `COMPLETED` (optionally `REPORT_SUBMITTED`)                        |


`GET /technician/service-requests?status=` filters one enum value. Combine
client-side for Today vs Upcoming.

---



## Figma screens → APIs

Checked against the Technician App frames on the Figma page above.


| Figma screen                                                                   | Already implemented                                                              |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Login / Create account / Forgot password                                       | `POST /auth/login`, `POST /auth/technician/signup`, password-reset OTP           |
| Home — greeting, jobs today, in progress, weekly/completed totals, rating, today’s job cards | `GET /technician/home-stats`, `GET /technician/service-requests`                 |
| Open Job / View details                                                        | `GET /technician/service-requests/:id`                                           |
| Call customer                                                                  | `POST /calls/service-request/:id/token` (or native `tel:` from `customer.phone`) |
| Get directions                                                                 | Client maps using `address` on the request — no maps API in this backend         |
| Mark as in progress                                                            | `PATCH /technician/service-requests/:id/status`                                  |
| Upload before / after photos                                                   | `POST /technician/service-requests/:id/media` `kind=BEFORE` / `AFTER`            |
| Add technician notes                                                           | `GET/POST/PATCH /technician/service-requests/:id/note` `{ "text" }`              |
| Open equipment & inlet details                                                 | `GET/POST /technician/service-requests/:id/equipment`, `PATCH .../equipment/:equipmentId` |
| Complete / submit service report                                               | `GET/POST/PATCH /technician/service-requests/:id/report`                         |
| Job photos: Before, After, Equip., Inlet                                       | media `kind` `BEFORE`, `AFTER`, `EQUIPMENT`, `INLET`                             |
| My Jobs (Today / Upcoming / Completed)                                         | list + client date/status filters                                                |
| Notifications / Alerts                                                         | `GET /notifications`, SSE stream                                                 |
| Chat                                                                           | `GET /conversations`, send on `/conversations/:id/messages`                      |
| Profile, edit, service area, logout                                            | `GET/PATCH /users/me`, `PATCH /users/me/technician`, `POST /auth/logout`         |
| Live tracking (customer sees ETA)                                              | technician `POST /tracking/service-requests/:id/location`                        |


Client-only (no extra backend):

- **Get directions** — open Apple/Google Maps from the job address.
- **Previous visit** on the job card — not a dedicated field. Derive from earlier
completed requests for the same customer if the app needs it.
- **Home KPI totals** — `GET /technician/home-stats`.

---



## 1. Register and sign in

Technicians register with service area and skills. The account stays inactive until
the 5-digit email OTP is verified. Admin then verifies the technician profile
(`PENDING_VERIFICATION` → `VERIFIED`) before they can be assigned to jobs.

```bash
curl -X POST 'http://localhost:5000/api/auth/technician/signup' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "marc@centralcare.ca",
    "password": "secure-password",
    "firstName": "Marc",
    "lastName": "Anderson",
    "phone": "+1 514 555 0100",
    "acceptTerms": true,
    "serviceArea": "Greater Montréal",
    "skills": ["Central vacuum repair", "Installation"]
  }'
```

```bash
curl -X POST 'http://localhost:5000/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "marc@centralcare.ca",
    "password": "secure-password"
  }'
```

`user.role` in the login payload is `TECHNICIAN`. Send that access token on every
call below.

---



## 2. Home and my jobs

```bash
curl -X GET 'http://localhost:5000/api/users/me' \
  -H 'Authorization: Bearer <technicianAccessToken>'

curl -X GET 'http://localhost:5000/api/technician/home-stats?timezone=America/Toronto' \
  -H 'Authorization: Bearer <technicianAccessToken>'
```

Example payload:

```json
{
  "firstName": "Marc",
  "jobsToday": 3,
  "inProgress": 1,
  "completedThisMonth": 12,
  "weeklyTasks": 8,
  "completedThisWeek": 5,
  "totalCompleted": 84,
  "upcoming": 4,
  "averageRating": 4.8,
  "date": "2026-08-27",
  "timezone": "America/Toronto"
}
```

```bash
curl -X GET 'http://localhost:5000/api/technician/service-requests' \
  -H 'Authorization: Bearer <technicianAccessToken>'

curl -X GET 'http://localhost:5000/api/technician/service-requests?status=SCHEDULED' \
  -H 'Authorization: Bearer <technicianAccessToken>'
```

The list is **only jobs assigned to this technician**. Unassigned accepted
requests never appear here — those belong on the admin calendar / technicians
Assign Job modal.

Each item includes customer, address, category, issue, description, schedule
window, status, media, and report when present.

---



## 3. Open a job

```bash
curl -X GET 'http://localhost:5000/api/technician/service-requests/clxreq01' \
  -H 'Authorization: Bearer <technicianAccessToken>'
```

`403` if the job is not assigned to this technician.

Use this payload for Customer Details, Service Details, and Customer-Reported
Issue (including customer `ISSUE` media).

---



## 4. Start the visit

Only the assigned technician, and only from `SCHEDULED`:

```bash
curl -X PATCH 'http://localhost:5000/api/technician/service-requests/clxreq01/status' \
  -H 'Authorization: Bearer <technicianAccessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "IN_PROGRESS"
  }'
```

`200` — `status` becomes `IN_PROGRESS`, `startedAt` is set. After this the
customer can no longer cancel.

While `SCHEDULED` or `IN_PROGRESS`, publish GPS so the customer tracking screen
can poll:

```bash
curl -X POST 'http://localhost:5000/api/tracking/service-requests/clxreq01/location' \
  -H 'Authorization: Bearer <technicianAccessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "latitude": 45.5017,
    "longitude": -73.5673
  }'
```

Call the customer (Agora). Customer, assigned technician, or admin may join:

```bash
curl -X POST 'http://localhost:5000/api/calls/service-request/clxreq01/token' \
  -H 'Authorization: Bearer <technicianAccessToken>'
```

---



## 5. Media, equipment, notes, and report

Figma “Technician Actions” map 1:1 to these writes.

**Photos / videos** (multipart `file` only — Cloudinary stores the URL):

```bash
curl -X POST 'http://localhost:5000/api/technician/service-requests/clxreq01/media' \
  -H 'Authorization: Bearer <technicianAccessToken>' \
  -F 'kind=BEFORE' \
  -F 'file=@before.jpg'
```

`kind` for technicians: `BEFORE`, `AFTER`, `EQUIPMENT`, `INLET`.
`ISSUE` media is customer-only.

**Equipment and vacuum ports:**

```bash
curl -X POST 'http://localhost:5000/api/technician/service-requests/clxreq01/equipment' \
  -H 'Authorization: Bearer <technicianAccessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "unitNumber": "Unit 24",
    "manufacturer": "Cyclo Vac",
    "model": "H725",
    "serialNumber": "SN-123456",
    "location": "Utility room",
    "condition": "Good",
    "additionalFeatures": ["VacPan"],
    "inlets": [
      { "floor": "Basement", "type": "Standard inlet", "quantity": 3 }
    ]
  }'
```

Same `unitNumber` on the same request updates the existing row. List the
customer inventory (admin dashboard shape) and patch a unit:

```bash
curl -X GET 'http://localhost:5000/api/technician/service-requests/clxreq01/equipment' \
  -H 'Authorization: Bearer <technicianAccessToken>'

curl -X PATCH 'http://localhost:5000/api/technician/service-requests/clxreq01/equipment/clxeq01' \
  -H 'Authorization: Bearer <technicianAccessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "condition": "Fair",
    "additionalFeatures": ["VacPan", "Wally Flex"],
    "inlets": [
      { "floor": "Basement", "type": "Standard inlet", "quantity": 4 }
    ]
  }'
```

**Job note** (one free-text note per assigned request; not the service report):

```bash
curl -X POST 'http://localhost:5000/api/technician/service-requests/clxreq01/note' \
  -H 'Authorization: Bearer <technicianAccessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "Customer asked to check the garage inlet on the next visit."
  }'
```

```bash
curl -X GET 'http://localhost:5000/api/technician/service-requests/clxreq01/note' \
  -H 'Authorization: Bearer <technicianAccessToken>'

curl -X PATCH 'http://localhost:5000/api/technician/service-requests/clxreq01/note' \
  -H 'Authorization: Bearer <technicianAccessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "Garage inlet is noisy; recommend replacement."
  }'
```

`POST` returns `409` if a note already exists. `GET` / `PATCH` return `404` until
one has been added. Report `technicianNotes` is still a separate field on the
service report.

**Service report** (Figma: work performed, parts used, visit times, submit for
office review):

```bash
curl -X POST 'http://localhost:5000/api/technician/service-requests/clxreq01/report' \
  -H 'Authorization: Bearer <technicianAccessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "repairStatus": "Repaired",
    "workPerformed": "Removed a blockage from the basement branch line and tested suction at all accessible inlets.",
    "technicianNotes": "One older inlet valve on the first floor may need replacement on a future visit.",
    "partsUsed": [
      { "name": "Replacement inlet valve", "quantity": 1 },
      { "name": "PVC coupling", "quantity": 1 }
    ],
    "followUpRequired": false,
    "arrivalTime": "2026-08-01T13:05:00.000Z",
    "departureTime": "2026-08-01T14:35:00.000Z"
  }'
```

Allowed when status is `IN_PROGRESS` or `REPORT_SUBMITTED` (resubmit / edit).
First submit moves the request to `REPORT_SUBMITTED` and notifies the customer
and admins. Read or edit afterward:

```bash
curl -X GET 'http://localhost:5000/api/technician/service-requests/clxreq01/report' \
  -H 'Authorization: Bearer <technicianAccessToken>'

curl -X PATCH 'http://localhost:5000/api/technician/service-requests/clxreq01/report' \
  -H 'Authorization: Bearer <technicianAccessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "technicianNotes": "Customer asked to replace the first-floor inlet on the next visit."
  }'
```

---



## 6. Chat, alerts, and profile

```bash
curl -X GET 'http://localhost:5000/api/conversations' \
  -H 'Authorization: Bearer <technicianAccessToken>'

curl -X GET 'http://localhost:5000/api/notifications' \
  -H 'Authorization: Bearer <technicianAccessToken>'

curl -X PATCH 'http://localhost:5000/api/users/me' \
  -H 'Authorization: Bearer <technicianAccessToken>' \
  -H 'Content-Type: application/json' \
  -d '{ "firstName": "Marc", "phone": "+1 514 555 0100" }'

curl -X PATCH 'http://localhost:5000/api/users/me/technician' \
  -H 'Authorization: Bearer <technicianAccessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "serviceArea": "Greater Montréal",
    "isAvailable": true
  }'
```

`PATCH /users/me/technician` is technician-only. Admin assignment requires
`isAvailable: true` and `verificationStatus: VERIFIED`.

Conversations are created when admin assigns the job. The technician lists
threads where `technicianId` is themselves.

---



## Who does what on one request

```text
Customer          submit request → accept quote → authorize card → confirm report
Admin             review → quote → assign technician + time → capture payment
Technician        start job → photos / equipment / job note → submit report
```

The technician never sets `scheduledStart`. A time change is an admin re-assign.
See [schedule.md](../schedule/schedule.md).