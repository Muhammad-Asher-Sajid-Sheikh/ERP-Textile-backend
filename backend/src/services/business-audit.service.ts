import type { Prisma } from "../generated/client.js";
export type BusinessContext = {
  actorId: string;
  requestId: string;
};
export function businessAudit(
  tx: Prisma.TransactionClient,
  context: BusinessContext,
  action: string,
  entityType: string,
  entityId: string,
  oldValues?: Prisma.InputJsonValue,
  newValues?: Prisma.InputJsonValue,
  reason?: string,
) {
  return tx.businessAuditLog.create({
    data: {
      ...context,
      action,
      entityType,
      entityId,
      oldValues,
      newValues,
      reason,
    },
  });
}
// Convert only explicitly selected business DTOs, never raw User or attachment records.
export const auditValues = (value: unknown): Prisma.InputJsonValue => {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
};
