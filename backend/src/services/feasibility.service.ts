import type { Inquiry, Prisma, Role } from "../generated/client.js";
import { ApiError } from "../utils/ApiError.js";
import { businessAudit, auditValues } from "./business-audit.service.js";
import { feasibilityBaselineReadiness } from "./baseline.service.js";
import {
  engineeringBlockers,
  feasibilityResponse,
  FEASIBILITY_AUTHORITY_DEPENDENCY,
} from "./feasibility-readiness.service.js";
import {
  approvedEmployee,
  personSelect,
  requireMarketingOwner,
  requireOpenInquiry,
  requireRevision,
  withWorkflow,
  type WorkflowContext,
} from "./workflow-access.service.js";
import type { Page } from "../validators/workflow.validator.js";
import type {
  CreateFeasibility,
  UpdateFeasibility,
  SubmitFeasibility,
  ReviseFeasibility,
  FeasibilityRiskDecision,
} from "../validators/feasibility.validator.js";

export const assessmentInclude = {
  createdBy: { select: personSelect },
  productionReviewer: { select: personSelect },
  submittedBy: { select: personSelect },
  articles: {
    orderBy: { code: "asc" },
    include: {
      materials: { orderBy: { code: "asc" } },
      processes: { orderBy: { sequence: "asc" } },
      risks: { orderBy: { id: "asc" } },
    },
  },
} satisfies Prisma.FeasibilityAssessmentInclude;
export type FeasibilityRecord = Prisma.FeasibilityAssessmentGetPayload<{
  include: typeof assessmentInclude;
}>;

async function findAssessment(
  tx: Prisma.TransactionClient,
  inquiryId: string,
  assessmentId: string,
  user: { id: string; role: Role },
) {
  const where: Prisma.FeasibilityAssessmentWhereInput = {
    id: assessmentId,
    inquiryId,
  };
  if (user.role === "PRODUCTION") {
    where.productionReviewerId = user.id;
  }
  const assessment = await tx.feasibilityAssessment.findFirst({
    where,
    include: assessmentInclude,
  });
  if (!assessment) {
    throw new ApiError(
      404,
      "Feasibility assessment not found",
      "FEASIBILITY_NOT_FOUND",
    );
  }
  return assessment;
}

function requireDraft(assessment: FeasibilityRecord) {
  if (assessment.submittedAt) {
    throw new ApiError(
      409,
      "Submitted feasibility assessments are immutable; create a revision",
      "FEASIBILITY_FROZEN",
    );
  }
}

function requireProduction(
  assessment: FeasibilityRecord,
  user: { id: string; role: Role },
) {
  if (
    user.role !== "PRODUCTION" ||
    assessment.productionReviewerId !== user.id
  ) {
    throw new ApiError(
      403,
      "Only the assigned Production reviewer can change technical findings",
      "PRODUCTION_REVIEWER_REQUIRED",
    );
  }
}

async function requireReadyBaseline(
  tx: Prisma.TransactionClient,
  inquiry: Inquiry,
  baselineVersionId: string,
) {
  const readiness = await feasibilityBaselineReadiness(
    tx,
    inquiry,
    baselineVersionId,
  );
  if (readiness.blockers.length > 0) {
    throw new ApiError(
      409,
      "Use the current ready baseline and resolve upstream holds or source changes",
      "FEASIBILITY_BASELINE_BLOCKED",
      readiness.blockers,
    );
  }
  return readiness.baseline;
}

function articleWrites(
  articles: UpdateFeasibility["articles"],
): Prisma.FeasibilityArticleCreateWithoutAssessmentInput[] {
  const records: Prisma.FeasibilityArticleCreateWithoutAssessmentInput[] = [];
  for (const article of articles) {
    const { materials, processes, risks, ...fields } = article;
    records.push({
      ...fields,
      materials: { create: materials },
      processes: { create: processes },
      risks: { create: risks },
    });
  }
  return records;
}

