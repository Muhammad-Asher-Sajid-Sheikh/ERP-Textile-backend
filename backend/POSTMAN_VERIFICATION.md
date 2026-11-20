# Manual Postman verification — foundation and WF-01

Send all requests manually. Do not add Postman JavaScript tests, runners, seed scripts or automated suites. These are expected results, not claims that business endpoints have already been exercised.

## Environment and conventions

Run the installation/build/migration steps in [README.md](./README.md). Server variables: DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET; ResendAPIKey/RESEND_FROM_EMAIL/FRONTEND_LOGIN_URL for notifications; FRONTEND_URL, PORT and NODE_ENV for deployment. Use a development database and email addresses approved for receiving notifications. Register/login/admin actions may send real email. No first-Management bypass is supplied: an authorized operator must provide an approved Management account before approval checks.

Create Postman variables manually:

| Variable | Value/source |
| --- | --- |
| `base_url` | `http://localhost:3000` (match PORT) |
| `access_token` | Copy `accesstoken` from Marketing login |
| `management_token` | Copy from approved Management login |
| `merchandise_token` | Copy from approved assigned MERCHANDISE login |
| `production_token` | Copy from approved PRODUCTION login |
| `merchandiser_id` | Approved MERCHANDISE user's profile `user.id` |
| `user_id` | User being reviewed by Management |
| `customer_id`, `other_customer_id` | Copy Customer creation `data.id` |
| `inquiry_id`, `duplicate_id` | Copy inquiry registration `data.id` |
| `evidence_id` | Copy evidence response `data.id` |

Headers used by the tables below (each row names its header set):

- **J:** `Content-Type: application/json`.
- **M:** J plus `Authorization: Bearer {{access_token}}`.
- **A:** J plus `Authorization: Bearer {{management_token}}`.
- **D:** J plus `Authorization: Bearer {{merchandise_token}}`.
- **P:** J plus `Authorization: Bearer {{production_token}}`.
- **C:** J and the Postman cookie jar containing `refreshtoken` for the base URL.

All listed paths are relative to `{{base_url}}`. `—` in a body column means **no request body**, including GETs. Use Body → raw → JSON for JSON bodies. Configure Postman authorization explicitly per request to avoid accidentally inheriting a stronger token.

Expected response structures referenced below:

- **S:** `{ "success": true, "statusCode": <HTTP status>, "message": "...", "data": <resource or object> }`.
- **L:** S with array `data` and `meta: { "page": 1, "pageSize": 20, "total": <count> }`.
- **E:** `{ "success": false, "statusCode": <HTTP status>, "code": "...", "message": "...", "errors": [], "requestId": "..." }`. Validation errors include path/message objects in `errors`.
- Auth responses additionally retain their original `user`, `users`, `count`, or `accesstoken` top-level aliases. Never expect a refresh token in JSON.

The cookie is HttpOnly, SameSite=Lax, Path=/, seven days, and Secure when NODE_ENV=production. Postman must retain and send it; use HTTPS for Secure cookies. Separate cookie jars/profiles for different actors prevent mixing sessions. Frontend fetch requests require `credentials: 'include'`. Token copying and assertions here are manual.

## Authentication regression checks

Use passwords and approved recipient addresses appropriate to your development environment; example credentials below are placeholders. The shared register/login/refresh limiter allows only five requests per IP per 15 minutes, so space requests accordingly. Do not disable it to make the checks pass.

