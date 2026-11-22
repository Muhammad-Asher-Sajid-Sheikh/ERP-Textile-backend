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

# Manual Postman verification — WF-02, WF-03 and Management

This section is additive; the foundation/WF-01 checklist above remains applicable. These requests are instructions for manual verification, not a claim that the new database-backed flows have run.

## Setup and permissions

Review the new migration, run `npm run migrate:deploy` against the intended development database, then `npm run generate`, `npm run build` and start the server. No reset or seed script is needed. Use an existing open inquiry created by your Marketing test user, assigned to your Merchandise test user. Existing closed/duplicate-linked inquiries cannot be used for new writes.

Keep header sets M, D, A and P from the first section. GET requests have no body. Every POST/PATCH uses raw JSON and Content-Type: application/json. Every response uses the existing success envelope; lists have `data: [...]` and `meta: { page, pageSize, total }`.

Additional variables (copy response values manually):

- `marketing_id`: original inquiry creator's user ID.
- `production_id`: approved Production user ID.
- `manager_id`: designated approved Management reviewer's user ID.
- `review_id`, `review_revision`: review `data.id` and `data.revision`.
- `review_item_id`: missing review item's `data.items[].id`.
- `clarification_id`, `clarification_revision`: clarification `data.id` / `data.revision`.
- `question_id`: `data.questions[].id`.
- `written_evidence_id`, `verbal_evidence_id`: evidence recorded with the existing WF-01 evidence endpoint, on this same inquiry.
- `baseline_id`, `baseline_revision`, `previous_baseline_id`: baseline IDs/revisions.
- `provisional_id`: provisional request ID.
- `received_at`: original inquiry receipt time.
- `request_at`: a past timestamp after inquiry receipt.
- `response_at`: a past timestamp after request_at, exactly matching response evidence.receivedAt.
- `follow_up_at`, `due_at`, `expiry_at`: future ISO UTC timestamps, with follow_up_at <= due_at.

New ownership rules: M writes must use the inquiry's original Marketing creator. D review edits/submission require the currently assigned merchandiser. P is restricted to reviews explicitly assigned to that Production user. A may read oversight but cannot perform Marketing/Production actions. The old WF-01 role rules are unchanged.

Global error expectations for all new endpoints: missing/invalid token 401; unapproved/wrong role 403; malformed JSON/UUID/enum or unknown body properties 400 VALIDATION_ERROR; absent or inaccessible inquiry/child record 404; stale expectedRevision 409 STALE_REVISION. Closed/duplicate-linked inquiry writes return 409 INQUIRY_NOT_EDITABLE. Pass actual numeric revision values, not quoted strings.

## WF-02 endpoint inventory

All paths below start with `/api/marketing/inquiries/{{inquiry_id}}`.

| Method and suffix | Header/role | Body | Expected result and rule |
| --- | --- | --- | --- |
| POST `/technical-reviews` | M owner or D assigned | Review body below | 201; data.version, revision and items. One draft per inquiry; second draft 409 REVIEW_DRAFT_EXISTS. |
| GET `/technical-reviews?page=1&pageSize=20` | M owner, D assigned, A, P assigned | None | 200 paged versions. P sees only reviews assigned to them. |
| GET `/technical-reviews/{{review_id}}` | Same readers | None | 200 review, missingInformation, quotationBlockers, applicabilityDependency. Wrong inquiry/review pair 404 REVIEW_NOT_FOUND. |
| PATCH `/technical-reviews/{{review_id}}` | D assigned | Full review body plus expectedRevision | 200 with incremented revision. Submitted version 409 REVIEW_FROZEN; omitted old item key 422 REVIEW_ITEM_REMOVAL_FORBIDDEN. |
| POST `/technical-reviews/{{review_id}}/consultations` | P assigned | Consultation body | 201 findings tied to exact review revision. Another Production reviewer 403/404. |
| POST `/technical-reviews/{{review_id}}/submit` | D assigned | Submission body | 200 immutable submittedAt/outcome. Never changes Inquiry.status. |

