import { PrismaClient, AuditActionType } from "../../generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { type Request, type Response } from "express";
import jwt from "jsonwebtoken";
//import { createAuditLog } from "../../middleware/rbac.middleware.js";
import { createAuditLog } from "../../utils/Audit.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

interface AccessTokenPayload extends jwt.JwtPayload {
  userId: string;
}

const getAccessToken = (req: Request): string => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Access token is required");
  }

  const token = authHeader.slice(7).trim();
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

const getParamId = (req: Request): string => {
  const { id } = req.params;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Invalid record ID");
  }
  return id;
};

const logRackRetentionActivity = async (
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
    console.error("RackRetention audit logging failed:", error);
  }
};

// ==========================================
// 1. CREATE RACK RETENTION
// ==========================================

export const createRackRetention = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);

    const {
      ppsId,
      sampleCode,
      rackLocation,
      custodianId,
      markingNotes,
      photoUrls,
    } = req.body;

    if (!ppsId || !sampleCode || !rackLocation || !custodianId) {
      return res.status(400).json({
        success: false,
        message: "ppsId, sampleCode, rackLocation and custodianId are required",
      });
    }

    const pps = await prisma.preProductionSample.findUnique({
      where: { id: ppsId },
    });

    if (!pps) {
      return res.status(404).json({
        success: false,
        message: "Pre-production sample not found",
      });
    }

    const existingRetention = await prisma.rackRetention.findUnique({
      where: { ppsId },
    });

    if (existingRetention) {
      return res.status(409).json({
        success: false,
        message: "Rack retention already exists for this PPS",
      });
    }

    const rackRetention = await prisma.rackRetention.create({
      data: {
        ppsId,
        sampleCode,
        rackLocation,
        custodianId,
        markingNotes,
        photoUrls: photoUrls || [],
        createdBy: userId,
      },
      include: {
        pps: true,
      },
    });

    await logRackRetentionActivity(
      req,
      "CREATE" as AuditActionType,
      `Created rack retention record ${rackRetention.id} for PPS ${ppsId}`,
      userId
    );

    return res.status(201).json({
      success: true,
      message: "Rack retention created successfully",
      data: rackRetention,
    });
  } catch (error: any) {
    console.error("Create RackRetention Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create rack retention",
    });
  }
};

// ==========================================
// 2. GET ALL RACK RETENTIONS
// ==========================================

export const getAllRackRetentions = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);

    const rackRetentions = await prisma.rackRetention.findMany({
      include: {
        pps: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // await logRackRetentionActivity(
    //   accessToken,
    //   "READ" as AuditActionType,
    //   "Retrieved all rack retention records",
    //   req
    // );

    return res.status(200).json({
      success: true,
      count: rackRetentions.length,
      data: rackRetentions,
    });
  } catch (error: any) {
    console.error("Get All RackRetentions Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve rack retentions",
    });
  }
};

// ==========================================
// 3. GET RACK RETENTION BY ID
// ==========================================

export const getRackRetentionById = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const id = getParamId(req);

    const rackRetention = await prisma.rackRetention.findUnique({
      where: { id },
      include: {
        pps: true,
      },
    });

    if (!rackRetention) {
      return res.status(404).json({
        success: false,
        message: "Rack retention record not found",
      });
    }

    // await logRackRetentionActivity(
    //   accessToken,
    //   "READ" as AuditActionType,
    //   `Retrieved rack retention record ${id}`,
    //   req
    // );

    return res.status(200).json({
      success: true,
      data: rackRetention,
    });
  } catch (error: any) {
    console.error("Get RackRetention By ID Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve rack retention",
    });
  }
};

// ==========================================
// 4. UPDATE RACK RETENTION
// ==========================================

export const updateRackRetention = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);
    const id = getParamId(req);

    const {
      sampleCode,
      rackLocation,
      custodianId,
      markingNotes,
      photoUrls,
      isActive,
      supersededReason,
    } = req.body;

    const existingRetention = await prisma.rackRetention.findUnique({
      where: { id },
    });

    if (!existingRetention) {
      return res.status(404).json({
        success: false,
        message: "Rack retention record not found",
      });
    }

    const updateData: any = {
      updatedBy: userId,
    };

    if (sampleCode !== undefined) updateData.sampleCode = sampleCode;
    if (rackLocation !== undefined) updateData.rackLocation = rackLocation;
    if (custodianId !== undefined) updateData.custodianId = custodianId;
    if (markingNotes !== undefined) updateData.markingNotes = markingNotes;
    if (photoUrls !== undefined) updateData.photoUrls = photoUrls;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (supersededReason !== undefined) {
      updateData.supersededReason = supersededReason;
    }

    const updatedRetention = await prisma.rackRetention.update({
      where: { id },
      data: updateData,
      include: {
        pps: true,
      },
    });

    await logRackRetentionActivity(
      req,
      "UPDATE" as AuditActionType,
      `Updated rack retention record ${id}`,
      userId
    );

    return res.status(200).json({
      success: true,
      message: "Rack retention updated successfully",
      data: updatedRetention,
    });
  } catch (error: any) {
    console.error("Update RackRetention Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update rack retention",
    });
  }
};

// ==========================================
// 5. DELETE RACK RETENTION
// ==========================================

export const deleteRackRetention = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);
    const id = getParamId(req);

    const existingRetention = await prisma.rackRetention.findUnique({
      where: { id },
    });

    if (!existingRetention) {
      return res.status(404).json({
        success: false,
        message: "Rack retention record not found",
      });
    }

    await prisma.rackRetention.delete({
      where: { id },
    });

    await logRackRetentionActivity(
      req,
      "DELETE" as AuditActionType,
      `Deleted rack retention record ${id}`,
      userId
    );

    return res.status(200).json({
      success: true,
      message: "Rack retention deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete RackRetention Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete rack retention",
    });
  }
};