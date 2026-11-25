import { z } from "zod";
import { Prisma } from "../generated/client.js";
import { text, uuid, pagination } from "./common.validator.js";

const note = text.max(10000);
const notes = z.array(note).max(100);
const unit = text.max(80);
const decimal = z
  .union([
    z
      .number()
      .finite()
      .max(Number.MAX_SAFE_INTEGER)
      .min(-Number.MAX_SAFE_INTEGER),
    z
      .string()
      .max(40)
      .regex(/^-?\d+(?:\.\d+)?$/, "Use a decimal number without a unit"),
  ])
  .transform((value) => {
    return new Prisma.Decimal(value);
  })
  .refine((value) => {
    return (
      value.decimalPlaces() <= 8 && value.abs().lessThan("10000000000000000")
    );
  }, "Use at most 16 integer digits and 8 decimal places");
const positive = decimal.refine((value) => {
  return value.greaterThan(0);
}, "Value must be positive");
const nonNegative = decimal.refine((value) => {
  return value.greaterThanOrEqualTo(0);
}, "Value cannot be negative");
const attributes = z
  .record(
    text.max(100),
    z.union([
      z.string().max(10000),
      z.number().finite(),
      z.boolean(),
      z.null(),
    ]),
  )
  .refine((value) => {
    return Object.keys(value).length <= 100;
  }, "Use at most 100 technical attributes")
  .default({});

export const feasibilityParams = z.object({ id: uuid, feasibilityId: uuid });
export const feasibilityQuery = z.strictObject(pagination);
export const feasibilityOutcome = z.enum([
  "FEASIBLE",
  "FEASIBLE_WITH_CONDITIONS",
  "ALTERNATIVE_REQUIRED",
  "TRIAL_SAMPLE_REQUIRED",
  "NOT_FEASIBLE",
]);
export const createFeasibilityInput = z.strictObject({
  baselineVersionId: uuid,
  productionReviewerId: text.max(200),
  changeReason: note,
});
const material = z
  .strictObject({
    applicableAdjustments: z
      .array(z.enum(["ALLOWANCE", "PROCESS_LOSS", "SHRINKAGE", "WASTAGE"]))
      .max(4)
      .refine((values) => {
        return new Set(values).size === values.length;
      }, "Applicable adjustments must be unique")
      .default([]),
    adjustmentApplicabilityReason: note.nullable().default(null),
    code: text.max(100),
    name: text.max(300),
    materialType: text.max(100),
    composition: note.nullable().default(null),
    construction: note.nullable().default(null),
    colour: text.max(300).nullable().default(null),
    yarnCount: text.max(100).nullable().default(null),
    quantity: positive.nullable().default(null),
    quantityUnit: unit.nullable().default(null),
    consumptionBasis: z
      .enum(["FINISHED_DYED_WEIGHT", "FABRIC_WIDTH", "OTHER"])
      .nullable()
      .default(null),
    consumptionQuantity: positive.nullable().default(null),
    consumptionUnit: unit.nullable().default(null),
    perQuantity: positive.nullable().default(null),
    perUnit: unit.nullable().default(null),
    basisDescription: note.nullable().default(null),
    fabricWidth: positive.nullable().default(null),
    fabricWidthUnit: z
      .enum(["mm", "cm", "m", "in", "ft"])
      .nullable()
      .default(null),
    finishedWeight: positive.nullable().default(null),
    finishedWeightUnit: z.enum(["g", "kg"]).nullable().default(null),
    gsm: positive.nullable().default(null),
    allowancePercent: nonNegative.nullable().default(null),
    processLossPercent: nonNegative.nullable().default(null),
    shrinkagePercent: nonNegative.nullable().default(null),
    wastagePercent: nonNegative.nullable().default(null),
    minimumProcessingQuantity: positive.nullable().default(null),
    minimumProcessingUnit: unit.nullable().default(null),
    technicalAttributes: attributes,
    assumptions: notes.default([]),
    uncertainties: notes.default([]),
  })
  .superRefine((value, context) => {
    const pairs = [
      [value.quantity, value.quantityUnit, "quantityUnit"],
      [value.consumptionQuantity, value.consumptionUnit, "consumptionUnit"],
      [value.perQuantity, value.perUnit, "perUnit"],
      [value.fabricWidth, value.fabricWidthUnit, "fabricWidthUnit"],
      [value.finishedWeight, value.finishedWeightUnit, "finishedWeightUnit"],
      [
        value.minimumProcessingQuantity,
        value.minimumProcessingUnit,
        "minimumProcessingUnit",
      ],
    ] as const;
    for (const [quantity, measurementUnit, path] of pairs) {
      if ((quantity === null) !== (measurementUnit === null)) {
        context.addIssue({
          code: "custom",
          path: [path],
          message:
            "Supply both a measurement and its unit, or leave both unknown",
        });
      }
    }
    if (
      value.consumptionBasis === "FINISHED_DYED_WEIGHT" &&
      value.consumptionUnit &&
      !["g", "kg"].includes(value.consumptionUnit)
    ) {
      context.addIssue({
        code: "custom",
        path: ["consumptionUnit"],
        message: "Finished dyed weight consumption must use g or kg",
      });
    }
    if (
      value.consumptionBasis === "FABRIC_WIDTH" &&
      value.consumptionUnit &&
      !["mm", "cm", "m", "in", "ft", "m2", "yd", "yd2"].includes(
        value.consumptionUnit,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["consumptionUnit"],
        message: "Fabric-width consumption must use a length or area unit",
      });
    }
  });
