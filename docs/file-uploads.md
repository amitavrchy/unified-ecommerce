# File uploads

Every endpoint that stores media takes `multipart/form-data`, and each file field is
documented in Swagger (`/api/docs`) so the file pickers appear there.

## How the endpoints behave

- **Send form data, not JSON.** All the POST and PATCH routes below are documented as
  `multipart/form-data`. A JSON body is still parsed for the URL-only fields, so older
  clients keep working, but form data is the supported request format.
- **Field names are fixed.** Photos go on `images`, clips on `videos`, and single-purpose
  uploads use their own name (`avatar`, `logo`, `file`, `returnLabel`). A file sent on the
  wrong field is rejected with `400` instead of being stored.
- **Everything arrives as text, and the server converts it.** Numbers (`price`, `stock`),
  booleans (`isActive`, `taxable`), and string lists (`features`, `imageUrls`) are coerced
  from their form values, so `price=39.99` and `taxable=false` work as written. String
  lists also accept repeated fields or one comma-separated value.
- **Nested fields are JSON strings.** A form request cannot express nested objects, so
  `specifications` is sent as JSON text:
  `-F 'specifications={"compatibility":"H700 series"}'`.
- **Validation happens before upload.** Content types and per-request limits are checked
  first, so a rejected request never leaves orphaned files in Cloudinary.
- **The server owns the stored URL.** Files are uploaded to Cloudinary and only the
  returned `secure_url` is persisted.

## Endpoints

| Endpoint                                                    | File fields            | Accepted types | Stored on                      |
| ----------------------------------------------------------- | ---------------------- | -------------- | ------------------------------ |
| `PATCH /api/users/me`                                       | `avatar`               | image          | `User.avatarUrl`               |
| `POST /api/service-requests`                                | `images[]`, `videos[]` | image / video  | `ServiceMedia` (`ISSUE`)       |
| `POST /api/service-requests/:id/media`                      | `file`                 | image or video | `ServiceMedia` (`ISSUE`)       |
| `POST /api/technician/service-requests/:id/media`           | `file` (required)      | image or video | `ServiceMedia`                 |
| `POST /api/admin/service-requests/:id/media`                | `file`                 | image or video | `ServiceMedia`                 |
| `POST /api/conversations/:id/messages`                      | `images[]`, `videos[]` | image / video  | `ChatMessage.attachments`      |
| `PATCH /api/orders/returns/:id/status`                      | `returnLabel`          | PDF or image   | `ReturnRequest.returnLabelUrl` |
| `POST` / `PATCH /api/admin/products[/:id]`                  | `images[]`             | image          | `Product.imageUrls`            |
| `POST` / `PATCH /api/catalog/products[/:id]`                | `images[]`             | image          | `Product.imageUrls`            |
| `POST /api/admin/customers/:customerId/equipment/:id/media` | `file`                 | image or video | `EquipmentMedia`               |
| `PATCH /api/admin/settings`                                 | `logo`                 | image          | `BusinessSettings.logoUrl`             |
| `POST /api/admin/settings/logo`                             | `logo`                 | image          | `BusinessSettings.logoUrl`             |
| `POST /api/admin/settings/hero`                             | `hero`                 | image          | `BusinessSettings.landingHeroImageUrl` |

## Limits

| Rule                                                               | Limit |
| ------------------------------------------------------------------ | ----- |
| Media per service request (`images` + `videos`)                    | 10    |
| Attachments per chat message (`attachments` + `images` + `videos`) | 5     |
| Images per product request                                         | 10    |

## Cloudinary folders

`vacuumCare/avatars`, `vacuumCare/chat`, `vacuumCare/equipment`, `vacuumCare/logos`,
`vacuumCare/products`, `vacuumCare/return-labels`, `vacuumCare/service-requests`.

## Frontend integration

Append the `File` objects straight onto a `FormData` and post it. Repeat the field name
once per file for the multi-file fields.

```ts
async function submitServiceRequest(
  values,
  imageFiles: File[],
  videoFiles: File[],
) {
  const form = new FormData();
  form.append('categoryId', values.categoryId);
  form.append('addressId', values.addressId);
  form.append('description', values.description);
  for (const file of imageFiles) form.append('images', file);
  for (const file of videoFiles) form.append('videos', file);

  const response = await fetch('/api/service-requests', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!response.ok) throw new Error((await response.json()).message);
  return response.json();
}
```

Three rules to follow on the client:

- **Never set `Content-Type` yourself.** The browser must generate it so the multipart
  boundary is included. Hardcoding `multipart/form-data` makes the body unparseable.
- **Send scalars as plain strings.** `form.append('price', '39.99')` and
  `form.append('taxable', 'false')` are correct; the server converts them.
- **Validate size and type before posting** if you want friendlier errors than the
  server's `400`. The server accepts images and videos on media fields, images only on
  `avatar`, `logo`, and product `images`, and PDF or image on `returnLabel`.

The response carries the persisted Cloudinary URL, so a form can render the stored image
straight from the response without a second request.

## Examples

Submit a service request with photos and a clip:

```bash
curl -X POST http://localhost:5000/api/service-requests \
  -H "Authorization: Bearer <token>" \
  -F "categoryId=service-category-id" \
  -F "addressId=saved-address-id" \
  -F "description=Low suction and a rattling sound." \
  -F "preferredDate=2026-09-02T09:00:00.000Z" \
  -F "preferredTime=09:00-12:00" \
  -F "images=@/path/to/inlet.jpg" \
  -F "images=@/path/to/canister.jpg" \
  -F "videos=@/path/to/noise.mp4"
```

Attach a technician "after" photo to an assigned request:

```bash
curl -X POST http://localhost:5000/api/technician/service-requests/<id>/media \
  -H "Authorization: Bearer <token>" \
  -F "kind=AFTER" \
  -F "file=@/path/to/after.jpg"
```

Send a chat message with an image:

```bash
curl -X POST http://localhost:5000/api/conversations/<id>/messages \
  -H "Authorization: Bearer <token>" \
  -F "body=Here is the inlet." \
  -F "images=@/path/to/inlet.png"
```

Create a product with an image, a comma-separated list, and a JSON object field:

```bash
curl -X POST http://localhost:5000/api/admin/products \
  -H "Authorization: Bearer <token>" \
  -F "name=HEPA Replacement Filter" \
  -F "description=High-efficiency replacement filter." \
  -F "category=Filters" \
  -F "price=39.99" \
  -F "stock=20" \
  -F "taxable=true" \
  -F "features=HEPA-grade filtration,Tool-free installation" \
  -F 'specifications={"compatibility":"H700 series"}' \
  -F "images=@/path/to/filter.jpg"
```

Upload a return shipping label:

```bash
curl -X PATCH http://localhost:5000/api/orders/returns/<id>/status \
  -H "Authorization: Bearer <token>" \
  -F "status=APPROVED" \
  -F "returnLabel=@/path/to/label.pdf"
```