Start with an incomplete review:

```json
{
  "productFamily": "Woven bed linen",
  "applicabilityReference": null,
  "assumptions": [],
  "notes": "TC-01 applicability requires Production/QA confirmation.",
  "productionReviewerId": "{{production_id}}",
  "items": [
    {
      "key": "product_type",
      "area": "PRODUCT",
      "label": "Product type",
      "state": "VERIFIED",
      "value": "Bed linen",
      "requiredFor": ["QUOTATION"],
      "applicabilityReason": "Explicit requirement identified for this inquiry; field dictionary pending.",
      "evidenceId": "{{written_evidence_id}}"
    },
    {
      "key": "fabric_composition",
      "area": "PRODUCT",
      "label": "Fabric composition",
      "state": "MISSING",
      "requiredFor": ["QUOTATION", "SAMPLE"],
      "applicabilityReason": "Composition is unresolved for this proposed fabric.",
      "needsProduction": true,
      "ownerId": "{{merchandiser_id}}",
      "dueAt": "{{due_at}}",
      "followUpAt": "{{follow_up_at}}",
      "escalationReason": "Costing basis is not available."
    }
  ]
}
```

Each item supports PRODUCT, QUANTITY, COMMERCIAL, TIMING, PACKING or QUALITY; VERIFIED, UNVERIFIED, MISSING, ASSUMED or NOT_APPLICABLE; and stage scope QUOTATION, SAMPLE or ORDER_ACTIVATION. Empty requiredFor means no stage marked mandatory. Missing/unverified items require owner/due/follow-up; verified customer facts require written evidence. No universal field list is imposed.

For PATCH, resend all fields/items above with `"expectedRevision": 1` (use the actual revision). Existing item keys cannot disappear. Set NOT_APPLICABLE with an applicabilityReason if needed. Each successful draft edit invalidates old Production consultation for submission; consult again against the returned revision.

Production consultation:

```json
{
  "expectedRevision": 1,
  "conclusion": "TECHNICAL_HOLD",
  "findings": "Composition and construction are required to assess manufacturability.",
  "assumptions": []
}
```

Other conclusions: SUPPORTED and NOT_FEASIBLE. Only the assigned Production account may enter these findings; a Marketing account cannot impersonate Production through a recordedById field.

Submit the incomplete review:

```json
{
  "expectedRevision": 1,
  "outcome": "CUSTOMER_CLARIFICATION_REQUIRED",
  "reason": "Request written fabric composition before further technical work."
}
```

Other outcomes: COMPLETE_FOR_CLARIFICATION_BASELINE, TECHNICAL_REVIEW_PENDING, FEASIBLE_WITH_ASSUMPTIONS, NOT_FEASIBLE. A complete outcome with missing/unverified/assumed items returns 409 INCOMPLETE_REVIEW. A positive outcome requiring Production without current SUPPORTED findings returns 409 TECHNICAL_HOLD. NOT_FEASIBLE without a Production conclusion returns 409 PRODUCTION_CONCLUSION_REQUIRED. Feasible-with-assumptions without explicit assumptions returns 422 ASSUMPTIONS_REQUIRED.

Submitted reviews cannot be edited. Create a new numbered review after clarification. A successful complete review still returns `formalCostingAllowed: false` and `quotationIssuanceAllowed: false`: TC-01 configuration and later approval workflows are not granted by this API.

## WF-03 clarification endpoint inventory

Use the same inquiry prefix.