| Method and URL | Headers | Example JSON body | Expected HTTP / structure | Rule |
| --- | --- | --- | --- | --- |
| POST `/api/auth/register` | J | `{"email":"marketing@example.com","password":"Example123!","confirmPassword":"Example123!","name":"Marketing Operator","role":"MARKETING"}` | 201 S, `user.status=PENDING`, same user in `data.user` | No automatic approval; welcome notification attempted |
| POST `/api/auth/login` | J | `{"email":"marketing@example.com","password":"Example123!"}` before approval | 403 E, `ACCOUNT_NOT_APPROVED`, top-level `status=PENDING` | Pending accounts cannot log in |
| GET `/api/auth/admin/pending-users` | A | — | 200 S, `users` array, `count`; no passwordHash | Pending list and aliases retained |
| PATCH `/api/auth/admin/users/{{user_id}}/approve` | A | `{}` | 200 S, `user.status=APPROVED` | Management approval and notification |
| POST `/api/auth/login` | J | `{"email":"marketing@example.com","password":"Example123!"}` after approval | 200 S, `accesstoken`, safe `user`, Set-Cookie | Copy access token; inspect seven-day cookie |
| GET `/api/auth/profile` | M | — | 200 S, safe `user` and `data.user` | Existing fields: id/name/email/role/status/department/lastLoginAt/createdAt |
| POST `/api/auth/refresh` | C plus `Authorization: Bearer {{access_token}}` while access is valid | `{}` | 200 S, `accesstoken` | Still-current access token is reused only with a valid stored refresh session |
| POST `/api/auth/refresh` | C, omit Authorization | `{}` | 200 S, new `accesstoken`, replacement cookie | Cookie-only refresh works; prior refresh token no longer usable |
| POST `/api/auth/refresh` | J with cookie jar disabled | `{}` | 401 E, `REFRESH_TOKEN_REQUIRED` | A valid access token alone cannot refresh |
| POST `/api/auth/change-password` | M | `{"currentPassword":"Example123!","newPassword":"Different123!","confirmPassword":"Different123!"}` | 200 S | Existing password rules/hash/change audit preserved |
| POST `/api/auth/logout` | M plus cookie jar | `{}` | 200 S and cleared cookie | Actor's refresh session revoked; repeat logout remains safe |
| POST `/api/auth/refresh` | C with the manually retained revoked cookie | `{}` | 401 E, `INVALID_REFRESH_TOKEN` | Revocation checked even if an old access token is still valid |
| PATCH `/api/auth/admin/users/{{user_id}}/reject` | A | `{"reason":"Development rejection check"}` for a different PENDING user | 200 S, `user.status=REJECTED` | Only pending accounts can be rejected |
| PATCH `/api/auth/admin/users/{{user_id}}/role` | A | `{"role":"MERCHANDISE"}` | 200 S, `user.oldRole`, `user.newRole` | Exact existing enum names preserved |
| PATCH `/api/auth/admin/users/{{user_id}}/suspend` | A | `{"reason":"Development suspension check"}` | 200 S, `user.status=SUSPENDED` | Suspension notification and audit |
| GET `/api/auth/profile` with the suspended actor's old access token | M, replace token with that actor's old token | — | 403 E, `ACCOUNT_NOT_APPROVED` | Suspension takes effect without waiting for JWT expiry |
| POST `/api/auth/refresh` with suspended actor's cookie | C | `{}` | 401 E, `ACCOUNT_NOT_APPROVED` | Live account status also checked during refresh |
| GET `/api/auth/admin/pending-users` | M | — | 403 E, `PERMISSION_DENIED` | Marketing cannot manage accounts |

For stale-role verification, retain an approved second Management user's token, use the primary administrator to PATCH that second user to MARKETING, and manually GET `/api/auth/admin/pending-users` with the retained token. Expect 403 E (`PERMISSION_DENIED`). Do not demote the only administrator. A previously approved user changed to REJECTED/SUSPENDED must also receive 403 on customer/inquiry calls. No INACTIVE User enum exists.

For lockout verification, make five incorrect login attempts for an approved account, observing 401 E (the IP limiter may also produce 429). After the IP window, a still-active account lock returns 403 `ACCOUNT_LOCKED`; after 15 minutes from locking, valid credentials should work. Access tokens remain 15 minutes; wait for expiry and verify profile returns 401 `TOKEN_EXPIRED`, then refresh with the cookie. No clocks need changing in a live environment.

## Customer Master

Create customer body **Customer A**:

```json
{
  "code": "ABC",
  "name": "Example Textile Buyer",
  "country": "Pakistan",
  "customerType": "Retail buyer",
  "contacts": [
    { "name": "Buyer Contact", "email": "buyer@example.com", "phone": "+92-000-0000000", "designation": "Sourcing" }
  ]
}
```

