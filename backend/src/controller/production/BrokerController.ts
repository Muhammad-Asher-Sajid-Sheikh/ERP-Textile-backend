import {
  PrismaClient,
  AuditActionType,
  BrokerPartyType,
} from "../../generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { createAuditLog } from "../../utils/Audit.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

interface AccessTokenPayload extends jwt.JwtPayload {
  id?: string;
  userId?: string;
  email?: string;
  role?: string;
  status?: string;
}

const sanitizeToken = (rawToken: string): string => {
  return rawToken.trim().replace(/^"(.*)"$/, "$1");
};

const getAccessToken = (req: Request): string => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Access token is required");
  }

  const token = sanitizeToken(authHeader.slice(7));
  if (!token) {
    throw new Error("Access token is required");
  }

  return token;
};

const getUserId = (accessToken: string): string => {
  const secret = process.env.ACCESS_TOKEN_SECRET;

  if (!secret) {
    throw new Error("ACCESS_TOKEN_SECRET is not configured");
  }

  const decoded = jwt.verify(accessToken, secret) as AccessTokenPayload;
  const userId = decoded.id ?? decoded.userId;

  if (!userId) {
    throw new Error("User ID not found in access token");
  }

  return userId;
};

const getParamString = (value: unknown, label = "ID"): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ${label}`);
  }
  return value.trim();
};

const isValidPartyType = (value: unknown): value is BrokerPartyType => {
  return (
    typeof value === "string" &&
    Object.values(BrokerPartyType).includes(value as BrokerPartyType)
  );
};

const logBrokerActivity = async (
  req: Request,
  actionType: AuditActionType,
  actionDetails: string,
  performedBy?: string
) => {
  try {
    await createAuditLog({
      req,
      actionType,
      actionDetails,
      performedBy,
    });
  } catch (error) {
    console.error("Broker audit logging failed:", error);
  }
};

// ==========================================
// 1. CREATE BROKER / THIRD-PARTY PROFILE
// ==========================================

export const createBroker = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);

    const { brokerName, partyType, contactPerson, email, phone } = req.body;

    if (!brokerName || typeof brokerName !== "string" || !brokerName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Broker name is mandatory.",
      });
    }

    if (partyType !== undefined && !isValidPartyType(partyType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid partyType. Allowed values: ${Object.values(
          BrokerPartyType
        ).join(", ")}`,
      });
    }

    const newBroker = await prisma.broker.create({
      data: {
        brokerName: brokerName.trim(),
        ...(partyType !== undefined && { partyType }),
        ...(contactPerson !== undefined && { contactPerson }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
      },
    });

    await logBrokerActivity(
      req,
      "CREATE" as AuditActionType,
      `Created broker profile ${newBroker.id} (${newBroker.brokerName})`,
      userId
    );

    return res.status(201).json({
      success: true,
      message: "Broker created successfully.",
      data: newBroker,
    });
  } catch (error: any) {
    console.error("Error creating broker:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while creating broker.",
      error: error.message,
    });
  }
};

// ==========================================
// 2. CREATE BROKER / THIRD-PARTY RECORD
// ==========================================

export const createBrokerRecord = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);

    const {
      icnNo,
      brokerId,
      stage,
      priceCost,
      dateToSent,
      dateToReceive,
    } = req.body;

    if (!icnNo || !brokerId || !stage || priceCost === undefined) {
      return res.status(400).json({
        success: false,
        message:
          "Missing mandatory fields: icnNo, brokerId, stage, and priceCost are required.",
      });
    }

    const parsedPriceCost = Number(priceCost);
    if (Number.isNaN(parsedPriceCost) || parsedPriceCost < 0) {
      return res.status(400).json({
        success: false,
        message: "priceCost must be a valid non-negative number.",
      });
    }

    const brokerExists = await prisma.broker.findUnique({
      where: { id: brokerId },
    });

    if (!brokerExists) {
      return res.status(404).json({
        success: false,
        message: `Broker with ID ${brokerId} not found.`,
      });
    }

    const newRecord = await prisma.brokerThirdPartyRecord.create({
      data: {
        icnNo: String(icnNo).trim(),
        brokerId,
        stage: String(stage).trim(),
        priceCost: parsedPriceCost,
        dateToSent: dateToSent ? new Date(dateToSent) : null,
        dateToReceive: dateToReceive ? new Date(dateToReceive) : null,
        isApproved: false,
      },
      include: {
        broker: true,
      },
    });

    await logBrokerActivity(
      req,
      "CREATE" as AuditActionType,
      `Created broker tracking record ${newRecord.id} for ICN ${newRecord.icnNo} (Broker: ${brokerExists.brokerName})`,
      userId
    );

    return res.status(201).json({
      success: true,
      message: "Broker tracking record created successfully.",
      data: newRecord,
    });
  } catch (error: any) {
    console.error("Error creating broker tracking record:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while creating broker record.",
      error: error.message,
    });
  }
};

