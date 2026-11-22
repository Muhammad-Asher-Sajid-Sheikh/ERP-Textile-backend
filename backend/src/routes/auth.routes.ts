import { Router } from "express";
import { authLimiter } from "../middleware/ratelimiter.js";
import { checktoken } from "../middleware/auth.middleware.js";
import { checkApproved, requireRole } from "../middleware/rbac.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import * as input from "../validators/auth.validator.js";
import * as auth from "../controllers/auth.controller.js";
import * as account from "../controllers/account.controller.js";
const router = Router();
// Registration and session endpoints retain their existing rate limits.
router.post(
  "/register",
  authLimiter,
  validate(input.registerInput),
  auth.register,
);
router.post("/login", authLimiter, validate(input.loginInput), auth.login);
router.post("/refresh", authLimiter, auth.refresh);
router.post("/logout", checktoken, auth.logout);
router.get("/profile", checktoken, auth.profile);
router.post(
  "/change-password",
  checktoken,
  validate(input.passwordInput),
  auth.changePassword,
);
// Only approved Management accounts can administer users.
router.get(
  "/admin/pending-users",
  checktoken,
  requireRole("MANAGEMENT"),
  checkApproved,
  account.pendingUsers,
);
router.patch(
  "/admin/users/:id/approve",
  checktoken,
  requireRole("MANAGEMENT"),
  checkApproved,
  account.updateAccount("approve"),
);
router.patch(
  "/admin/users/:id/reject",
  checktoken,
  requireRole("MANAGEMENT"),
  checkApproved,
  account.updateAccount("reject"),
);
router.patch(
  "/admin/users/:id/role",
  checktoken,
  requireRole("MANAGEMENT"),
  checkApproved,
  account.updateAccount("role"),
);
router.patch(
  "/admin/users/:id/suspend",
  checktoken,
  requireRole("MANAGEMENT"),
  checkApproved,
  account.updateAccount("suspend"),
);
export default router;
