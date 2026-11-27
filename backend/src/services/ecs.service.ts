import { randomUUID } from "node:crypto";
import { Prisma, type Inquiry, type Role } from "../generated/client.js";
import { ApiError } from "../utils/ApiError.js";
import { auditValues, businessAudit } from "./business-audit.service.js";
import { assessmentInclude, type FeasibilityRecord } from "./feasibility.service.js";
import { feasibilityResponse } from "./feasibility-readiness.service.js";
import {
  requireMarketingOwner, requireOpenInquiry, requireRevision, withWorkflow,
  type WorkflowContext,
} from "./workflow-access.service.js";
import { calculateVersion, ecsVersionInclude, type EcsRecord } from "./ecs-calculation.service.js";
import type { Page } from "../validators/workflow.validator.js";
import type {
  AlternativeEcs, CalculateEcs, CostItemInput, CreateEcs, DispositionEcs,
  ReviseEcs, SubmitEcs, UpdateEcs,
} from "../validators/ecs.validator.js";

const formulaDependency = {
  code: "ECS_CONTROLLING_FORMULA_VALIDATION_PENDING",
  owner: "BBTI Production and Accounts; Management release",
  reference: "P1-D0.11 WF-05 / Category B; BBTI ERP V1.1 release notes 2-3, RF-01 calculation validation",
  affectedFunctions: ["Authoritative ECS calculations", "Ready for Approval", "Frozen quotation rates"],
  requirement: "Validate controlling costing examples, units, rate sources and dependent interfaces, with departmental sign-off and arithmetic UAT",
};
const versionSummary = {
  id: true, ecsId: true, version: true, revision: true, previousVersionId: true,
  alternativeKey: true, alternativeDescription: true, status: true,
  baselineVersionId: true, feasibilityId: true, costingCurrency: true, quotationCurrency: true,
  changeReason: true, preparedAt: true, preparedById: true, createdAt: true, updatedAt: true,
} satisfies Prisma.EcsVersionSelect;

function requireFinancialRead(inquiry: Inquiry, user: { id: string; role: Role }) {
  if (user.role !== "MANAGEMENT") requireMarketingOwner(inquiry, user);
}

async function requireEditable(tx: Prisma.TransactionClient, inquiry: Inquiry, version: EcsRecord, expectedRevision: number) {
  requireOpenInquiry(inquiry);
  if (inquiry.status === "ON_HOLD") {
    throw new ApiError(409, "The inquiry is on hold", "INQUIRY_NOT_EDITABLE");
  }
  requireRevision(version.revision, expectedRevision);
  if (version.preparedAt || ["READY_FOR_APPROVAL", "SUPERSEDED"].includes(version.status)) {
    throw new ApiError(409, "Create a new version to change a submitted costing", "ECS_NOT_EDITABLE");
  }
  const newerRevision = await tx.ecsVersion.findFirst({
    where: { ecsId: version.ecsId, alternativeKey: version.alternativeKey, version: { gt: version.version } },
    select: { id: true },
  });
  if (newerRevision) {
    throw new ApiError(409, "This historical version is preserved; edit the newer revision", "ECS_VERSION_REVISED");
  }
}

async function findEcs(tx: Prisma.TransactionClient, inquiryId: string, ecsId: string) {
  const ecs = await tx.estimatedCostSheet.findFirst({ where: { id: ecsId, inquiryId } });
  if (!ecs) throw new ApiError(404, "Estimated cost sheet not found", "ECS_NOT_FOUND");
  return ecs;
}

async function findVersion(tx: Prisma.TransactionClient, inquiryId: string, ecsId: string, versionId: string) {
  const version = await tx.ecsVersion.findFirst({
    where: { id: versionId, ecsId, ecs: { inquiryId } }, include: ecsVersionInclude,
  });
  if (!version) throw new ApiError(404, "ECS version not found", "ECS_VERSION_NOT_FOUND");
  return version;
}