| Method and suffix | Header/role | Body | Expected result and rule |
| --- | --- | --- | --- |
| POST `/clarifications` | M owner | Request below | 201 questions with IDs and UNANSWERED state. Foreign review item 422 INVALID_REVIEW_ITEM. |
| GET `/clarifications?page=1&pageSize=20` | M owner, D assigned, A | None | 200 paged requests, responses, pending count and ageing. |
| GET `/clarifications/{{clarification_id}}` | Same readers | None | 200 full question/answer history; wrong parent 404 CLARIFICATION_NOT_FOUND. |
| GET `/workflow-notices?page=1&pageSize=20` | M owner, D assigned, A | None | 200 customer-change notices with affected owner IDs and requiresBaselineReview; no unrelated audit events. |
| PATCH `/clarifications/{{clarification_id}}` | M owner | Follow-up body | 200 revised responsibility, dates or hold. Invalid chronology 422 INVALID_CLARIFICATION_DATE. |
| POST `/clarifications/{{clarification_id}}/responses` | M owner | Response below | 201 append-only answer. Foreign question 422 INVALID_QUESTION. |
| POST `/clarifications/{{clarification_id}}/escalations` | M owner | Escalation body | 200 persistent escalation. Fully answered request 409 CLARIFICATION_RESOLVED. |

Create one consolidated request:

```json
{
  "subject": "Confirm bed linen requirements",
  "requestedAt": "{{request_at}}",
  "responsibleId": "{{merchandiser_id}}",
  "dueAt": "{{due_at}}",
  "followUpAt": "{{follow_up_at}}",
  "questions": [
    { "question": "What fabric composition is required?", "reviewItemId": "{{review_item_id}}" },
    { "question": "What finished dimensions are required?" }
  ]
}
```

Copy question IDs separately. Request time must be after inquiry receipt; request <= follow-up <= due. Responsibility must be the approved inquiry owner or assigned merchandiser. The owner remains responsible for customer communication.

Record a telephone answer as original WF-01 evidence first. Then POST a response:

```json
{
  "questionId": "{{question_id}}",
  "response": "Customer verbally requested 100% cotton.",
  "receivedAt": "{{response_at}}",
  "evidenceId": "{{verbal_evidence_id}}",
  "confirmation": "WRITTEN_CONFIRMATION_PENDING"
}
```

Expected: answer sequence 1, question still pending; no baseline/customer approval. receivedAt must exactly match the evidence time and cannot precede the clarification request or latest answer.

Preserve a later EMAIL/WHATSAPP/WEBSITE response as new evidence, update response_at to its received time, and POST:

```json
{
  "questionId": "{{question_id}}",
  "response": "100% cotton, confirmed in writing.",
  "receivedAt": "{{response_at}}",
  "evidenceId": "{{written_evidence_id}}",
  "confirmation": "WRITTEN_CONFIRMED"
}
```

Expected: sequence 2 and both answers remain in GET history. Confirming telephone/meeting/agent/other evidence returns 422 WRITTEN_EVIDENCE_REQUIRED. Evidence from another inquiry, or an original already corrected by later evidence, returns 422 INVALID_EVIDENCE_REFERENCE. Wrong time returns 422 INVALID_RESPONSE_DATE. A later verbal change makes the latest answer pending again.

Follow-up PATCH (reload revision after each response):

```json
{
  "expectedRevision": 3,
  "followUpAt": "{{follow_up_at}}",
  "dueAt": "{{due_at}}",
  "customerHold": true,
  "reason": "Customer requested additional time."
}
```

Use customerHold false to release the clarification hold. This does not change WF-01 Inquiry.status.

Escalation POST:

```json
{ "expectedRevision": 4, "reason": "Mandatory information remains unanswered after follow-up." }
```

Management's escalation list includes pending explicit escalations and overdue follow-ups. To test overdue behaviour without clock manipulation, create a separate clarification with all valid request/follow-up/due timestamps in the past, after original inquiry receipt.

## WF-03 baseline endpoint inventory

Use the same inquiry prefix. Write with M owner; read with M owner, D assigned or A.