// ==========================================
// 3. GET ALL BROKERS
// ==========================================

export const getAllBrokers = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);

    const { partyType } = req.query;

    if (partyType !== undefined && !isValidPartyType(partyType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid partyType filter. Allowed values: ${Object.values(
          BrokerPartyType
        ).join(", ")}`,
      });
    }

    const brokers = await prisma.broker.findMany({
      where: {
        ...(partyType !== undefined && { partyType }),
      },
      orderBy: { createdAt: "desc" },
    });

    await logBrokerActivity(
      req,
      "READ" as AuditActionType,
      "Retrieved all broker profiles",
      userId
    );

    return res.status(200).json({
      success: true,
      count: brokers.length,
      data: brokers,
    });
  } catch (error: any) {
    console.error("Error fetching brokers:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching brokers.",
      error: error.message,
    });
  }
};

// ==========================================
// 4. GET BROKER RECORDS BY ICN
// ==========================================

export const getBrokerRecordsByIcn = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);
    const icnNo = getParamString(req.params.icnNo, "ICN number");

    const records = await prisma.brokerThirdPartyRecord.findMany({
      where: { icnNo },
      include: {
        broker: true,
      },
      orderBy: { createdAt: "desc" },
    });

    await logBrokerActivity(
      req,
      "READ" as AuditActionType,
      `Retrieved broker tracking records for ICN ${icnNo}`,
      userId
    );

    return res.status(200).json({
      success: true,
      icnNo,
      count: records.length,
      data: records,
    });
  } catch (error: any) {
    console.error("Error fetching broker records by ICN:", error);
    return res.status(500).json({
      success: false,
      message:
        "Internal server error while fetching broker records for this ICN.",
      error: error.message,
    });
  }
};

// ==========================================
// 5. UPDATE BROKER PROFILE
// ==========================================

export const updateBroker = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);
    const id = getParamString(req.params.id, "Broker ID");

    const { brokerName, partyType, contactPerson, email, phone } = req.body;

    if (partyType !== undefined && !isValidPartyType(partyType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid partyType. Allowed values: ${Object.values(
          BrokerPartyType
        ).join(", ")}`,
      });
    }

    const existingBroker = await prisma.broker.findUnique({
      where: { id },
    });

    if (!existingBroker) {
      return res.status(404).json({
        success: false,
        message: `Broker with ID ${id} not found.`,
      });
    }

    const updatedBroker = await prisma.broker.update({
      where: { id },
      data: {
        ...(brokerName !== undefined && {
          brokerName: String(brokerName).trim(),
        }),
        ...(partyType !== undefined && { partyType }),
        ...(contactPerson !== undefined && { contactPerson }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
      },
    });

    await logBrokerActivity(
      req,
      "UPDATE" as AuditActionType,
      `Updated broker profile ${id} (${updatedBroker.brokerName})`,
      userId
    );

    return res.status(200).json({
      success: true,
      message: "Broker profile updated successfully.",
      data: updatedBroker,
    });
  } catch (error: any) {
    console.error("Error updating broker:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while updating broker.",
      error: error.message,
    });
  }
};

// ==========================================
// 6. UPDATE BROKER / THIRD-PARTY RECORD
// ==========================================