async function engineeringBasis(tx: Prisma.TransactionClient, inquiry: Inquiry, feasibilityId: string, requireReady: boolean) {
  const assessment = await tx.feasibilityAssessment.findFirst({
    where: { id: feasibilityId, inquiryId: inquiry.id }, include: assessmentInclude,
  });
  if (!assessment) throw new ApiError(404, "Feasibility assessment not found", "FEASIBILITY_NOT_FOUND");
  const readiness = await feasibilityResponse(tx, inquiry, assessment);
  if (requireReady && !readiness.usableAsPreliminaryCostingBasis) {
    throw new ApiError(409, "Resolve the upstream costing-basis blockers", "ECS_ENGINEERING_BASIS_BLOCKED", readiness.blockingReasons);
  }
  return readiness;
}

function inheritedArticles(assessment: FeasibilityRecord): Prisma.EcsArticleUncheckedCreateWithoutEcsVersionInput[] {
  const articles: Prisma.EcsArticleUncheckedCreateWithoutEcsVersionInput[] = [];
  for (const article of assessment.articles) {
    const costItems: Prisma.EcsCostItemUncheckedCreateWithoutEcsArticleInput[] = [];
    for (const material of article.materials) {
      let category: "YARN" | "FABRIC" | "OTHER" = "OTHER";
      if (material.materialType.trim().toUpperCase() === "YARN") category = "YARN";
      if (material.materialType.trim().toUpperCase() === "FABRIC") category = "FABRIC";
      costItems.push({
        id: randomUUID(), feasibilityMaterialId: material.id,
        code: `MATERIAL:${material.code}`, name: material.name, category,
        materialSpecification: auditValues(material),
        chargingBasis: "QUANTITY_RATE", quantityBasis: "INHERITED_CONSUMPTION",
        assumptions: [], percentageBaseItemIds: [],
      });
    }
    for (const process of article.processes) {
      costItems.push({
        id: randomUUID(), feasibilityProcessId: process.id,
        code: `PROCESS:${process.sequence}`, name: process.operation, category: "PROCESSING",
        assumptions: [], percentageBaseItemIds: [],
      });
    }
    articles.push({
      feasibilityArticleId: article.id, articleCode: article.code, productName: article.name,
      productFamily: article.productFamily, productKind: article.productKind,
      quantity: article.quantity, quantityUnit: article.quantityUnit,
      engineeringSnapshot: auditValues(article), assumptions: [], costItems: { create: costItems },
    });
  }
  return articles;
}

function copiedArticles(source: EcsRecord): Prisma.EcsArticleUncheckedCreateWithoutEcsVersionInput[] {
  const articles: Prisma.EcsArticleUncheckedCreateWithoutEcsVersionInput[] = [];
  for (const article of source.articles) {
    const ids = new Map<string, string>();
    for (const item of article.costItems) ids.set(item.id, randomUUID());
    const costItems: Prisma.EcsCostItemUncheckedCreateWithoutEcsArticleInput[] = [];
    for (const item of article.costItems) {
      const {
        id, ecsArticleId: _articleId, feasibilityMaterial: _material, feasibilityProcess: _process,
        materialSpecification, includedInItemId: _includedInItemId, ...fields
      } = item;
      costItems.push({
        ...fields, id: ids.get(id),
        materialSpecification: materialSpecification === null ? Prisma.JsonNull : auditValues(materialSpecification),
        includedInItemId: null,
        percentageBaseItemIds: item.percentageBaseItemIds.map((baseId) => ids.get(baseId)!),
        rateClassification: "REVALIDATION_REQUIRED", rateReviewedAt: null,
        rateReviewedById: null, rateReviewReason: null,
      });
    }
    articles.push({
      feasibilityArticleId: article.feasibilityArticleId, articleCode: article.articleCode,
      productName: article.productName, productFamily: article.productFamily, productKind: article.productKind,
      quantity: article.quantity, quantityUnit: article.quantityUnit,
      engineeringSnapshot: auditValues(article.engineeringSnapshot),
      proposedSellingPrice: article.proposedSellingPrice, pricingNotes: article.pricingNotes,
      assumptions: article.assumptions, costItems: { create: costItems },
    });
  }
  return articles;
}

