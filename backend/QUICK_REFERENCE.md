# Backend quick reference

From `backend/`: `npm ci`, configure `.env`, `npm run prisma:validate`, `npm run generate`, `npm run typecheck`, review/apply migrations with `npm run migrate:deploy`, then `npm run dev`. Deployment: `npm run build`, then `npm start`.

Read [README.md](./README.md) for runtime/environment/migration details, [RBAC_GUIDE.md](./RBAC_GUIDE.md) for current permissions, and [POSTMAN_VERIFICATION.md](./POSTMAN_VERIFICATION.md) for request bodies and expected results.

Existing authentication endpoints and top-level aliases are preserved. New business endpoints use ApiResponse/ApiError. WF-01 creates permanent customer/year-scoped IRNs and append-only evidence; it does not activate orders or implement marketing campaigns.
