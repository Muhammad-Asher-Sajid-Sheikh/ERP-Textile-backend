import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import type { Inquiry, Prisma, Role } from "../generated/client.js";
import type { BusinessContext } from "./business-audit.service.js";
export type WorkflowContext = BusinessContext;
export const personSelect = {
  id: true,
  name: true,
  role: true,
} satisfies Prisma.UserSelect;
export const AUTHORITY_DEPENDENCY =
  "Specialized provisional-work approval authority is not mapped";
export const TC01_DEPENDENCY =
  "Production/QA-approved TC-01 field applicability is not configured";
export async function currentActor(
  tx: Prisma.TransactionClient,
  context: WorkflowContext,
) {
  const user = await tx.user.findUnique({
    where: { id: context.actorId },
    select: { ...personSelect, status: true },
  });
  if (!user || user.status !== "APPROVED") {
    throw new ApiError(
      403,
      "An approved account is required",
      "ACCOUNT_NOT_APPROVED",
    );
  }
  return user;
}
export async function approvedEmployee(
  tx: Prisma.TransactionClient,
  id: string,
  roles: Role[],
) {
  const employee = await tx.user.findFirst({
    where: { id, status: "APPROVED", role: { in: roles } },
    select: personSelect,
  });
  if (!employee) {
    throw new ApiError(
      422,
      "The responsible employee must have an approved account and appropriate role",
      "INVALID_RESPONSIBLE_EMPLOYEE",
    );
  }
  return employee;
}
export function requireMarketingOwner(
  inquiry: Inquiry,
  user: {
    id: string;
    role: Role;
  },
) {
  if (user.role !== "MARKETING" || inquiry.createdById !== user.id) {
    throw new ApiError(
      403,
      "Only the inquiry's Marketing owner can perform this operation",
      "WORKFLOW_OWNER_REQUIRED",
    );
  }
}
export function requireAssignedMerchandiser(
  inquiry: Inquiry,
  user: {
    id: string;
    role: Role;
  },
) {
  if (user.role !== "MERCHANDISE" || inquiry.merchandiserId !== user.id) {
    throw new ApiError(
      403,
      "Only the assigned merchandiser can perform the completeness review",
      "ASSIGNED_MERCHANDISER_REQUIRED",
    );
  }
}
export function requireOpenInquiry(inquiry: Inquiry) {
  if (["CLOSED", "DUPLICATE_LINKED"].includes(inquiry.status)) {
    throw new ApiError(
      409,
      "Closed or duplicate-linked inquiries cannot be edited",
      "INQUIRY_NOT_EDITABLE",
    );
  }
}
export function requireRevision(actual: number, expected: number) {
  if (actual !== expected) {
    throw new ApiError(
      409,
      "The record changed; reload before continuing",
      "STALE_REVISION",
    );
  }
}
// Reuse WF-01's customer-first lock order so closure, assignment and new work cannot race.
export async function withWorkflow<T>(
  inquiryId: string,
  context: WorkflowContext,
  work: (
    tx: Prisma.TransactionClient,
    inquiry: Inquiry,
    user: Awaited<ReturnType<typeof currentActor>>,
  ) => Promise<T>,
  allowProduction: boolean | "FEASIBILITY" = false,
) {
  return prisma.$transaction(
    async (tx) => {
      const identity = await tx.inquiry.findUnique({
        where: { id: inquiryId },
        select: { customerId: true },
      });
      if (!identity) {
        throw new ApiError(404, "Inquiry not found", "INQUIRY_NOT_FOUND");
      }
      await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${identity.customerId} FOR UPDATE`;
      // Keep the acting account's authority stable until the business transaction commits.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${context.actorId} FOR SHARE`;
      const inquiry = await tx.inquiry.findUniqueOrThrow({
        where: { id: inquiryId },
      });
      const user = await currentActor(tx, context);
      let productionCanRead = false;
      if (user.role === "PRODUCTION") {
        if (allowProduction === "FEASIBILITY") {
          productionCanRead =
            (await tx.feasibilityAssessment.count({
              where: { inquiryId, productionReviewerId: user.id },
            })) > 0;
        } else if (allowProduction === true) {
          productionCanRead =
            (await tx.inquiryTechnicalReview.count({
              where: { inquiryId, productionReviewerId: user.id },
            })) > 0;
        }
      }
      const canRead =
        user.role === "MANAGEMENT" ||
        (user.role === "MARKETING" && inquiry.createdById === user.id) ||
        (user.role === "MERCHANDISE" && inquiry.merchandiserId === user.id) ||
        productionCanRead;
      if (!canRead) {
        throw new ApiError(404, "Inquiry not found", "INQUIRY_NOT_FOUND");
      }
      return work(tx, inquiry, user);
    },
    { maxWait: 10000, timeout: 15000 },
  );
}
export async function linkedEvidence(
  tx: Prisma.TransactionClient,
  inquiryId: string,
  evidenceId: string,
  written: boolean,
) {
  const evidence = await tx.inquiryEvidence.findFirst({
    where: { id: evidenceId, inquiryId },
    select: {
      id: true,
      source: true,
      receivedAt: true,
      corrections: { select: { id: true }, take: 1 },
    },
  });
  if (!evidence || evidence.corrections.length > 0) {
    throw new ApiError(
      422,
      "Use current original evidence from this inquiry",
      "INVALID_EVIDENCE_REFERENCE",
    );
  }
  if (written && !["EMAIL", "WHATSAPP", "WEBSITE"].includes(evidence.source)) {
    throw new ApiError(
      422,
      "Written confirmation requires email, WhatsApp or website evidence",
      "WRITTEN_EVIDENCE_REQUIRED",
    );
  }
  return evidence;
}
