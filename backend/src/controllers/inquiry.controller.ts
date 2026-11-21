import type { Request } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { actor } from "../middleware/auth.middleware.js";
import { idParams, pagination } from "../validators/common.validator.js";
import * as input from "../validators/inquiry.validator.js";
import * as inquiry from "../services/inquiry.service.js";
const context = (req: Request) => {
  return {
    actorId: actor(req).id,
    requestId: req.correlationId,
  };
};
const id = (req: Request) => {
  return idParams.parse(req.params).id;
};
const page = (req: Request) => {
  return z.strictObject(pagination).parse(req.query);
};
export const create = asyncHandler(async (req, res) => {
  const result = await inquiry.createInquiry(
    input.createInquiryInput.parse(req.body),
    context(req),
  );
  res.status(201).json(
    new ApiResponse(201, result.inquiry, "Inquiry registered successfully", {
      likelyDuplicates: result.likelyDuplicates,
    }),
  );
});
export const get = asyncHandler(async (req, res) => {
  const data = await inquiry.getInquiry(id(req), actor(req));
  return res.json(new ApiResponse(200, data));
});
export const list = asyncHandler(async (req, res) => {
  const result = await inquiry.listInquiries(
    input.inquiryQuery.parse(req.query),
    actor(req),
  );
  res.json(
    new ApiResponse(200, result.data, "Inquiries retrieved", result.meta),
  );
});
export const update = asyncHandler(async (req, res) => {
  const data = await inquiry.updateInquiry(
    id(req),
    input.updateInquiryInput.parse(req.body),
    context(req),
  );
  return res.json(new ApiResponse(200, data, "Inquiry updated"));
});
export const addEvidence = asyncHandler(async (req, res) => {
  const data = await inquiry.addEvidence(
    id(req),
    input.evidenceInput.parse(req.body),
    context(req),
  );
  return res.status(201).json(new ApiResponse(201, data, "Evidence preserved"));
});
export const acknowledge = asyncHandler(async (req, res) => {
  const data = await inquiry.acknowledge(
    id(req),
    input.acknowledgementInput.parse(req.body),
    context(req),
  );
  return res
    .status(201)
    .json(new ApiResponse(201, data, "Acknowledgement recorded"));
});
export const linkDuplicate = asyncHandler(async (req, res) => {
  const body = input.duplicateInput.parse(req.body);
  const data = await inquiry.linkDuplicate(
    id(req),
    body.duplicateOfId,
    body.reason,
    context(req),
  );
  res.json(new ApiResponse(200, data, "Duplicate linked; both IRNs preserved"));
});
export const transition = asyncHandler(async (req, res) => {
  const data = await inquiry.transition(
    id(req),
    input.transitionInput.parse(req.body),
    context(req),
  );
  return res.json(new ApiResponse(200, data, "Inquiry status updated"));
});
export const history = asyncHandler(async (req, res) => {
  const result = await inquiry.history(id(req), actor(req), page(req));
  res.json(
    new ApiResponse(200, result.data, "Inquiry history retrieved", result.meta),
  );
});
export const listEvidence = asyncHandler(async (req, res) => {
  const result = await inquiry.listEvidence(id(req), actor(req), page(req));
  res.json(
    new ApiResponse(200, result.data, "Evidence retrieved", result.meta),
  );
});
export const listAcknowledgements = asyncHandler(async (req, res) => {
  const result = await inquiry.listAcknowledgements(
    id(req),
    actor(req),
    page(req),
  );
  res.json(
    new ApiResponse(
      200,
      result.data,
      "Acknowledgements retrieved",
      result.meta,
    ),
  );
});
export const download = asyncHandler(async (req, res) => {
  const params = input.evidenceParams.parse(req.params);
  const attachment = await inquiry.downloadAttachment(
    params.id,
    params.evidenceId,
    actor(req),
  );
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${attachment.filename}"`,
  );
  res.setHeader("Cache-Control", "no-store");
  res.send(Buffer.from(attachment.attachmentBytes!));
});
