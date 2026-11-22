# Readability refactor and WF-02 / WF-03 implementation notes

## Review boundaries

Implementation stayed on `refactor/backend-foundation-wf01` without creating a branch. The initial implementation handoff was uncommitted; the user subsequently authorized committing, pushing and opening a pull request.

At the start, the customer service, customer controller and customer routes already had uncommitted readability edits. The implementation built on those files. The existing untracked workspace configuration and Repomix snapshot were not edited.

Phase 1 changed existing services, controllers, validators, middleware, utilities and routes only. Phase 2 lives in the new workflow/access, technical-review, clarification, baseline and management modules, plus additive schema/migration changes and two route mounts in the application. Existing business-service files contain readability changes only.

## Phase 1

- Expanded conditional bodies and arrow functions, and formatted nested queries and schema fields.
- Replaced the attachment MIME ternary chain with ordered PDF, PNG, JPEG and UTF-8 branches. Base64 decoding, canonical-base64 checks, size checks, byte signatures, messages and SHA-256 inputs are unchanged.
- Renamed local customer-relationship variables and account-notification variables; exported contracts remain unchanged.
- Moved awaited controller service calls into local variables so response construction is readable.
- Kept query selections, pagination, transaction options, customer locks, IRN sequence SQL, audit data, JWT expiry, cookies, RBAC and response aliases unchanged.

Before Phase 2, typecheck, Prisma validation and build passed. The compiled application connected and started on port 3101, and GET /health returned 200. Cleanup was disabled only for this temporary startup process, which was then stopped. No schema or migration changes existed at that checkpoint.

A normalized TypeScript syntax comparison of all existing routes, validators, middleware and utilities matched the initial working files after accounting for explicit blocks/returns and formatting. Services/controllers were reviewed for query, control-flow, error, hash and response preservation. This is static review, not proof of runtime API equivalence. Manual Postman regression is still required.

Potential pre-existing issues intentionally retained: changing a password does not revoke existing sessions; login/account refresh decisions have their existing transaction boundaries; auth notification messages can say an email was sent even when best-effort delivery failed. These were not silently changed in the refactor.

## Business source and permissions

The local BBTI P1-D0.11 PDF, pages 4–5 (WF-02/WF-03), page 2 (distinct authorities), pages 28–29 (TC-01 readiness dependencies), and pages 31–33 (workflow ownership and source/version control) informed the implementation.

New workflow writes use the existing authenticated-user middleware and a fresh approved-account lookup inside the transaction. The actor row is held with a share lock until commit. The customer lock precedes that lookup and serializes new operations with WF-01 closure/reassignment and duplicate linking.

- Marketing owner: start reviews; create/update clarifications; record customer answers; escalate; draft/freeze/revise baselines; request provisional review.
- Assigned merchandiser: start/edit/submit technical reviews; read the inquiry's new workflow records.
- Assigned Production reviewer: read their technical reviews and record their own consultation against an exact content revision.
- Management: oversight reads and non-authorizing dispositions by the named request reviewer. No original customer evidence editing.
- Unrelated staff cannot access another inquiry's new workflow records. The original WF-01 access rules remain unchanged.

Marketing ownership is the existing inquiry `createdById`; technical coordination is `merchandiserId`. There is no new ownership-transfer endpoint. Broader team ownership or reassignment of a departed Marketing owner needs an explicit policy.

## WF-02

A numbered technical review has a mutable draft revision and an immutable submitted snapshot. Only one draft per inquiry is allowed. Draft updates retain item keys and IDs; mark a field NOT_APPLICABLE with a reason rather than deleting it. The body is a full draft replacement, not a partial field patch.

Items record area, value, state, customer evidence, stage applicability, responsible employee, due date, next follow-up and escalation reason. No technical field is universally mandatory. Requiredness is explicitly recorded by the reviewer and does not replace Production/QA-approved TC-01 configuration.

Production findings are append-only. They identify the actor and exact draft revision. Editing the review invalidates earlier consultations for submission purposes. Submission preserves that content revision so consultation linkage remains exact. Positive outcomes needing Production require current support; NOT_FEASIBLE requires Production attribution. Incomplete records cannot be declared complete. Review outcome never overwrites WF-01 status.

The API reports the unresolved applicability dependency and `formalCostingAllowed: false`. This batch does not implement a costing/quotation release endpoint. Future consumers must enforce these gates themselves; an informational flag alone is not a security boundary.

## WF-03

Questions and answers are separate records. Responses reference existing original inquiry evidence and must match its received timestamp. Each answer has a controlled sequence number so latest-answer ordering is deterministic. A later response never edits earlier responses.

