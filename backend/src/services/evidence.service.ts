import { createHash } from "node:crypto";
import { isUtf8 } from "node:buffer";
import type { Prisma } from "../generated/client.js";
import { ApiError } from "../utils/ApiError.js";
import {
  MAX_ATTACHMENT_BYTES,
  type EvidenceInput,
} from "../validators/inquiry.validator.js";
export const evidenceSelect = {
  id: true,
  inquiryId: true,
  source: true,
  receivedAt: true,
  message: true,
  reference: true,
  correctsEvidenceId: true,
  filename: true,
  mediaType: true,
  byteSize: true,
  attachmentSha256: true,
  contentSha256: true,
  uploadedById: true,
  createdAt: true,
} satisfies Prisma.InquiryEvidenceSelect;
export function prepareEvidence(input: EvidenceInput) {
  const { attachment, ...fields } = input;
  const attachmentBytes = attachment
    ? Buffer.from(attachment.base64, "base64")
    : undefined;
  if (attachmentBytes && attachment) {
    if (
      !attachmentBytes.length ||
      attachmentBytes.length > MAX_ATTACHMENT_BYTES ||
      attachmentBytes.toString("base64") !== attachment.base64
    ) {
      throw new ApiError(
        400,
        "Invalid attachment or attachment exceeds 5 MiB",
        "INVALID_ATTACHMENT",
      );
    }
    const mediaType = attachment.mediaType;
    let contentMatchesType: boolean;

    if (mediaType === "application/pdf") {
      contentMatchesType =
        attachmentBytes.subarray(0, 5).toString() === "%PDF-";
    } else if (mediaType === "image/png") {
      contentMatchesType = attachmentBytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    } else if (mediaType === "image/jpeg") {
      contentMatchesType =
        attachmentBytes[0] === 255 &&
        attachmentBytes[1] === 216 &&
        attachmentBytes[2] === 255;
    } else {
      contentMatchesType =
        isUtf8(attachmentBytes) && !attachmentBytes.includes(0);
    }
    if (!contentMatchesType) {
      throw new ApiError(
        400,
        "Attachment content does not match the declared type",
        "INVALID_ATTACHMENT_TYPE",
      );
    }
  }
  const attachmentSha256 = attachmentBytes
    ? createHash("sha256").update(attachmentBytes).digest("hex")
    : undefined;
  // Length-delimited JSON avoids ambiguous concatenation; filenames do not affect duplicate detection.
  const contentSha256 = createHash("sha256")
    .update(JSON.stringify([input.message ?? null, attachmentSha256 ?? null]))
    .digest("hex");
  return {
    ...fields,
    filename: attachment?.filename,
    mediaType: attachment?.mediaType,
    attachmentBytes: attachmentBytes,
    byteSize: attachmentBytes?.length,
    attachmentSha256,
    contentSha256,
  };
}
