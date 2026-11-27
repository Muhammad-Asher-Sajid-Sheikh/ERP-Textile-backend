import { Prisma } from "../generated/client.js";
import { ApiError } from "../utils/ApiError.js";

export const ecsVersionInclude = {
  articles: {
    orderBy: { articleCode: "asc" },
    include: {
      costItems: {
        orderBy: { code: "asc" },
        include: { feasibilityMaterial: true, feasibilityProcess: true },
      },
    },
  },
} satisfies Prisma.EcsVersionInclude;
export type EcsRecord = Prisma.EcsVersionGetPayload<{ include: typeof ecsVersionInclude }>;
type CostItem = EcsRecord["articles"][number]["costItems"][number];
type Article = EcsRecord["articles"][number];
const Decimal = Prisma.Decimal.clone({ precision: 80, rounding: Prisma.Decimal.ROUND_HALF_UP });

function resultNumber(value: Prisma.Decimal | null): string | null {
  if (value === null) return null;
  const rounded = value.toDecimalPlaces(12);
  if (!rounded.isFinite() || rounded.abs().greaterThanOrEqualTo("1e26")) {
    throw new ApiError(422, "Calculated value exceeds decimal storage precision", "ECS_NUMERIC_OVERFLOW");
  }
  return rounded.toFixed();
}

function normalizedUnit(unit: string | null): string | null {
  if (!unit) return null;
  const value = unit.trim().toLowerCase();
  const aliases: Record<string, string> = {
    pieces: "piece", pcs: "piece", pc: "piece", sets: "set",
    kilograms: "kg", kilogram: "kg", kgs: "kg", grams: "g", gram: "g",
    metres: "m", meters: "m", metre: "m", meter: "m",
    pounds: "lb", lbs: "lb", pound: "lb", cartons: "carton",
    inches: "in", inch: "in", feet: "ft", foot: "ft", yards: "yd", yard: "yd",
  };
  return aliases[value] ?? value;
}

function unitFactor(from: string | null, to: string | null, allowConversion: boolean) {
  const source = normalizedUnit(from);
  const target = normalizedUnit(to);
  if (!source || !target) return null;
  if (source === target) return new Decimal(1);
  if (!allowConversion) return null;
  // NIST Handbook 44, Appendix C: international pound, inch, foot and yard definitions.
  const mass: Record<string, string> = { kg: "1", g: "0.001", lb: "0.45359237" };
  const length: Record<string, string> = { m: "1", cm: "0.01", mm: "0.001", in: "0.0254", ft: "0.3048", yd: "0.9144" };
  for (const units of [mass, length]) {
    const sourceFactor = units[source];
    const targetFactor = units[target];
    if (sourceFactor && targetFactor) return new Decimal(sourceFactor).div(targetFactor);
  }
  return null;
}