| Method and URL | Headers | Example JSON body | Expected HTTP / structure | Rule |
| --- | --- | --- | --- | --- |
| POST `/api/customers` | M | Customer A above | 201 S; copy `data.id` | Code/name/country/contact mandatory; creator is token user |
| GET `/api/customers/{{customer_id}}` | M | — | 200 S with contacts and relationships | Controlled identity returned |
| GET `/api/customers?page=1&pageSize=20&search=ABC&active=true&country=Pakistan` | A | — | 200 L | Server filtering and stable name/ID ordering |
| PATCH `/api/customers/{{customer_id}}` | M | `{"name":"Example Textile Buyer Updated","contacts":[{"name":"Updated Contact","email":"buyer@example.com"}]}` | 200 S | Supplied contact array replaces contacts; audit retains previous values |
| POST `/api/customers` | M | Repeat Customer A with code `abc` | 409 E, `CUSTOMER_CODE_CONFLICT` | Case-normalized code uniqueness |
| POST `/api/customers` | M | `{"code":"BAD","name":"Buyer","country":"Pakistan","contacts":[]}` | 400 E, `VALIDATION_ERROR` | At least one usable named contact |
| PATCH `/api/customers/{{customer_id}}` | M | `{"code":"NEW","createdById":"someone-else"}` | 400 E | Unknown/server-controlled properties rejected |
| GET `/api/customers/not-a-uuid` | M | — | 400 E | Invalid UUID handled without ORM leakage |
| GET `/api/customers/{{customer_id}}` | J | — | 401 E | Authentication required |
| POST `/api/customers` | P | Customer A | 403 E | Production not authorized |
| POST `/api/customers` | M | Customer A with `code:"AGENT"`, `name:"Independent Agent"` | 201 S; copy `other_customer_id` | Distinct commercial party identity |
| PATCH `/api/customers/{{customer_id}}` | M | `{"relationships":[{"partyId":"{{other_customer_id}}","role":"AGENT"}]}` | 200 S with related party | Buyer and agent are not forced to be the same customer |
| PATCH `/api/customers/{{customer_id}}` | A | `{"active":false}` | 200 S, `data.active=false` | Deactivation preserves inquiries |
| PATCH `/api/customers/{{customer_id}}` | A | `{"active":true}` | 200 S | Reactivate before normal registration checks |

## Inquiry registration and maintenance

Obtain an approved MERCHANDISE user's ID through that user's profile or the existing account approval process. Use valid timestamps at or before the current time for original communication; the example receipt below is historical. Set response due dates deliberately. No future Production-stage fields are required.

Registration body **Inquiry A**:

```json
{
  "customerId": "{{customer_id}}",
  "source": "EMAIL",
  "sourceReference": "message-20261120-001@example.com",
  "receivedAt": "2026-11-20T08:00:00Z",
  "productCategory": "Bed linen",
  "seasonProgram": "Spring 2027",
  "destination": "United Kingdom",
  "estimatedQuantity": 2500,
  "quantityUnit": "sets",
  "targetDate": "2027-02-01",
  "merchandiserId": "{{merchandiser_id}}",
  "priority": "NORMAL",
  "responseDueAt": "2026-11-23T12:00:00Z",
  "nextAction": "Request fabric and size details",
  "evidence": {
    "source": "EMAIL",
    "receivedAt": "2026-11-20T08:00:00Z",
    "reference": "message-20261120-001@example.com",
    "message": "Please quote for 2500 bed linen sets. Further specifications will follow."
  }
}
```

Unknown productCategory, seasonProgram, destination, estimatedQuantity, quantityUnit and targetDate can be omitted. Default priority is NORMAL. The initial evidence source/receipt timestamp must match the inquiry. Capture every source truthfully; EMAIL, WHATSAPP, WEBSITE, BUYING_AGENT, MEETING, TELEPHONE and OTHER are accepted.

