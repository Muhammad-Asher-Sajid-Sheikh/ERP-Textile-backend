import type { Inquiry, Prisma } from "../generated/client.js";
import type { FeasibilityRecord } from "./feasibility.service.js";
import { feasibilityBaselineReadiness } from "./baseline.service.js";
import { TC01_DEPENDENCY } from "./workflow-access.service.js";

export const FEASIBILITY_AUTHORITY_DEPENDENCY =
  "Top-management authority for enterprise feasibility-risk decisions is not mapped";

export function engineeringBlockers(assessment: FeasibilityRecord) {
  const blockers: string[] = [];
  const uncertainties: string[] = [
    ...assessment.uncertainties,
    ...assessment.assumptions,
  ];
  let managementRiskPending = false;
  if (assessment.articles.length === 0) {
    blockers.push("Record at least one article");
  }
  for (const article of assessment.articles) {
    const prefix = `${article.code}: `;
    uncertainties.push(
      ...article.uncertainties,
      ...article.assumptions,
      ...article.capabilityLimitations,
    );
    if (!article.quantity || !article.quantityUnit) {
      blockers.push(prefix + "record article quantity and its unit");
    }
    if (article.materials.length === 0) {
      blockers.push(
        prefix + "record material requirements and their consumption basis",
      );
    }
    if (article.processes.length === 0) {
      blockers.push(prefix + "record a process route");
    }
    if (
      !article.sampleFeasibility ||
      !article.capacityAssessment ||
      article.estimatedLeadTimeDays === null
    ) {
      blockers.push(
        prefix + "record sample feasibility, capacity and lead time",
      );
    }
    if (!article.riskAssessment) {
      blockers.push(
        prefix +
          "record the technical risk assessment, including when no risks were identified",
      );
    }
    if (
      article.productKind === "TOWEL" &&
      !article.materials.some((material) => {
        return material.consumptionBasis === "FINISHED_DYED_WEIGHT";
      })
    ) {
      blockers.push(
        prefix +
          "use finished dyed piece/set weight as the primary towel basis",
      );
    }
    if (
      article.productKind === "WOVEN_MADE_UP" &&
      !article.materials.some((material) => {
        return material.consumptionBasis === "FABRIC_WIDTH";
      })
    ) {
      blockers.push(
        prefix + "record the fabric-width basis for woven made-ups",
      );
    }
    for (const material of article.materials) {
      const materialPrefix = prefix + material.code + ": ";
      uncertainties.push(...material.uncertainties, ...material.assumptions);
      if (
        !material.consumptionBasis ||
        !material.consumptionQuantity ||
        !material.consumptionUnit ||
        !material.perQuantity ||
        !material.perUnit
      ) {
        blockers.push(
          materialPrefix +
            "record consumption, measurement unit and per-piece/set or other denominator",
        );
      }
      if (material.consumptionBasis === "OTHER" && !material.basisDescription) {
        blockers.push(
          materialPrefix + "explain the product-specific consumption basis",
        );
      }
      if (
        material.consumptionBasis === "FINISHED_DYED_WEIGHT" &&
        (!material.finishedWeight ||
          !material.finishedWeightUnit ||
          !["piece", "set"].includes(material.perUnit ?? ""))
      ) {
        blockers.push(
          materialPrefix +
            "record finished dyed weight in g/kg per piece or set",
        );
      }
      if (
        material.consumptionBasis === "FABRIC_WIDTH" &&
        (!material.fabricWidth || !material.fabricWidthUnit)
      ) {
        blockers.push(materialPrefix + "record fabric width and its unit");
      }
      if (!material.adjustmentApplicabilityReason) {
        blockers.push(
          materialPrefix +
            "explain which allowances and losses apply to this material",
        );
      }
      const adjustments = [
        ["ALLOWANCE", material.allowancePercent],
        ["PROCESS_LOSS", material.processLossPercent],
        ["SHRINKAGE", material.shrinkagePercent],
        ["WASTAGE", material.wastagePercent],
      ] as const;
      for (const [kind, value] of adjustments) {
        if (material.applicableAdjustments.includes(kind) && value === null) {
          uncertainties.push(materialPrefix + kind + " remains unknown");
        }
      }
    }
    for (const process of article.processes) {
      uncertainties.push(...process.assumptions, ...process.limitations);
      if (
        !process.execution ||
        !process.capability ||
        process.estimatedLeadTimeDays === null
      ) {
        blockers.push(
          prefix +
            `operation ${process.sequence}: record execution mode, capability and lead time`,
        );
      }
      if (process.execution === "INTERNAL" && !article.internalCapability) {
        blockers.push(prefix + "record internal manufacturing capability");
      }
      if (
        process.execution === "OUTSOURCED" &&
        (!process.processor ||
          !article.externalCapability ||
          !article.supplierAvailability)
      ) {
        blockers.push(
          prefix +
            "record external capability, processor and supplier availability",
        );
      }
    }
    for (const risk of article.risks) {
      if (risk.requiresManagementAcceptance) {
        managementRiskPending = true;
      }
    }
  }
  return { blockers, uncertainties, managementRiskPending };
}