function copyArticles(
  assessment: FeasibilityRecord,
): Prisma.FeasibilityArticleCreateWithoutAssessmentInput[] {
  const records: Prisma.FeasibilityArticleCreateWithoutAssessmentInput[] = [];
  for (const article of assessment.articles) {
    const {
      id: _id,
      assessmentId: _assessmentId,
      materials,
      processes,
      risks,
      technicalAttributes,
      ...fields
    } = article;
    records.push({
      ...fields,
      technicalAttributes: auditValues(technicalAttributes),
      materials: {
        create: materials.map((material) => {
          const {
            id: _materialId,
            articleId: _articleId,
            technicalAttributes: attributes,
            ...materialFields
          } = material;
          return {
            ...materialFields,
            technicalAttributes: auditValues(attributes),
          };
        }),
      },
      processes: {
        create: processes.map((process) => {
          const {
            id: _processId,
            articleId: _articleId,
            ...processFields
          } = process;
          return processFields;
        }),
      },
      risks: {
        create: risks.map((risk) => {
          const { id: _riskId, articleId: _articleId, ...riskFields } = risk;
          return riskFields;
        }),
      },
    });
  }
  return records;
}

export async function createFeasibility(
  inquiryId: string,
  input: CreateFeasibility,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireOpenInquiry(inquiry);
    requireMarketingOwner(inquiry, user);
    const baseline = await requireReadyBaseline(
      tx,
      inquiry,
      input.baselineVersionId,
    );
    await approvedEmployee(tx, input.productionReviewerId, ["PRODUCTION"]);
    const previous = await tx.feasibilityAssessment.findFirst({
      where: { inquiryId },
      orderBy: { version: "desc" },
    });
    if (previous) {
      if (!previous.submittedAt) {
        throw new ApiError(
          409,
          "Finish the existing feasibility draft first",
          "FEASIBILITY_DRAFT_EXISTS",
        );
      }
      throw new ApiError(
        409,
        "Use the revision operation for an existing feasibility assessment",
        "FEASIBILITY_REVISION_REQUIRED",
      );
    }
    const assessment = await tx.feasibilityAssessment.create({
      data: {
        ...input,
        inquiryId,
        createdById: user.id,
        version: 1,
        conditions: [],
        assumptions: baseline.assumptions,
        uncertainties: [],
      },
      include: assessmentInclude,
    });
    await businessAudit(
      tx,
      context,
      "FEASIBILITY_CREATED",
      "Inquiry",
      inquiryId,
      undefined,
      auditValues(assessment),
      input.changeReason,
    );
    await businessAudit(
      tx,
      context,
      "FEASIBILITY_REVIEWER_ASSIGNED",
      "Inquiry",
      inquiryId,
      undefined,
      {
        feasibilityId: assessment.id,
        version: assessment.version,
        productionReviewerId: input.productionReviewerId,
      },
      input.changeReason,
    );
    return feasibilityResponse(tx, inquiry, assessment);
  });
}

export async function listFeasibilities(
  inquiryId: string,
  page: Page,
  context: WorkflowContext,
) {
  return withWorkflow(
    inquiryId,
    context,
    async (tx, inquiry, user) => {
      const where: Prisma.FeasibilityAssessmentWhereInput = { inquiryId };
      if (user.role === "PRODUCTION") {
        where.productionReviewerId = user.id;
      }
      const assessments = await tx.feasibilityAssessment.findMany({
        where,
        include: assessmentInclude,
        orderBy: { version: "desc" },
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      });
      const total = await tx.feasibilityAssessment.count({ where });
      const data = [];
      for (const assessment of assessments) {
        data.push(await feasibilityResponse(tx, inquiry, assessment));
      }
      return { data, meta: { ...page, total } };
    },
    "FEASIBILITY",
  );
}

export async function getFeasibility(
  inquiryId: string,
  assessmentId: string,
  context: WorkflowContext,
) {
  return withWorkflow(
    inquiryId,
    context,
    async (tx, inquiry, user) => {
      const assessment = await findAssessment(
        tx,
        inquiryId,
        assessmentId,
        user,
      );
      return feasibilityResponse(tx, inquiry, assessment);
    },
    "FEASIBILITY",
  );
}

