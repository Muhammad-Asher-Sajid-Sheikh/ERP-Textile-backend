import type { Request, Response, NextFunction, RequestHandler } from "express";
export function asyncHandler(
  handler: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => {
        return handler(req, res, next);
      })
      .catch(next);
  };
}
