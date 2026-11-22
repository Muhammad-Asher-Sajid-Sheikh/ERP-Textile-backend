import { z } from "zod";
import {
  pagination,
  text,
  uuid,
  instant,
  pastInstant,
} from "./common.validator.js";
const note = text.max(10000);
const notes = z.array(note).max(100);
const userId = text.max(200);
export const reviewOutcome = z.enum([
  "COMPLETE_FOR_CLARIFICATION_BASELINE",
  "CUSTOMER_CLARIFICATION_REQUIRED",
  "TECHNICAL_REVIEW_PENDING",
  "FEASIBLE_WITH_ASSUMPTIONS",
  "NOT_FEASIBLE",
]);
export const workflowParams = z.object({
  id: uuid,
  reviewId: uuid.optional(),
  clarificationId: uuid.optional(),
  versionId: uuid.optional(),
});
export const workflowPage = z.strictObject(pagination);
const expectedRevision = z.number().int().positive();
const reviewItem = z
  .strictObject({
    key: text.max(100).refine((key) => {
      return !key.startsWith("question:");
    }, "The question: prefix is reserved for clarification assertions"),
    area: z.enum([
      "PRODUCT",
      "QUANTITY",
      "COMMERCIAL",
      "TIMING",
      "PACKING",
      "QUALITY",
    ]),
    label: text.max(300),
    state: z.enum([
      "VERIFIED",
      "UNVERIFIED",
      "MISSING",
      "ASSUMED",
      "NOT_APPLICABLE",
    ]),
    value: note.nullable().default(null),
    requiredFor: z
      .array(z.enum(["QUOTATION", "SAMPLE", "ORDER_ACTIVATION"]))
      .max(3)
      .default([]),
    applicabilityReason: note,
    needsProduction: z.boolean().default(false),
    evidenceId: uuid.nullable().default(null),
    ownerId: userId.nullable().default(null),
    dueAt: instant.nullable().default(null),
    followUpAt: instant.nullable().default(null),
    escalationReason: note.nullable().default(null),
  })
  .superRefine((item, context) => {
    if (
      ["VERIFIED", "UNVERIFIED", "ASSUMED"].includes(item.state) &&
      !item.value
    ) {
      context.addIssue({
        code: "custom",
        message: "Record the known value or assumption",
        path: ["value"],
      });
    }
    if (item.state === "VERIFIED" && !item.evidenceId) {
      context.addIssue({
        code: "custom",
        message: "Verified customer information requires written evidence",
        path: ["evidenceId"],
      });
    }
    if (
      ["MISSING", "UNVERIFIED"].includes(item.state) &&
      (!item.ownerId || !item.dueAt || !item.followUpAt)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Missing or unverified information requires an owner, due date and follow-up",
      });
    }
    if (item.followUpAt && item.dueAt && item.followUpAt > item.dueAt) {
      context.addIssue({
        code: "custom",
        message: "Follow-up cannot be after the due date",
      });
    }
  });
export const reviewInput = z
  .strictObject({
    productFamily: text.max(300),
    applicabilityReference: note.nullable().default(null),
    assumptions: notes.default([]),
    notes: note.nullable().default(null),
    productionReviewerId: userId.nullable().default(null),
    items: z.array(reviewItem).min(1).max(100),
  })
  .refine((review) => {
    return (
      new Set(
        review.items.map((item) => {
          return item.key;
        }),
      ).size === review.items.length
    );
  }, "Review item keys must be unique");
export const updateReviewInput = reviewInput.safeExtend({ expectedRevision });
export const submitReviewInput = z.strictObject({
  expectedRevision,
  outcome: reviewOutcome,
  reason: note,
});
export const consultationInput = z.strictObject({
  expectedRevision,
  conclusion: z.enum(["SUPPORTED", "TECHNICAL_HOLD", "NOT_FEASIBLE"]),
  findings: note,
  assumptions: notes.default([]),
});
export const clarificationInput = z
  .strictObject({
    subject: text.max(300),
    requestedAt: pastInstant,
    responsibleId: userId,
    dueAt: instant,
    followUpAt: instant,
    questions: z
      .array(z.strictObject({ question: note, reviewItemId: uuid.optional() }))
      .min(1)
      .max(100),
  })
  .refine((input) => {
    return (
      input.followUpAt >= input.requestedAt && input.dueAt >= input.followUpAt
    );
  }, "Use request <= follow-up <= due dates");
export const clarificationUpdateInput = z.strictObject({
  expectedRevision,
  responsibleId: userId.optional(),
  dueAt: instant.optional(),
  followUpAt: instant.optional(),
  customerHold: z.boolean().optional(),
  reason: note,
});
export const clarificationResponseInput = z.strictObject({
  questionId: uuid,
  response: note,
  receivedAt: pastInstant,
  evidenceId: uuid,
  confirmation: z.enum(["WRITTEN_CONFIRMATION_PENDING", "WRITTEN_CONFIRMED"]),
});
export const escalationInput = z.strictObject({
  expectedRevision,
  reason: note,
});
const assertion = z.strictObject({
  key: text.max(100),
  value: note,
  confirmed: z.boolean(),
  evidenceId: uuid,
});
const assertions = z
  .array(assertion)
  .max(200)
  .refine((items) => {
    return (
      new Set(
        items.map((item) => {
          return item.key;
        }),
      ).size === items.length
    );
  }, "Assertion keys must be unique");
export const baselineInput = z.strictObject({
  reviewId: uuid,
  changeReason: note,
});
export const baselineUpdateInput = z.strictObject({
  expectedRevision,
  assertions,
  assumptions: notes,
  openQuestions: notes,
  changeReason: note,
});
export const finalizeBaselineInput = z.strictObject({
  expectedRevision,
  outcome: z.enum([
    "BASELINE_READY_FOR_FEASIBILITY",
    "CLARIFICATION_PENDING",
    "CUSTOMER_HOLD",
  ]),
});
export const reviseBaselineInput = z.strictObject({
  reviewId: uuid.optional(),
  changeReason: note,
});
export const provisionalInput = z.strictObject({
  reviewId: uuid,
  proposedActivity: note,
  unaffectedScope: note,
  assumptions: notes,
  risks: notes.min(1),
  reviewerId: userId,
  expiresAt: instant.optional(),
});
export const provisionalDecisionInput = z.strictObject({
  reviewId: uuid,
  disposition: z.enum([
    "REJECTED",
    "RETURNED_FOR_INFORMATION",
    "APPROVED",
    "REVOKED",
  ]),
  reason: note,
  conditions: notes.default([]),
});
export const overviewQuery = z.strictObject({
  ...pagination,
  customerId: uuid.optional(),
  merchandiserId: userId.optional(),
  status: z
    .enum([
      "RECEIVED",
      "REGISTERED",
      "ACKNOWLEDGED",
      "DUPLICATE_LINKED",
      "ON_HOLD",
      "CLOSED",
    ])
    .optional(),
  reviewOutcome: reviewOutcome.optional(),
  overdue: z.enum(["true", "false"]).optional(),
});
export const escalationQuery = z.strictObject({
  ...pagination,
  inquiryId: uuid.optional(),
  responsibleId: userId.optional(),
  overdue: z.enum(["true", "false"]).optional(),
});
export const provisionalQuery = z.strictObject({
  ...pagination,
  reviewerId: userId.optional(),
  inquiryId: uuid.optional(),
});
export type ReviewInput = z.infer<typeof reviewInput>;
export type UpdateReviewInput = z.infer<typeof updateReviewInput>;
export type Page = z.infer<typeof workflowPage>;
