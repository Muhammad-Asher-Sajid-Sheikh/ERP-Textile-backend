# Authorization in the current backend

JWT verification is mandatory. [auth.middleware.ts](./src/middleware/auth.middleware.ts) loads the current User role/status once per request. Only APPROVED accounts proceed. Demotion and suspension affect the next protected request; token claims alone never grant business or Management access.

| Capability | MANAGEMENT | MARKETING | MERCHANDISE | PRODUCTION |
| --- | --- | --- | --- | --- |
| Own profile/password/logout | Yes | Yes | Yes | Yes |
| Account approval/rejection/role/suspension | Yes | No | No | No |
| Customer Master read/write/deactivate | Yes | Yes | No | No |
| Register/change inquiry, owner, evidence, status | No | Yes | No | No |
| Read inquiry, history, attachments | All | All | Assigned only | No |
| Read inquiry business audit | Yes | No | No | No |

The existing enum values are unchanged. Marketing is a commercial inquiry-to-order function; no campaign endpoints exist. Department-wide Marketing access is the minimal current mapping because no team/tenant scope exists in the repository. Management inquiry visibility does not authorize commercial/financial/QA or production decisions.

Finance, Accounts, QA and designated issuers require future explicit permissions and management-approved mappings. No approval for WF-02 through WF-14 is inferred from these roles. See [README.md](./README.md) and [POSTMAN_VERIFICATION.md](./POSTMAN_VERIFICATION.md) for implemented behavior and manual checks.
