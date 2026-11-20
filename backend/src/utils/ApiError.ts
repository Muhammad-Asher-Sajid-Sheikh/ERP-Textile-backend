export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    public readonly errors: unknown[] = [],
    public readonly isOperational = true,
    public readonly compatibility: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }
}
