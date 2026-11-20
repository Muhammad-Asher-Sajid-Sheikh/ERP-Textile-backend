export class ApiResponse<T = null> {
  readonly success = true;
  constructor(
    public readonly statusCode: number,
    public readonly data: T,
    public readonly message = 'Success',
    public readonly meta?: Record<string, unknown>,
  ) {}
}
