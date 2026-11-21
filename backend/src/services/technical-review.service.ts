import type { z } from "zod";
import type { Prisma } from "../generated/client.js";
import { ApiError } from "../utils/ApiError.js";
import { auditValues, businessAudit } from "./business-audit.service.js";
import {
  approvedEmployee,
  linkedEvidence,
  personSelect,
  requireAssignedMerchandiser,
  requireMarketingOwner,
  requireOpenInquiry,
  requireRevision,
  TC01_DEPENDENCY,
  withWorkflow,
  type WorkflowContext,
} from "./workflow-access.service.js";
import type {
  ReviewInput,
  UpdateReviewInput,
  Page,
  submitReviewInput,
  consultationInput,
} from "../validators/workflow.validator.js";
export const reviewInclude = {
  items: { orderBy: { key: "asc" } },
  consultations: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { recordedBy: { select: personSelect } },
  },
  createdBy: { select: personSelect },
  submittedBy: { select: personSelect },
  productionReviewer: { select: personSelect },
} satisfies Prisma.InquiryTechnicalReviewInclude;
export async function findReview(
  tx: Prisma.TransactionClient,
  inquiryId: string,
  reviewId: string,
) {
  const review = await tx.inquiryTechnicalReview.findFirst({
    where: { id: reviewId, inquiryId },
    include: reviewInclude,
  });
  if (!review) {
    throw new ApiError(404, "Technical review not found", "REVIEW_NOT_FOUND");
  }
  return review;
}
function requireDraft(review: { submittedAt: Date | null }) {
  if (review.submittedAt) {
    throw new ApiError(
      409,
      "Submitted reviews are immutable; create a new review version",
      "REVIEW_FROZEN",
    );
  }
}
async function validateReview(
  tx: Prisma.TransactionClient,
  inquiry: { id: string; createdById: string; merchandiserId: string },
  input: ReviewInput,
) {
  if (input.productionReviewerId) {
    await approvedEmployee(tx, input.productionReviewerId, ["PRODUCTION"]);
  }
  for (const item of input.items) {
    if (item.ownerId) {
      const participants = [
        inquiry.createdById,
        inquiry.merchandiserId,
        input.productionReviewerId,
      ];
      if (!participants.includes(item.ownerId)) {
        throw new ApiError(
          422,
          "Assign missing information to an inquiry participant",
          "INVALID_RESPONSIBLE_EMPLOYEE",
        );
      }
      await approvedEmployee(tx, item.ownerId, [
        "MARKETING",
        "MERCHANDISE",
        "PRODUCTION",
      ]);
    }
    if (item.evidenceId) {
      await linkedEvidence(
        tx,
        inquiry.id,
        item.evidenceId,
        item.state === "VERIFIED",
      );
    }
    if (item.needsProduction && !input.productionReviewerId) {
      throw new ApiError(
        422,
        "Assign Production for items requiring technical consultation",
        "PRODUCTION_REVIEWER_REQUIRED",
      );
    }
  }
}
export function reviewReadiness(
  review: Awaited<ReturnType<typeof findReview>>,
) {
  const missingInformation = review.items.filter((item) => {
    return item.state === "MISSING" || item.state === "UNVERIFIED";
  });
  const quotationBlockers = review.items.filter((item) => {
    return (
      item.requiredFor.includes("QUOTATION") &&
      !["VERIFIED", "NOT_APPLICABLE"].includes(item.state)
    );
  });
  return {
    ...review,
    missingInformation,
    quotationBlockers,
    applicabilityDependency: TC01_DEPENDENCY,
    // An entered reference does not constitute an approved field dictionary or costing release.
    formalCostingAllowed: false,
    quotationIssuanceAllowed: false,
  };
}
export async function createReview(
  inquiryId: string,
  input: ReviewInput,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireOpenInquiry(inquiry);
    if (user.role === "MARKETING") {
      requireMarketingOwner(inquiry, user);
    } else {
      requireAssignedMerchandiser(inquiry, user);
    }
    await validateReview(tx, inquiry, input);
    const previous = await tx.inquiryTechnicalReview.findFirst({
      where: { inquiryId },
      orderBy: { version: "desc" },
    });
    if (previous && !previous.submittedAt) {
      throw new ApiError(
        409,
        "Finish the existing draft before creating another review",
        "REVIEW_DRAFT_EXISTS",
      );
    }
    const { items, ...fields } = input;
    const review = await tx.inquiryTechnicalReview.create({
      data: {
        ...fields,
        inquiryId,
        version: (previous?.version ?? 0) + 1,
        createdById: user.id,
        items: { create: items },
      },
      include: reviewInclude,
    });
    await businessAudit(
      tx,
      context,
      "TECHNICAL_REVIEW_CREATED",
      "Inquiry",
      inquiryId,
      undefined,
      auditValues(review),
    );
    return reviewReadiness(review);
  });
}
export async function updateReview(
  inquiryId: string,
  reviewId: string,
  input: UpdateReviewInput,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireOpenInquiry(inquiry);
    requireAssignedMerchandiser(inquiry, user);
    const review = await findReview(tx, inquiryId, reviewId);
    requireDraft(review);
    requireRevision(review.revision, input.expectedRevision);
    await validateReview(tx, inquiry, input);
    // Keep item IDs stable because clarification questions can refer to them.
    if (
      review.items.some((item) => {
        return !input.items.some((replacement) => {
          return replacement.key === item.key;
        });
      })
    ) {
      throw new ApiError(
        422,
        "Retain existing item keys; mark inapplicable items explicitly",
        "REVIEW_ITEM_REMOVAL_FORBIDDEN",
      );
    }
    const { items, expectedRevision: _expected, ...fields } = input;
    for (const item of items) {
      await tx.technicalReviewItem.upsert({
        where: { reviewId_key: { reviewId, key: item.key } },
        create: { ...item, reviewId },
        update: item,
      });
    }
    const updated = await tx.inquiryTechnicalReview.update({
      where: { id: reviewId },
      data: { ...fields, revision: { increment: 1 } },
      include: reviewInclude,
    });
    await businessAudit(
      tx,
      context,
      "TECHNICAL_REVIEW_UPDATED",
      "Inquiry",
      inquiryId,
      auditValues(review),
      auditValues(updated),
    );
    return reviewReadiness(updated);
  });
}
export async function submitReview(
  inquiryId: string,
  reviewId: string,
  input: z.infer<typeof submitReviewInput>,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireOpenInquiry(inquiry);
    requireAssignedMerchandiser(inquiry, user);
    const review = await findReview(tx, inquiryId, reviewId);
    requireDraft(review);
    requireRevision(review.revision, input.expectedRevision);
    const consultation = review.consultations.find((entry) => {
      return entry.reviewRevision === review.revision;
    });
    const needsProduction = review.items.some((item) => {
      return item.needsProduction;
    });
    const positiveOutcome = [
      "COMPLETE_FOR_CLARIFICATION_BASELINE",
      "FEASIBLE_WITH_ASSUMPTIONS",
    ].includes(input.outcome);
    if (
      positiveOutcome &&
      needsProduction &&
      (!consultation || consultation.conclusion !== "SUPPORTED")
    ) {
      throw new ApiError(
        409,
        "Current Production support is required for a positive technical outcome",
        "TECHNICAL_HOLD",
      );
    }
    if (
      input.outcome === "NOT_FEASIBLE" &&
      (!consultation || consultation.conclusion !== "NOT_FEASIBLE")
    ) {
      throw new ApiError(
        409,
        "A not-feasible conclusion must be recorded by Production",
        "PRODUCTION_CONCLUSION_REQUIRED",
      );
    }
    if (
      input.outcome === "COMPLETE_FOR_CLARIFICATION_BASELINE" &&
      review.items.some((item) => {
        return !["VERIFIED", "NOT_APPLICABLE"].includes(item.state);
      })
    ) {
      throw new ApiError(
        409,
        "Unresolved information cannot be marked complete",
        "INCOMPLETE_REVIEW",
      );
    }
    if (
      input.outcome === "FEASIBLE_WITH_ASSUMPTIONS" &&
      review.assumptions.length === 0 &&
      !review.items.some((item) => {
        return item.state === "ASSUMED";
      })
    ) {
      throw new ApiError(
        422,
        "Record the assumptions explicitly",
        "ASSUMPTIONS_REQUIRED",
      );
    }
    for (const item of review.items) {
      if (item.evidenceId) {
        await linkedEvidence(
          tx,
          inquiryId,
          item.evidenceId,
          item.state === "VERIFIED",
        );
      }
    }
    const updated = await tx.inquiryTechnicalReview.update({
      where: { id: reviewId },
      data: {
        outcome: input.outcome,
        submittedAt: new Date(),
        submittedById: user.id,
      },
      include: reviewInclude,
    });
    await businessAudit(
      tx,
      context,
      "TECHNICAL_REVIEW_SUBMITTED",
      "Inquiry",
      inquiryId,
      auditValues(review),
      auditValues(updated),
      input.reason,
    );
    return reviewReadiness(updated);
  });
}
export async function recordConsultation(
  inquiryId: string,
  reviewId: string,
  input: z.infer<typeof consultationInput>,
  context: WorkflowContext,
) {
  return withWorkflow(
    inquiryId,
    context,
    async (tx, inquiry, user) => {
      requireOpenInquiry(inquiry);
      const review = await findReview(tx, inquiryId, reviewId);
      if (
        user.role !== "PRODUCTION" ||
        review.productionReviewerId !== user.id
      ) {
        throw new ApiError(
          403,
          "Only the assigned Production reviewer can record technical findings",
          "PRODUCTION_REVIEWER_REQUIRED",
        );
      }
      requireDraft(review);
      requireRevision(review.revision, input.expectedRevision);
      const { expectedRevision, ...fields } = input;
      const consultation = await tx.productionConsultation.create({
        data: {
          ...fields,
          reviewId,
          reviewRevision: expectedRevision,
          recordedById: user.id,
        },
      });
      await businessAudit(
        tx,
        context,
        "PRODUCTION_CONSULTATION_RECORDED",
        "Inquiry",
        inquiryId,
        undefined,
        auditValues(consultation),
      );
      return consultation;
    },
    true,
  );
}
export async function getReview(
  inquiryId: string,
  reviewId: string,
  context: WorkflowContext,
) {
  return withWorkflow(
    inquiryId,
    context,
    async (tx, _inquiry, user) => {
      const review = await findReview(tx, inquiryId, reviewId);
      if (
        user.role === "PRODUCTION" &&
        review.productionReviewerId !== user.id
      ) {
        throw new ApiError(
          404,
          "Technical review not found",
          "REVIEW_NOT_FOUND",
        );
      }
      return reviewReadiness(review);
    },
    true,
  );
}
export async function listReviews(
  inquiryId: string,
  page: Page,
  context: WorkflowContext,
) {
  return withWorkflow(
    inquiryId,
    context,
    async (tx, _inquiry, user) => {
      const where: Prisma.InquiryTechnicalReviewWhereInput = { inquiryId };
      if (user.role === "PRODUCTION") {
        where.productionReviewerId = user.id;
      }
      const data = await tx.inquiryTechnicalReview.findMany({
        where,
        include: reviewInclude,
        orderBy: { version: "desc" },
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      });
      const total = await tx.inquiryTechnicalReview.count({ where });
      return { data: data.map(reviewReadiness), meta: { ...page, total } };
    },
    true,
  );
}
