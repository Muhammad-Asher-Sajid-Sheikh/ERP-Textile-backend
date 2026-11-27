import type { ErrorRequestHandler } from "express";
import { Prisma } from "../generated/client.js";
import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError.js";
import { prisma } from "../lib/prisma.js";
import { businessAudit } from "../services/business-audit.service.js";
export const errorHandler: ErrorRequestHandler = async (
  error: unknown,
  req,
  res,
  next,
) => {
  if (res.headersSent) {
    return next(error);
  }
  let failure = error instanceof ApiError ? error : undefined;
  if (error instanceof ZodError) {
    failure = new ApiError(
      400,
      "Invalid request",
      "VALIDATION_ERROR",
      error.issues.map((i) => {
        return {
          path: i.path,
          message: i.message,
        };
      }),
    );
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      failure = new ApiError(
        409,
        "A record with this identity already exists",
        "RESOURCE_CONFLICT",
      );
    }
    if (error.code === "P2025") {
      failure = new ApiError(404, "Resource not found", "RESOURCE_NOT_FOUND");
    }
    if (error.code === "P2003") {
      failure = new ApiError(
        422,
        "Referenced resource is missing or in use",
        "INVALID_REFERENCE",
      );
    }
    if (error.code === "P2034") {
      failure = new ApiError(
        409,
        "Concurrent update; reload and retry",
        "CONCURRENT_UPDATE",
      );
    }
  } else if (error instanceof SyntaxError && "body" in error) {
    failure = new ApiError(400, "Malformed JSON body", "INVALID_JSON");
  } else if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    failure = new ApiError(413, "Request body too large", "PAYLOAD_TOO_LARGE");
  }
  if (!failure) {
    // Never log raw ORM errors, SQL, request bodies, tokens or document contents.
    console.error({
      event: "request_failed",
      requestId: req.correlationId,
      errorType: error instanceof Error ? error.name : "UnknownError",
      location:
        error instanceof Error
          ? error.stack
              ?.split("\n")
              .filter((line) => {
                return /^\s+at /.test(line);
              })
              .slice(0, 5)
          : undefined,
    });
    failure = new ApiError(
      500,
      "Internal server error",
      "INTERNAL_ERROR",
      [],
      false,
    );
  }
  const requestPath = req.originalUrl.split("?")[0] ?? "";
  const workflowMutation =
    ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
    /^\/api\/(marketing\/inquiries|management\/(inquiries|provisional-review-requests))(\/|$)/.test(requestPath);
  if (req.user && workflowMutation && [403, 404, 409, 422].includes(failure.statusCode)) {
    const auditContext = { actorId: req.user.id, requestId: req.correlationId };
    const blockedAction = { method: req.method, code: failure.code, statusCode: failure.statusCode };
    const reason = failure.message;
    try {
      // The rejected business transaction has rolled back; retain its denial separately.
      await prisma.$transaction(async (tx) => {
        await businessAudit(
          tx,
          auditContext,
          "WORKFLOW_ACTION_BLOCKED",
          "WorkflowRequest",
          requestPath,
          undefined,
          blockedAction,
          reason,
        );
      });
    } catch {
      console.error({ event: "workflow_denial_audit_failed", requestId: req.correlationId });
    }
  }
  res.status(failure.statusCode).json({
    ...failure.compatibility,
    success: false,
    statusCode: failure.statusCode,
    code: failure.code,
    message: failure.message,
    errors: failure.errors,
    requestId: req.correlationId,
  });
};
