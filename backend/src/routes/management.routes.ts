import { Router } from "express";
import { checktoken } from "../middleware/auth.middleware.js";
import { checkApproved, requireRole } from "../middleware/rbac.middleware.js";
import * as management from "../controllers/management.controller.js";
const router = Router();
router.use(checktoken, checkApproved, requireRole("MANAGEMENT"));
// Oversight reads existing business records; it does not duplicate inquiry state.
router.get("/inquiries/overview", management.inquiryOverview);
router.get("/inquiries/:id/summary", management.inquirySummary);
router.get("/clarification-escalations", management.clarificationEscalations);
router.get("/provisional-review-requests", management.listProvisionalRequests);
router.get(
  "/provisional-review-requests/:id",
  management.getProvisionalRequest,
);
// Only non-authorizing review dispositions are supported until authority is mapped.
router.post(
  "/provisional-review-requests/:id/decisions",
  management.decideProvisionalRequest,
);
export default router;