export async function updateFeasibility(
  inquiryId: string,
  assessmentId: string,
  input: UpdateFeasibility,
  context: WorkflowContext,
) {
  return withWorkflow(
    inquiryId,
    context,
    async (tx, inquiry, user) => {
      requireOpenInquiry(inquiry);
      const previous = await findAssessment(tx, inquiryId, assessmentId, user);
      requireProduction(previous, user);
      requireDraft(previous);
      requireRevision(previous.revision, input.expectedRevision);
      await requireReadyBaseline(tx, inquiry, previous.baselineVersionId);
      const { expectedRevision: _revision, articles, ...fields } = input;
      // Only draft children are replaced; their prior content stays in the same transaction's audit entry.
      const childScope = { article: { assessmentId } };
      await tx.feasibilityRisk.deleteMany({ where: childScope });
      await tx.feasibilityProcess.deleteMany({ where: childScope });
      await tx.feasibilityMaterial.deleteMany({ where: childScope });
      await tx.feasibilityArticle.deleteMany({ where: { assessmentId } });
      const updated = await tx.feasibilityAssessment.update({
        where: { id: assessmentId },
        data: {
          ...fields,
          revision: { increment: 1 },
          articles: { create: articleWrites(articles) },
        },
        include: assessmentInclude,
      });
      await businessAudit(
        tx,
        context,
        "FEASIBILITY_UPDATED",
        "Inquiry",
        inquiryId,
        auditValues(previous),
        auditValues(updated),
        input.changeReason,
      );
      return feasibilityResponse(tx, inquiry, updated);
    },
    "FEASIBILITY",
  );
}

export async function submitFeasibility(
  inquiryId: string,
  assessmentId: string,
  input: SubmitFeasibility,
  context: WorkflowContext,
) {
  return withWorkflow(
    inquiryId,
    context,
    async (tx, inquiry, user) => {
      requireOpenInquiry(inquiry);
      const previous = await findAssessment(tx, inquiryId, assessmentId, user);
      requireProduction(previous, user);
      requireDraft(previous);
      requireRevision(previous.revision, input.expectedRevision);
      const engineering = engineeringBlockers(previous);
      const positiveOutcome = ["FEASIBLE", "FEASIBLE_WITH_CONDITIONS"].includes(
        input.outcome,
      );
      // A non-positive historical conclusion can close a stale draft, allowing a new
      // version against current requirements. It never becomes a usable costing basis.
      if (positiveOutcome) {
        await requireReadyBaseline(tx, inquiry, previous.baselineVersionId);
      }
      if (positiveOutcome && engineering.blockers.length > 0) {
        throw new ApiError(
          422,
          "Record a usable article-level engineering basis before a positive technical outcome",
          "FEASIBILITY_INCOMPLETE",
          engineering.blockers,
        );
      }
      if (
        input.outcome === "FEASIBLE_WITH_CONDITIONS" &&
        previous.conditions.length === 0
      ) {
        throw new ApiError(
          422,
          "Record explicit conditions before conditional feasibility",
          "FEASIBILITY_CONDITIONS_REQUIRED",
        );
      }
      if (
        input.outcome === "FEASIBLE" &&
        (previous.conditions.length > 0 || engineering.uncertainties.length > 0)
      ) {
        throw new ApiError(
          409,
          "Resolve conditions and uncertainties or submit a conditional outcome",
          "FEASIBILITY_CONDITIONS_PENDING",
          engineering.uncertainties,
        );
      }
      const submitted = await tx.feasibilityAssessment.update({
        where: { id: assessmentId },
        data: {
          outcome: input.outcome,
          submissionReason: input.reason,
          submittedAt: new Date(),
          submittedById: user.id,
          revision: { increment: 1 },
        },
        include: assessmentInclude,
      });
      await businessAudit(
        tx,
        context,
        "FEASIBILITY_SUBMITTED",
        "Inquiry",
        inquiryId,
        auditValues(previous),
        auditValues(submitted),
        input.reason,
      );
      return feasibilityResponse(tx, inquiry, submitted);
    },
    "FEASIBILITY",
  );
}

