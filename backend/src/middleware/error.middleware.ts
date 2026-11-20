import type { ErrorRequestHandler } from 'express';
import { Prisma } from '../generated/client.js';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) return next(error);
  let failure = error instanceof ApiError ? error : undefined;
  if (error instanceof ZodError) {
    failure = new ApiError(400, 'Invalid request', 'VALIDATION_ERROR', error.issues.map(i => ({ path: i.path, message: i.message })));
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') failure = new ApiError(409, 'A record with this identity already exists', 'RESOURCE_CONFLICT');
    if (error.code === 'P2025') failure = new ApiError(404, 'Resource not found', 'RESOURCE_NOT_FOUND');
    if (error.code === 'P2003') failure = new ApiError(422, 'Referenced resource is missing or in use', 'INVALID_REFERENCE');
    if (error.code === 'P2034') failure = new ApiError(409, 'Concurrent update; reload and retry', 'CONCURRENT_UPDATE');
  } else if (error instanceof SyntaxError && 'body' in error) {
    failure = new ApiError(400, 'Malformed JSON body', 'INVALID_JSON');
  } else if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
    failure = new ApiError(413, 'Request body too large', 'PAYLOAD_TOO_LARGE');
  }
  if (!failure) {
    // Never log raw ORM errors, SQL, request bodies, tokens or document contents.
    console.error({ event: 'request_failed', requestId: req.correlationId,
      errorType: error instanceof Error ? error.name : 'UnknownError',
      location: error instanceof Error ? error.stack?.split('\n').filter(line => /^\s+at /.test(line)).slice(0, 5) : undefined });
    failure = new ApiError(500, 'Internal server error', 'INTERNAL_ERROR', [], false);
  }
  res.status(failure.statusCode).json({ ...failure.compatibility,
    success: false, statusCode: failure.statusCode, code: failure.code,
    message: failure.message, errors: failure.errors, requestId: req.correlationId });
};
