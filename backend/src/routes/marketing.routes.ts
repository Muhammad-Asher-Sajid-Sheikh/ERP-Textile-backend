import { Router } from "express";
import { checktoken } from "../middleware/auth.middleware.js";
import { checkApproved, requireRole } from "../middleware/rbac.middleware.js";
import * as inquiry from "../controllers/inquiry.controller.js";
const router = Router();
router.use(
  checktoken,
  checkApproved,
  requireRole("MARKETING", "MANAGEMENT", "MERCHANDISE"),
);
const write = requireRole("MARKETING");
router.post("/inquiries", write, inquiry.create);
router.get("/inquiries", inquiry.list);
router.get("/inquiries/:id", inquiry.get);
router.patch("/inquiries/:id", write, inquiry.update);
router.post("/inquiries/:id/evidence", write, inquiry.addEvidence);
router.get("/inquiries/:id/evidence", inquiry.listEvidence);
router.get("/inquiries/:id/evidence/:evidenceId/attachment", inquiry.download);
router.post("/inquiries/:id/acknowledgements", write, inquiry.acknowledge);
router.get("/inquiries/:id/acknowledgements", inquiry.listAcknowledgements);
router.post("/inquiries/:id/link-duplicate", write, inquiry.linkDuplicate);
router.post("/inquiries/:id/status", write, inquiry.transition);
router.get("/inquiries/:id/history", inquiry.history);
export default router;
