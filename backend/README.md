# BBTI ERP backend - foundation and WF-01

This Express 5 / PostgreSQL / Prisma 7 service implements the existing account lifecycle and WF-01 Customer Inquiry Receipt and Registration. Requirements were checked against BBTI P1-D0.11 (12 November 2026), pages 1-3. That specification is a management release candidate; this implementation grants no quotation, financial, order-activation or production authority.

## Runtime and commands

Use Node 22.12+ (verified with Node 24) and run all commands from `backend/`:

```sh
npm ci
npm run prisma:validate
npm run generate
npm run typecheck
npm run build
npm run migrate:deploy
npm run dev
# Or, after building:
npm start
```

Configure `.env` from [.env.example](./.env.example). Never commit it. `DATABASE_URL`, `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are required at application import. Prisma CLI requires `DATABASE_URL`; no credential fallback exists. Use independent random JWT secrets. `ResendAPIKey`, `RESEND_FROM_EMAIL`, and `FRONTEND_LOGIN_URL` configure existing email notifications. Missing mail configuration does not prevent startup or roll back an account mutation; delivery failures are logged without confidential contents. Legacy successful account messages still say notification email sent, so that text is not delivery confirmation.

`PORT` defaults to 3000. `FRONTEND_URL` controls credentialed CORS. `NODE_ENV=production` enables Secure refresh cookies; production requires HTTPS. `ENABLE_REQUEST_LOGGING=true` logs only correlation ID, method and status. `ENABLE_TOKEN_CLEANUP=false` disables hourly cleanup; `TOKEN_CLEANUP_INTERVAL_MS` otherwise controls its interval. The existing auth limiter remains five shared register/login/refresh requests per IP per 15 minutes; the old documented `RATE_LIMIT_*` variables were never read and remain unused. Express does not trust arbitrary forwarded IP headers; configure a known proxy topology separately before proxy deployment.

Development runs TypeScript through `tsx watch`. Deployment compiles NodeNext ESM to `dist/` with `tsc`; generated Prisma sources compile alongside application code. Source `.js` imports resolve to TypeScript during compilation and to emitted JavaScript in production. Prisma's generator explicitly emits `.js` import paths. Generated files and `dist/` are ignored, so generate before type checking. Build with development dependencies available; deploy `dist/`, package manifests and production dependencies (`npm ci --omit=dev --ignore-scripts` after the build, or a separate runtime image). `npm start` uses Node only. Run migration deployment in a build/release environment with the Prisma CLI installed. Do not run Prisma 8 from the repository root.

## Architecture

- [src/app.ts](./src/app.ts): middleware and route assembly, without starting a listener.
- [src/server.ts](./src/server.ts): database connection, listener, cleanup and graceful shutdown.
- [src/routes/](./src/routes/): endpoint declarations and authorization middleware.
- [src/controllers/](./src/controllers/): request parsing, HTTP status, cookies and response projection.
- [src/services/](./src/services/): auth, account, token, customer, inquiry and evidence workflows.
- [src/middleware/](./src/middleware/): live authentication, RBAC, validation, errors and 404 handling.
- [src/lib/prisma.ts](./src/lib/prisma.ts): single shared PostgreSQL adapter/client.
- [src/validators/](./src/validators/): strict business DTOs and compatible auth validation.
- [src/utils/](./src/utils/): ApiResponse, ApiError and asyncHandler.
- [prisma/](./prisma/): schema and append-only migration history.

The existing unmounted Merchandising product-list helper is retained with its shared client and corrected Prisma delegate. No Merchandising business workflow has been redesigned. OrderToken is not an official ICN or an order-activation mechanism.

## Authentication compatibility

All eleven existing methods and URLs are preserved. Password hashing remains bcrypt with 12 rounds; password rules, pending registration, Management approval/rejection/suspension/role changes, five-failure account lockout and 15-minute lock duration remain. Access JWTs expire in 15 minutes; refresh JWTs and the `refreshtoken` cookie expire in seven days. Cookie attributes remain HttpOnly, SameSite=Lax, Path=/ and Secure in production. Notification templates and events are retained, with HTML escaping added for user content.

Auth success responses retain `success`, `message`, and existing top-level `user`, `users`, `count`, and `accesstoken` fields. The normalized `statusCode` and `data` fields are additive; the aliases deliberately duplicate the same safe projection. Existing error `status`/`requiredRoles`/`userRole` fields are retained where applicable. Validation errors now also have stable `code` and `errors` fields. Unexpected failures return a safe generic message.

JWTs must verify before a live database lookup. Role and status are loaded once per protected request, so suspension, rejection or demotion takes effect on the next request, even with an old token. All protected endpoints require APPROVED. The schema has no separate INACTIVE account status; customer inactivity is independent. Auth user IDs remain text-compatible with the historical integer-to-text migration.

Refresh now checks the refresh cookie signature, stored session, expiry, user identity and live status before any successful return. A supplied access token that is still valid and matches current authority retains the existing no-rotation behavior. Otherwise, a valid cookie can refresh without an access header; rotation deletes the old session and stores a uniquely identified replacement transactionally. Logout revokes only the actor's matching refresh session and is idempotent for an already revoked cookie. As before, logout does not blacklist an already issued access JWT.

Initial Management provisioning remains an operator responsibility. Registration never auto-approves a Management account. On a new database an authorized operator must provision/approve the first administrator using the existing operational process; this PR adds no bootstrap bypass or seed script.

## Permissions

See [RBAC_GUIDE.md](./RBAC_GUIDE.md). Marketing and Management maintain Customer Master. Marketing alone writes inquiries; all approved Marketing users share the current department scope. Management reads inquiries and their business audit entries. MERCHANDISE reads only assigned inquiries, including related customer details, history and evidence. PRODUCTION has no WF-01 access. There is no tenant/team hierarchy in the existing schema, so finer Marketing ownership scopes need an explicit future mapping.

These permissions do not confer Finance, Accounts, QA, quotation approval, PO acceptance, ICN issuance or production release authority. Those mappings remain unresolved and outside this PR.

## Endpoints

Authentication stays under `/api/auth`: POST `register`, `login`, `refresh`, `logout`, `change-password`; GET `profile`, `admin/pending-users`; PATCH `admin/users/:id/approve`, `reject`, `role`, `suspend`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST / GET | `/api/customers` | Create / search customers |
| GET / PATCH | `/api/customers/:id` | Read / update or deactivate |
| POST / GET | `/api/marketing/inquiries` | Register / search inquiries |
| GET / PATCH | `/api/marketing/inquiries/:id` | Read / edit permitted fields |
| POST / GET | `/api/marketing/inquiries/:id/evidence` | Append / page through original evidence |
| GET | `/api/marketing/inquiries/:id/evidence/:evidenceId/attachment` | Authorized attachment download |
| POST / GET | `/api/marketing/inquiries/:id/acknowledgements` | Record / list customer acknowledgements |
| POST | `/api/marketing/inquiries/:id/link-duplicate` | Link to another inquiry of the same customer |
| POST | `/api/marketing/inquiries/:id/status` | Hold, resume or close with a reason |
| GET | `/api/marketing/inquiries/:id/history` | Status history; business audit included for Management |

JSON success: `{ "success": true, "statusCode": 201, "message": "Inquiry registered successfully", "data": {...}, "meta": {...} }`. Metadata is optional. Error: `{ "success": false, "statusCode": 409, "code": "INVALID_STATUS_TRANSITION", "message": "...", "errors": [], "requestId": "..." }`. Known invalid requests are 400, authentication 401, authorization 403, missing resources 404, conflicts 409, domain validation 422 and rate limits 429. Oversized bodies return 413. Unknown failures are 500 without ORM queries or stacks. Downloads return bytes instead of a JSON envelope.

List queries use `page` (default 1) and `pageSize` (default 20, max 100). Customer filters: `search`, `country`, `active=true|false`; sorting by name then ID. Inquiry filters: `search` (IRN/category), `customerId`, `merchandiserId`, `status`, `priority`, `source`; sorting newest first then ID. Detail responses include the first 20 evidence/acknowledgement records and counts; use their paginated GET endpoints for the remainder. History has independent transition/audit totals. No User passwords, tokens or security fields appear in business responses.

## Customer and registration rules

Customer requires a controlled unique code, name, country and at least one named contact with email or phone. Codes normalize to uppercase letters/digits/single hyphens and are immutable; deactivation preserves identities and existing inquiries. Contact and relationship arrays supplied to PATCH replace that collection, with old/new values retained in transactional audit. Omitted collections remain unchanged. Commercial-party relationships point to reusable Customer identities using BUYER, LEGAL_BUYER, AGENT, ACCOUNT_OWNER, REMITTER, CONSIGNEE or ULTIMATE_CUSTOMER; an unknown relationship need not be supplied. No customer approval gate exists.

Registration requires an active customer, source, original received timestamp with UTC offset, original message or attachment, approved MERCHANDISE assignee, response deadline and next action. Priority defaults to NORMAL (LOW/HIGH/URGENT are available). Product/category, season/program, destination, estimated quantity/unit and target date may remain unknown. Optional quantities are positive and stored as Decimal(20,4); JSON responses serialize them as strings. Dates use ISO formats; target date is date-only. Source and received time on the initial evidence must match the inquiry. Future receipt/acknowledgement timestamps and deadlines before receipt are rejected. An overdue deadline can be recorded when entering an older inquiry.

Acknowledgement is recorded later, not required before registration. The endpoint records an acknowledgement already sent by a person; it does not send email or WhatsApp. This avoids inventing a communication integration.

## IRN and state rules

IRN is `CustomerCode-YYMMDD-nnn`. YYMMDD and the annual counter year use the UTC registration date, taken after obtaining the customer's transaction lock, independent of server timezone and the original received time. A PostgreSQL `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` allocates per customer/year, in the same transaction as inquiry/evidence/history/audit creation. Failure rolls back allocation. Customer updates and inquiry mutations take the same customer row lock. Unique constraints protect both the full IRN and `(customerId, irnYear, irnSerial)`.

The exact three-digit format permits 001-999 per customer/year. A 1000th allocation returns `IRN_SEQUENCE_EXHAUSTED` and rolls back; wider numbering requires business authorization rather than silently changing the specified format. A new year gets a new counter starting at 001. Database triggers prohibit changing issued identity/receipt fields, deleting inquiries, changing customer codes, or rewinding counters. Closure never releases a serial. No API accepts an IRN or creator ID.

RECEIVED is recorded retrospectively in history using the original receipt time, followed by REGISTERED on save. There is no incomplete draft endpoint issuing an IRN. REGISTERED can become ACKNOWLEDGED through acknowledgement recording. REGISTERED/ACKNOWLEDGED can become ON_HOLD or CLOSED; ON_HOLD can resume to REGISTERED or close. Resume retains past acknowledgements. REGISTERED/ACKNOWLEDGED/ON_HOLD can become DUPLICATE_LINKED through explicit linking. DUPLICATE_LINKED can only close; CLOSED is terminal. Holds, resumes, duplicate links and closures require a reason. Closed/linked records cannot be edited, but evidence may still be appended. All transitions are transactionally audited.

Likely duplicate detection is advisory: matching original content hash, or matching source/channel reference for the same customer, yields up to 20 candidates in registration `meta.likelyDuplicates`. It does not silently merge or block a genuinely separate inquiry. Marketing must review and explicitly link genuine duplicates. Linking requires the same customer and prevents self-links, chains and cycles; both original IRNs and evidence remain permanent. Fuzzy semantic duplicate detection is not implemented.

## Evidence storage and production dependency

Original messages and optional attachment bytes are stored in PostgreSQL. SHA-256 hashes, actual byte size, content type, plain filename, uploader and creation time are recorded. Only PDF, PNG, JPEG, UTF-8 text and email files are accepted, up to 5 MiB per attachment within a 10 MiB JSON request. The base64 encoding must be canonical and file signatures/text encoding must match the declared type. No path or external URL is fetched. A filename/reference alone is not stored file evidence.

Evidence, acknowledgements, status history and business audit rows are append-only at the database level. Corrections append evidence referencing `correctsEvidenceId`; the original stays unchanged. Original message whitespace is retained. Metadata queries omit bytes. Downloads require the same inquiry access as reads, use attachment disposition and `application/octet-stream`, and disable caching. There is no public upload directory.

This is real database-backed storage suitable for development and small bounded evidence, not configured production object storage. Before production acceptance, approve retention/backups, capacity, malware scanning/quarantine, and private object storage for larger or additional file formats. Signature checking is not malware scanning. The object-storage and retention decisions are explicit deployment dependencies, not completed features.

## Migration safety

Old migration files are unchanged. The historical auth migration drops the old tutorial Post table and changes User IDs; it must not be blindly replayed against a populated pre-auth database. Back up and inspect migration status/drift first. This task's configured database was inspected as empty before applying the chain; established deployments should already have the old migrations recorded.

The foundation migration only adds the previously unmigrated Products table, its relation, and orderId indexes. ProductFamily's existing required columns and foreign key are restored in the schema to match history. Existing User/RefreshToken/AuditLog definitions are preserved. `@updatedAt` is applied to Merchandising update timestamps without dropping their existing defaults.

The WF-01 migration creates new enums/tables/indexes/restrictive foreign keys, check constraints and immutability triggers. It neither drops existing tables/columns nor rewrites auth records. Do not use `db push`, reset or edited old migrations to reconcile an existing installation. Custom SQL triggers/checks are authoritative additions beyond what Prisma's schema diff represents. Future retention/data correction migrations must explicitly account for them.

## Verification and remaining work

Use [POSTMAN_VERIFICATION.md](./POSTMAN_VERIFICATION.md) for manual authentication, customer, inquiry, authorization and IRN checks. No automated tests, seed scripts or custom test runners are introduced. Compilation, migration deployment and startup are separate from endpoint/UAT verification; the final delivery records which checks actually ran.

WF-02 through WF-14, Finance/QA authority mapping, production storage approval and end-to-end business UAT remain outside this implementation. The supplied internal management PDF is reference material and is not automatically published with the PR.

Verification on 20 November 2026: Prisma validation, generation (7.10.1), TypeScript checking and compilation passed. The full six-migration chain deployed to the inspected empty local PostgreSQL database; migration status is current and the database-to-schema diff is empty. Development and compiled production-mode servers started, and the registered router stack contains the existing eleven auth endpoints plus all customer/inquiry routes. Manual HTTP probes covered health, unauthenticated customer/inquiry rejection and unknown-route handling. Authenticated business operations, notification delivery, concurrency and annual reset remain for the manual Postman/UAT checklist. No business records or test users were seeded.

Compiled production startup and HTTP 200 health were also verified after `npm ci --omit=dev --ignore-scripts`; development dependencies were then restored with `npm ci`.

Compatible dependency updates removed the initial critical audit finding. `npm audit` still reports three high findings through Prisma's `effect` dependency chain. Its proposed forced remediation downgrades Prisma to 6, so it was not applied; review an upstream Prisma 7-compatible fix before production acceptance. Prisma CLI/client/adapter are aligned at 7.10.1 in the lockfile.
