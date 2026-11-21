import type { Request } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { actor } from "../middleware/auth.middleware.js";
import { idParams, uuid } from "../validators/common.validator.js";
import * as input from "../validators/workflow.validator.js";
import * as reviews from "../services/technical-review.service.js";
import * as clarifications from "../services/clarification.service.js";
import * as baselines from "../services/baseline.service.js";
import * as management from "../services/management.service.js";
function context(req: Request) {
  const user = actor(req);
  return { actorId: user.id, requestId: req.correlationId };
}
export const createReview = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const body = input.reviewInput.parse(req.body);
  const currentUser = context(req);
  const result = await reviews.createReview(inquiryId, body, currentUser);
  res
    .status(201)
    .json(new ApiResponse(201, result, "Technical review draft created"));
});
export const updateReview = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const reviewId = uuid.parse(req.params.reviewId);
  const body = input.updateReviewInput.parse(req.body);
  const currentUser = context(req);
  const result = await reviews.updateReview(
    inquiryId,
    reviewId,
    body,
    currentUser,
  );
  res
    .status(200)
    .json(new ApiResponse(200, result, "Technical review updated"));
});
export const submitReview = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const reviewId = uuid.parse(req.params.reviewId);
  const body = input.submitReviewInput.parse(req.body);
  const currentUser = context(req);
  const result = await reviews.submitReview(
    inquiryId,
    reviewId,
    body,
    currentUser,
  );
  res
    .status(200)
    .json(new ApiResponse(200, result, "Technical review submitted"));
});
export const consult = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const reviewId = uuid.parse(req.params.reviewId);
  const body = input.consultationInput.parse(req.body);
  const currentUser = context(req);
  const result = await reviews.recordConsultation(
    inquiryId,
    reviewId,
    body,
    currentUser,
  );
  res
    .status(201)
    .json(new ApiResponse(201, result, "Production consultation recorded"));
});
export const getReview = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const reviewId = uuid.parse(req.params.reviewId);
  const currentUser = context(req);
  const result = await reviews.getReview(inquiryId, reviewId, currentUser);
  res
    .status(200)
    .json(new ApiResponse(200, result, "Technical review retrieved"));
});
export const listReviews = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const body = input.workflowPage.parse(req.query);
  const currentUser = context(req);
  const result = await reviews.listReviews(inquiryId, body, currentUser);
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result.data,
        "Technical reviews retrieved",
        result.meta,
      ),
    );
});
export const createClarification = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const body = input.clarificationInput.parse(req.body);
  const currentUser = context(req);
  const result = await clarifications.createClarification(
    inquiryId,
    body,
    currentUser,
  );
  res.status(201).json(new ApiResponse(201, result, "Clarification requested"));
});
export const updateClarification = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const clarificationId = uuid.parse(req.params.clarificationId);
  const body = input.clarificationUpdateInput.parse(req.body);
  const currentUser = context(req);
  const result = await clarifications.updateClarification(
    inquiryId,
    clarificationId,
    body,
    currentUser,
  );
  res.status(200).json(new ApiResponse(200, result, "Clarification updated"));
});
export const respond = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const clarificationId = uuid.parse(req.params.clarificationId);
  const body = input.clarificationResponseInput.parse(req.body);
  const currentUser = context(req);
  const result = await clarifications.respond(
    inquiryId,
    clarificationId,
    body,
    currentUser,
  );
  res
    .status(201)
    .json(new ApiResponse(201, result, "Clarification response preserved"));
});
export const escalate = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const clarificationId = uuid.parse(req.params.clarificationId);
  const body = input.escalationInput.parse(req.body);
  const currentUser = context(req);
  const result = await clarifications.escalate(
    inquiryId,
    clarificationId,
    body,
    currentUser,
  );
  res.status(200).json(new ApiResponse(200, result, "Clarification escalated"));
});
export const getClarification = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const clarificationId = uuid.parse(req.params.clarificationId);
  const currentUser = context(req);
  const result = await clarifications.getClarification(
    inquiryId,
    clarificationId,
    currentUser,
  );
  res.status(200).json(new ApiResponse(200, result, "Clarification retrieved"));
});
export const listClarifications = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const body = input.workflowPage.parse(req.query);
  const currentUser = context(req);
  const result = await clarifications.listClarifications(
    inquiryId,
    body,
    currentUser,
  );
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result.data,
        "Clarifications retrieved",
        result.meta,
      ),
    );
});
export const createBaseline = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const body = input.baselineInput.parse(req.body);
  const currentUser = context(req);
  const result = await baselines.createBaseline(inquiryId, body, currentUser);
  res.status(201).json(new ApiResponse(201, result, "Baseline draft created"));
});
export const updateBaseline = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const versionId = uuid.parse(req.params.versionId);
  const body = input.baselineUpdateInput.parse(req.body);
  const currentUser = context(req);
  const result = await baselines.updateBaseline(
    inquiryId,
    versionId,
    body,
    currentUser,
  );
  res.status(200).json(new ApiResponse(200, result, "Baseline draft updated"));
});
export const finalizeBaseline = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const versionId = uuid.parse(req.params.versionId);
  const body = input.finalizeBaselineInput.parse(req.body);
  const currentUser = context(req);
  const result = await baselines.finalizeBaseline(
    inquiryId,
    versionId,
    body,
    currentUser,
  );
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Baseline frozen; no customer or quotation approval granted",
      ),
    );
});
export const reviseBaseline = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const versionId = uuid.parse(req.params.versionId);
  const body = input.reviseBaselineInput.parse(req.body);
  const currentUser = context(req);
  const result = await baselines.reviseBaseline(
    inquiryId,
    versionId,
    body,
    currentUser,
  );
  res
    .status(201)
    .json(new ApiResponse(201, result, "Baseline revision created"));
});
export const getBaseline = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const versionId = uuid.parse(req.params.versionId);
  const currentUser = context(req);
  const result = await baselines.getBaseline(inquiryId, versionId, currentUser);
  res.status(200).json(new ApiResponse(200, result, "Baseline retrieved"));
});
export const listBaselines = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const body = input.workflowPage.parse(req.query);
  const currentUser = context(req);
  const result = await baselines.listBaselines(inquiryId, body, currentUser);
  res
    .status(200)
    .json(
      new ApiResponse(200, result.data, "Baselines retrieved", result.meta),
    );
});
export const createProvisionalRequest = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const body = input.provisionalInput.parse(req.body);
  const currentUser = context(req);
  const result = await management.createProvisionalRequest(
    inquiryId,
    body,
    currentUser,
  );
  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        result,
        "Provisional review requested; work is not authorized",
      ),
    );
});

export const listWorkflowNotices = asyncHandler(async (req, res) => {
  const inquiryId = idParams.parse(req.params).id;
  const page = input.workflowPage.parse(req.query);
  const currentUser = context(req);
  const result = await clarifications.listWorkflowNotices(
    inquiryId,
    page,
    currentUser,
  );
  res.json(
    new ApiResponse(
      200,
      result.data,
      "Customer-change notices retrieved",
      result.meta,
    ),
  );
});