| Method and URL | Headers | Example JSON body | Expected HTTP / structure | Rule |
| --- | --- | --- | --- | --- |
| POST `/api/marketing/inquiries` | M | Inquiry A | 201 S; `data.irn`, `data.status=REGISTERED`, `meta.likelyDuplicates` | Atomic registration; save `inquiry_id` and IRN |
| GET `/api/marketing/inquiries/{{inquiry_id}}` | M | — | 200 S, evidence metadata/messages, first 20 acknowledgements and `_count` | Never exposes attachment bytes or User security fields |
| GET `/api/marketing/inquiries?page=1&pageSize=20&status=REGISTERED&customerId={{customer_id}}&priority=NORMAL&source=EMAIL` | A | — | 200 L | Server filtering and newest-first/ID ordering |
| GET `/api/marketing/inquiries?search=ABC&merchandiserId={{merchandiser_id}}` | M | — | 200 L | IRN/category search and assignment filter |
| PATCH `/api/marketing/inquiries/{{inquiry_id}}` | M | `{"nextAction":"Request artwork","priority":"HIGH","estimatedQuantity":3000,"destination":null}` | 200 S | Only editable fields change; unknowns can be cleared |
| PATCH `/api/marketing/inquiries/{{inquiry_id}}` | M | `{"merchandiserId":"{{merchandiser_id}}","responseDueAt":"2026-11-24T12:00:00Z"}` | 200 S | Owner must remain an approved MERCHANDISE user |
| GET `/api/marketing/inquiries/{{inquiry_id}}/history?page=1&pageSize=20` | A | — | 200 S with `data.transitions`, `data.audit`, `meta.total`, `meta.auditTotal` | Original receipt, registration and later actions traceable |
| GET `/api/marketing/inquiries/{{inquiry_id}}/history` | D | — | 200 S with transitions, no audit | Assigned technical access is narrower than Management audit access |
| GET `/api/marketing/inquiries/{{inquiry_id}}` | D | — | 200 S if assigned; 404 E otherwise | Assignment restriction avoids revealing unassigned records |
| GET `/api/marketing/inquiries` | D | — | 200 L containing only assigned inquiries | Filtering cannot broaden the actor's scope |

### Evidence and downloads

Append original evidence body **Evidence B** (base64 is the exact UTF-8 bytes `Original inquiry`):

```json
{
  "source": "EMAIL",
  "receivedAt": "2026-11-20T09:00:00Z",
  "reference": "followup-001@example.com",
  "message": "Original follow-up communication retained without alteration.",
  "attachment": {
    "filename": "original-inquiry.txt",
    "mediaType": "text/plain",
    "base64": "T3JpZ2luYWwgaW5xdWlyeQ=="
  }
}
```

| Method and URL | Headers | Example JSON body | Expected HTTP / structure | Rule |
| --- | --- | --- | --- | --- |
| POST `/api/marketing/inquiries/{{inquiry_id}}/evidence` | M | Evidence B | 201 S with hashes, byteSize, uploader; copy evidence_id | Bytes are persisted, not just a filename/URL |
| GET `/api/marketing/inquiries/{{inquiry_id}}/evidence?page=1&pageSize=20` | M | — | 200 L, no attachmentBytes | Evidence metadata remains pageable |
| GET `/api/marketing/inquiries/{{inquiry_id}}/evidence/{{evidence_id}}/attachment` | D | — | 200 raw bytes: `Original inquiry`; attachment disposition, no-store | Authorized download with correct bytes |
| POST `/api/marketing/inquiries/{{inquiry_id}}/evidence` | M | `{"source":"TELEPHONE","receivedAt":"2026-11-20T10:00:00Z","message":"Correction recorded from the subsequent customer call.","correctsEvidenceId":"{{evidence_id}}"}` | 201 S with a new ID | Append a correction; GET original evidence again and compare ID/hash/message |
| POST `/api/marketing/inquiries/{{inquiry_id}}/evidence` | M | `{"source":"EMAIL","receivedAt":"2026-11-20T09:00:00Z","reference":"https://example.com/unverified.pdf"}` | 400 E | URL/reference alone is not original communication/file storage |
| POST `/api/marketing/inquiries/{{inquiry_id}}/evidence` | M | Evidence B with filename `../private.txt` | 400 E | Path traversal rejected |
| POST `/api/marketing/inquiries/{{inquiry_id}}/evidence` | M | Evidence B with mediaType `application/pdf` but unchanged text bytes | 400 E, `INVALID_ATTACHMENT_TYPE` | Declared MIME checked against content |
| GET `/api/marketing/inquiries/{{inquiry_id}}/evidence/{{evidence_id}}/attachment` | J | — | 401 E | Files are not public |

Manually submit a >5 MiB attachment (valid base64) and expect 400 validation error, or 413 if the full body exceeds 10 MiB. This is an operational upload bound, not a business quantity limit. No update/delete evidence endpoints exist; a PATCH/DELETE to the evidence resource should return 404 E and leave the original unchanged. Server signatures do not certify files malware-free.

### Acknowledgement, duplicate linking, holds and closure

