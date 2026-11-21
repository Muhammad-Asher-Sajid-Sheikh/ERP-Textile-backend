import type { Request } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { actor } from "../middleware/auth.middleware.js";
import { idParams } from "../validators/common.validator.js";
import * as input from "../validators/workflow.validator.js";
import * as management from "../services/management.service.js";
function context(req: Request) {
  return { actorId: actor(req).id, requestId: req.correlationId };
}
export const inquiryOverview = asyncHandler(async (req, res) => {
  const parsed = input.overviewQuery.parse(req.query);
  const currentUser = context(req);
  const result = await management.inquiryOverview(parsed, currentUser);
  res.json(new ApiResponse(200, result.data, "Success", result.meta));
});
export const inquirySummary = asyncHandler(async (req, res) => {
  const id = idParams.parse(req.params).id;
  const currentUser = context(req);
  const result = await management.inquirySummary(id, currentUser);
  res.json(new ApiResponse(200, result, "Success"));
});
export const clarificationEscalations = asyncHandler(async (req, res) => {
  const parsed = input.escalationQuery.parse(req.query);
  const currentUser = context(req);
  const result = await management.clarificationEscalations(parsed, currentUser);
  res.json(new ApiResponse(200, result.data, "Success", result.meta));
});
export const listProvisionalRequests = asyncHandler(async (req, res) => {
  const parsed = input.provisionalQuery.parse(req.query);
  const currentUser = context(req);
  const result = await management.listProvisionalRequests(parsed, currentUser);
  res.json(new ApiResponse(200, result.data, "Success", result.meta));
});
export const getProvisionalRequest = asyncHandler(async (req, res) => {
  const id = idParams.parse(req.params).id;
  const currentUser = context(req);
  const result = await management.getProvisionalRequest(id, currentUser);
  res.json(new ApiResponse(200, result, "Success"));
});
export const decideProvisionalRequest = asyncHandler(async (req, res) => {
  const id = idParams.parse(req.params).id;
  const parsed = input.provisionalDecisionInput.parse(req.body);
  const currentUser = context(req);
  const result = await management.decideProvisionalRequest(
    id,
    parsed,
    currentUser,
  );
  res.json(new ApiResponse(200, result, "Success"));
});