async function versionResponse(tx: Prisma.TransactionClient, inquiry: Inquiry, version: EcsRecord) {
  const basis = await engineeringBasis(tx, inquiry, version.feasibilityId, false);
  const calculation = calculateVersion(version);
  const missingInputs = [...calculation.calculationBlockers, ...calculation.rateBlockers];
  if (!version.paymentTerms) missingInputs.push("PAYMENT_TERMS_REQUIRED");
  if (!version.costCoverageNotes) missingInputs.push("APPLICABLE_COST_COVERAGE_REVIEW_REQUIRED");
  for (const article of version.articles) {
    if (article.proposedSellingPrice === null) missingInputs.push(`${article.id}: PROPOSED_SELLING_PRICE_REQUIRED`);
  }
  const approvalBlockers = [...basis.blockingReasons, ...missingInputs];
  if (basis.baselineVersionId !== version.baselineVersionId) approvalBlockers.push("ECS_BASELINE_MISMATCH");
  if (version.calculatedRevision !== version.revision || !version.calculationSnapshot) {
    approvalBlockers.push("CURRENT_REVISION_CALCULATION_REQUIRED");
  }
  if (version.outstandingConditions.length > 0) approvalBlockers.push("COSTING_CONDITIONS_UNRESOLVED");
  approvalBlockers.push(formulaDependency.code);
  // A later draft does not replace a submitted snapshot, and alternatives never select each other.
  let current = await tx.ecsVersion.findFirst({
    where: { ecsId: version.ecsId, alternativeKey: version.alternativeKey, preparedAt: { not: null } },
    orderBy: { version: "desc" }, select: { id: true },
  });
  if (!current) {
    current = await tx.ecsVersion.findFirst({
      where: { ecsId: version.ecsId, alternativeKey: version.alternativeKey },
      orderBy: { version: "desc" }, select: { id: true },
    });
  }
  return {
    ...version, versionId: version.id, inquiryId: inquiry.id, irn: inquiry.irn,
    baselineVersion: basis.baselineVersion,
    feasibility: {
      id: basis.id, version: basis.version, revision: basis.revision, lifecycle: basis.lifecycle,
      outcome: basis.outcome, isCurrent: basis.isCurrent,
      usableAsPreliminaryCostingBasis: basis.usableAsPreliminaryCostingBasis,
      blockingReasons: basis.blockingReasons,
    },
    isCurrent: current?.id === version.id && basis.isCurrent,
    currentVersionMeaning: "Latest prepared snapshot within this alternative, or latest draft if none is prepared; never commercial selection",
    exchangeRateDirection: "COSTING_CURRENCY_PER_QUOTATION_CURRENCY",
    sellingPriceBasis: "QUOTATION_CURRENCY_PER_ARTICLE_UNIT",
    calculation, calculationCurrent: version.calculatedRevision === version.revision,
    arithmeticComplete: calculation.arithmeticComplete,
    calculationComplete: false,
    missingInputs,
    calculationBlockers: [...calculation.calculationBlockers, formulaDependency.code],
    approvalBlockers: [...new Set(approvalBlockers)], readyForInternalApproval: approvalBlockers.length === 0,
    dependencies: [
      ...basis.dependencies, formulaDependency,
      { code: "COMMERCIAL_FREEZE_UNAVAILABLE", owner: "Management and Marketing", affectedFunctions: ["Frozen-rate use"], requirement: "WF-06 approval and WF-07 negotiated price finalization" },
    ],
    formalCostingAllowed: false, quotationIssuanceAllowed: false, frozenRateEligible: false,
    sampleAuthorizationGranted: false, rateReviewMeaning: "Marketing working-rate review; no independent Accounts or Management approval",
  };
}

export async function createEcs(inquiryId: string, input: CreateEcs, context: WorkflowContext) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireMarketingOwner(inquiry, user);
    const basis = await engineeringBasis(tx, inquiry, input.feasibilityId, true);
    const existing = await tx.estimatedCostSheet.findUnique({ where: { inquiryId } });
    if (existing) throw new ApiError(409, "Use the existing ECS revision or alternative endpoints", "ECS_ALREADY_EXISTS");
    const ecs = await tx.estimatedCostSheet.create({ data: { inquiryId, createdById: user.id } });
    const version = await tx.ecsVersion.create({
      data: {
        ecsId: ecs.id, baselineVersionId: basis.baselineVersionId, feasibilityId: basis.id,
        version: 1, alternativeKey: randomUUID(), createdById: user.id,
        costingCurrency: input.costingCurrency, quotationCurrency: input.quotationCurrency,
        changeReason: input.changeReason, commercialAssumptions: [], outstandingConditions: [],
        articles: { create: inheritedArticles(basis) },
      }, include: ecsVersionInclude,
    });
    await businessAudit(tx, context, "ECS_CREATED", "EcsVersion", version.id, undefined, auditValues(version), input.changeReason);
    return versionResponse(tx, inquiry, version);
  });
}