export async function feasibilityResponse(
  tx: Prisma.TransactionClient,
  inquiry: Inquiry,
  assessment: FeasibilityRecord,
) {
  const source = await feasibilityBaselineReadiness(
    tx,
    inquiry,
    assessment.baselineVersionId,
  );
  const latest = await tx.feasibilityAssessment.findFirst({
    where: { inquiryId: inquiry.id, submittedAt: { not: null } },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  const engineering = engineeringBlockers(assessment);
  const blockingReasons = [...source.blockers, ...engineering.blockers];
  if (assessment.submittedAt && latest?.id !== assessment.id) {
    blockingReasons.push("FEASIBILITY_SUPERSEDED");
  }
  if (!assessment.submittedAt) {
    blockingReasons.push("FEASIBILITY_NOT_SUBMITTED");
  }
  if (assessment.outcome !== "FEASIBLE") {
    blockingReasons.push("UNCONDITIONAL_FEASIBILITY_NOT_ESTABLISHED");
  }
  if (
    assessment.conditions.length > 0 ||
    engineering.uncertainties.length > 0 ||
    source.baseline.assumptions.length > 0
  ) {
    blockingReasons.push("CONDITIONS_OR_UNCERTAINTIES_PENDING");
  }
  if (engineering.managementRiskPending) {
    blockingReasons.push("RISK_AUTHORITY_UNCONFIGURED");
  }
  const dependencies = [
    TC01_DEPENDENCY,
    "Product-specific consumption and costing formulas require controlling validation",
  ];
  if (engineering.managementRiskPending) {
    dependencies.push(FEASIBILITY_AUTHORITY_DEPENDENCY);
  }
  return {
    ...assessment,
    inquiry: { id: inquiry.id, irn: inquiry.irn },
    baselineVersion: {
      id: source.baseline.id,
      version: source.baseline.version,
      frozenAt: source.baseline.frozenAt,
      outcome: source.baseline.outcome,
      reviewId: source.baseline.reviewId,
      assertions: source.baseline.assertions,
      assumptions: source.baseline.assumptions,
      openQuestions: source.baseline.openQuestions,
    },
    lifecycle: assessment.submittedAt ? "SUBMITTED" : "DRAFT",
    isCurrent:
      assessment.submittedAt !== null &&
      latest?.id === assessment.id &&
      source.blockers.length === 0,
    usableAsPreliminaryCostingBasis: blockingReasons.length === 0,
    blockingReasons: [...new Set(blockingReasons)],
    uncertainties: [...new Set([...engineering.uncertainties, ...source.baseline.assumptions])],
    dependencies,
    riskDecisions: [],
    riskDecisionAuthorityConfigured: false,
    formalCostingAllowed: false,
    quotationIssuanceAllowed: false,
    sampleAuthorizationGranted: false,
    purchasingAllowed: false,
    productionReleaseGranted: false,
  };
}