| Method and suffix | Body | Expected result and rule |
| --- | --- | --- |
| POST `/baselines` | Create below | 201 version 1 draft, sourced facts/assumptions/open questions. Unsubmitted review 409 REVIEW_NOT_SUBMITTED. |
| GET `/baselines?page=1&pageSize=20` | None | 200 paged version history, newest first. |
| GET `/baselines/{{baseline_id}}` | None | 200 exact version; wrong parent 404 BASELINE_NOT_FOUND. |
| PATCH `/baselines/{{baseline_id}}` | Full draft content below | 200 incremented revision; only unfrozen drafts. |
| POST `/baselines/{{baseline_id}}/finalize` | Finalize below | 200 frozenAt; original snapshot is immutable. |
| POST `/baselines/{{baseline_id}}/revise` | Revision below | 201 next numbered draft; prior frozen version retained. |

Create from a submitted review:

```json
{ "reviewId": "{{review_id}}", "changeReason": "Consolidate the preliminary customer requirements." }
```

GET the draft before editing. It gathers current review facts and latest answers automatically. Do not copy only the example assertion below if the real draft contains more source facts; retain all its confirmed source assertions and IDs.

```json
{
  "expectedRevision": 1,
  "assertions": [
    { "key": "product_type", "value": "Bed linen", "confirmed": true, "evidenceId": "{{written_evidence_id}}" }
  ],
  "assumptions": [],
  "openQuestions": ["Awaiting written dimensions"],
  "changeReason": "Review consolidated wording and outstanding questions."
}
```

Draft assertions are a full replacement. Every customer assertion requires evidence; assumptions and open questions remain separate arrays. Confirmed assertions require current written evidence. Editing a frozen version returns 409 BASELINE_FROZEN.

Freeze a pending snapshot if clarification remains:

```json
{ "expectedRevision": 2, "outcome": "CLARIFICATION_PENDING" }
```

Other outcomes: CUSTOMER_HOLD and BASELINE_READY_FOR_FEASIBILITY. Readiness requires no pending questions/holds, the latest usable submitted review, no unconfirmed assertions/open points and retained verified source facts. Failure returns 409 BASELINE_NOT_READY or BASELINE_FACTS_MISSING. A source change after drafting returns 409 BASELINE_SOURCE_CHANGED; reconcile via draft PATCH and retry. Freezing never grants customer approval, costing release or quotation permission.

Revision:

```json
{ "reviewId": "{{review_id}}", "changeReason": "Customer supplied written composition and dimensions." }
```

Use the latest frozen version's URL. If reviewId is omitted, it reuses that baseline's exact review. A second open draft returns 409 BASELINE_DRAFT_EXISTS; revising a draft or an older frozen version returns 409 INVALID_BASELINE_REVISION. Save the previous baseline ID and verify it remains unchanged after revision/finalization. Reconcile carried historical evidence in the new draft before freezing it.

For a successful readiness scenario: answer every question in writing, release customer/WF-01 holds, create a new review with all relevant facts verified (no guessed field applicability), obtain current Production SUPPORTED findings where required, submit it, revise the baseline against that review, retain all confirmed source facts, resolve open points and finalize as BASELINE_READY_FOR_FEASIBILITY. The returned quotationIssuanceAllowed must still be false.

Close the inquiry using the existing WF-01 status endpoint at the end. Baseline GET then derives workflowOutcome INQUIRY_CLOSED; no second closure flag is written.

## Management overview and provisional review

All following reads/decisions use A. Read endpoints have no body.

| Method and endpoint | Body | Expected result and rule |
| --- | --- | --- |
| GET `/api/management/inquiries/overview?page=1&pageSize=20` | None | 200 current review/frozen baseline, pending clarifications, technical hold, follow-ups and escalations. |
| GET `/api/management/inquiries/{{inquiry_id}}/summary` | None | 200 one inquiry, its owner and current workflow information. |
| GET `/api/management/clarification-escalations?page=1&pageSize=20` | None | 200 unresolved escalated/overdue requests, with responsible employees. |
| POST `/api/marketing/inquiries/{{inquiry_id}}/provisional-review-requests` | Request below; use M owner | 201 immutable scope tied to current submitted review. It authorizes no work. |
| GET `/api/management/provisional-review-requests?page=1&pageSize=20` | None | 200 paged requests and effective states. |
| GET `/api/management/provisional-review-requests/{{provisional_id}}` | None | 200 exact scope, version, risks and disposition history. |
| POST `/api/management/provisional-review-requests/{{provisional_id}}/decisions` | Decision below; designated A reviewer | 200 non-authorizing disposition, or documented conflict below. |