function applicableQuantity(article: Article, item: CostItem, blockers: string[]) {
  let quantity: Prisma.Decimal | null = null;
  let unit: string | null = null;
  const material = item.feasibilityMaterial;
  if (material) {
    if (item.quantityBasis === "INHERITED_CONSUMPTION") {
      if (!material.consumptionQuantity || !material.perQuantity || !article.quantity ||
          !material.consumptionUnit || !material.perUnit || !article.quantityUnit) {
        blockers.push("MISSING_INHERITED_CONSUMPTION_BASIS");
      } else {
        const denominatorFactor = unitFactor(article.quantityUnit, material.perUnit, item.allowStandardUnitConversion);
        if (denominatorFactor === null) {
          blockers.push("CONSUMPTION_DENOMINATOR_UNIT_MISMATCH");
        } else if (material.perQuantity.lessThanOrEqualTo(0)) {
          blockers.push("INVALID_CONSUMPTION_DENOMINATOR");
        } else {
          quantity = new Decimal(material.consumptionQuantity).div(material.perQuantity).mul(article.quantity).mul(denominatorFactor);
          unit = material.consumptionUnit;
        }
      }
    } else if (item.quantityBasis === "INHERITED_QUANTITY") {
      quantity = material.quantity;
      unit = material.quantityUnit;
      if (!item.quantityBasisReference) blockers.push("ENGINEERING_QUANTITY_MEANING_REQUIRED");
    } else {
      blockers.push("SELECT_INHERITED_MATERIAL_QUANTITY_BASIS");
    }
    // WF-04 does not establish whether its quantities include these adjustments.
    const adjustments = [
      ["ALLOWANCE", material.allowancePercent],
      ["PROCESS_LOSS", material.processLossPercent],
      ["SHRINKAGE", material.shrinkagePercent],
      ["WASTAGE", material.wastagePercent],
    ] as const;
    if (adjustments.some(([kind, value]) => {
      if (value === null) return material.applicableAdjustments.includes(kind);
      return !value.isZero();
    })) {
      blockers.push("ENGINEERING_ADJUSTMENT_SEQUENCE_UNVALIDATED");
    }
    if (material.minimumProcessingQuantity !== null) {
      const minimumFactor = unitFactor(material.minimumProcessingUnit, unit, item.allowStandardUnitConversion);
      if (!quantity || minimumFactor === null) {
        blockers.push("PROCESS_MINIMUM_UNIT_OR_QUANTITY_UNRESOLVED");
      } else if (quantity.lessThan(new Decimal(material.minimumProcessingQuantity).mul(minimumFactor))) {
        blockers.push("PROCESS_MINIMUM_CHARGING_RULE_UNVALIDATED");
      }
    }
  } else if (item.quantityBasis === "EXPLICIT") {
    quantity = item.quantity;
    unit = item.quantityUnit;
    if (!item.quantityBasisReference) blockers.push("QUANTITY_BASIS_REFERENCE_REQUIRED");
  } else {
    blockers.push("MISSING_QUANTITY_BASIS");
  }
  if (!quantity || !unit) blockers.push("MISSING_QUANTITY_OR_UNIT");
  if (quantity && quantity.lessThanOrEqualTo(0)) blockers.push("INVALID_QUANTITY");
  const factor = unitFactor(unit, item.rateUnit, item.allowStandardUnitConversion);
  let chargingQuantity: Prisma.Decimal | null = null;
  if (factor === null) {
    blockers.push("UNIT_CONVERSION_REQUIRED_OR_UNSUPPORTED");
  } else if (quantity !== null) {
    chargingQuantity = new Decimal(quantity).mul(factor);
  }
  return { quantity, unit, chargingQuantity, conversionFactor: factor };
}

function toCostingCurrency(value: Prisma.Decimal, currency: string | null, version: EcsRecord, blockers: string[]) {
  if (currency === version.costingCurrency) return new Decimal(value);
  if (currency !== version.quotationCurrency) {
    blockers.push("UNSUPPORTED_OR_MISSING_RATE_CURRENCY");
    return null;
  }
  if (!version.exchangeRate || version.exchangeRate.lessThanOrEqualTo(0) || !version.exchangeRateSource || !version.exchangeRateDate) {
    blockers.push("MISSING_EXCHANGE_RATE_OR_SOURCE");
    return null;
  }
  return new Decimal(value).mul(version.exchangeRate);
}

