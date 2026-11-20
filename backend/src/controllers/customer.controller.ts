import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { actor } from "../middleware/auth.middleware.js";
import { idParams } from "../validators/common.validator.js";
import {
  createCustomerInput,
  updateCustomerInput,
  customerQuery,
} from "../validators/customer.validator.js";
import * as customer from "../services/customer.service.js";
export const create = asyncHandler(async (req, res) => {
  const data = await customer.createCustomer(
    createCustomerInput.parse(req.body),
    { actorId: actor(req).id, requestId: req.correlationId },
  );
  res
    .status(201)
    .json(new ApiResponse(201, data, "Customer created successfully"));
});
export const get = asyncHandler(async (req, res) =>
  res.json(
    new ApiResponse(
      200,
      await customer.getCustomer(idParams.parse(req.params).id),
    ),
  ),
);
export const list = asyncHandler(async (req, res) => {
  const result = await customer.listCustomers(customerQuery.parse(req.query));
  res.json(
    new ApiResponse(200, result.data, "Customers retrieved", result.meta),
  );
});
export const update = asyncHandler(async (req, res) => {
  const data = await customer.updateCustomer(
    idParams.parse(req.params).id,
    updateCustomerInput.parse(req.body),
    { actorId: actor(req).id, requestId: req.correlationId },
  );
  res.json(new ApiResponse(200, data, "Customer updated successfully"));
});