export const updateBrokerRecord = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);
    const id = getParamString(req.params.id, "Broker record ID");

    const {
      icnNo,
      brokerId,
      stage,
      priceCost,
      dateToSent,
      dateToReceive,
      isApproved,
    } = req.body;

    const existingRecord = await prisma.brokerThirdPartyRecord.findUnique({
      where: { id },
    });

    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        message: `Broker tracking record with ID ${id} not found.`,
      });
    }

    if (brokerId !== undefined) {
      const brokerExists = await prisma.broker.findUnique({
        where: { id: brokerId },
      });
      if (!brokerExists) {
        return res.status(404).json({
          success: false,
          message: `Broker with ID ${brokerId} not found.`,
        });
      }
    }

    let parsedPriceCost: number | undefined;
    if (priceCost !== undefined) {
      parsedPriceCost = Number(priceCost);
      if (Number.isNaN(parsedPriceCost) || parsedPriceCost < 0) {
        return res.status(400).json({
          success: false,
          message: "priceCost must be a valid non-negative number.",
        });
      }
    }

    const updatedRecord = await prisma.brokerThirdPartyRecord.update({
      where: { id },
      data: {
        ...(icnNo !== undefined && { icnNo: String(icnNo).trim() }),
        ...(brokerId !== undefined && { brokerId }),
        ...(stage !== undefined && { stage: String(stage).trim() }),
        ...(parsedPriceCost !== undefined && { priceCost: parsedPriceCost }),
        ...(dateToSent !== undefined && {
          dateToSent: dateToSent ? new Date(dateToSent) : null,
        }),
        ...(dateToReceive !== undefined && {
          dateToReceive: dateToReceive ? new Date(dateToReceive) : null,
        }),
        ...(isApproved !== undefined && { isApproved: Boolean(isApproved) }),
      },
      include: {
        broker: true,
      },
    });

    await logBrokerActivity(
      req,
      "UPDATE" as AuditActionType,
      `Updated broker tracking record ${id} for ICN ${updatedRecord.icnNo}`,
      userId
    );

    return res.status(200).json({
      success: true,
      message: "Broker tracking record updated successfully.",
      data: updatedRecord,
    });
  } catch (error: any) {
    console.error("Error updating broker tracking record:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while updating broker record.",
      error: error.message,
    });
  }
};

// ==========================================
// 7. DELETE BROKER PROFILE
// ==========================================

export const deleteBroker = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);
    const id = getParamString(req.params.id, "Broker ID");

    const existingBroker = await prisma.broker.findUnique({
      where: { id },
      include: {
        _count: {
          select: { trackingRecords: true },
        },
      },
    });

    if (!existingBroker) {
      return res.status(404).json({
        success: false,
        message: `Broker with ID ${id} not found.`,
      });
    }

    if (existingBroker._count.trackingRecords > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete broker. ${existingBroker._count.trackingRecords} active tracking record(s) are linked to this broker.`,
      });
    }

    await prisma.broker.delete({
      where: { id },
    });

    await logBrokerActivity(
      req,
      "DELETE" as AuditActionType,
      `Deleted broker profile ${id} (${existingBroker.brokerName})`,
      userId
    );

    return res.status(200).json({
      success: true,
      message: "Broker profile deleted successfully.",
    });
  } catch (error: any) {
    console.error("Error deleting broker:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while deleting broker.",
      error: error.message,
    });
  }
};

// ==========================================
// 8. DELETE BROKER / THIRD-PARTY RECORD
// ==========================================

export const deleteBrokerRecord = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);
    const id = getParamString(req.params.id, "Broker record ID");

    const existingRecord = await prisma.brokerThirdPartyRecord.findUnique({
      where: { id },
    });

    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        message: `Broker tracking record with ID ${id} not found.`,
      });
    }

    await prisma.brokerThirdPartyRecord.delete({
      where: { id },
    });

    await logBrokerActivity(
      req,
      "DELETE" as AuditActionType,
      `Deleted broker tracking record ${id} for ICN ${existingRecord.icnNo}`,
      userId
    );

    return res.status(200).json({
      success: true,
      message: "Broker tracking record deleted successfully.",
    });
  } catch (error: any) {
    console.error("Error deleting broker tracking record:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while deleting broker record.",
      error: error.message,
    });
  }
};