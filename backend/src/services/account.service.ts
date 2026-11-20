import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { publicUser, notifyEmail } from './auth.service.js';
import { sendAccountApprovedEmail, sendAccountRejectedEmail, sendAccountSuspendedEmail, sendRoleChangedEmail } from './mailer.js';
import type { Role, AuditActionType, Prisma } from '../generated/client.js';

export const pendingUsers = () => prisma.user.findMany({ where: { status: 'PENDING' }, select: { ...publicUser, createdAt: true }, orderBy: { createdAt: 'asc' } });
type Action = 'approve' | 'reject' | 'suspend' | 'role';
export async function updateAccount(id: string, action: Action, performedBy: string, ipAddress?: string, reason?: string, role?: Role) {
  const result = await prisma.$transaction(async tx => {
    // Serialize account decisions so their preconditions and audit records stay consistent.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(404, 'User not found.', 'USER_NOT_FOUND');
    const data: Prisma.UserUpdateInput = {};
    let actionType: AuditActionType;
    let details: Record<string, string>;
    if (action === 'approve') {
      if (user.status === 'APPROVED') throw new ApiError(400, 'User is already approved.', 'ACCOUNT_ALREADY_APPROVED');
      data.status = 'APPROVED'; actionType = 'APPROVED'; details = { approvedBy: performedBy };
    } else if (action === 'reject') {
      if (user.status !== 'PENDING') throw new ApiError(400, 'Can only reject pending users.', 'INVALID_ACCOUNT_STATE');
      data.status = 'REJECTED'; actionType = 'REJECTED'; details = { reason: reason || 'No reason provided', rejectedBy: performedBy };
    } else if (action === 'suspend') {
      if (user.status === 'SUSPENDED') throw new ApiError(400, 'User is already suspended.', 'ACCOUNT_ALREADY_SUSPENDED');
      data.status = 'SUSPENDED'; actionType = 'SUSPENDED'; details = { reason: reason || 'No reason provided', suspendedBy: performedBy };
    } else {
      if (!role) throw new ApiError(400, 'New role is required.', 'ROLE_REQUIRED');
      if (user.role === role) throw new ApiError(400, 'User already has this role.', 'ROLE_UNCHANGED');
      data.role = role; actionType = 'ROLE_CHANGED'; details = { oldRole: user.role, newRole: role, changedBy: performedBy };
    }
    const updated = await tx.user.update({ where: { id }, data, select: publicUser });
    await tx.auditLog.create({ data: { userId: id, actionType, actionDetails: JSON.stringify(details), performedBy, ipAddress } });
    return { updated, oldRole: user.role };
  });
  const u = result.updated;
  if (action === 'approve') await notifyEmail(() => sendAccountApprovedEmail(u.email, u.name, u.role));
  if (action === 'reject') await notifyEmail(() => sendAccountRejectedEmail(u.email, u.name, reason));
  if (action === 'suspend') await notifyEmail(() => sendAccountSuspendedEmail(u.email, u.name, reason));
  if (action === 'role') await notifyEmail(() => sendRoleChangedEmail(u.email, u.name, u.role, result.oldRole));
  if (action === 'role') return { id: u.id, email: u.email, name: u.name, oldRole: result.oldRole, newRole: u.role };
  if (action === 'reject' || action === 'suspend') return { id: u.id, email: u.email, name: u.name, status: u.status };
  return u;
}