export async function listEcs(inquiryId: string, page: Page, context: WorkflowContext) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireFinancialRead(inquiry, user);
    const where = { inquiryId };
    const total = await tx.estimatedCostSheet.count({ where });
    const data = await tx.estimatedCostSheet.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page.page - 1) * page.pageSize, take: page.pageSize,
      include: { versions: { select: versionSummary, orderBy: { version: "desc" }, take: 1 } },
    });
    return { data, meta: { ...page, total, totalPages: Math.ceil(total / page.pageSize) } };
  });
}

export async function getEcs(inquiryId: string, ecsId: string, context: WorkflowContext) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireFinancialRead(inquiry, user);
    const ecs = await findEcs(tx, inquiryId, ecsId);
    const versionCount = await tx.ecsVersion.count({ where: { ecsId } });
    const latestVersion = await tx.ecsVersion.findFirst({
      where: { ecsId }, orderBy: { version: "desc" },
      select: {
        ...versionSummary,
        articles: { select: {
          id: true, feasibilityArticleId: true, articleCode: true, productName: true,
          productFamily: true, quantity: true, quantityUnit: true,
        }, orderBy: { articleCode: "asc" } },
      },
    });
    return {
      ...ecs, inquiry: { id: inquiry.id, irn: inquiry.irn }, versionCount, latestVersion,
      versionHistoryPath: `/api/marketing/inquiries/${inquiryId}/ecs/${ecsId}/versions`,
      controllingVersionId: null, frozenRateEligible: false,
    };
  });
}

export async function listVersions(inquiryId: string, ecsId: string, page: Page, context: WorkflowContext) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireFinancialRead(inquiry, user);
    await findEcs(tx, inquiryId, ecsId);
    const total = await tx.ecsVersion.count({ where: { ecsId } });
    const data = await tx.ecsVersion.findMany({
      where: { ecsId }, select: versionSummary, orderBy: { version: "desc" },
      skip: (page.page - 1) * page.pageSize, take: page.pageSize,
    });
    return { data, meta: { ...page, total, totalPages: Math.ceil(total / page.pageSize) } };
  });
}

export async function getVersion(inquiryId: string, ecsId: string, versionId: string, context: WorkflowContext) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireFinancialRead(inquiry, user);
    const version = await findVersion(tx, inquiryId, ecsId, versionId);
    return versionResponse(tx, inquiry, version);
  });
}

