import type { RequestHandler } from "express";
import type { ZodType } from "zod";
export const validate = (
  schema: ZodType,
  target: "body" | "params" | "query" = "body",
): RequestHandler => {
  return (req, _res, next) => {
    try {
      schema.parse(req[target]);
      next();
    } catch (error) {
      next(error);
    }
  };
};
