import type { z } from "zod";
import type { Prisma } from "../generated/client.js";
import { ApiError } from "../utils/ApiError.js";
import { businessAudit, auditValues } from "./business-audit.service.js";
import {
  approvedEmployee,
  linkedEvidence,
  requireMarketingOwner,
  requireOpenInquiry,
  requireRevision,
  withWorkflow,
  type WorkflowContext,
  personSelect,
} from "./workflow-access.service.js";
import type {
  clarificationInput,
  clarificationUpdateInput,
  clarificationResponseInput,
  escalationInput,
  Page,
} from "../validators/workflow.validator.js";
export const clarificationInclude = {
  responsible: { select: personSelect },
  questions: {
    orderBy: { id: "asc" },
    include: { responses: { orderBy: { sequence: "desc" } } },
  },
} satisfies Prisma.CustomerClarificationInclude;
export async function findClarification(
  tx: Prisma.TransactionClient,
  inquiryId: string,
  clarificationId: string,
) {
  const clarification = await tx.customerClarification.findFirst({
    where: { id: clarificationId, inquiryId },
    include: clarificationInclude,
  });
  if (!clarification) {
    throw new ApiError(
      404,
      "Clarification not found",
      "CLARIFICATION_NOT_FOUND",
    );
  }
  return clarification;
}
export function clarificationSummary(
  clarification: Awaited<ReturnType<typeof findClarification>>,
  inquiryStatus: string,
) {
  const pendingQuestions = clarification.questions.filter((question) => {
    return question.confirmation !== "WRITTEN_CONFIRMED";
  });
  let outcome = "RESPONDED";
  if (inquiryStatus === "CLOSED") {
    outcome = "INQUIRY_CLOSED";
  } else if (clarification.customerHold) {
    outcome = "CUSTOMER_HOLD";
  } else if (pendingQuestions.length > 0) {
    outcome = "CLARIFICATION_PENDING";
  }
  return {
    ...clarification,
    outcome,
    pendingQuestionCount: pendingQuestions.length,
    responseAgeDays: Math.max(
      0,
      Math.floor((Date.now() - clarification.requestedAt.getTime()) / 86400000),
    ),
    overdue:
      inquiryStatus !== "CLOSED" &&
      pendingQuestions.length > 0 &&
      clarification.followUpAt < new Date(),
  };
}
export async function createClarification(
  inquiryId: string,
  input: z.infer<typeof clarificationInput>,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireOpenInquiry(inquiry);
    requireMarketingOwner(inquiry, user);
    await approvedEmployee(tx, input.responsibleId, [
      "MARKETING",
      "MERCHANDISE",
    ]);
    if (
      input.responsibleId !== inquiry.createdById &&
      input.responsibleId !== inquiry.merchandiserId
    ) {
      throw new ApiError(
        422,
        "Assign clarification to the inquiry owner or assigned merchandiser",
        "INVALID_RESPONSIBLE_EMPLOYEE",
      );
    }
    if (input.requestedAt < inquiry.receivedAt) {
      throw new ApiError(
        422,
        "Clarification cannot precede inquiry receipt",
        "INVALID_CLARIFICATION_DATE",
      );
    }
    for (const question of input.questions) {
      if (
        question.reviewItemId &&
        !(await tx.technicalReviewItem.findFirst({
          where: { id: question.reviewItemId, review: { inquiryId } },
        }))
      ) {
        throw new ApiError(
          422,
          "Question must reference a review item on this inquiry",
          "INVALID_REVIEW_ITEM",
        );
      }
    }
    const { questions, ...fields } = input;
    const clarification = await tx.customerClarification.create({
      data: {
        ...fields,
        inquiryId,
        createdById: user.id,
        questions: { create: questions },
      },
      include: clarificationInclude,
    });
    await businessAudit(
      tx,
      context,
      "CLARIFICATION_REQUESTED",
      "Inquiry",
      inquiryId,
      undefined,
      auditValues(clarification),
    );
    return clarificationSummary(clarification, inquiry.status);
  });
}
export async function updateClarification(
  inquiryId: string,
  clarificationId: string,
  input: z.infer<typeof clarificationUpdateInput>,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireOpenInquiry(inquiry);
    requireMarketingOwner(inquiry, user);
    const previous = await findClarification(tx, inquiryId, clarificationId);
    requireRevision(previous.revision, input.expectedRevision);
    if (input.responsibleId) {
      await approvedEmployee(tx, input.responsibleId, [
        "MARKETING",
        "MERCHANDISE",
      ]);
      if (
        input.responsibleId !== inquiry.createdById &&
        input.responsibleId !== inquiry.merchandiserId
      ) {
        throw new ApiError(
          422,
          "Assign clarification to the inquiry owner or assigned merchandiser",
          "INVALID_RESPONSIBLE_EMPLOYEE",
        );
      }
    }
    const dueAt = input.dueAt ?? previous.dueAt;
    const followUpAt = input.followUpAt ?? previous.followUpAt;
    if (followUpAt < previous.requestedAt || followUpAt > dueAt) {
      throw new ApiError(
        422,
        "Use request <= follow-up <= due dates",
        "INVALID_CLARIFICATION_DATE",
      );
    }
    const { expectedRevision: _revision, reason, ...fields } = input;
    const updated = await tx.customerClarification.update({
      where: { id: clarificationId },
      data: { ...fields, revision: { increment: 1 } },
      include: clarificationInclude,
    });
    await businessAudit(
      tx,
      context,
      "CLARIFICATION_UPDATED",
      "Inquiry",
      inquiryId,
      auditValues(previous),
      auditValues(updated),
      reason,
    );
    return clarificationSummary(updated, inquiry.status);
  });
}
export async function respond(
  inquiryId: string,
  clarificationId: string,
  input: z.infer<typeof clarificationResponseInput>,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireOpenInquiry(inquiry);
    requireMarketingOwner(inquiry, user);
    const clarification = await findClarification(
      tx,
      inquiryId,
      clarificationId,
    );
    const question = clarification.questions.find((entry) => {
      return entry.id === input.questionId;
    });
    if (!question) {
      throw new ApiError(
        422,
        "Question does not belong to this clarification",
        "INVALID_QUESTION",
      );
    }
    const evidence = await linkedEvidence(
      tx,
      inquiryId,
      input.evidenceId,
      input.confirmation === "WRITTEN_CONFIRMED",
    );
    if (
      input.receivedAt < clarification.requestedAt ||
      input.receivedAt.getTime() !== evidence.receivedAt.getTime()
    ) {
      throw new ApiError(
        422,
        "Response date must match its evidence and follow the request",
        "INVALID_RESPONSE_DATE",
      );
    }
    const previousResponse = question.responses[0];
    if (previousResponse && input.receivedAt < previousResponse.receivedAt) {
      throw new ApiError(
        422,
        "A new response cannot predate the latest recorded answer",
        "INVALID_RESPONSE_DATE",
      );
    }
    const response = await tx.clarificationResponse.create({
      data: {
        ...input,
        sequence: (previousResponse?.sequence ?? 0) + 1,
        recordedById: user.id,
      },
    });
    await tx.clarificationQuestion.update({
      where: { id: question.id },
      data: { confirmation: input.confirmation },
    });
    await tx.customerClarification.update({
      where: { id: clarificationId },
      data: { revision: { increment: 1 } },
    });
    // Persist an in-app impact notice. Do not send customer emails or change a frozen baseline.
    await businessAudit(
      tx,
      context,
      "CLARIFICATION_RESPONSE_RECORDED",
      "Inquiry",
      inquiryId,
      undefined,
      auditValues({
        ...response,
        affectedOwnerIds: [inquiry.createdById, inquiry.merchandiserId],
        requiresBaselineReview: true,
      }),
    );
    return response;
  });
}
export async function escalate(
  inquiryId: string,
  clarificationId: string,
  input: z.infer<typeof escalationInput>,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireOpenInquiry(inquiry);
    requireMarketingOwner(inquiry, user);
    const previous = await findClarification(tx, inquiryId, clarificationId);
    requireRevision(previous.revision, input.expectedRevision);
    if (
      previous.questions.every((question) => {
        return question.confirmation === "WRITTEN_CONFIRMED";
      })
    ) {
      throw new ApiError(
        409,
        "No unanswered clarification remains to escalate",
        "CLARIFICATION_RESOLVED",
      );
    }
    const updated = await tx.customerClarification.update({
      where: { id: clarificationId },
      data: {
        escalationReason: input.reason,
        escalatedAt: new Date(),
        revision: { increment: 1 },
      },
      include: clarificationInclude,
    });
    await businessAudit(
      tx,
      context,
      "CLARIFICATION_ESCALATED",
      "Inquiry",
      inquiryId,
      auditValues(previous),
      auditValues(updated),
      input.reason,
    );
    return clarificationSummary(updated, inquiry.status);
  });
}
export async function getClarification(
  inquiryId: string,
  clarificationId: string,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry) => {
    const clarification = await findClarification(
      tx,
      inquiryId,
      clarificationId,
    );
    return clarificationSummary(clarification, inquiry.status);
  });
}
export async function listClarifications(
  inquiryId: string,
  page: Page,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry) => {
    const where = { inquiryId };
    const clarifications = await tx.customerClarification.findMany({
      where,
      include: clarificationInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    });
    const total = await tx.customerClarification.count({ where });
    return {
      data: clarifications.map((entry) => {
        return clarificationSummary(entry, inquiry.status);
      }),
      meta: { ...page, total },
    };
  });
}

// Customer changes are visible to the two affected workflow owners without exposing all Management audit data.
export async function listWorkflowNotices(
  inquiryId: string,
  page: Page,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx) => {
    const where = {
      entityType: "Inquiry",
      entityId: inquiryId,
      action: "CLARIFICATION_RESPONSE_RECORDED",
    };
    const notices = await tx.businessAuditLog.findMany({
      where,
      select: { id: true, createdAt: true, newValues: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    });
    const total = await tx.businessAuditLog.count({ where });
    return { data: notices, meta: { ...page, total } };
  });
}
