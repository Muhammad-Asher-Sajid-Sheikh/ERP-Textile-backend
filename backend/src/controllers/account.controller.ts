import { asyncHandler } from "../utils/asyncHandler.js";
import { actor } from "../middleware/auth.middleware.js";
import { authResponse } from "./auth.controller.js";
import * as account from "../services/account.service.js";
import {
  authIdInput,
  reasonInput,
  roleInput,
} from "../validators/auth.validator.js";
export const pendingUsers = asyncHandler(async (_req, res) => {
  const users = await account.pendingUsers();
  authResponse(res, { count: users.length, users });
});
const messages = {
  approve: "User approved successfully! Notification email sent.",
  reject: "User rejected successfully! Notification email sent.",
  suspend: "User suspended successfully! Notification email sent.",
  role: "User role changed successfully! Notification email sent.",
};
export const updateAccount = (action: keyof typeof messages) =>
  asyncHandler(async (req, res) => {
    const { id } = authIdInput.parse(req.params);
    const role = action === "role" ? roleInput.parse(req.body).role : undefined;
    const reason =
      action === "reject" || action === "suspend"
        ? reasonInput.parse(req.body ?? {}).reason
        : undefined;
    const user = await account.updateAccount(
      id,
      action,
      actor(req).id,
      req.ip,
      reason,
      role,
    );
    authResponse(res, { user }, messages[action]);
  });
