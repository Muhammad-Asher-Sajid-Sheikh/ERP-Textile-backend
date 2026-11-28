import type { Request } from "express";
import { actor } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { idParams } from "../validators/common.validator.js";
import * as input from "../validators/ecs.validator.js";
import * as ecs from "../services/ecs.service.js";

function context(req: Request) {
  return { actorId: actor(req).id, requestId: req.correlationId };
}

export const create = asyncHandler(async (req, res) => {
  const { id } = idParams.parse(req.params);
  const result = await ecs.createEcs(id, input.createEcsInput.parse(req.body), context(req));
  res.status(201).json(new ApiResponse(201, result, "ECS draft created"));
});

export const list = asyncHandler(async (req, res) => {
  const { id } = idParams.parse(req.params);
  const result = await ecs.listEcs(id, input.ecsQuery.parse(req.query), context(req));
  res.json(new ApiResponse(200, result.data, "Estimated cost sheets retrieved", result.meta));
});

export const get = asyncHandler(async (req, res) => {
  const { id, ecsId } = input.ecsParams.parse(req.params);
  const result = await ecs.getEcs(id, ecsId, context(req));
  res.json(new ApiResponse(200, result, "Estimated cost sheet retrieved"));
});

export const listVersions = asyncHandler(async (req, res) => {
  const { id, ecsId } = input.ecsParams.parse(req.params);
  const result = await ecs.listVersions(id, ecsId, input.ecsQuery.parse(req.query), context(req));
  res.json(new ApiResponse(200, result.data, "ECS versions and alternatives retrieved", result.meta));
});

export const getVersion = asyncHandler(async (req, res) => {
  const { id, ecsId, versionId } = input.versionParams.parse(req.params);
  const result = await ecs.getVersion(id, ecsId, versionId, context(req));
  res.json(new ApiResponse(200, result, "ECS version retrieved"));
});

export const update = asyncHandler(async (req, res) => {
  const { id, ecsId, versionId } = input.versionParams.parse(req.params);
  const result = await ecs.updateVersion(id, ecsId, versionId, input.updateEcsInput.parse(req.body), context(req));
  res.json(new ApiResponse(200, result, "ECS inputs updated; calculation invalidated"));
});

export const calculate = asyncHandler(async (req, res) => {
  const { id, ecsId, versionId } = input.versionParams.parse(req.params);
  const result = await ecs.calculateEcs(id, ecsId, versionId, input.calculateEcsInput.parse(req.body), context(req));
  res.json(new ApiResponse(200, result, "Preliminary calculation recorded with completeness and dependency information"));
});

export const disposition = asyncHandler(async (req, res) => {
  const { id, ecsId, versionId } = input.versionParams.parse(req.params);
  const result = await ecs.recordDisposition(id, ecsId, versionId, input.dispositionEcsInput.parse(req.body), context(req));
  res.json(new ApiResponse(200, result, "Costing disposition recorded; no work authorization granted"));
});

export const submit = asyncHandler(async (req, res) => {
  const { id, ecsId, versionId } = input.versionParams.parse(req.params);
  const result = await ecs.submitEcs(id, ecsId, versionId, input.submitEcsInput.parse(req.body), context(req));
  res.json(new ApiResponse(200, result, "ECS prepared for internal approval; commercial approval remains pending"));
});

export const revise = asyncHandler(async (req, res) => {
  const { id, ecsId, versionId } = input.versionParams.parse(req.params);
  const result = await ecs.reviseEcs(id, ecsId, versionId, input.reviseEcsInput.parse(req.body), context(req));
  res.status(201).json(new ApiResponse(201, result, "ECS revision created; copied rates require review"));
});

export const alternative = asyncHandler(async (req, res) => {
  const { id, ecsId, versionId } = input.versionParams.parse(req.params);
  const result = await ecs.reviseEcs(id, ecsId, versionId, input.alternativeEcsInput.parse(req.body), context(req));
  res.status(201).json(new ApiResponse(201, result, "Costing alternative created without commercial selection"));
});

export const costItems = asyncHandler(async (req, res) => {
  const { id, ecsId, versionId } = input.versionParams.parse(req.params);
  const result = await ecs.getCostItems(id, ecsId, versionId, context(req));
  res.json(new ApiResponse(200, result, "ECS cost items retrieved; frozen-rate use remains blocked"));
});
