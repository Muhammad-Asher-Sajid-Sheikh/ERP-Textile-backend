import { Router } from "express";
import { checktoken } from "../middleware/auth.middleware.js";
import { checkApproved, requireRole } from "../middleware/rbac.middleware.js";
import * as workflow from "../controllers/workflow.controller.js";
const router = Router();
// Per-route guards keep the original WF-01 router's permissions unchanged.
const read = [
  checktoken,
  checkApproved,
  requireRole("MARKETING", "MERCHANDISE", "MANAGEMENT"),
];
const reviewRead = [
  checktoken,
  checkApproved,
  requireRole("MARKETING", "MERCHANDISE", "MANAGEMENT", "PRODUCTION"),
];
const marketing = [checktoken, checkApproved, requireRole("MARKETING")];
const merchandiser = [checktoken, checkApproved, requireRole("MERCHANDISE")];
// WF-02: the assigned merchandiser submits the review; Production owns its findings.
router.post(
  "/inquiries/:id/technical-reviews",
  checktoken,
  checkApproved,
  requireRole("MARKETING", "MERCHANDISE"),
  workflow.createReview,
);
router.get(
  "/inquiries/:id/technical-reviews",
  ...reviewRead,
  workflow.listReviews,
);
router.get(
  "/inquiries/:id/technical-reviews/:reviewId",
  ...reviewRead,
  workflow.getReview,
);
router.patch(
  "/inquiries/:id/technical-reviews/:reviewId",
  ...merchandiser,
  workflow.updateReview,
);
router.post(
  "/inquiries/:id/technical-reviews/:reviewId/submit",
  ...merchandiser,
  workflow.submitReview,
);
router.post(
  "/inquiries/:id/technical-reviews/:reviewId/consultations",
  checktoken,
  checkApproved,
  requireRole("PRODUCTION"),
  workflow.consult,
);
// WF-03: the Marketing owner manages customer communications and baselines.
router.get(
  "/inquiries/:id/workflow-notices",
  ...read,
  workflow.listWorkflowNotices,
);
router.post(
  "/inquiries/:id/clarifications",
  ...marketing,
  workflow.createClarification,
);
router.get(
  "/inquiries/:id/clarifications",
  ...read,
  workflow.listClarifications,
);
router.get(
  "/inquiries/:id/clarifications/:clarificationId",
  ...read,
  workflow.getClarification,
);
router.patch(
  "/inquiries/:id/clarifications/:clarificationId",
  ...marketing,
  workflow.updateClarification,
);
router.post(
  "/inquiries/:id/clarifications/:clarificationId/responses",
  ...marketing,
  workflow.respond,
);
router.post(
  "/inquiries/:id/clarifications/:clarificationId/escalations",
  ...marketing,
  workflow.escalate,
);
router.post("/inquiries/:id/baselines", ...marketing, workflow.createBaseline);
router.get("/inquiries/:id/baselines", ...read, workflow.listBaselines);
router.get(
  "/inquiries/:id/baselines/:versionId",
  ...read,
  workflow.getBaseline,
);
router.patch(
  "/inquiries/:id/baselines/:versionId",
  ...marketing,
  workflow.updateBaseline,
);
router.post(
  "/inquiries/:id/baselines/:versionId/finalize",
  ...marketing,
  workflow.finalizeBaseline,
);
router.post(
  "/inquiries/:id/baselines/:versionId/revise",
  ...marketing,
  workflow.reviseBaseline,
);
router.post(
  "/inquiries/:id/provisional-review-requests",
  ...marketing,
  workflow.createProvisionalRequest,
);
export default router;