| Method and URL | Headers | Example JSON body | Expected HTTP / structure | Rule |
| --- | --- | --- | --- | --- |
| POST `/api/marketing/inquiries/{{inquiry_id}}/acknowledgements` | M | `{"acknowledgedAt":"2026-11-20T10:00:00Z","channel":"EMAIL","recipient":"buyer@example.com","message":"We received your inquiry and will follow up.","reference":"ack-001@example.com"}` | 201 S; follow-up GET inquiry shows ACKNOWLEDGED | Records an acknowledgement already sent; no message is sent by this endpoint |
| GET `/api/marketing/inquiries/{{inquiry_id}}/acknowledgements?page=1&pageSize=20` | A | — | 200 L | Append-only acknowledgement history |
| POST `/api/marketing/inquiries` | M | Inquiry A again | 201 S, new permanent IRN, `meta.likelyDuplicates` includes original | Advisory duplicate detection; no silent merge |
| POST `/api/marketing/inquiries/{{duplicate_id}}/link-duplicate` | M | `{"duplicateOfId":"{{inquiry_id}}","reason":"Same customer request was forwarded twice"}` | 200 S, status DUPLICATE_LINKED and duplicateOfId | Original and duplicate keep their own IRN/evidence |
| POST `/api/marketing/inquiries/{{inquiry_id}}/link-duplicate` | M | `{"duplicateOfId":"{{duplicate_id}}","reason":"Attempt reverse link"}` | 409 E, `DUPLICATE_CHAIN` | Cycles/chains rejected |
| POST `/api/marketing/inquiries/{{inquiry_id}}/link-duplicate` | M | `{"duplicateOfId":"{{inquiry_id}}","reason":"Self link"}` | 422 E, `INVALID_DUPLICATE` | Self-reference rejected |
| POST `/api/marketing/inquiries/{{inquiry_id}}/status` | M | `{"status":"ON_HOLD","reason":"Awaiting artwork","notes":"Customer follow-up planned"}` | 200 S, ON_HOLD | Explicit transition and mandatory reason |
| POST `/api/marketing/inquiries/{{inquiry_id}}/status` | M | `{"status":"REGISTERED","reason":"Customer supplied the missing artwork"}` | 200 S, REGISTERED | Resume from hold; previous acknowledgement still retained |
| POST `/api/marketing/inquiries/{{inquiry_id}}/status` | M | `{"status":"CLOSED","reason":"Customer cancelled the request"}` | 200 S, CLOSED | Closure preserves IRN, evidence and reason |
| POST `/api/marketing/inquiries/{{inquiry_id}}/status` | M | `{"status":"REGISTERED","reason":"Try reopening"}` after closure | 409 E, `INVALID_STATUS_TRANSITION` | CLOSED is terminal in WF-01 |
| POST `/api/marketing/inquiries/{{inquiry_id}}/status` | M | `{"status":"CLOSED"}` | 400 E | Missing close reason |
| GET `/api/marketing/inquiries/{{inquiry_id}}/history` | A | — | 200 S with transitions/audit and actor IDs/request IDs | Review old/new statuses and reasons; page through all entries |

### Validation and authorization failures

Each registration variant below means manually copy Inquiry A and make exactly the stated change. Send each separately with the specified headers.

| Method and URL | Headers | Example JSON body / change to Inquiry A | Expected HTTP / structure | Rule |
| --- | --- | --- | --- | --- |
| POST `/api/marketing/inquiries` | M | Inquiry A with `customerId:"00000000-0000-4000-8000-000000000001"` | 422 E, `INVALID_CUSTOMER` | Unknown customer |
| POST `/api/marketing/inquiries` | M | Inquiry A after deactivating its customer | 422 E, `CUSTOMER_INACTIVE` | Inactive customer cannot receive new registrations; reactivate afterward |
| POST `/api/marketing/inquiries` | M | Inquiry A with `merchandiserId:"not-an-existing-user"` | 422 E, `INVALID_MERCHANDISER` | Unknown assignee (legacy User IDs are text) |
| POST `/api/marketing/inquiries` | M | Inquiry A using a PRODUCTION or suspended MERCHANDISE user's ID | 422 E, `INVALID_MERCHANDISER` | Role and current status checked |
| POST `/api/marketing/inquiries` | M | `{}` | 400 E, `VALIDATION_ERROR` | Mandatory registration fields |
| POST `/api/marketing/inquiries` | M | Inquiry A with evidence omitted | 400 E | Original communication required |
| POST `/api/marketing/inquiries` | M | Inquiry A with `receivedAt:"not-a-date"` | 400 E | Invalid dates |
| POST `/api/marketing/inquiries` | M | Inquiry A with `responseDueAt:"2026-11-19T00:00:00Z"` | 400 E | Deadline before receipt |
| POST `/api/marketing/inquiries` | M | Inquiry A with `estimatedQuantity:-1` | 400 E | Invalid quantity |
| POST `/api/marketing/inquiries` | M | Inquiry A plus `irn:"ABC-261120-999"`, `createdById:"fake"` | 400 E | Server identity cannot be supplied |
| PATCH `/api/marketing/inquiries/{{inquiry_id}}` | M | `{"status":"CLOSED","customerId":"{{other_customer_id}}"}` | 400 E | No arbitrary status/customer replacement through PATCH |
| GET `/api/marketing/inquiries/not-a-uuid` | M | — | 400 E | Invalid resource ID |
| GET `/api/marketing/inquiries?pageSize=101` | M | — | 400 E | Bounded pagination |
| POST `/api/marketing/inquiries` | J | Inquiry A | 401 E | Missing authentication |
| POST `/api/marketing/inquiries` | A | Inquiry A | 403 E | Management visibility does not grant Marketing writes |
| GET `/api/marketing/inquiries` | P | — | 403 E | Production has no WF-01 read access |
| PATCH `/api/marketing/inquiries/{{inquiry_id}}` | D | `{"nextAction":"Unauthorized change"}` | 403 E | Assigned merchandiser is read-only |

