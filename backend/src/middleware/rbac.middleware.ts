import type { RequestHandler } from 'express';
import type { Role } from '../generated/enums.js';
import { ApiError } from '../utils/ApiError.js';
import { actor } from './auth.middleware.js';
export const checkApproved: RequestHandler = (req, _res, next) => {
  const user = actor(req);
  if (user.status !== 'APPROVED') throw new ApiError(403, 'Account is not approved', 'ACCOUNT_NOT_APPROVED', [], true, { status: user.status });
  next();
};
export const requireRole = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  const user = actor(req);
  if (!roles.includes(user.role)) throw new ApiError(403, 'Access denied. Insufficient permissions.', 'PERMISSION_DENIED', [], true, { requiredRoles: roles, userRole: user.role });
  next();
};