function validateCostItems(version: EcsRecord) {
  const fixedOrderCosts = new Map<string, EcsRecord["articles"][number]["costItems"][number]>();
  const allocations = new Map<string, Prisma.Decimal>();
  for (const article of version.articles) {
    const codes = new Set<string>();
    const orderReferences = new Set<string>();
    const items = new Map(article.costItems.map((item) => [item.id, item]));
    for (const item of article.costItems) {
      const code = item.code.trim().toLowerCase();
      if (codes.has(code)) throw new ApiError(422, "Cost item codes must be unique within an article", "ECS_DUPLICATE_ITEM");
      codes.add(code);
      if (item.feasibilityMaterialId) {
        if (item.chargingBasis !== "QUANTITY_RATE" || item.quantityBasis === "EXPLICIT" || item.quantity !== null || item.quantityUnit !== null) {
          throw new ApiError(422, "Inherited materials must use their engineering quantity basis", "ECS_ENGINEERING_READ_ONLY");
        }
      } else if (item.quantityBasis && item.quantityBasis !== "EXPLICIT") {
        throw new ApiError(422, "A supplementary or process cost needs an explicit financial quantity basis", "ECS_INVALID_QUANTITY_BASIS");
      }
      if (item.rateCurrency && ![version.costingCurrency, version.quotationCurrency].includes(item.rateCurrency)) {
        throw new ApiError(422, "Rate currency must match costing or quotation currency", "ECS_UNSUPPORTED_CURRENCY");
      }
      if (item.applicability !== "CHARGE" && !item.applicabilityReason) {
        throw new ApiError(422, "Explain excluded or included costs", "ECS_APPLICABILITY_REASON_REQUIRED");
      }
      if (item.applicability === "INCLUDED_IN_OTHER") {
        const target = item.includedInItemId ? items.get(item.includedInItemId) : undefined;
        if (!target || target.id === item.id || target.applicability !== "CHARGE" || target.chargingBasis === "PERCENTAGE") {
          throw new ApiError(422, "Link included costs to a charged non-percentage item in this article", "ECS_INVALID_INCLUDED_COST");
        }
      } else if (item.includedInItemId) {
        throw new ApiError(422, "Only included costs may reference another item's rate", "ECS_INVALID_INCLUDED_COST");
      }
      for (const id of item.percentageBaseItemIds) {
        const base = items.get(id);
        if (!base || id === item.id || base.applicability !== "CHARGE") {
          throw new ApiError(422, "Percentage bases must reference distinct charged items in this article", "ECS_INVALID_PERCENTAGE_BASE");
        }
      }
      if (item.chargingBasis === "PERCENTAGE") {
        if (item.unitRate !== null || item.quantity !== null || item.quantityUnit !== null || item.rateUnit !== null || item.rateCurrency !== null) {
          throw new ApiError(422, "Percentage costs use costing-currency item amounts; clear quantity and unit-rate fields", "ECS_MIXED_CHARGING_BASIS");
        }
      } else if (item.percentage !== null || item.percentageBaseItemIds.length > 0) {
        throw new ApiError(422, "Percentage inputs require percentage charging basis", "ECS_MIXED_CHARGING_BASIS");
      }
      if (item.chargingBasis === "FIXED_ORDER") {
        if (item.quantity !== null || item.quantityUnit !== null) {
          throw new ApiError(422, "Fixed order costs use the whole-order rate and explicit allocation percentage", "ECS_MIXED_CHARGING_BASIS");
        }
        if (item.applicability === "CHARGE" && item.orderCostReference) {
          const key = item.orderCostReference.toLowerCase();
          if (orderReferences.has(key)) {
            throw new ApiError(422, "Allocate each order-level charge only once per article", "ECS_DUPLICATE_ORDER_COST");
          }
          orderReferences.add(key);
          const previous = fixedOrderCosts.get(key);
          if (previous && (previous.unitRate?.toString() !== item.unitRate?.toString() ||
              previous.rateCurrency !== item.rateCurrency || previous.rateSource !== item.rateSource)) {
            throw new ApiError(422, "Allocations of an order cost must use the same total rate, currency and source", "ECS_INCONSISTENT_ORDER_COST");
          }
          fixedOrderCosts.set(key, item);
          const allocated = (allocations.get(key) ?? new Prisma.Decimal(0)).plus(item.allocationPercent ?? 0);
          if (allocated.greaterThan(100)) {
            throw new ApiError(422, "An order cost cannot be allocated more than once in total", "ECS_EXCESS_ORDER_ALLOCATION");
          }
          allocations.set(key, allocated);
        }
      } else if (item.orderCostReference !== null || item.allocationPercent !== null) {
        throw new ApiError(422, "Order allocations require fixed-order charging basis", "ECS_MIXED_CHARGING_BASIS");
      }
      if (!item.feasibilityMaterialId && !item.feasibilityProcessId) {
        const duplicate = article.costItems.some((source) => source.id !== item.id &&
          (source.feasibilityMaterialId || source.feasibilityProcessId) &&
          (source.name.trim().toLowerCase() === item.name.trim().toLowerCase() ||
            source.feasibilityMaterial?.code.trim().toLowerCase() === code));
        if (duplicate) throw new ApiError(422, "Update the inherited line instead of duplicating its cost", "ECS_DUPLICATE_INHERITED_COST");
      }
    }
  }
}