For a cross-customer duplicate check, register an inquiry for `other_customer_id`, then POST `/api/marketing/inquiries/{{duplicate_id}}/link-duplicate` with M and `{"duplicateOfId":"<other customer's inquiry UUID>","reason":"Cross-customer attempt"}` using a still-editable source. Expect 422 E (`INVALID_DUPLICATE`). A closed/previously linked source instead fails its earlier state check with 409.

## IRN concurrency and permanence — manual procedure

1. Open two or more Postman tabs with POST `{{base_url}}/api/marketing/inquiries`, M headers and Inquiry A. Manually click Send in rapid succession (or use two operators). Every successful response must be 201 S with a different IRN and database ID. Repeated content may produce advisory duplicate candidates. Record the IRNs; no request runner is needed.
2. Check `ABC-YYMMDD-nnn`: the date must be the current **UTC registration date**, even if `receivedAt` is older or another timezone. The three-digit serial increases within the customer/year, not per day. Do not hardcode `261120` in expectations on another date.
3. POST `/api/customers` with M and Customer A using a new code `SECOND` (201 S). Register Inquiry A with that new customer ID (201 S). Its first serial must be `001`, independently of ABC's current sequence.
4. Between two valid registrations, submit Inquiry A with the invalid merchandiser body above (422 E). The invalid request must not create an inquiry or consume a serial. Compare subsequent successful numbers while ensuring no other operator is creating inquiries.
5. Close one registered inquiry using POST `/api/marketing/inquiries/:id/status`, M, `{"status":"CLOSED","reason":"Manual permanence check"}` (200 S). Register another inquiry (201 S). Its serial must be greater; the closed inquiry remains retrievable with its unchanged IRN. Duplicate linking must likewise preserve both numbers.
6. Annual reset needs a controlled year-boundary environment. On an **isolated development instance/database**, have the operator arrange a UTC year boundary using the machine clock, restart the application, and obtain fresh development tokens. POST Inquiry A immediately before and after that boundary (M, 201 S). The new year's first serial is `001` and YY changes; earlier rows remain. Never change a shared/production clock or rewind its counters. Tokens/cookies depend on wall time, so use fresh sessions. If such an environment is unavailable, mark annual-reset runtime verification pending; source review of the `(customerId, year)` key alone is not a runtime check. Changing receivedAt alone must not trigger an annual reset.
7. Three-digit exhaustion is a separate operational boundary: the 1000th attempted saved inquiry in one customer/year must return 409 E `IRN_SEQUENCE_EXHAUSTED`, without consuming another number. Do not generate hundreds of records in the shared database solely to exercise this case; reserve it for controlled manual UAT. Wider suffixes require an approved numbering change.

## Completion record

Record date, actor roles, environment, requests actually sent, HTTP results and resulting IDs/IRNs in the team's UAT record. Verify database counts, append-only behavior, transaction rollback and permissions with an authorized operator as needed. Do not infer successful customer/inquiry behavior from `/health`, a successful build or an applied migration. Production object storage, retention, malware handling and specialized departmental authority are separate unresolved dependencies.
