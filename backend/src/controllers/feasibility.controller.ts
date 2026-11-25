import type { Request } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { actor } from "../middleware/auth.middleware.js";
import { idParams } from "../validators/common.validator.js";
import * as input from "../validators/feasibility.validator.js";
import * as feasibility from "../services/feasibility.service.js";

function context(req: Request) {
  const user = actor(req);
  return { actorId: user.id, requestId: req.correlationId };
}

export const create = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const body = input.createFeasibilityInput.parse(req.body);
  const currentUser = context(req);
  const assessment = await feasibility.createFeasibility(
    inquiryId,
    body,
    currentUser,
  );
  res
    .status(201)
    .json(new ApiResponse(201, assessment, "Feasibility draft created"));
});

export const list = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const page = input.feasibilityQuery.parse(req.query);
  const currentUser = context(req);
  const result = await feasibility.listFeasibilities(
    inquiryId,
    page,
    currentUser,
  );
  res.json(
    new ApiResponse(
      200,
      result.data,
      "Feasibility assessments retrieved",
      result.meta,
    ),
  );
});

export const get = asyncHandler(async (req, res) => {
  const params = input.feasibilityParams.parse(req.params);
  const currentUser = context(req);
  const assessment = await feasibility.getFeasibility(
    params.id,
    params.feasibilityId,
    currentUser,
  );
  res.json(
    new ApiResponse(200, assessment, "Feasibility assessment retrieved"),
  );
});

export const update = asyncHandler(async (req, res) => {
  const params = input.feasibilityParams.parse(req.params);
  const body = input.updateFeasibilityInput.parse(req.body);
  const currentUser = context(req);
  const assessment = await feasibility.updateFeasibility(
    params.id,
    params.feasibilityId,
    body,
    currentUser,
  );
  res.json(new ApiResponse(200, assessment, "Feasibility draft updated"));
});

export const submit = asyncHandler(async (req, res) => {
  const params = input.feasibilityParams.parse(req.params);
  const body = input.submitFeasibilityInput.parse(req.body);
  const currentUser = context(req);
  const assessment = await feasibility.submitFeasibility(
    params.id,
    params.feasibilityId,
    body,
    currentUser,
  );
  res.json(
    new ApiResponse(
      200,
      assessment,
      "Production feasibility submitted; no commercial or execution approval granted",
    ),
  );
});

export const revise = asyncHandler(async (req, res) => {
  const params = input.feasibilityParams.parse(req.params);
  const body = input.reviseFeasibilityInput.parse(req.body);
  const currentUser = context(req);
  const assessment = await feasibility.reviseFeasibility(
    params.id,
    params.feasibilityId,
    body,
    currentUser,
  );
  res
    .status(201)
    .json(new ApiResponse(201, assessment, "Feasibility revision created"));
});

export const riskDecision = asyncHandler(async (req, _res) => {
  const params = input.feasibilityParams.parse(req.params);
  const body = input.feasibilityRiskDecisionInput.parse(req.body);
  const currentUser = context(req);
  // Authority is currently unresolved; the service validates scope and returns a controlled conflict.
  await feasibility.decideFeasibilityRisk(
    params.id,
    params.feasibilityId,
    body,
    currentUser,
  );
});