async function writeCostItem(tx: Prisma.TransactionClient, article: EcsRecord["articles"][number], input: CostItemInput, userId: string) {
  const { id, rateReview, ...fields } = input;
  const existing = id ? article.costItems.find((item) => item.id === id) : undefined;
  if (id && !existing) throw new ApiError(422, "Cost item does not belong to this article/version", "ECS_INVALID_ITEM_REFERENCE");
  if (existing && (existing.feasibilityMaterialId || existing.feasibilityProcessId) &&
      ((fields.code !== undefined && fields.code !== existing.code) || (fields.name !== undefined && fields.name !== existing.name))) {
    throw new ApiError(422, "Inherited item identifiers and names are read-only", "ECS_ENGINEERING_READ_ONLY");
  }
  const rateChanged = [
    "unitRate", "rateUnit", "rateCurrency", "rateSource", "rateSourceType", "rateSourceAttribution",
    "rateDate", "percentage", "percentageBaseItemIds", "chargingBasis", "allocationPercent", "orderCostReference",
  ].some((key) => Object.hasOwn(fields, key));
  let item;
  if (existing) {
    item = await tx.ecsCostItem.update({ where: { id: existing.id }, data: fields });
  } else {
    if (!fields.code || !fields.name || !fields.category) {
      throw new ApiError(422, "New supplementary items require code, name and category", "ECS_NEW_ITEM_FIELDS_REQUIRED");
    }
    item = await tx.ecsCostItem.create({ data: {
      ...fields, ecsArticleId: article.id, code: fields.code, name: fields.name, category: fields.category,
      assumptions: fields.assumptions ?? [], percentageBaseItemIds: fields.percentageBaseItemIds ?? [],
    } });
  }
  if (rateChanged || rateReview) {
    if (rateReview) {
      if (!item.rateSource || !item.rateSourceType || !item.rateDate ||
          (item.rateSourceType === "ACCOUNTS_INPUT" && !item.rateSourceAttribution) ||
          (item.chargingBasis === "PERCENTAGE" ? item.percentage === null : item.unitRate === null)) {
        throw new ApiError(422, "Rate review requires a value, source type/reference and effective date; Accounts inputs need attribution", "ECS_RATE_REVIEW_INCOMPLETE");
      }
      if (rateReview.classification === "CURRENT_WORKING" && existing &&
          ["HISTORICAL", "REVALIDATION_REQUIRED"].includes(existing.rateClassification) &&
          item.rateSourceType !== "REVALIDATED_HISTORICAL" &&
          !(fields.rateSource && fields.rateDate && fields.rateSourceType)) {
        throw new ApiError(422, "Supply a current source or explicitly revalidate the historical rate", "ECS_RATE_REVALIDATION_REQUIRED");
      }
    }
    await tx.ecsCostItem.update({ where: { id: item.id }, data: {
      rateClassification: rateReview?.classification ?? "UNREVIEWED",
      rateReviewedAt: rateReview ? new Date() : null,
      rateReviewedById: rateReview ? userId : null,
      rateReviewReason: rateReview?.reason ?? null,
    } });
  }
}

export async function updateVersion(inquiryId: string, ecsId: string, versionId: string, input: UpdateEcs, context: WorkflowContext) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireMarketingOwner(inquiry, user);
    const before = await findVersion(tx, inquiryId, ecsId, versionId);
    await requireEditable(tx, inquiry, before, input.expectedRevision);
    const { expectedRevision: _revision, reason, articles, ...fields } = input;
    if (before.costingCurrency === before.quotationCurrency && fields.exchangeRate && !fields.exchangeRate.equals(1)) {
      throw new ApiError(422, "Same-currency exchange rate must be one or unset", "ECS_INVALID_EXCHANGE_RATE");
    }
    for (const articleInput of articles ?? []) {
      const article = before.articles.find((record) => record.id === articleInput.id);
      if (!article) throw new ApiError(422, "Article does not belong to this ECS version", "ECS_INVALID_ARTICLE_REFERENCE");
      const { id, costItems, ...articleFields } = articleInput;
      await tx.ecsArticle.update({ where: { id }, data: articleFields });
      for (const item of costItems ?? []) await writeCostItem(tx, article, item, user.id);
    }
    const version = await tx.ecsVersion.update({ where: { id: versionId }, data: {
      ...fields, revision: { increment: 1 }, calculatedRevision: null, calculatedAt: null,
      calculationSnapshot: Prisma.DbNull,
    }, include: ecsVersionInclude });
    validateCostItems(version);
    calculateVersion(version);
    await businessAudit(tx, context, "ECS_INPUTS_UPDATED", "EcsVersion", versionId, auditValues(before), auditValues(version), reason);
    const rateUpdates = articles?.some((article) => article.costItems?.some((item) =>
      ["unitRate", "percentage", "rateSource", "rateSourceType", "rateDate", "rateCurrency", "rateUnit", "rateReview"].some((key) => Object.hasOwn(item, key))));
    if (rateUpdates) {
      await businessAudit(tx, context, "ECS_RATES_UPDATED", "EcsVersion", versionId,
        auditValues(before.articles), auditValues(version.articles), reason);
    }
    return versionResponse(tx, inquiry, version);
  });
}