Overview filters: customerId, merchandiserId, existing WF-01 status, reviewOutcome (latest review only), overdue=true/false. Escalation filters: inquiryId, responsibleId, overdue=true/false. Provisional list filters: inquiryId, reviewerId. All use page/pageSize (max 100).

Use a separate current submitted incomplete review for provisional tests:

```json
{
  "reviewId": "{{review_id}}",
  "proposedActivity": "Discuss possible packing alternatives only",
  "unaffectedScope": "No final consumption, costing, sample commitment or quotation issuance",
  "assumptions": ["Fabric composition remains unresolved"],
  "risks": ["Cost estimate cannot be finalized"],
  "reviewerId": "{{manager_id}}",
  "expiresAt": "{{expiry_at}}"
}
```

The missingInformation snapshot is copied from that submitted review; it cannot be fabricated through request JSON. If no unresolved item exists: 422 NO_PROVISIONAL_SCOPE. If expiry is not future: 422 INVALID_EXPIRY. Unsubmitted/outdated review: 409 REVIEW_NOT_SUBMITTED / STALE_REVIEW_VERSION.

Rejection:

```json
{
  "reviewId": "{{review_id}}",
  "disposition": "REJECTED",
  "reason": "Obtain the missing cost basis before proceeding.",
  "conditions": ["Submit a new request if the scope changes."]
}
```

RETURNED_FOR_INFORMATION is also supported. Only the named Management reviewer can record a disposition (403 REVIEWER_REQUIRED otherwise). Wrong reviewId: 409 REVIEW_VERSION_MISMATCH. Second disposition: 409 REQUEST_ALREADY_REVIEWED. New technical review after request creation: 409 STALE_REVIEW_VERSION. There is no update/delete API for requests or decisions.

On a fresh undecided request, attempt disposition APPROVED. Expected: 409 APPROVAL_AUTHORITY_UNCONFIGURED, because generic MANAGEMENT does not establish specialized provisional-work authority. REVOKED also returns that dependency: no grant exists in this implementation. Do not treat a request or internal review as permission to work or issue a quotation.

For expiry testing, create a request with a short future expiry, wait manually, then GET and attempt a disposition. Expected: effectiveState EXPIRED, provisionalWorkAuthorized false, and 409 REQUEST_EXPIRED. Rejected requests remain visible with REJECTED state and never become valid. Every response keeps quotationIssuanceAllowed false.

## Final manual scenarios

1. Exercise the existing auth/customer/WF-01 regression checklist before testing new flows.
2. Verify complete, clarification-required, technical-pending, assumed and not-feasible review outcomes; prove the appropriate blockers above.
3. Edit a draft after Production consultation and prove old findings cannot support the new revision.
4. Send two draft updates with the same expectedRevision; only the first succeeds.
5. Preserve verbal then written answers; inspect both responses and confirmation changes.
6. Verify foreign inquiry evidence, question, review and baseline IDs are rejected.
7. Freeze/revise a baseline; compare the historical snapshot and IRN/WF-01 status.
8. Change a source after drafting; prove finalization requires reconciliation.
9. Verify Management overview, pending/escalated questions, overdue filtering and requiresBaselineReview after a later answer.
10. Verify provisional rejection, return, repeated decision, expiry, mismatched version and blocked approval.
11. Use another Marketing owner, unassigned Merchandise, unassigned Production, generic Management writes, suspended users and missing tokens to verify access denials.
12. Close an inquiry through WF-01 and verify no new workflow write can bypass closure.
13. Inspect existing inquiry history as Management for the new transactional business-audit actions. Verify historical customer evidence is unchanged.
