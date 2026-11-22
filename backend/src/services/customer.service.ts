import type { z } from "zod";
import type { Prisma } from "../generated/client.js";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import type {
  CreateCustomer,
  UpdateCustomer,
  customerQuery,
} from "../validators/customer.validator.js";
import {
  businessAudit,
  auditValues,
  type BusinessContext,
} from "./business-audit.service.js";
const include = {
  contacts: true,
  relationships: {
    include: {
      party: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.CustomerInclude;
async function validateRelatedParties(
  tx: Prisma.TransactionClient,
  relationships: CreateCustomer["relationships"],
  customerId?: string,
) {
  if (!relationships) {
    return;
  }
  const keys = relationships.map((relationship) => {
    return `${relationship.partyId}:${relationship.role}`;
  });
  if (new Set(keys).size !== keys.length) {
    throw new ApiError(
      400,
      "Repeated commercial-party relationship",
      "DUPLICATE_RELATIONSHIP",
    );
  }
  if (
    relationships.some((relationship) => {
      return relationship.partyId === customerId;
    })
  ) {
    throw new ApiError(
      422,
      "A customer cannot be its own related party",
      "SELF_RELATIONSHIP",
    );
  }
  const ids = [
    ...new Set(
      relationships.map((relationship) => {
        return relationship.partyId;
      }),
    ),
  ];
  if (
    (await tx.customer.count({
      where: {
        id: {
          in: ids,
        },
      },
    })) !== ids.length
  ) {
    throw new ApiError(
      422,
      "Related commercial party does not exist",
      "INVALID_PARTY",
    );
  }
}
export async function createCustomer(
  input: CreateCustomer,
  context: BusinessContext,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      await validateRelatedParties(tx, input.relationships);
      const { contacts, relationships, ...fields } = input;
      const customer = await tx.customer.create({
        data: {
          ...fields,
          createdById: context.actorId,
          updatedById: context.actorId,
          contacts: {
            create: contacts,
          },
          relationships: {
            create: relationships,
          },
        },
        include,
      });
      await businessAudit(
        tx,
        context,
        "CUSTOMER_CREATED",
        "Customer",
        customer.id,
        undefined,
        auditValues(customer),
      );
      return customer;
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new ApiError(
        409,
        "Customer code already exists",
        "CUSTOMER_CODE_CONFLICT",
      );
    }
    throw error;
  }
}
export async function getCustomer(id: string) {
  const customer = await prisma.customer.findUnique({
    where: {
      id,
    },
    include,
  });
  if (!customer) {
    throw new ApiError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
  }
  return customer;
}
export async function listCustomers(query: z.infer<typeof customerQuery>) {
  const where: Prisma.CustomerWhereInput = {
    country: query.country,
    active: query.active === undefined ? undefined : query.active === "true",
    ...(query.search
      ? {
          OR: [
            {
              name: {
                contains: query.search,
                mode: "insensitive",
              },
            },
            {
              code: {
                contains: query.search,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };
  const [data, total] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: [
        {
          name: "asc",
        },
        {
          id: "asc",
        },
      ],
    }),
    prisma.customer.count({
      where,
    }),
  ]);
  return {
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
    },
  };
}
export async function updateCustomer(
  id: string,
  input: UpdateCustomer,
  context: BusinessContext,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${id} FOR UPDATE`;
    const existingCustomer = await tx.customer.findUnique({
      where: {
        id,
      },
      include,
    });
    if (!existingCustomer) {
      throw new ApiError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
    }
    await validateRelatedParties(tx, input.relationships, id);
    const { contacts, relationships, ...fields } = input;
    const customer = await tx.customer.update({
      where: {
        id,
      },
      data: {
        ...fields,
        updatedById: context.actorId,
        ...(contacts
          ? {
              contacts: {
                deleteMany: {},
                create: contacts,
              },
            }
          : {}),
        ...(relationships
          ? {
              relationships: {
                deleteMany: {},
                create: relationships,
              },
            }
          : {}),
      },
      include,
    });
    await businessAudit(
      tx,
      context,
      "CUSTOMER_UPDATED",
      "Customer",
      id,
      auditValues(existingCustomer),
      auditValues(customer),
    );
    return customer;
  });
}