export function calculateVersion(version: EcsRecord) {
  const calculationBlockers: string[] = [];
  const rateBlockers: string[] = [];
  let partialSubtotal = new Decimal(0);
  const orderAllocations = new Map<string, Prisma.Decimal>();
  for (const article of version.articles) {
    for (const item of article.costItems) {
      if (item.applicability === "CHARGE" && item.chargingBasis === "FIXED_ORDER" && item.orderCostReference && item.allocationPercent) {
        const key = item.orderCostReference.toLowerCase();
        const allocated = orderAllocations.get(key) ?? new Decimal(0);
        orderAllocations.set(key, allocated.plus(item.allocationPercent));
      }
    }
  }
  const articles = [];
  for (const article of version.articles) {
    const amounts = new Map<string, Prisma.Decimal>();
    const quantities = new Map<string, ReturnType<typeof applicableQuantity>>();
    const percentageBases = new Map<string, Prisma.Decimal>();
    const itemBlockers = new Map<string, string[]>();
    for (const item of article.costItems) {
      const blockers: string[] = [];
      itemBlockers.set(item.id, blockers);
      if (item.applicability !== "CHARGE") continue;
      if (item.formulaDependency) blockers.push(`UNVALIDATED_FORMULA: ${item.formulaDependency}`);
      if (!item.rateSource || !item.rateSourceType || !item.rateDate ||
          (item.rateSourceType === "ACCOUNTS_INPUT" && !item.rateSourceAttribution)) {
        rateBlockers.push(`${item.id}: RATE_SOURCE_INFORMATION_REQUIRED`);
      }
      if (item.rateClassification !== "CURRENT_WORKING" || !item.rateReviewedAt || !item.rateReviewedById) {
        rateBlockers.push(`${item.id}: CURRENT_RATE_REVIEW_REQUIRED`);
      }
      if (item.chargingBasis === "PERCENTAGE") {
        if (item.percentage === null || item.percentageBaseItemIds.length === 0) {
          blockers.push("MISSING_PERCENTAGE_OR_EXACT_BASE_ITEMS");
        }
        continue;
      }
      if (item.unitRate === null) blockers.push("MISSING_RATE");
      let sourceAmount: Prisma.Decimal | null = null;
      if (item.chargingBasis === "FIXED_ORDER") {
        if (item.rateUnit !== "order") blockers.push("FIXED_ORDER_RATE_UNIT_REQUIRED");
        if (!item.quantityBasisReference) blockers.push("ORDER_COST_SCOPE_REQUIRED");
        if (!item.orderCostReference || item.allocationPercent === null) {
          blockers.push("ORDER_COST_REFERENCE_AND_ALLOCATION_REQUIRED");
        } else if (!orderAllocations.get(item.orderCostReference.toLowerCase())?.equals(100)) {
          blockers.push("ORDER_COST_ALLOCATION_MUST_TOTAL_100_PERCENT");
        }
        if (item.unitRate !== null && item.allocationPercent !== null) {
          sourceAmount = new Decimal(item.unitRate).mul(item.allocationPercent).div(100);
        }
      } else if (item.chargingBasis === "QUANTITY_RATE") {
        const applicable = applicableQuantity(article, item, blockers);
        quantities.set(item.id, applicable);
        if (applicable.chargingQuantity && item.unitRate !== null) {
          sourceAmount = new Decimal(applicable.chargingQuantity).mul(item.unitRate);
        }
      } else {
        blockers.push("MISSING_CHARGING_BASIS");
      }
      if (sourceAmount !== null) {
        const amount = toCostingCurrency(sourceAmount, item.rateCurrency, version, blockers);
        if (amount !== null && blockers.length === 0) amounts.set(item.id, amount);
      }
    }
    // Resolve explicit percentage dependencies in order; cycles never produce a partial base.
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const item of article.costItems) {
        if (item.applicability !== "CHARGE" || item.chargingBasis !== "PERCENTAGE" ||
            amounts.has(item.id) || itemBlockers.get(item.id)!.length > 0 || item.percentage === null) continue;
        let base = new Decimal(0);
        let available = true;
        for (const id of item.percentageBaseItemIds) {
          const amount = amounts.get(id);
          if (amount === undefined) { available = false; break; }
          base = base.plus(amount);
        }
        if (available) {
          percentageBases.set(item.id, base);
          amounts.set(item.id, base.mul(item.percentage).div(100));
          progressed = true;
        }
      }
    }
    const blockers: string[] = [];
    let subtotal = new Decimal(0);
    const categoryAmounts = new Map<string, Prisma.Decimal>();
    const categorySubtotals: Record<string, string> = {};
    const costItems = [];
    let chargedItems = 0;
    for (const item of article.costItems) {
      const missing = itemBlockers.get(item.id)!;
      if (item.applicability === "CHARGE") {
        chargedItems++;
        if (item.chargingBasis === "PERCENTAGE" && !amounts.has(item.id) && missing.length === 0) {
          missing.push("PERCENTAGE_BASE_INCOMPLETE_OR_CYCLIC");
        }
        for (const reason of missing) blockers.push(`${item.id}: ${reason}`);
      }
      const amount = amounts.get(item.id) ?? null;
      if (amount !== null) {
        subtotal = subtotal.plus(amount);
        const categoryTotal = new Decimal(categoryAmounts.get(item.category) ?? "0").plus(amount);
        categoryAmounts.set(item.category, categoryTotal);
      }
      const applicable = quantities.get(item.id);
      costItems.push({
        id: item.id,
        calculatedAmount: resultNumber(amount),
        applicableQuantity: resultNumber(applicable?.quantity ?? null),
        applicableQuantityUnit: applicable?.unit ?? null,
        chargingQuantity: resultNumber(applicable?.chargingQuantity ?? null),
        chargingQuantityUnit: item.rateUnit,
        unitConversionFactor: resultNumber(applicable?.conversionFactor ?? null),
        quantityBasis: item.quantityBasis,
        engineeringRecordedQuantity: item.feasibilityMaterial?.quantity ?? null,
        engineeringRecordedQuantityUnit: item.feasibilityMaterial?.quantityUnit ?? null,
        engineeringAdjustedRequiredQuantity: null,
        procurementQuantity: null,
        percentageBaseAmount: resultNumber(percentageBases.get(item.id) ?? null),
        currency: version.costingCurrency,
        calculationBlockers: missing,
        excludedFromTotal: item.applicability !== "CHARGE",
      });
    }
    for (const [category, amount] of categoryAmounts) categorySubtotals[category] = resultNumber(amount)!;
    if (chargedItems === 0) blockers.push(`${article.id}: NO_APPLICABLE_COSTS`);
    if (!article.quantity || !article.quantityUnit || article.quantity.lessThanOrEqualTo(0)) {
      blockers.push(`${article.id}: MISSING_ARTICLE_QUANTITY`);
    }
    const total = blockers.length === 0 ? subtotal : null;
    let unitCost: Prisma.Decimal | null = null;
    let quotationUnitCost: Prisma.Decimal | null = null;
    if (total !== null && article.quantity) {
      unitCost = total.div(article.quantity);
      if (version.costingCurrency === version.quotationCurrency) {
        quotationUnitCost = unitCost;
      } else if (version.exchangeRate?.greaterThan(0) && version.exchangeRateSource && version.exchangeRateDate) {
        quotationUnitCost = unitCost.div(version.exchangeRate);
      } else {
        blockers.push(`${article.id}: MISSING_EXCHANGE_RATE_OR_SOURCE`);
      }
    }
    let profit: Prisma.Decimal | null = null;
    let markup: Prisma.Decimal | null = null;
    let margin: Prisma.Decimal | null = null;
    if (quotationUnitCost !== null && article.proposedSellingPrice?.greaterThan(0)) {
      profit = new Decimal(article.proposedSellingPrice).minus(quotationUnitCost);
      margin = profit.div(article.proposedSellingPrice).mul(100);
      if (quotationUnitCost.greaterThan(0)) markup = profit.div(quotationUnitCost).mul(100);
    }
    partialSubtotal = partialSubtotal.plus(subtotal);
    calculationBlockers.push(...blockers);
    articles.push({
      articleId: article.id, quantity: article.quantity, quantityUnit: article.quantityUnit,
      costItems, partialSubtotal: resultNumber(subtotal), categorySubtotals,
      totalEstimatedCost: resultNumber(total), costPerArticleUnit: resultNumber(unitCost),
      quotationCostPerArticleUnit: resultNumber(quotationUnitCost),
      proposedSellingPrice: article.proposedSellingPrice,
      profitPerUnit: resultNumber(profit), impliedMarkupPercent: resultNumber(markup),
      impliedMarginPercent: resultNumber(margin), calculationBlockers: blockers,
      arithmeticComplete: blockers.length === 0,
    });
  }
  if (version.articles.length === 0) calculationBlockers.push("NO_ARTICLES");
  return {
    ecsVersionId: version.id, baselineVersionId: version.baselineVersionId, feasibilityId: version.feasibilityId,
    engine: "WF05_EXPLICIT_ARITHMETIC_V1", financialAuthority: "PRELIMINARY_ESTIMATE",
    decimalPrecision: 80, outputDecimalPlaces: 12, rounding: "HALF_UP",
    unitConversionReference: "NIST Handbook 44 Appendix C; explicit opt-in, mass-to-mass or length-to-length only",
    exchangeRateDirection: "COSTING_CURRENCY_PER_QUOTATION_CURRENCY",
    articles, partialSubtotal: resultNumber(partialSubtotal),
    totalEstimatedCost: calculationBlockers.length === 0 ? resultNumber(partialSubtotal) : null,
    arithmeticComplete: calculationBlockers.length === 0,
    calculationBlockers, rateBlockers,
  };
}
