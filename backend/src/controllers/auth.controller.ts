import type { Response } from 'express';
import { env } from '../config/env.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { actor } from '../middleware/auth.middleware.js';
import * as input from '../validators/auth.validator.js';
import * as auth from '../services/auth.service.js';
import * as token from '../services/token.service.js';

// Deliberate compatibility aliases: user, users, count and accesstoken remain top-level.
export function authResponse(res: Response, data: Record<string, unknown>, message = 'Success', status = 200) {
  return res.status(status).json({ ...new ApiResponse(status, data, message), ...data });
}
const cookieOptions = { httpOnly: true, secure: env.production, sameSite: 'lax' as const, maxAge: 7 * 86400000 };
export const register = asyncHandler(async (req, res) => {
  const user = await auth.register(input.registerInput.parse(req.body), req.ip);
  authResponse(res, { user }, 'Registration successful! Your account is pending management approval. Check your email for confirmation.', 201);
});
export const login = asyncHandler(async (req, res) => {
  const result = await auth.login(input.loginInput.parse(req.body), req.ip, req.get('user-agent'));
  res.cookie('refreshtoken', result.refreshToken, cookieOptions);
  authResponse(res, { accesstoken: result.accessToken, user: result.user }, 'Login successful!');
});
export const refresh = asyncHandler(async (req, res) => {
  const cookie: unknown = req.cookies?.refreshtoken;
  if (typeof cookie !== 'string' || !cookie) throw new ApiError(401, 'Refresh token not found. Please log in again.', 'REFRESH_TOKEN_REQUIRED');
  const result = await token.refreshAccessToken(cookie, req.headers.authorization?.split(' ')[1], req.ip);
  res.cookie('refreshtoken', result.refreshToken, cookieOptions);
  authResponse(res, { accesstoken: result.accessToken }, 'Token refreshed successfully');
});
export const logout = asyncHandler(async (req, res) => {
  const user = actor(req);
  const cookie: unknown = req.cookies?.refreshtoken;
  if (typeof cookie === 'string') await token.revokeRefreshToken(cookie, user.id);
  await auth.logAuditEvent(user.id, 'LOGIN_ATTEMPT', { status: 'logout' }, req.ip);
  res.clearCookie('refreshtoken', { httpOnly: true, secure: env.production, sameSite: 'lax' });
  authResponse(res, {}, 'Logged out successfully');
});
export const profile = asyncHandler(async (req, res) => authResponse(res, { user: await auth.profile(actor(req).id) }));
export const changePassword = asyncHandler(async (req, res) => {
  await auth.changePassword(actor(req).id, input.passwordInput.parse(req.body), req.ip);
  authResponse(res, {}, 'Password changed successfully.');
});
