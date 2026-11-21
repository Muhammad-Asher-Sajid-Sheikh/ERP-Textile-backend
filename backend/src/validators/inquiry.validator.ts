import { z } from "zod";
import { Prisma } from "../generated/client.js";
import {
  InquirySource,
  InquiryPriority,
  InquiryStatus,
} from "../generated/enums.js";
import {
  text,
  uuid,
  instant,
  pastInstant,
  pagination,
} from "./common.validator.js";
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const attachment = z.strictObject({
  filename: z
    .string()
    .min(1)
    .max(180)
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9._ -]*$/,
      "Use a plain filename without path separators",
    ),
  mediaType: z.enum([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "text/plain",
    "message/rfc822",
  ]),
  base64: z
    .string()
    .min(4)
    .max(Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4)
    .regex(
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      "Invalid base64",
    ),
});
const evidenceFields = {
  source: z.enum(InquirySource),
  receivedAt: pastInstant,
  // Preserve the original message exactly; trim only to check non-emptiness.
  message: z
    .string()
    .refine((v) => {
      return v.trim().length > 0;
    }, "Message cannot be blank")
    .optional(),
  reference: text.optional(),
  attachment: attachment.optional(),
};
export const evidenceInput = z
  .strictObject({
    ...evidenceFields,
    correctsEvidenceId: uuid.optional(),
  })
  .refine((v) => {
    return v.message || v.attachment;
  }, "Original message or attachment bytes are required");
const originalEvidence = z.strictObject(evidenceFields).refine((v) => {
  return v.message || v.attachment;
}, "Original message or attachment bytes are required");
const editable = {
  productCategory: text.nullable().optional(),
  seasonProgram: text.nullable().optional(),
  destination: text.nullable().optional(),
  estimatedQuantity: z
    .number()
    .finite()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .refine((v) => {
      return new Prisma.Decimal(v).decimalPlaces() <= 4;
    }, "Use at most four decimal places")
    .nullable()
    .optional(),
  quantityUnit: text.nullable().optional(),
  targetDate: z.iso
    .date()
    .transform((v) => {
      return new Date(v + "T00:00:00.000Z");
    })
    .nullable()
    .optional(),
  merchandiserId: text,
  priority: z.enum(InquiryPriority),
  responseDueAt: instant,
  nextAction: text,
};
export const createInquiryInput = z
  .strictObject({
    customerId: uuid,
    source: z.enum(InquirySource),
    sourceReference: text.optional(),
    receivedAt: pastInstant,
    ...editable,
    priority: z.enum(InquiryPriority).default("NORMAL"),
    evidence: originalEvidence,
  })
  .refine((v) => {
    return v.responseDueAt >= v.receivedAt;
  }, "Response deadline cannot precede receipt")
  .refine((v) => {
    return (
      v.evidence.source === v.source &&
      v.evidence.receivedAt.getTime() === v.receivedAt.getTime()
    );
  }, "Original evidence must match the inquiry source and received timestamp");
export const updateInquiryInput = z
  .strictObject(editable)
  .partial()
  .refine((v) => {
    return Object.keys(v).length > 0;
  }, "Supply at least one editable field");
export const acknowledgementInput = z
  .strictObject({
    acknowledgedAt: pastInstant,
    channel: z.enum(InquirySource),
    recipient: text,
    message: text.optional(),
    reference: text.optional(),
  })
  .refine((v) => {
    return v.message || v.reference;
  }, "Record an acknowledgement message or reference");
export const duplicateInput = z.strictObject({
  duplicateOfId: uuid,
  reason: text,
});
export const transitionInput = z.strictObject({
  status: z.enum(["ON_HOLD", "CLOSED", "REGISTERED"]),
  reason: text,
  notes: text.optional(),
});
export const inquiryQuery = z.strictObject({
  ...pagination,
  search: text.optional(),
  customerId: uuid.optional(),
  merchandiserId: text.optional(),
  status: z.enum(InquiryStatus).optional(),
  priority: z.enum(InquiryPriority).optional(),
  source: z.enum(InquirySource).optional(),
});
export const evidenceParams = z.object({
  id: uuid,
  evidenceId: uuid,
});
export type CreateInquiry = z.infer<typeof createInquiryInput>;
export type UpdateInquiry = z.infer<typeof updateInquiryInput>;
export type EvidenceInput = z.infer<typeof evidenceInput>;
export type AcknowledgementInput = z.infer<typeof acknowledgementInput>;
