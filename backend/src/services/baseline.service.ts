import { createHash } from "node:crypto";
import type { z } from "zod";
import type { Prisma } from "../generated/client.js";
import { ApiError } from "../utils/ApiError.js";
import { businessAudit, auditValues } from "./business-audit.service.js";
import { findReview } from "./technical-review.service.js";
import {
  linkedEvidence,
  requireMarketingOwner,
  requireOpenInquiry,
  requireRevision,
  withWorkflow,
  type WorkflowContext,
} from "./workflow-access.service.js";
import type {
  baselineInput,
  baselineUpdateInput,
  finalizeBaselineInput,
  reviseBaselineInput,
  Page,
} from "../validators/workflow.validator.js";
const baselineInclude = {
  assertions: { orderBy: { key: "asc" } },
} satisfies Prisma.RequirementBaselineVersionInclude;
async function findBaseline(
  tx: Prisma.TransactionClient,
  inquiryId: string,
  versionId: string,
) {
  const baseline = await tx.requirementBaselineVersion.findFirst({
    where: { id: versionId, inquiryId },
    include: baselineInclude,
  });
  if (!baseline) {
    throw new ApiError(
      404,
      "Requirement baseline not found",
      "BASELINE_NOT_FOUND",
    );
  }
  return baseline;
}
async function sourceRequirements(
  tx: Prisma.TransactionClient,
  inquiryId: string,
  reviewId: string,
) {
  const review = await findReview(tx, inquiryId, reviewId);
  if (!review.submittedAt) {
    throw new ApiError(
      409,
      "A baseline requires a submitted technical review",
      "REVIEW_NOT_SUBMITTED",
    );
  }
  const questions = await tx.clarificationQuestion.findMany({
    where: { clarification: { inquiryId } },
    orderBy: { id: "asc" },
    include: { responses: { orderBy: { sequence: "desc" }, take: 1 } },
  });
  const assertions: z.infer<typeof baselineUpdateInput>["assertions"] = [];
  const openQuestions: string[] = [];
  const assumptions = [...review.assumptions];
  for (const item of review.items) {
    if (item.state === "ASSUMED" && item.value) {
      assumptions.push(`${item.label}: ${item.value}`);
    } else if (["MISSING", "UNVERIFIED"].includes(item.state)) {
      openQuestions.push(item.label);
    }
    if (
      item.evidenceId &&
      item.value &&
      ["VERIFIED", "UNVERIFIED"].includes(item.state)
    ) {
      assertions.push({
        key: item.key,
        value: item.value,
        confirmed: item.state === "VERIFIED",
        evidenceId: item.evidenceId,
      });
    }
  }
  for (const question of questions) {
    const response = question.responses[0];
    if (question.confirmation !== "WRITTEN_CONFIRMED") {
      openQuestions.push(question.question);
    }
    if (response) {
      assertions.push({
        key: `question:${question.id}`,
        value: response.response,
        confirmed: response.confirmation === "WRITTEN_CONFIRMED",
        evidenceId: response.evidenceId,
      });
    }
  }
  // Detect source changes between drafting and freezing without editing earlier versions.
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ review, questions }))
    .digest("hex");
  return { review, assertions, assumptions, openQuestions, fingerprint };
}
async function validateAssertions(
  tx: Prisma.TransactionClient,
  inquiryId: string,
  assertions: z.infer<typeof baselineUpdateInput>["assertions"],
) {
  for (const assertion of assertions) {
    await linkedEvidence(
      tx,
      inquiryId,
      assertion.evidenceId,
      assertion.confirmed,
    );
    // One message can support several independent facts. Only question-derived
    // assertions follow that question's latest answer, not every use of the message.
    if (!assertion.key.startsWith("question:")) {
      continue;
    }
    const question = await tx.clarificationQuestion.findFirst({
      where: {
        id: assertion.key.slice("question:".length),
        clarification: { inquiryId },
      },
      select: {
        responses: {
          orderBy: { sequence: "desc" },
          take: 1,
          select: { evidenceId: true, confirmation: true },
        },
      },
    });
    const latest = question?.responses[0];
    if (
      !latest ||
      latest.evidenceId !== assertion.evidenceId ||
      (assertion.confirmed && latest.confirmation !== "WRITTEN_CONFIRMED")
    ) {
      throw new ApiError(
        409,
        "Use the latest clarification response in the baseline",
        "BASELINE_SOURCE_CHANGED",
      );
    }
  }
}
function baselineResponse(
  baseline: Awaited<ReturnType<typeof findBaseline>>,
  inquiryStatus: string,
) {
  return {
    ...baseline,
    workflowOutcome:
      inquiryStatus === "CLOSED" ? "INQUIRY_CLOSED" : baseline.outcome,
    customerApprovalGranted: false,
    quotationIssuanceAllowed: false,
  };
}
async function createDraft(
  tx: Prisma.TransactionClient,
  inquiryId: string,
  reviewId: string,
  reason: string,
  context: WorkflowContext,
  previousVersionId?: string,
) {
  const latest = await tx.requirementBaselineVersion.findFirst({
    where: { inquiryId },
    orderBy: { version: "desc" },
  });
  if (latest && !latest.frozenAt) {
    throw new ApiError(
      409,
      "Finish the existing baseline draft first",
      "BASELINE_DRAFT_EXISTS",
    );
  }
  const source = await sourceRequirements(tx, inquiryId, reviewId);
  if (previousVersionId) {
    const previous = await findBaseline(tx, inquiryId, previousVersionId);
    if (previous.sourceFingerprint === source.fingerprint) {
      source.assertions = previous.assertions.map((assertion) => {
        return {
          key: assertion.key,
          value: assertion.value,
          confirmed: assertion.confirmed,
          evidenceId: assertion.evidenceId,
        };
      });
      source.assumptions = previous.assumptions;
      source.openQuestions = previous.openQuestions;
    } else {
      // New source facts replace matching keys; manually consolidated facts remain visible.
      const merged = new Map(
        previous.assertions.map((assertion) => {
          return [
            assertion.key,
            {
              key: assertion.key,
              value: assertion.value,
              confirmed: assertion.confirmed,
              evidenceId: assertion.evidenceId,
            },
          ];
        }),
      );
      for (const assertion of source.assertions) {
        merged.set(assertion.key, assertion);
      }
      source.assertions = [...merged.values()];
      source.assumptions = [
        ...new Set([...previous.assumptions, ...source.assumptions]),
      ];
      source.openQuestions = [
        ...new Set([...previous.openQuestions, ...source.openQuestions]),
      ];
    }
  }
  if (!previousVersionId) {
    await validateAssertions(tx, inquiryId, source.assertions);
  }
  const draft = await tx.requirementBaselineVersion.create({
    data: {
      inquiryId,
      reviewId,
      version: (latest?.version ?? 0) + 1,
      previousVersionId,
      createdById: context.actorId,
      changeReason: reason,
      assumptions: source.assumptions,
      openQuestions: source.openQuestions,
      sourceFingerprint: source.fingerprint,
      assertions: { create: source.assertions },
    },
    include: baselineInclude,
  });
  await businessAudit(
    tx,
    context,
    "BASELINE_DRAFT_CREATED",
    "Inquiry",
    inquiryId,
    undefined,
    auditValues(draft),
    reason,
  );
  return draft;
}
export async function createBaseline(
  inquiryId: string,
  input: z.infer<typeof baselineInput>,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireOpenInquiry(inquiry);
    requireMarketingOwner(inquiry, user);
    if (
      (await tx.requirementBaselineVersion.count({ where: { inquiryId } })) > 0
    ) {
      throw new ApiError(
        409,
        "Use the revision operation for an existing baseline",
        "BASELINE_REVISION_REQUIRED",
      );
    }
    const draft = await createDraft(
      tx,
      inquiryId,
      input.reviewId,
      input.changeReason,
      context,
    );
    return baselineResponse(draft, inquiry.status);
  });
}
export async function updateBaseline(
  inquiryId: string,
  versionId: string,
  input: z.infer<typeof baselineUpdateInput>,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireOpenInquiry(inquiry);
    requireMarketingOwner(inquiry, user);
    const previous = await findBaseline(tx, inquiryId, versionId);
    if (previous.frozenAt) {
      throw new ApiError(
        409,
        "Frozen baselines are immutable",
        "BASELINE_FROZEN",
      );
    }
    requireRevision(previous.revision, input.expectedRevision);
    await validateAssertions(tx, inquiryId, input.assertions);
    const source = await sourceRequirements(tx, inquiryId, previous.reviewId);
    const { expectedRevision: _expected, assertions, ...fields } = input;
    const updated = await tx.requirementBaselineVersion.update({
      where: { id: versionId },
      data: {
        ...fields,
        sourceFingerprint: source.fingerprint,
        revision: { increment: 1 },
        assertions: { deleteMany: {}, create: assertions },
      },
      include: baselineInclude,
    });
    await businessAudit(
      tx,
      context,
      "BASELINE_DRAFT_UPDATED",
      "Inquiry",
      inquiryId,
      auditValues(previous),
      auditValues(updated),
      input.changeReason,
    );
    return baselineResponse(updated, inquiry.status);
  });
}
export async function finalizeBaseline(
  inquiryId: string,
  versionId: string,
  input: z.infer<typeof finalizeBaselineInput>,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireOpenInquiry(inquiry);
    requireMarketingOwner(inquiry, user);
    const baseline = await findBaseline(tx, inquiryId, versionId);
    if (baseline.frozenAt) {
      throw new ApiError(
        409,
        "Frozen baselines are immutable",
        "BASELINE_FROZEN",
      );
    }
    requireRevision(baseline.revision, input.expectedRevision);
    const source = await sourceRequirements(tx, inquiryId, baseline.reviewId);
    if (source.fingerprint !== baseline.sourceFingerprint) {
      throw new ApiError(
        409,
        "Sources changed; review and update the draft before freezing",
        "BASELINE_SOURCE_CHANGED",
      );
    }
    await validateAssertions(tx, inquiryId, baseline.assertions);
    const omittedFact = source.assertions.some((sourceAssertion) => {
      return (
        sourceAssertion.confirmed &&
        !baseline.assertions.some((assertion) => {
          return (
            assertion.key === sourceAssertion.key &&
            assertion.evidenceId === sourceAssertion.evidenceId &&
            assertion.confirmed
          );
        })
      );
    });
    if (omittedFact) {
      throw new ApiError(
        409,
        "Retain the currently verified source requirements in the baseline",
        "BASELINE_FACTS_MISSING",
      );
    }
    if (input.outcome === "BASELINE_READY_FOR_FEASIBILITY") {
      const latestReview = await tx.inquiryTechnicalReview.findFirst({
        where: { inquiryId },
        orderBy: { version: "desc" },
      });
      const customerHold = await tx.customerClarification.count({
        where: { inquiryId, customerHold: true },
      });
      const unresolved =
        baseline.openQuestions.length > 0 ||
        source.openQuestions.length > 0 ||
        baseline.assertions.some((assertion) => {
          return !assertion.confirmed;
        });
      const usableReview = [
        "COMPLETE_FOR_CLARIFICATION_BASELINE",
        "FEASIBLE_WITH_ASSUMPTIONS",
      ].includes(source.review.outcome ?? "");
      if (
        inquiry.status === "ON_HOLD" ||
        customerHold > 0 ||
        unresolved ||
        !usableReview ||
        latestReview?.id !== baseline.reviewId ||
        baseline.assertions.length === 0
      ) {
        throw new ApiError(
          409,
          "Resolve open points and holds against the current review before declaring readiness",
          "BASELINE_NOT_READY",
        );
      }
    }
    // Freezing is an internal version-control action, never customer or quotation approval.
    const frozen = await tx.requirementBaselineVersion.update({
      where: { id: versionId },
      data: {
        outcome: input.outcome,
        frozenAt: new Date(),
        revision: { increment: 1 },
      },
      include: baselineInclude,
    });
    await businessAudit(
      tx,
      context,
      "BASELINE_FROZEN",
      "Inquiry",
      inquiryId,
      auditValues(baseline),
      auditValues(frozen),
    );
    return baselineResponse(frozen, inquiry.status);
  });
}
export async function reviseBaseline(
  inquiryId: string,
  versionId: string,
  input: z.infer<typeof reviseBaselineInput>,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireOpenInquiry(inquiry);
    requireMarketingOwner(inquiry, user);
    const previous = await findBaseline(tx, inquiryId, versionId);
    const latest = await tx.requirementBaselineVersion.findFirst({
      where: { inquiryId },
      orderBy: { version: "desc" },
    });
    if (!previous.frozenAt || latest?.id !== versionId) {
      throw new ApiError(
        409,
        "Revise the latest frozen baseline",
        "INVALID_BASELINE_REVISION",
      );
    }
    const draft = await createDraft(
      tx,
      inquiryId,
      input.reviewId ?? previous.reviewId,
      input.changeReason,
      context,
      previous.id,
    );
    return baselineResponse(draft, inquiry.status);
  });
}
export async function getBaseline(
  inquiryId: string,
  versionId: string,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry) => {
    const baseline = await findBaseline(tx, inquiryId, versionId);
    return baselineResponse(baseline, inquiry.status);
  });
}
export async function listBaselines(
  inquiryId: string,
  page: Page,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry) => {
    const where = { inquiryId };
    const baselines = await tx.requirementBaselineVersion.findMany({
      where,
      include: baselineInclude,
      orderBy: { version: "desc" },
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    });
    const total = await tx.requirementBaselineVersion.count({ where });
    return {
      data: baselines.map((baseline) => {
        return baselineResponse(baseline, inquiry.status);
      }),
      meta: { ...page, total },
    };
  });
}