Written confirmation accepts EMAIL, WHATSAPP or WEBSITE evidence. TELEPHONE, MEETING, BUYING_AGENT and OTHER sources remain unconfirmed until an explicit written communication is preserved. This is a conservative channel classification, not automatic proof of customer approval. Corrected evidence cannot be used for a new verified assertion; use the correcting record.

Customer responses create an audited impact notice identifying Marketing and the assigned merchandiser. Those owners can retrieve notices through GET `/api/marketing/inquiries/:id/workflow-notices`; this exposes only customer-response notices, not the wider Management audit trail. Management oversight surfaces whether new answers or review versions require baseline review. No external emails, push transport or unrelated workflow are introduced.

A draft baseline gathers review facts, assumptions and open points plus the latest clarification responses. It stores exact review and evidence links. Draft updates require an expected revision. Finalization freezes a numbered version and checks source fingerprints, current evidence and retained verified facts. Feasibility readiness additionally requires the latest usable submitted review, no unanswered questions/holds and at least one confirmed assertion. A pending/held baseline can still be frozen as a historical snapshot.

Revision preserves the old frozen version and creates a new draft. Unchanged source data copies the prior consolidation; changed source facts replace matching keys while other prior facts and open points remain visible for reconciliation. A revision may initially carry historical evidence that must be corrected in its draft before freezing. New drafts do not replace the current frozen baseline. Freeze means internal readiness/version control, not customer approval or quotation authorization.

Inquiry closure is derived from the existing Inquiry.status; no separate persisted CLOSED baseline state exists.

## Management authority boundary

The repository has only a generic MANAGEMENT role and no specialized provisional-work approval mapping. As explicitly permitted by the task, final authorization is not implemented. Requests capture the immutable submitted review version, missing-information snapshot, unaffected activity scope, assumptions, risks, requester, designated reviewer and optional expiry.

The designated approved Management reviewer may record REJECTED or RETURNED_FOR_INFORMATION. These are immutable, non-authorizing dispositions. APPROVED and REVOKED attempts return APPROVAL_AUTHORITY_UNCONFIGURED; there is no grant to revoke. Repeated, expired, unrelated-version and stale-version decisions are rejected. A materially changed request requires a new record. Returned/rejected requests cannot be silently removed.

Every request response reports `provisionalWorkAuthorized: false` and `quotationIssuanceAllowed: false`. Do not implement later workflow approvals based on the generic role or this record's existence.

## Database and migration

New entities: InquiryTechnicalReview, TechnicalReviewItem, ProductionConsultation, CustomerClarification, ClarificationQuestion, ClarificationResponse, RequirementBaselineVersion, BaselineAssertion, ProvisionalReviewRequest and ProvisionalReviewDecision.

They reference existing Inquiry, User and InquiryEvidence records. BusinessAuditLog stores material changes in the same transaction. Customer/inquiry data and original attachments are not duplicated. The provisional missing-information JSON is an intentional immutable decision-scope snapshot.

The additive migration creates new enums, tables, indexes and foreign keys; it does not delete/update existing data or rewrite migration history. Foreign keys restrict deletion. Composite uniqueness controls review/baseline version and response sequence allocation. Additional partial indexes enforce one open draft per inquiry.

The migration is supplied for review and deployment; it has not been applied to the configured database. Do not run reset/db push. Use `npm run migrate:deploy` after reviewing the migration and choosing the intended database, then regenerate and restart the application.

## Manual regression

Retest registration/pending approval/login/refresh/logout/password changes; customer contacts and relationships replacement; inquiry registration and concurrent IRNs; invalid/valid attachments and unchanged content hashes; append-only corrections; acknowledgements; duplicate linking; statuses/history; role and assignment denials. See the existing and new sections in [POSTMAN_VERIFICATION.md](../POSTMAN_VERIFICATION.md).

## Final verification (2026-11-21)

- `npm run typecheck`: passed after implementing the new workflows.
- `npm run prisma:validate`: passed.
- `npm run build`: passed, including Prisma Client generation.
- Compiled `node dist/server.js` startup: passed with the existing configured database connection, temporary port 3101 and token cleanup disabled for the check.
- Manual HTTP smoke checks: GET /health returned 200; unauthenticated Management overview and technical-review requests returned 401. The temporary server was stopped.
- `git diff --check`: passed.
- The new migration was generated by comparing the pre-feature schema with the final schema, without applying it. It contains only new tables/enums/indexes/constraints; existing applied migrations were not changed.
- No authenticated workflow CRUD, migration deployment or end-to-end business scenario has been verified against the database. Run the manual Postman scenarios after deployment.
- No automated test infrastructure, test scripts, seed scripts or project dependencies were added.