export async function calculateEcs(inquiryId: string, ecsId: string, versionId: string, input: CalculateEcs, context: WorkflowContext) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireMarketingOwner(inquiry, user);
    const before = await findVersion(tx, inquiryId, ecsId, versionId);
    await requireEditable(tx, inquiry, before, input.expectedRevision);
    validateCostItems(before);
    const calculation = calculateVersion(before);
    const revision = before.revision + 1;
    const version = await tx.ecsVersion.update({ where: { id: versionId }, data: {
      revision, calculatedRevision: revision, calculatedAt: new Date(), calculationSnapshot: auditValues(calculation),
    }, include: ecsVersionInclude });
    await businessAudit(tx, context, "ECS_CALCULATED", "EcsVersion", versionId,
      auditValues({ revision: before.revision, calculation: before.calculationSnapshot }),
      auditValues({ revision, calculation }));
    return versionResponse(tx, inquiry, version);
  });
}

export async function recordDisposition(inquiryId: string, ecsId: string, versionId: string, input: DispositionEcs, context: WorkflowContext) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireMarketingOwner(inquiry, user);
    const before = await findVersion(tx, inquiryId, ecsId, versionId);
    await requireEditable(tx, inquiry, before, input.expectedRevision);
    if (input.status === "PRELIMINARY_PROVISIONAL") await engineeringBasis(tx, inquiry, before.feasibilityId, true);
    if (input.status === "PRICE_DEFERRED" && before.outstandingConditions.length === 0) {
      throw new ApiError(422, "Record the sample or technical dependency in outstandingConditions before deferring price", "ECS_DEFERRAL_DEPENDENCY_REQUIRED");
    }
    const version = await tx.ecsVersion.update({ where: { id: versionId }, data: {
      status: input.status, dispositionReason: input.reason, revision: { increment: 1 },
      calculatedRevision: null, calculatedAt: null, calculationSnapshot: Prisma.DbNull,
    }, include: ecsVersionInclude });
    await businessAudit(tx, context, "ECS_DISPOSITION_RECORDED", "EcsVersion", versionId,
      auditValues({ status: before.status, revision: before.revision }), auditValues({ status: version.status, revision: version.revision }), input.reason);
    return versionResponse(tx, inquiry, version);
  });
}

export async function submitEcs(inquiryId: string, ecsId: string, versionId: string, input: SubmitEcs, context: WorkflowContext) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireMarketingOwner(inquiry, user);
    const before = await findVersion(tx, inquiryId, ecsId, versionId);
    await requireEditable(tx, inquiry, before, input.expectedRevision);
    validateCostItems(before);
    const response = await versionResponse(tx, inquiry, before);
    if (response.approvalBlockers.length > 0) {
      throw new ApiError(409, "ECS cannot be prepared for approval until its dependencies are resolved", "ECS_SUBMISSION_BLOCKED", response.approvalBlockers);
    }
    const revision = before.revision + 1;
    const version = await tx.ecsVersion.update({ where: { id: versionId }, data: {
      status: "READY_FOR_APPROVAL", revision, calculatedRevision: revision,
      preparedAt: new Date(), preparedById: user.id, submissionReason: input.reason,
    }, include: ecsVersionInclude });
    await businessAudit(tx, context, "ECS_SUBMITTED", "EcsVersion", versionId,
      auditValues(before), auditValues(version), input.reason);
    return versionResponse(tx, inquiry, version);
  });
}