export async function reviseFeasibility(
  inquiryId: string,
  assessmentId: string,
  input: ReviseFeasibility,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireOpenInquiry(inquiry);
    requireMarketingOwner(inquiry, user);
    const previous = await findAssessment(tx, inquiryId, assessmentId, user);
    const latest = await tx.feasibilityAssessment.findFirst({
      where: { inquiryId },
      orderBy: { version: "desc" },
    });
    if (latest && !latest.submittedAt) {
      throw new ApiError(
        409,
        "Finish the existing feasibility draft first",
        "FEASIBILITY_DRAFT_EXISTS",
      );
    }
    if (!previous.submittedAt || latest?.id !== previous.id) {
      throw new ApiError(
        409,
        "Revise the latest submitted feasibility version",
        "INVALID_FEASIBILITY_REVISION",
      );
    }
    const baselineVersionId =
      input.baselineVersionId ?? previous.baselineVersionId;
    const baseline = await requireReadyBaseline(tx, inquiry, baselineVersionId);
    const productionReviewerId =
      input.productionReviewerId ?? previous.productionReviewerId;
    await approvedEmployee(tx, productionReviewerId, ["PRODUCTION"]);
    const assumptions = [
      ...new Set([...previous.assumptions, ...baseline.assumptions]),
    ];
    const revised = await tx.feasibilityAssessment.create({
      data: {
        inquiryId,
        baselineVersionId,
        productionReviewerId,
        createdById: user.id,
        version: previous.version + 1,
        previousVersionId: previous.id,
        changeReason: input.changeReason,
        conditions: previous.conditions,
        assumptions,
        uncertainties: previous.uncertainties,
        notes: previous.notes,
        articles: { create: copyArticles(previous) },
      },
      include: assessmentInclude,
    });
    await businessAudit(
      tx,
      context,
      "FEASIBILITY_REVISED",
      "Inquiry",
      inquiryId,
      {
        feasibilityId: previous.id,
        version: previous.version,
        baselineVersionId: previous.baselineVersionId,
      },
      auditValues(revised),
      input.changeReason,
    );
    await businessAudit(
      tx,
      context,
      "FEASIBILITY_REVIEWER_ASSIGNED",
      "Inquiry",
      inquiryId,
      undefined,
      {
        feasibilityId: revised.id,
        version: revised.version,
        productionReviewerId,
      },
      input.changeReason,
    );
    return feasibilityResponse(tx, inquiry, revised);
  });
}

export async function decideFeasibilityRisk(
  inquiryId: string,
  assessmentId: string,
  input: FeasibilityRiskDecision,
  context: WorkflowContext,
) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    if (user.role !== "MANAGEMENT") {
      throw new ApiError(
        403,
        "Management access is required",
        "PERMISSION_DENIED",
      );
    }
    requireOpenInquiry(inquiry);
    const assessment = await findAssessment(tx, inquiryId, assessmentId, user);
    if (!assessment.submittedAt) {
      throw new ApiError(
        409,
        "Risk decisions must reference an immutable submitted assessment",
        "FEASIBILITY_NOT_SUBMITTED",
      );
    }
    for (const riskId of input.riskIds) {
      const matching = assessment.articles.some((article) => {
        return article.risks.some((risk) => {
          return risk.id === riskId && risk.requiresManagementAcceptance;
        });
      });
      if (!matching) {
        throw new ApiError(
          422,
          "Risk must require acceptance and belong to this exact feasibility version",
          "INVALID_FEASIBILITY_RISK",
        );
      }
    }
    // A generic MANAGEMENT role does not prove the top-management authority required by WF-04.
    throw new ApiError(
      409,
      FEASIBILITY_AUTHORITY_DEPENDENCY,
      "RISK_AUTHORITY_UNCONFIGURED",
    );
  });
}