const process = z.strictObject({
  sequence: z.number().int().positive().max(100000),
  operation: text.max(300),
  execution: z.enum(["INTERNAL", "OUTSOURCED"]).nullable().default(null),
  capability: note.nullable().default(null),
  processor: note.nullable().default(null),
  estimatedLeadTimeDays: nonNegative.nullable().default(null),
  technicalDetails: note.nullable().default(null),
  assumptions: notes.default([]),
  limitations: notes.default([]),
});
const risk = z.strictObject({
  description: note,
  mitigation: note,
  alternativeRoute: note.nullable().default(null),
  requiresManagementAcceptance: z.boolean(),
});
const article = z
  .strictObject({
    riskAssessment: note.nullable().default(null),
    code: text.max(100),
    name: text.max(300),
    productFamily: text.max(300),
    productKind: z.enum(["TOWEL", "WOVEN_MADE_UP", "OTHER"]),
    quantity: positive.nullable().default(null),
    quantityUnit: unit.nullable().default(null),
    technicalAttributes: attributes,
    internalCapability: note.nullable().default(null),
    externalCapability: note.nullable().default(null),
    supplierAvailability: note.nullable().default(null),
    sampleFeasibility: note.nullable().default(null),
    capacityAssessment: note.nullable().default(null),
    estimatedLeadTimeDays: nonNegative.nullable().default(null),
    capabilityLimitations: notes.default([]),
    assumptions: notes.default([]),
    uncertainties: notes.default([]),
    materials: z.array(material).max(100).default([]),
    processes: z.array(process).max(100).default([]),
    risks: z.array(risk).max(100).default([]),
  })
  .superRefine((value, context) => {
    if ((value.quantity === null) !== (value.quantityUnit === null)) {
      context.addIssue({
        code: "custom",
        path: ["quantityUnit"],
        message: "Supply both article quantity and unit, or leave both unknown",
      });
    }
    if (
      new Set(value.materials.map((item) => item.code)).size !==
      value.materials.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["materials"],
        message: "Material codes must be unique within an article",
      });
    }
    if (
      new Set(value.processes.map((item) => item.sequence)).size !==
      value.processes.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["processes"],
        message: "Process sequence numbers must be unique within an article",
      });
    }
  });
export const updateFeasibilityInput = z
  .strictObject({
    expectedRevision: z.number().int().positive(),
    changeReason: note,
    conditions: notes,
    assumptions: notes,
    uncertainties: notes,
    notes: note.nullable().default(null),
    articles: z.array(article).max(50),
  })
  .refine((value) => {
    return (
      new Set(value.articles.map((item) => item.code)).size ===
      value.articles.length
    );
  }, "Article codes must be unique within an assessment");
export const submitFeasibilityInput = z.strictObject({
  expectedRevision: z.number().int().positive(),
  outcome: feasibilityOutcome,
  reason: note,
});
export const reviseFeasibilityInput = z.strictObject({
  baselineVersionId: uuid.optional(),
  productionReviewerId: text.max(200).optional(),
  changeReason: note,
});
export const feasibilityRiskDecisionInput = z.strictObject({
  decision: z.enum(["ACCEPTED", "REJECTED"]),
  riskIds: z
    .array(uuid)
    .min(1)
    .max(100)
    .refine((ids) => {
      return new Set(ids).size === ids.length;
    }, "Risk references must be unique"),
  reason: note,
  conditions: notes,
});
export type CreateFeasibility = z.infer<typeof createFeasibilityInput>;
export type UpdateFeasibility = z.infer<typeof updateFeasibilityInput>;
export type SubmitFeasibility = z.infer<typeof submitFeasibilityInput>;
export type ReviseFeasibility = z.infer<typeof reviseFeasibilityInput>;
export type FeasibilityRiskDecision = z.infer<
  typeof feasibilityRiskDecisionInput
>;
