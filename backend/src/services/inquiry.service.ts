import type { z } from "zod";
import {
  Prisma,
  type Inquiry,
  type InquiryStatus,
  type Role,
} from "../generated/client.js";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import {
  businessAudit,
  auditValues,
  type BusinessContext,
} from "./business-audit.service.js";
import { evidenceSelect, prepareEvidence } from "./evidence.service.js";
import { currentActor, requireMarketingOwner, withWorkflow } from "./workflow-access.service.js";
import type {
  CreateInquiry,
  UpdateInquiry,
  EvidenceInput,
  AcknowledgementInput,
  inquiryQuery,
  transitionInput,
} from "../validators/inquiry.validator.js";
type Reader = {
  id: string;
  role: Role;
};
const personSelect = {
  id: true,
  name: true,
  role: true,
} satisfies Prisma.UserSelect;
const detailInclude = {
  customer: {
    select: {
      id: true,
      code: true,
      name: true,
      country: true,
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
    },
  },
  merchandiser: {
    select: personSelect,
  },
  evidence: {
    select: evidenceSelect,
    take: 20,
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  },
  acknowledgements: {
    take: 20,
    orderBy: [
      {
        createdAt: "desc",
      },
      {
        id: "asc",
      },
    ],
  },
  _count: {
    select: {
      evidence: true,
      acknowledgements: true,
      duplicates: true,
    },
  },
} satisfies Prisma.InquiryInclude;
const scope = (reader: Reader): Prisma.InquiryWhereInput => {
  if (reader.role === "MARKETING") return { createdById: reader.id };
  if (reader.role === "MERCHANDISE") return { merchandiserId: reader.id };
  if (reader.role === "MANAGEMENT") return {};
  throw new ApiError(403, "Inquiry access is not permitted", "PERMISSION_DENIED");
};
async function validateMerchandiser(tx: Prisma.TransactionClient, id: string) {
  const user = await tx.user.findFirst({
    where: {
      id,
      role: "MERCHANDISE",
      status: "APPROVED",
    },
    select: {
      id: true,
    },
  });
  if (!user) {
    throw new ApiError(
      422,
      "Assigned merchandiser must be an approved MERCHANDISE user",
      "INVALID_MERCHANDISER",
    );
  }
}
function assertEditable(inquiry: Inquiry) {
  if (inquiry.status === "CLOSED" || inquiry.status === "DUPLICATE_LINKED") {
    throw new ApiError(
      409,
      "Closed or duplicate-linked inquiries cannot be edited",
      "INQUIRY_NOT_EDITABLE",
    );
  }
}
async function withInquiry<T>(
  id: string,
  context: BusinessContext,
  work: (tx: Prisma.TransactionClient, inquiry: Inquiry) => Promise<T>,
) {
  return withWorkflow(id, context, async (tx, inquiry, user) => {
    requireMarketingOwner(inquiry, user);
    return work(tx, inquiry);
  });
}
async function statusChange(
  tx: Prisma.TransactionClient,
  inquiry: Inquiry,
  status: InquiryStatus,
  context: BusinessContext,
  reason?: string,
  notes?: string,
) {
  await tx.inquiry.update({
    where: {
      id: inquiry.id,
    },
    data: {
      status,
      statusReason: reason ?? null,
    },
  });
  await tx.inquiryStatusHistory.create({
    data: {
      inquiryId: inquiry.id,
      previousStatus: inquiry.status,
      newStatus: status,
      changedById: context.actorId,
      reason,
      notes,
    },
  });
  await businessAudit(
    tx,
    context,
    "INQUIRY_STATUS_CHANGED",
    "Inquiry",
    inquiry.id,
    {
      status: inquiry.status,
    },
    {
      status,
    },
    reason,
  );
}
export async function createInquiry(
  input: CreateInquiry,
  context: BusinessContext,
) {
  const prepared = prepareEvidence(input.evidence);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${input.customerId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${context.actorId} FOR SHARE`;
      const user = await currentActor(tx, context);
      if (user.role !== "MARKETING") {
        throw new ApiError(403, "Only Marketing can register inquiries", "PERMISSION_DENIED");
      }
      const customer = await tx.customer.findUnique({
        where: {
          id: input.customerId,
        },
      });
      if (!customer) {
        throw new ApiError(422, "Customer does not exist", "INVALID_CUSTOMER");
      }
      if (!customer.active) {
        throw new ApiError(422, "Customer is inactive", "CUSTOMER_INACTIVE");
      }
      await validateMerchandiser(tx, input.merchandiserId);
      const now = new Date();
      const year = now.getUTCFullYear();
      // Roll back sequence allocation with registration so a failure does not consume an IRN.
      const allocated = await tx.$queryRaw<
        {
          lastValue: number;
        }[]
      >`
      INSERT INTO "IrnSequence" ("customerId", "year", "lastValue") VALUES (${customer.id}, ${year}, 1)
      ON CONFLICT ("customerId", "year") DO UPDATE SET "lastValue" = "IrnSequence"."lastValue" + 1
      RETURNING "lastValue"`;
      const serial = allocated[0]?.lastValue;
      if (!serial || serial > 999) {
        throw new ApiError(
          409,
          "The three-digit annual IRN sequence is exhausted; a numbering-policy decision is required",
          "IRN_SEQUENCE_EXHAUSTED",
        );
      }
      const date = now.toISOString().slice(2, 10).replaceAll("-", "");
      const irn = `${customer.code}-${date}-${String(serial).padStart(3, "0")}`;
      const candidates = await tx.inquiry.findMany({
        where: {
          customerId: customer.id,
          OR: [
            {
              originalEvidenceHash: prepared.contentSha256,
            },
            ...(input.sourceReference
              ? [
                  {
                    source: input.source,
                    sourceReference: input.sourceReference,
                  },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          irn: true,
          status: true,
        },
        take: 20,
        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "asc",
          },
        ],
      });
      const { evidence: _evidence, ...fields } = input;
      const inquiry = await tx.inquiry.create({
        data: {
          ...fields,
          irn,
          irnYear: year,
          irnSerial: serial,
          createdAt: now,
          status: "REGISTERED",
          createdById: context.actorId,
          originalEvidenceHash: prepared.contentSha256,
          evidence: {
            create: {
              ...prepared,
              uploadedById: context.actorId,
            },
          },
          history: {
            create: [
              {
                newStatus: "RECEIVED",
                changedById: context.actorId,
                createdAt: input.receivedAt,
                notes:
                  "Receipt recorded retrospectively from original communication.",
              },
              {
                previousStatus: "RECEIVED",
                newStatus: "REGISTERED",
                changedById: context.actorId,
                createdAt: now,
                notes: "IRN allocated on successful registration.",
              },
            ],
          },
        },
        include: detailInclude,
      });
      await businessAudit(
        tx,
        context,
        "INQUIRY_REGISTERED",
        "Inquiry",
        inquiry.id,
        undefined,
        {
          irn,
          status: inquiry.status,
          customerId: customer.id,
          merchandiserId: inquiry.merchandiserId,
          originalEvidenceHash: prepared.contentSha256,
        },
      );
      return {
        inquiry,
        likelyDuplicates: candidates,
      };
    },
    {
      maxWait: 10000,
      timeout: 15000,
    },
  );
}
export async function getInquiry(id: string, reader: Reader) {
  const inquiry = await prisma.inquiry.findFirst({
    where: {
      id,
      ...scope(reader),
    },
    include: detailInclude,
  });
  if (!inquiry) {
    throw new ApiError(404, "Inquiry not found", "INQUIRY_NOT_FOUND");
  }
  return inquiry;
}
async function assertReadable(id: string, reader: Reader) {
  if (
    !(await prisma.inquiry.findFirst({
      where: {
        id,
        ...scope(reader),
      },
      select: {
        id: true,
      },
    }))
  ) {
    throw new ApiError(404, "Inquiry not found", "INQUIRY_NOT_FOUND");
  }
}
export async function listInquiries(
  query: z.infer<typeof inquiryQuery>,
  reader: Reader,
) {
  const where: Prisma.InquiryWhereInput = {
    customerId: query.customerId,
    merchandiserId: query.merchandiserId,
    status: query.status,
    priority: query.priority,
    source: query.source,
    AND: [scope(reader)],
    ...(query.search
      ? {
          OR: [
            {
              irn: {
                contains: query.search,
                mode: "insensitive",
              },
            },
            {
              productCategory: {
                contains: query.search,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };
  const [data, total] = await prisma.$transaction([
    prisma.inquiry.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "asc",
        },
      ],
      include: {
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        merchandiser: {
          select: personSelect,
        },
      },
    }),
    prisma.inquiry.count({
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
export async function updateInquiry(
  id: string,
  input: UpdateInquiry,
  context: BusinessContext,
) {
  return withInquiry(id, context, async (tx, inquiry) => {
    assertEditable(inquiry);
    if (input.merchandiserId) {
      await validateMerchandiser(tx, input.merchandiserId);
    }
    if (input.responseDueAt && input.responseDueAt < inquiry.receivedAt) {
      throw new ApiError(
        422,
        "Response deadline cannot precede receipt",
        "INVALID_DEADLINE",
      );
    }
    const updatedInquiry = await tx.inquiry.update({
      where: {
        id,
      },
      data: input,
    });
    const oldFields = Object.fromEntries(
      Object.keys(input).map((key) => {
        return [key, inquiry[key as keyof UpdateInquiry]];
      }),
    );
    await businessAudit(
      tx,
      context,
      "INQUIRY_UPDATED",
      "Inquiry",
      id,
      auditValues(oldFields),
      auditValues(input),
    );
    return updatedInquiry;
  });
}
export async function addEvidence(
  id: string,
  input: EvidenceInput,
  context: BusinessContext,
) {
  const prepared = prepareEvidence(input);
  return withInquiry(id, context, async (tx, inquiry) => {
    // Evidence remains append-only even after closure so later original communications are not lost.
    if (
      input.correctsEvidenceId &&
      !(await tx.inquiryEvidence.findFirst({
        where: {
          id: input.correctsEvidenceId,
          inquiryId: inquiry.id,
        },
      }))
    ) {
      throw new ApiError(
        422,
        "Correction must reference evidence on this inquiry",
        "INVALID_EVIDENCE_REFERENCE",
      );
    }
    const evidence = await tx.inquiryEvidence.create({
      data: {
        ...prepared,
        inquiryId: id,
        uploadedById: context.actorId,
      },
      select: evidenceSelect,
    });
    await businessAudit(
      tx,
      context,
      "INQUIRY_EVIDENCE_ADDED",
      "Inquiry",
      id,
      undefined,
      {
        evidenceId: evidence.id,
        contentSha256: evidence.contentSha256,
        correctsEvidenceId: evidence.correctsEvidenceId,
      },
    );
    return evidence;
  });
}
export async function acknowledge(
  id: string,
  input: AcknowledgementInput,
  context: BusinessContext,
) {
  return withInquiry(id, context, async (tx, inquiry) => {
    if (!["REGISTERED", "ACKNOWLEDGED"].includes(inquiry.status)) {
      throw new ApiError(
        409,
        "Only registered or acknowledged inquiries can record an acknowledgement",
        "INVALID_STATUS_TRANSITION",
      );
    }
    if (input.acknowledgedAt < inquiry.receivedAt) {
      throw new ApiError(
        422,
        "Acknowledgement cannot precede receipt",
        "INVALID_ACKNOWLEDGEMENT_DATE",
      );
    }
    const acknowledgement = await tx.inquiryAcknowledgement.create({
      data: {
        ...input,
        inquiryId: id,
        recordedById: context.actorId,
      },
    });
    if (inquiry.status !== "ACKNOWLEDGED") {
      await statusChange(
        tx,
        inquiry,
        "ACKNOWLEDGED",
        context,
        undefined,
        `Acknowledgement ${acknowledgement.id}`,
      );
    }
    await businessAudit(
      tx,
      context,
      "INQUIRY_ACKNOWLEDGEMENT_RECORDED",
      "Inquiry",
      id,
      undefined,
      {
        acknowledgementId: acknowledgement.id,
        acknowledgedAt: input.acknowledgedAt.toISOString(),
      },
    );
    return acknowledgement;
  });
}
export async function linkDuplicate(
  id: string,
  duplicateOfId: string,
  reason: string,
  context: BusinessContext,
) {
  if (id === duplicateOfId) {
    throw new ApiError(
      422,
      "An inquiry cannot be its own duplicate",
      "INVALID_DUPLICATE",
    );
  }
  return withInquiry(id, context, async (tx, inquiry) => {
    assertEditable(inquiry);
    const target = await tx.inquiry.findUnique({
      where: {
        id: duplicateOfId,
      },
    });
    if (!target || target.customerId !== inquiry.customerId) {
      throw new ApiError(
        422,
        "Duplicates must belong to the same customer",
        "INVALID_DUPLICATE",
      );
    }
    if (
      target.duplicateOfId ||
      (await tx.inquiry.count({
        where: {
          duplicateOfId: id,
        },
      }))
    ) {
      throw new ApiError(
        409,
        "Link directly to the original inquiry; duplicate chains and cycles are not allowed",
        "DUPLICATE_CHAIN",
      );
    }
    await tx.inquiry.update({
      where: {
        id,
      },
      data: {
        duplicateOfId,
      },
    });
    await statusChange(
      tx,
      inquiry,
      "DUPLICATE_LINKED",
      context,
      reason,
      `Linked to ${target.irn}`,
    );
    await businessAudit(
      tx,
      context,
      "INQUIRY_DUPLICATE_LINKED",
      "Inquiry",
      id,
      {
        duplicateOfId: null,
      },
      {
        duplicateOfId,
      },
      reason,
    );
    return tx.inquiry.findUniqueOrThrow({
      where: {
        id,
      },
    });
  });
}
export async function transition(
  id: string,
  input: z.infer<typeof transitionInput>,
  context: BusinessContext,
) {
  return withInquiry(id, context, async (tx, inquiry) => {
    const allowed: Record<InquiryStatus, readonly InquiryStatus[]> = {
      RECEIVED: [],
      REGISTERED: ["ON_HOLD", "CLOSED"],
      ACKNOWLEDGED: ["ON_HOLD", "CLOSED"],
      ON_HOLD: ["REGISTERED", "CLOSED"],
      DUPLICATE_LINKED: ["CLOSED"],
      CLOSED: [],
    };
    if (!allowed[inquiry.status].includes(input.status)) {
      throw new ApiError(
        409,
        "Invalid inquiry status transition",
        "INVALID_STATUS_TRANSITION",
      );
    }
    await statusChange(
      tx,
      inquiry,
      input.status,
      context,
      input.reason,
      input.notes,
    );
    return tx.inquiry.findUniqueOrThrow({
      where: {
        id,
      },
    });
  });
}
type Page = {
  page: number;
  pageSize: number;
};
export async function history(id: string, reader: Reader, page: Page) {
  await assertReadable(id, reader);
  const args = {
    skip: (page.page - 1) * page.pageSize,
    take: page.pageSize,
    orderBy: [
      {
        createdAt: "asc" as const,
      },
      {
        id: "asc" as const,
      },
    ],
  };
  const [transitions, total] = await prisma.$transaction([
    prisma.inquiryStatusHistory.findMany({
      where: {
        inquiryId: id,
      },
      ...args,
    }),
    prisma.inquiryStatusHistory.count({
      where: {
        inquiryId: id,
      },
    }),
  ]);
  const audit =
    reader.role === "MANAGEMENT"
      ? await prisma.businessAuditLog.findMany({
          where: {
            entityType: "Inquiry",
            entityId: id,
          },
          ...args,
        })
      : undefined;
  const auditTotal =
    reader.role === "MANAGEMENT"
      ? await prisma.businessAuditLog.count({
          where: {
            entityType: "Inquiry",
            entityId: id,
          },
        })
      : undefined;
  return {
    data: {
      transitions,
      audit,
    },
    meta: {
      ...page,
      total,
      auditTotal,
    },
  };
}
export async function listEvidence(id: string, reader: Reader, page: Page) {
  await assertReadable(id, reader);
  const [data, total] = await prisma.$transaction([
    prisma.inquiryEvidence.findMany({
      where: {
        inquiryId: id,
      },
      select: evidenceSelect,
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
      orderBy: [
        {
          createdAt: "asc",
        },
        {
          id: "asc",
        },
      ],
    }),
    prisma.inquiryEvidence.count({
      where: {
        inquiryId: id,
      },
    }),
  ]);
  return {
    data,
    meta: {
      ...page,
      total,
    },
  };
}
export async function listAcknowledgements(
  id: string,
  reader: Reader,
  page: Page,
) {
  await assertReadable(id, reader);
  const [data, total] = await prisma.$transaction([
    prisma.inquiryAcknowledgement.findMany({
      where: {
        inquiryId: id,
      },
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
      orderBy: [
        {
          createdAt: "asc",
        },
        {
          id: "asc",
        },
      ],
    }),
    prisma.inquiryAcknowledgement.count({
      where: {
        inquiryId: id,
      },
    }),
  ]);
  return {
    data,
    meta: {
      ...page,
      total,
    },
  };
}
export async function downloadAttachment(
  id: string,
  evidenceId: string,
  reader: Reader,
) {
  await assertReadable(id, reader);
  const evidence = await prisma.inquiryEvidence.findFirst({
    where: {
      id: evidenceId,
      inquiryId: id,
    },
    select: {
      filename: true,
      attachmentBytes: true,
      attachmentSha256: true,
    },
  });
  if (!evidence?.attachmentBytes) {
    throw new ApiError(404, "Attachment not found", "ATTACHMENT_NOT_FOUND");
  }
  return evidence;
}
