import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import type { AuditActionType, Prisma } from '../generated/client.js';
import type { z } from 'zod';
import type { registerInput, loginInput, passwordInput } from '../validators/auth.validator.js';
import { generateAccessToken, generateRefreshToken, storeRefreshToken } from './token.service.js';
import { sendWelcomeEmail } from './mailer.js';

export const publicUser = { id: true, email: true, name: true, role: true, status: true } satisfies Prisma.UserSelect;
export const strongPassword = (password: string) => password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[!@#$%^&*(),.?":{}|<>]/.test(password);
function enforcePassword(password: string) {
  if (!strongPassword(password)) throw new ApiError(400, 'Password must be at least 8 characters and contain uppercase, lowercase, numbers, and special characters.', 'WEAK_PASSWORD');
}
export async function notifyEmail(send: () => Promise<unknown>) {
  try { await send(); } catch { console.error({ event: 'auth_email_failed' }); }
}
export async function logAuditEvent(userId: string, actionType: AuditActionType, details: Prisma.InputJsonValue, ipAddress?: string) {
  // Preserve best-effort login audit behavior. Account mutations use transactional audit below.
  try { await prisma.auditLog.create({ data: { userId, actionType, actionDetails: JSON.stringify(details), ipAddress } }); }
  catch { console.error({ event: 'auth_audit_failed', actionType, userId }); }
}
export async function register(input: z.infer<typeof registerInput>, ipAddress?: string) {
  if (input.password !== input.confirmPassword) throw new ApiError(400, 'Passwords do not match.', 'PASSWORD_MISMATCH');
  enforcePassword(input.password);
  const email = input.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw new ApiError(409, 'Email is already registered.', 'EMAIL_ALREADY_EXISTS');
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.$transaction(async tx => {
    const created = await tx.user.create({ data: { email, name: input.name, role: input.role, passwordHash, status: 'PENDING' }, select: publicUser });
    await tx.auditLog.create({ data: { userId: created.id, actionType: 'REGISTERED', actionDetails: JSON.stringify({ role: created.role }), ipAddress } });
    return created;
  });
  await notifyEmail(() => sendWelcomeEmail(user.email, user.name, user.role));
  return user;
}
export async function login(input: z.infer<typeof loginInput>, ipAddress?: string, userAgent?: string) {
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user) throw new ApiError(401, 'Invalid credentials.', 'INVALID_CREDENTIALS');
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new ApiError(403, 'Account is temporarily locked due to multiple failed login attempts. Try again later.', 'ACCOUNT_LOCKED');
  if (!await bcrypt.compare(input.password, user.passwordHash)) {
    const failed = await prisma.user.update({ where: { id: user.id }, data: { loginAttempts: { increment: 1 } } });
    if (failed.loginAttempts >= 5) await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() + 15 * 60000) } });
    await logAuditEvent(user.id, 'LOGIN_FAILED', { reason: 'Invalid password' }, ipAddress);
    throw new ApiError(401, 'Invalid credentials.', 'INVALID_CREDENTIALS');
  }
  if (user.status !== 'APPROVED') {
    await logAuditEvent(user.id, 'LOGIN_FAILED', { reason: `Account ${user.status}` }, ipAddress);
    throw new ApiError(403, `Your account is ${user.status.toLowerCase()}. Please contact management.`, 'ACCOUNT_NOT_APPROVED', [], true, { status: user.status });
  }
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  await storeRefreshToken(refreshToken, user.id, ipAddress, userAgent);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastLoginIp: ipAddress, loginAttempts: 0, lockedUntil: null } });
  await logAuditEvent(user.id, 'LOGIN_ATTEMPT', { status: 'successful' }, ipAddress);
  return { accessToken, refreshToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}
export const profile = (id: string) => prisma.user.findUniqueOrThrow({ where: { id }, select: { ...publicUser, department: true, lastLoginAt: true, createdAt: true } });
export async function changePassword(id: string, input: z.infer<typeof passwordInput>, ipAddress?: string) {
  if (input.newPassword !== input.confirmPassword) throw new ApiError(400, 'New passwords do not match.', 'PASSWORD_MISMATCH');
  if (input.currentPassword === input.newPassword) throw new ApiError(400, 'New password must be different from current password.', 'PASSWORD_UNCHANGED');
  enforcePassword(input.newPassword);
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  if (!await bcrypt.compare(input.currentPassword, user.passwordHash)) throw new ApiError(401, 'Current password is incorrect.', 'INVALID_CREDENTIALS');
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id }, data: { passwordHash, isPasswordChanged: true } });
    await tx.auditLog.create({ data: { userId: id, actionType: 'PASSWORD_CHANGED', actionDetails: '{}', ipAddress } });
  });
}
