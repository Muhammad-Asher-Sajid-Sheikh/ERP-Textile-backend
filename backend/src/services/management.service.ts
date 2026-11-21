import type { z } from "zod";
import type { Prisma } from "../generated/client.js";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { businessAudit, auditValues } from "./business-audit.service.js";
import { findReview } from "./technical-review.service.js";
import {
  AUTHORITY_DEPENDENCY,
  TC01_DEPENDENCY,
  approvedEmployee,
  currentActor,
  personSelect,
  requireMarketingOwner,
  requireOpenInquiry,
  withWorkflow,
  type WorkflowContext,
} from "./workflow-access.service.js";
import type {
  provisionalInput,
  provisionalDecisionInput,
  overviewQuery,
  escalationQuery,
  provisionalQuery,
} from "../validators/workflow.validator.js";
async function requireManagement(
  tx: Prisma.TransactionClient,
  context: WorkflowContext,
) {
  const user = await currentActor(tx, context);
  if (user.role !== "MANAGEMENT") {
    throw new ApiError(
      403,
      "Management access is required",
      "PERMISSION_DENIED",
    );
  }
  return user;
}
const requestInclude = {
  requestedBy: { select: personSelect },
  reviewer: { select: personSelect },
  review: { select: { id: true, version: true, outcome: true } },
  decisions: { include: { recordedBy: { select: personSelect } } },
} satisfies Prisma.ProvisionalReviewRequestInclude;
function requestResponse(
  request: Prisma.ProvisionalReviewRequestGetPayload<{
    include: typeof requestInclude;
  }>,
) {
  let effectiveState: string = "PENDING_AUTHORITY_MAPPING";
  if (request.decisions[0]) {
    effectiveState = request.decisions[0].disposition;
  } else if (request.expiresAt && request.expiresAt <= new Date()) {
    effectiveState = "EXPIRED";
  }
  return {
    ...request,
    effectiveState,
    authorityDependency: AUTHORITY_DEPENDENCY,
    provisionalWorkAuthorized: false,
    quotationIssuanceAllowed: false,
  };
}
export async function createProvisionalRequest(
  inquiryId: string,
  input: z.infer<typeof provisionalInput>,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireOpenInquiry(inquiry);
    requireMarketingOwner(inquiry, user);
    const review = await findReview(tx, inquiryId, input.reviewId);
    if (!review.submittedAt) {
      throw new ApiError(
        409,
        "Provisional review requires an immutable submitted review version",
        "REVIEW_NOT_SUBMITTED",
      );
    }
    const latest = await tx.inquiryTechnicalReview.findFirst({
      where: { inquiryId },
      orderBy: { version: "desc" },
    });
    if (latest?.id !== review.id) {
      throw new ApiError(
        409,
        "Use the current technical-review version",
        "STALE_REVIEW_VERSION",
      );
    }
    await approvedEmployee(tx, input.reviewerId, ["MANAGEMENT"]);
    if (input.expiresAt && input.expiresAt <= new Date()) {
      throw new ApiError(
        422,
        "Request expiry must be in the future",
        "INVALID_EXPIRY",
      );
    }
    const missingInformation = review.items.filter((item) => {
      return !["VERIFIED", "NOT_APPLICABLE"].includes(item.state);
    });
    if (missingInformation.length === 0) {
      throw new ApiError(
        422,
        "A provisional request must identify unresolved information",
        "NO_PROVISIONAL_SCOPE",
      );
    }
    const request = await tx.provisionalReviewRequest.create({
      data: {
        ...input,
        inquiryId,
        requestedById: user.id,
        missingInformation: auditValues(missingInformation),
      },
      include: requestInclude,
    });
    await businessAudit(
      tx,
      context,
      "PROVISIONAL_REVIEW_REQUESTED",
      "Inquiry",
      inquiryId,
      undefined,
      auditValues(request),
    );
    return requestResponse(request);
  });
}
export async function decideProvisionalRequest(
  requestId: string,
  input: z.infer<typeof provisionalDecisionInput>,
  context: WorkflowContext,
) {
  const identity = await prisma.provisionalReviewRequest.findUnique({
    where: { id: requestId },
    select: { inquiryId: true },
  });
  if (!identity) {
    throw new ApiError(
      404,
      "Provisional request not found",
      "PROVISIONAL_REQUEST_NOT_FOUND",
    );
  }
  return withWorkflow(identity.inquiryId, context, async (tx, inquiry) => {
    requireOpenInquiry(inquiry);
    const reviewer = await requireManagement(tx, context);
    const request = await tx.provisionalReviewRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: requestInclude,
    });
    if (request.reviewerId !== reviewer.id) {
      throw new ApiError(
        403,
        "Only the assigned Management reviewer can record a disposition",
        "REVIEWER_REQUIRED",
      );
    }
    if (input.reviewId !== request.reviewId) {
      throw new ApiError(
        409,
        "The decision must reference the request's exact review version",
        "REVIEW_VERSION_MISMATCH",
      );
    }
    const latest = await tx.inquiryTechnicalReview.findFirst({
      where: { inquiryId: inquiry.id },
      orderBy: { version: "desc" },
    });
    if (latest?.id !== request.reviewId) {
      throw new ApiError(
        409,
        "A newer technical review requires a new provisional request",
        "STALE_REVIEW_VERSION",
      );
    }
    if (request.decisions.length > 0) {
      throw new ApiError(
        409,
        "This request already has a disposition; retain it and create a new request",
        "REQUEST_ALREADY_REVIEWED",
      );
    }
    if (request.expiresAt && request.expiresAt <= new Date()) {
      throw new ApiError(
        409,
        "The provisional request has expired",
        "REQUEST_EXPIRED",
      );
    }
    if (input.disposition === "APPROVED" || input.disposition === "REVOKED") {
      throw new ApiError(
        409,
        AUTHORITY_DEPENDENCY,
        "APPROVAL_AUTHORITY_UNCONFIGURED",
      );
    }
    const decision = await tx.provisionalReviewDecision.create({
      data: {
        requestId,
        disposition: input.disposition,
        reason: input.reason,
        conditions: input.conditions,
        recordedById: reviewer.id,
      },
    });
    await businessAudit(
      tx,
      context,
      "PROVISIONAL_REVIEW_DISPOSITION_RECORDED",
      "Inquiry",
      inquiry.id,
      undefined,
      auditValues({ ...decision, reviewId: request.reviewId }),
    );
    const updated = await tx.provisionalReviewRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: requestInclude,
    });
    return requestResponse(updated);
  });
}
export async function getProvisionalRequest(
  requestId: string,
  context: WorkflowContext,
) {
  return prisma.$transaction(async (tx) => {
    await requireManagement(tx, context);
    const request = await tx.provisionalReviewRequest.findUnique({
      where: { id: requestId },
      include: requestInclude,
    });
    if (!request) {
      throw new ApiError(
        404,
        "Provisional request not found",
        "PROVISIONAL_REQUEST_NOT_FOUND",
      );
    }
    return requestResponse(request);
  });
}
export async function listProvisionalRequests(
  query: z.infer<typeof provisionalQuery>,
  context: WorkflowContext,
) {
  return prisma.$transaction(async (tx) => {
    await requireManagement(tx, context);
    const where = { inquiryId: query.inquiryId, reviewerId: query.reviewerId };
    const data = await tx.provisionalReviewRequest.findMany({
      where,
      include: requestInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const total = await tx.provisionalReviewRequest.count({ where });
    return {
      data: data.map(requestResponse),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  });
}
const oversightInclude = {
  customer: { select: { id: true, code: true, name: true } },
  createdBy: { select: personSelect },
  merchandiser: { select: personSelect },
  technicalReviews: {
    orderBy: { version: "desc" },
    take: 1,
    include: { items: true },
  },
  baselines: {
    where: { frozenAt: { not: null } },
    orderBy: { version: "desc" },
    take: 1,
  },
  clarifications: {
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      subject: true,
      requestedAt: true,
      dueAt: true,
      followUpAt: true,
      customerHold: true,
      escalationReason: true,
      escalatedAt: true,
      questions: {
        select: {
          confirmation: true,
          responses: {
            orderBy: { sequence: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      },
    },
  },
} satisfies Prisma.InquiryInclude;
function oversightResponse(
  inquiry: Prisma.InquiryGetPayload<{
    include: typeof oversightInclude;
  }>,
) {
  const currentReview = inquiry.technicalReviews[0] ?? null;
  const currentBaseline = inquiry.baselines[0] ?? null;
  const pending = inquiry.clarifications.filter((clarification) => {
    return clarification.questions.some((question) => {
      return question.confirmation !== "WRITTEN_CONFIRMED";
    });
  });
  const closed =
    inquiry.status === "CLOSED" || inquiry.status === "DUPLICATE_LINKED";
  const changedSinceBaseline =
    currentBaseline !== null &&
    (currentReview?.id !== currentBaseline.reviewId ||
      inquiry.clarifications.some((clarification) => {
        return clarification.questions.some((question) => {
          const response = question.responses[0];
          return response && response.createdAt > currentBaseline.frozenAt!;
        });
      }));
  let workflowOutcome: string =
    currentBaseline?.outcome ?? "CLARIFICATION_PENDING";
  if (inquiry.status === "CLOSED") {
    workflowOutcome = "INQUIRY_CLOSED";
  } else if (
    inquiry.status === "ON_HOLD" ||
    inquiry.clarifications.some((clarification) => {
      return clarification.customerHold;
    })
  ) {
    workflowOutcome = "CUSTOMER_HOLD";
  } else if (changedSinceBaseline || pending.length > 0) {
    workflowOutcome = "CLARIFICATION_PENDING";
  }
  return {
    id: inquiry.id,
    irn: inquiry.irn,
    customer: inquiry.customer,
    owner: inquiry.createdBy,
    merchandiser: inquiry.merchandiser,
    status: inquiry.status,
    currentReview,
    currentBaseline,
    pendingClarifications: pending,
    overdueFollowUps: closed
      ? []
      : pending.filter((clarification) => {
          return clarification.followUpAt < new Date();
        }),
    outstandingEscalations: closed
      ? []
      : pending.filter((clarification) => {
          return clarification.escalatedAt !== null;
        }),
    missingInformationEscalations: closed
      ? []
      : (currentReview?.items.filter((item) => {
          return (
            item.escalationReason &&
            ["MISSING", "UNVERIFIED"].includes(item.state)
          );
        }) ?? []),
    technicalHold:
      currentReview?.outcome === "TECHNICAL_REVIEW_PENDING" ||
      currentReview?.outcome === "NOT_FEASIBLE" ||
      Boolean(
        currentReview &&
          !currentReview.submittedAt &&
          currentReview.items.some((item) => {
            return item.needsProduction;
          }),
      ),
    requiresBaselineReview: changedSinceBaseline,
    workflowOutcome,
    applicabilityDependency: TC01_DEPENDENCY,
    authorityDependency: AUTHORITY_DEPENDENCY,
    formalCostingAllowed: false,
    quotationIssuanceAllowed: false,
  };
}
export async function inquiryOverview(
  query: z.infer<typeof overviewQuery>,
  context: WorkflowContext,
) {
  return prisma.$transaction(async (tx) => {
    await requireManagement(tx, context);
    const where: Prisma.InquiryWhereInput = {
      customerId: query.customerId,
      merchandiserId: query.merchandiserId,
      status: query.status,
    };
    if (query.reviewOutcome) {
      // Filter the latest version, not an older review that happened to have this outcome.
      const matching = await tx.$queryRaw<
        {
          id: string;
        }[]
      >`
        SELECT "inquiryId" AS "id" FROM (
          SELECT DISTINCT ON ("inquiryId") "inquiryId", "outcome"
          FROM "InquiryTechnicalReview" ORDER BY "inquiryId", "version" DESC
        ) latest WHERE "outcome" = ${query.reviewOutcome}::"TechnicalReviewOutcome"`;
      where.id = {
        in: matching.map((review) => {
          return review.id;
        }),
      };
    }
    if (query.overdue !== undefined) {
      const overdue: Prisma.InquiryWhereInput = {
        status: { notIn: ["CLOSED", "DUPLICATE_LINKED"] },
        clarifications: {
          some: {
            followUpAt: { lt: new Date() },
            questions: { some: { confirmation: { not: "WRITTEN_CONFIRMED" } } },
          },
        },
      };
      where.AND = query.overdue === "true" ? [overdue] : [{ NOT: overdue }];
    }
    const data = await tx.inquiry.findMany({
      where,
      include: oversightInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const total = await tx.inquiry.count({ where });
    return {
      data: data.map(oversightResponse),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  });
}
export async function inquirySummary(
  inquiryId: string,
  context: WorkflowContext,
) {
  return prisma.$transaction(async (tx) => {
    await requireManagement(tx, context);
    const inquiry = await tx.inquiry.findUnique({
      where: { id: inquiryId },
      include: oversightInclude,
    });
    if (!inquiry) {
      throw new ApiError(404, "Inquiry not found", "INQUIRY_NOT_FOUND");
    }
    return oversightResponse(inquiry);
  });
}
export async function clarificationEscalations(
  query: z.infer<typeof escalationQuery>,
  context: WorkflowContext,
) {
  return prisma.$transaction(async (tx) => {
    await requireManagement(tx, context);
    const where: Prisma.CustomerClarificationWhereInput = {
      inquiryId: query.inquiryId,
      responsibleId: query.responsibleId,
      inquiry: { status: { notIn: ["CLOSED", "DUPLICATE_LINKED"] } },
      questions: { some: { confirmation: { not: "WRITTEN_CONFIRMED" } } },
      OR: [{ escalatedAt: { not: null } }, { followUpAt: { lt: new Date() } }],
    };
    if (query.overdue !== undefined) {
      where.followUpAt =
        query.overdue === "true" ? { lt: new Date() } : { gte: new Date() };
    }
    const data = await tx.customerClarification.findMany({
      where,
      include: {
        responsible: { select: personSelect },
        questions: true,
        inquiry: { select: { id: true, irn: true } },
      },
      orderBy: [{ followUpAt: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const total = await tx.customerClarification.count({ where });
    return {
      data,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  });
}