## Remaining decisions

Production/QA must supply the approved product-family/stage TC-01 dictionary. Business owners must map specialized provisional-work authority before grant-producing decisions can be added. Written confirmation currently uses explicit EMAIL/WHATSAPP/WEBSITE evidence; channel-specific written artifacts received by an agent or in a meeting require a policy before widening that classification. New Marketing ownership uses the original inquiry creator; team ownership/transfer is not guessed.

## Changed-file inventory

The existing customer-file edits were retained as the starting point. The local workspace configuration and Repomix snapshot are excluded from the commit. The following inventory describes the implementation changes.

- Modified: [POSTMAN_VERIFICATION.md](../POSTMAN_VERIFICATION.md)
- Modified: [prisma/schema.prisma](../prisma/schema.prisma)
- Modified: [src/app.ts](../src/app.ts)
- Modified: [src/controllers/account.controller.ts](../src/controllers/account.controller.ts)
- Modified: [src/controllers/auth.controller.ts](../src/controllers/auth.controller.ts)
- Modified: [src/controllers/customer.controller.ts](../src/controllers/customer.controller.ts)
- Modified: [src/controllers/inquiry.controller.ts](../src/controllers/inquiry.controller.ts)
- Modified: [src/middleware/auth.middleware.ts](../src/middleware/auth.middleware.ts)
- Modified: [src/middleware/error.middleware.ts](../src/middleware/error.middleware.ts)
- Modified: [src/middleware/notFound.middleware.ts](../src/middleware/notFound.middleware.ts)
- Modified: [src/middleware/ratelimiter.ts](../src/middleware/ratelimiter.ts)
- Modified: [src/middleware/rbac.middleware.ts](../src/middleware/rbac.middleware.ts)
- Modified: [src/middleware/validate.middleware.ts](../src/middleware/validate.middleware.ts)
- Modified: [src/routes/auth.routes.ts](../src/routes/auth.routes.ts)
- Modified: [src/routes/customer.routes.ts](../src/routes/customer.routes.ts)
- Modified: [src/routes/marketing.routes.ts](../src/routes/marketing.routes.ts)
- Modified: [src/services/account.service.ts](../src/services/account.service.ts)
- Modified: [src/services/auth.service.ts](../src/services/auth.service.ts)
- Modified: [src/services/business-audit.service.ts](../src/services/business-audit.service.ts)
- Modified: [src/services/customer.service.ts](../src/services/customer.service.ts)
- Modified: [src/services/evidence.service.ts](../src/services/evidence.service.ts)
- Modified: [src/services/inquiry.service.ts](../src/services/inquiry.service.ts)
- Modified: [src/services/token.service.ts](../src/services/token.service.ts)
- Modified: [src/utils/ApiError.ts](../src/utils/ApiError.ts)
- Modified: [src/utils/ApiResponse.ts](../src/utils/ApiResponse.ts)
- Modified: [src/utils/asyncHandler.ts](../src/utils/asyncHandler.ts)
- Modified: [src/validators/auth.validator.ts](../src/validators/auth.validator.ts)
- Modified: [src/validators/common.validator.ts](../src/validators/common.validator.ts)
- Modified: [src/validators/customer.validator.ts](../src/validators/customer.validator.ts)
- Modified: [src/validators/inquiry.validator.ts](../src/validators/inquiry.validator.ts)
- New: [docs/WORKFLOW_IMPLEMENTATION.md](./WORKFLOW_IMPLEMENTATION.md)
- New: [prisma/migrations/20261121110000_inquiry_review_clarification_baseline/migration.sql](../prisma/migrations/20261121110000_inquiry_review_clarification_baseline/migration.sql)
- New: [src/controllers/management.controller.ts](../src/controllers/management.controller.ts)
- New: [src/controllers/workflow.controller.ts](../src/controllers/workflow.controller.ts)
- New: [src/routes/management.routes.ts](../src/routes/management.routes.ts)
- New: [src/routes/workflow.routes.ts](../src/routes/workflow.routes.ts)
- New: [src/services/baseline.service.ts](../src/services/baseline.service.ts)
- New: [src/services/clarification.service.ts](../src/services/clarification.service.ts)
- New: [src/services/management.service.ts](../src/services/management.service.ts)
- New: [src/services/technical-review.service.ts](../src/services/technical-review.service.ts)
- New: [src/services/workflow-access.service.ts](../src/services/workflow-access.service.ts)
- New: [src/validators/workflow.validator.ts](../src/validators/workflow.validator.ts)
