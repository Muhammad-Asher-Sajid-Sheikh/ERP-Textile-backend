import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import type { Request } from 'express';

export const checktoken = asyncHandler(async (req, _res, next) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '');
  if (!match?.[1]) throw new ApiError(401, 'Access token required', 'AUTH_REQUIRED');
  let decoded: string | jwt.JwtPayload;
  try { decoded = jwt.verify(match[1], env.accessSecret, { algorithms: ['HS256'] }); }
  catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw new ApiError(401, 'Access token expired. Please refresh your token.', 'TOKEN_EXPIRED');
    throw new ApiError(401, 'Invalid access token', 'INVALID_TOKEN');
  }
  if (typeof decoded === 'string' || typeof decoded.id !== 'string') throw new ApiError(401, 'Invalid access token', 'INVALID_TOKEN');
  const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, email: true, role: true, status: true } });
  if (!user) throw new ApiError(401, 'User not authenticated', 'AUTH_REQUIRED');
  if (user.status !== 'APPROVED') throw new ApiError(403, `Your account is currently ${user.status.toLowerCase()}. Access denied.`, 'ACCOUNT_NOT_APPROVED', [], true, { status: user.status });
  req.user = user;
  next();
});
export function actor(req: Request) {
  if (!req.user) throw new ApiError(401, 'User not authenticated', 'AUTH_REQUIRED');
  return req.user;
}
