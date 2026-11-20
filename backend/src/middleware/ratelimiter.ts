import rateLimit from "express-rate-limit";
import { ApiError } from "../utils/ApiError.js";
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(
      new ApiError(
        429,
        "Too many login attempts. Please try again after 15 minutes.",
        "RATE_LIMIT_EXCEEDED",
        [],
        true,
        { status: 429 },
      ),
    ),
});