export async function reviseEcs(inquiryId: string, ecsId: string, versionId: string, input: ReviseEcs | AlternativeEcs, context: WorkflowContext) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    requireMarketingOwner(inquiry, user);
    const source = await findVersion(tx, inquiryId, ecsId, versionId);
    let feasibilityId = source.feasibilityId;
    if ("feasibilityId" in input && input.feasibilityId) feasibilityId = input.feasibilityId;
    const basis = await engineeringBasis(tx, inquiry, feasibilityId, true);
    const latest = await tx.ecsVersion.findFirst({ where: { ecsId }, orderBy: { version: "desc" }, select: { version: true } });
    const alternative = "alternativeDescription" in input;
    const sameBasis = feasibilityId === source.feasibilityId;
    let version = await tx.ecsVersion.create({ data: {
      ecsId, baselineVersionId: basis.baselineVersionId, feasibilityId,
      version: (latest?.version ?? 0) + 1, previousVersionId: source.id,
      alternativeKey: alternative ? randomUUID() : source.alternativeKey,
      alternativeDescription: alternative ? input.alternativeDescription : source.alternativeDescription,
      costingCurrency: source.costingCurrency, quotationCurrency: source.quotationCurrency,
      paymentTerms: source.paymentTerms, commercialAssumptions: source.commercialAssumptions,
      outstandingConditions: source.outstandingConditions, notes: source.notes,
      changeReason: input.changeReason, createdById: user.id,
      articles: { create: sameBasis ? copiedArticles(source) : inheritedArticles(basis) },
    }, include: ecsVersionInclude });
    if (sameBasis) {
      // Restore inclusion links only after every copied item exists.
      for (const article of source.articles) {
        const copied = version.articles.find((record) => record.feasibilityArticleId === article.feasibilityArticleId)!;
        for (const item of article.costItems) {
          if (!item.includedInItemId) continue;
          const target = article.costItems.find((record) => record.id === item.includedInItemId)!;
          const copiedItem = copied.costItems.find((record) => record.code === item.code)!;
          const copiedTarget = copied.costItems.find((record) => record.code === target.code)!;
          await tx.ecsCostItem.update({ where: { id: copiedItem.id }, data: { includedInItemId: copiedTarget.id } });
        }
      }
      version = await findVersion(tx, inquiryId, ecsId, version.id);
    }
    validateCostItems(version);
    await businessAudit(tx, context, alternative ? "ECS_ALTERNATIVE_CREATED" : "ECS_REVISED", "EcsVersion", version.id,
      auditValues({ sourceVersionId: source.id, sourceRevision: source.revision }), auditValues(version), input.changeReason);
    return versionResponse(tx, inquiry, version);
  });
}

export async function getCostItems(inquiryId: string, ecsId: string, versionId: string, context: WorkflowContext) {
  return withWorkflow(inquiryId, context, async (tx, inquiry, user) => {
    const version = await findVersion(tx, inquiryId, ecsId, versionId);
    if (user.role === "MERCHANDISE") {
      // withWorkflow already checks assignment. No draft financial data crosses this boundary.
      throw new ApiError(409, "No controlling frozen ECS rates are available before WF-06/WF-07", "ECS_FROZEN_RATES_UNAVAILABLE");
    }
    requireFinancialRead(inquiry, user);
    const items = [];
    for (const article of version.articles) {
      for (const item of article.costItems) {
        items.push({
          ...item, ecsId, ecsVersionId: version.id, ecsArticleId: article.id,
          ecsLineItemId: item.id, materialCode: item.feasibilityMaterial?.code ?? null,
          articleCode: article.articleCode, articleQuantity: article.quantity, articleQuantityUnit: article.quantityUnit,
          frozenRateEligible: false, ecsFrozenUnitRate: null,
        });
      }
    }
    return { inquiryId, irn: inquiry.irn, ecsId, versionId, items, frozenRateEligible: false, dependency: "WF-06 approval and WF-07 final negotiated-price freeze" };
  });
}
