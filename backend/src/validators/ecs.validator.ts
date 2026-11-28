import { z } from "zod";
import { Prisma } from "../generated/client.js";
import { pagination, pastInstant, text, uuid } from "./common.validator.js";

const decimal = z.string().max(39).regex(/^\d+(?:\.\d+)?$/, "Use a non-negative decimal string")
  .transform((value) => new Prisma.Decimal(value))
  .refine((value) => value.decimalPlaces() <= 12 && value.lessThan("1e26"),
    "Use at most 26 integer digits and 12 decimal places");
const positive = decimal.refine((value) => value.greaterThan(0), "Value must be positive");
const allocationPercent = positive.refine((value) => value.lessThanOrEqualTo(100), "Allocation cannot exceed 100 percent");
const currencies = new Set(Intl.supportedValuesOf("currency"));
const currency = z.string().trim().toUpperCase().refine((value) => currencies.has(value), "Use a supported ISO 4217 currency code");
const unit = text.transform((value) => value.toLowerCase());
const strings = z.array(text);
const uniqueIds = z.array(uuid).refine((ids) => new Set(ids).size === ids.length, "Duplicate identifiers");
export const ecsParams = z.object({ id: uuid, ecsId: uuid });
export const versionParams = ecsParams.extend({ versionId: uuid });
export const ecsQuery = z.strictObject(pagination);
export const createEcsInput = z.strictObject({
  feasibilityId: uuid,
  costingCurrency: currency,
  quotationCurrency: currency,
  changeReason: text,
});
export const category = z.enum([
  "YARN", "FABRIC", "PROCESSING", "LABOUR", "CONFECTION", "VALUE_ADDITION",
  "TRIM_ACCESSORY", "PACKING", "OVERHEAD", "FREIGHT", "FINANCE", "RISK_ALLOWANCE", "OTHER",
]);
const costItem = z.strictObject({
  id: uuid.optional(),
  code: text.optional(),
  name: text.optional(),
  category: category.optional(),
  componentRole: text.nullable().optional(),
  chargingBasis: z.enum(["QUANTITY_RATE", "FIXED_ORDER", "PERCENTAGE"]).nullable().optional(),
  quantityBasis: z.enum(["INHERITED_CONSUMPTION", "INHERITED_QUANTITY", "EXPLICIT"]).nullable().optional(),
  quantity: positive.nullable().optional(),
  quantityUnit: unit.nullable().optional(),
  quantityBasisReference: text.nullable().optional(),
  allowStandardUnitConversion: z.boolean().optional(),
  orderCostReference: text.nullable().optional(),
  allocationPercent: allocationPercent.nullable().optional(),
  unitRate: decimal.nullable().optional(),
  rateUnit: unit.nullable().optional(),
  rateCurrency: currency.nullable().optional(),
  rateSource: text.nullable().optional(),
  rateSourceType: z.enum([
    "SUPPLIER_QUOTATION", "PROCESSOR_QUOTATION", "PRODUCTION_ESTIMATE", "ACCOUNTS_INPUT",
    "APPROVED_INTERNAL_REFERENCE", "REVALIDATED_HISTORICAL",
  ]).nullable().optional(),
  rateSourceAttribution: text.nullable().optional(),
  rateDate: pastInstant.nullable().optional(),
  rateReview: z.strictObject({
    classification: z.enum(["CURRENT_WORKING", "HISTORICAL"]),
    reason: text,
  }).optional(),
  percentage: decimal.nullable().optional(),
  percentageBaseItemIds: uniqueIds.optional(),
  applicability: z.enum(["CHARGE", "INCLUDED_IN_OTHER", "NOT_APPLICABLE"]).optional(),
  applicabilityReason: text.nullable().optional(),
  includedInItemId: uuid.nullable().optional(),
  formulaDependency: text.nullable().optional(),
  assumptions: strings.optional(),
  notes: text.nullable().optional(),
});
const article = z.strictObject({
  id: uuid,
  proposedSellingPrice: positive.nullable().optional(),
  pricingNotes: text.nullable().optional(),
  assumptions: strings.optional(),
  costItems: z.array(costItem).optional(),
}).superRefine((value, ctx) => {
  const ids = value.costItems?.flatMap((item) => item.id ? [item.id] : []) ?? [];
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate cost item identifiers" });
  }
});
export const updateEcsInput = z.strictObject({
  expectedRevision: z.number().int().positive(),
  reason: text,
  exchangeRate: positive.nullable().optional(),
  exchangeRateSource: text.nullable().optional(),
  exchangeRateDate: pastInstant.nullable().optional(),
  paymentTerms: text.nullable().optional(),
  commercialAssumptions: strings.optional(),
  outstandingConditions: strings.optional(),
  costCoverageNotes: text.nullable().optional(),
  notes: text.nullable().optional(),
  articles: z.array(article).optional(),
}).superRefine((value, ctx) => {
  const ids = value.articles?.map((item) => item.id) ?? [];
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate article identifiers" });
  }
});
export const calculateEcsInput = z.strictObject({ expectedRevision: z.number().int().positive() });
export const submitEcsInput = calculateEcsInput.extend({ reason: text });
export const dispositionEcsInput = submitEcsInput.extend({
  status: z.enum(["DRAFT_DATA_PENDING", "PRELIMINARY_PROVISIONAL", "PRICE_DEFERRED"]),
});
export const reviseEcsInput = z.strictObject({ changeReason: text, feasibilityId: uuid.optional() });
export const alternativeEcsInput = z.strictObject({ changeReason: text, alternativeDescription: text });

export type CreateEcs = z.infer<typeof createEcsInput>;
export type UpdateEcs = z.infer<typeof updateEcsInput>;
export type CostItemInput = z.infer<typeof costItem>;
export type CalculateEcs = z.infer<typeof calculateEcsInput>;
export type SubmitEcs = z.infer<typeof submitEcsInput>;
export type DispositionEcs = z.infer<typeof dispositionEcsInput>;
export type ReviseEcs = z.infer<typeof reviseEcsInput>;
export type AlternativeEcs = z.infer<typeof alternativeEcsInput>;
