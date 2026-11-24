import { PrismaClient, AuditActionType, ActiveGate } from "../../generated/client.js";
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





// Lot Schedule
// ==========================================
// 1. CREATE MASTER LOT
// ==========================================

export const createMasterLot = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);

    const {
      lotCode,
      tnaId,
      activeGate,
      isApproved,
      targetQuantity,
      plannedStartDate,
      plannedEndDate,
      remarks,
    } = req.body;

    if (!lotCode || !tnaId) {
      return res.status(400).json({
        success: false,
        message: "lotCode and tnaId are required",
      });
    }

    const existingLot = await prisma.masterLot.findUnique({
      where: { lotCode },
    });

    if (existingLot) {
      return res.status(409).json({
        success: false,
        message: "Master lot with this lotCode already exists",
      });
    }

    const tna = await prisma.timeActionPlan.findUnique({
      where: { id: tnaId },
    });

    if (!tna) {
      return res.status(404).json({
        success: false,
        message: "Time action plan not found",
      });
    }

    const masterLot = await prisma.masterLot.create({
      data: {
        lotCode,
        tnaId,
        ...(activeGate !== undefined && { activeGate }),
        ...(isApproved !== undefined && { isApproved: Boolean(isApproved) }),
        ...(targetQuantity !== undefined && {
          targetQuantity: targetQuantity === null ? null : Number(targetQuantity),
        }),
        ...(plannedStartDate !== undefined && {
          plannedStartDate: plannedStartDate ? new Date(plannedStartDate) : null,
        }),
        ...(plannedEndDate !== undefined && {
          plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : null,
        }),
        ...(remarks !== undefined && { remarks }),
        createdBy: userId,
      },
      include: {
        tna: true,
        stageLots: true,
      },
    });

    await logRackRetentionActivity(
      req,
      "CREATE" as AuditActionType,
      `Created master lot record ${masterLot.id} (${masterLot.lotCode})`,
      userId
    );

    return res.status(201).json({
      success: true,
      message: "Master lot created successfully",
      data: masterLot,
    });
  } catch (error: any) {
    console.error("Create MasterLot Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create master lot",
    });
  }
};

// ==========================================
// 2. GET ALL MASTER LOTS
// ==========================================

export const getAllMasterLots = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);

    const masterLots = await prisma.masterLot.findMany({
      include: {
        tna: true,
        stageLots: {
          orderBy: {
            stageSequence: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    await logRackRetentionActivity(
      req,
      "READ" as AuditActionType,
      "Retrieved all master lot records",
      userId
    );

    return res.status(200).json({
      success: true,
      count: masterLots.length,
      data: masterLots,
    });
  } catch (error: any) {
    console.error("Get All MasterLots Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve master lots",
    });
  }
};

// ==========================================
// 3. GET MASTER LOT BY ID
// ==========================================

export const getMasterLotById = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);
    const id = getParamId(req);

    const masterLot = await prisma.masterLot.findUnique({
      where: { id },
      include: {
        tna: true,
        stageLots: {
          orderBy: {
            stageSequence: "asc",
          },
        },
      },
    });

    if (!masterLot) {
      return res.status(404).json({
        success: false,
        message: "Master lot record not found",
      });
    }

    await logRackRetentionActivity(
      req,
      "READ" as AuditActionType,
      `Retrieved master lot record ${id}`,
      userId
    );

    return res.status(200).json({
      success: true,
      data: masterLot,
    });
  } catch (error: any) {
    console.error("Get MasterLot By ID Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve master lot",
    });
  }
};

// ==========================================
// 4. UPDATE MASTER LOT
// ==========================================

export const updateMasterLot = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);
    const id = getParamId(req);

    const {
      lotCode,
      tnaId,
      activeGate,
      isApproved,
      targetQuantity,
      plannedStartDate,
      plannedEndDate,
      remarks,
    } = req.body;

    const existingLot = await prisma.masterLot.findUnique({
      where: { id },
    });

    if (!existingLot) {
      return res.status(404).json({
        success: false,
        message: "Master lot record not found",
      });
    }

    if (lotCode !== undefined && lotCode !== existingLot.lotCode) {
      const duplicateCode = await prisma.masterLot.findUnique({
        where: { lotCode },
      });
      if (duplicateCode) {
        return res.status(409).json({
          success: false,
          message: "Another master lot already uses this lotCode",
        });
      }
    }

    if (tnaId !== undefined) {
      const tna = await prisma.timeActionPlan.findUnique({
        where: { id: tnaId },
      });
      if (!tna) {
        return res.status(404).json({
          success: false,
          message: "Time action plan not found",
        });
      }
    }

    const updateData: any = {
      updatedBy: userId,
    };

    if (lotCode !== undefined) updateData.lotCode = lotCode;
    if (tnaId !== undefined) updateData.tnaId = tnaId;
    if (activeGate !== undefined) updateData.activeGate = activeGate;
    if (isApproved !== undefined) updateData.isApproved = Boolean(isApproved);
    if (targetQuantity !== undefined) {
      updateData.targetQuantity =
        targetQuantity === null ? null : Number(targetQuantity);
    }
    if (plannedStartDate !== undefined) {
      updateData.plannedStartDate = plannedStartDate
        ? new Date(plannedStartDate)
        : null;
    }
    if (plannedEndDate !== undefined) {
      updateData.plannedEndDate = plannedEndDate
        ? new Date(plannedEndDate)
        : null;
    }
    if (remarks !== undefined) updateData.remarks = remarks;

    const updatedLot = await prisma.masterLot.update({
      where: { id },
      data: updateData,
      include: {
        tna: true,
        stageLots: {
          orderBy: {
            stageSequence: "asc",
          },
        },
      },
    });

    await logRackRetentionActivity(
      req,
      "UPDATE" as AuditActionType,
      `Updated master lot record ${id}`,
      userId
    );

    return res.status(200).json({
      success: true,
      message: "Master lot updated successfully",
      data: updatedLot,
    });
  } catch (error: any) {
    console.error("Update MasterLot Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update master lot",
    });
  }
};

// ==========================================
// 5. DELETE MASTER LOT
// ==========================================

export const deleteMasterLot = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);
    const id = getParamId(req);

    const existingLot = await prisma.masterLot.findUnique({
      where: { id },
    });

    if (!existingLot) {
      return res.status(404).json({
        success: false,
        message: "Master lot record not found",
      });
    }

    await prisma.masterLot.delete({
      where: { id },
    });

    await logRackRetentionActivity(
      req,
      "DELETE" as AuditActionType,
      `Deleted master lot record ${id}`,
      userId
    );

    return res.status(200).json({
      success: true,
      message: "Master lot deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete MasterLot Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete master lot",
    });
  }
};




// STAGEWISE LOTS
// ==========================================
// 1. CREATE STAGE-WISE LOT
// ==========================================

export const createStageWiseLot = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);

    const {
      masterLotId,
      gate,
      stageName,
      stageSequence,
      allocatedQty,
      completedQty,
      rejectedQty,
      scheduledStartAt,
      scheduledEndAt,
      status,
      notes,
    } = req.body;

    if (
      !masterLotId ||
      !gate ||
      !stageName ||
      stageSequence === undefined ||
      allocatedQty === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "masterLotId, gate, stageName, stageSequence and allocatedQty are required",
      });
    }

    const parsedSequence = Number(stageSequence);
    const parsedAllocatedQty = Number(allocatedQty);

    if (Number.isNaN(parsedSequence) || Number.isNaN(parsedAllocatedQty)) {
      return res.status(400).json({
        success: false,
        message: "stageSequence and allocatedQty must be valid numbers",
      });
    }

    const masterLot = await prisma.masterLot.findUnique({
      where: { id: masterLotId },
    });

    if (!masterLot) {
      return res.status(404).json({
        success: false,
        message: "Master lot not found",
      });
    }

    const duplicateStageLot = await prisma.stageWiseLot.findUnique({
      where: {
        masterLotId_gate_stageSequence: {
          masterLotId,
          gate,
          stageSequence: parsedSequence,
        },
      },
    });

    if (duplicateStageLot) {
      return res.status(409).json({
        success: false,
        message:
          "A stage-wise lot already exists for this masterLotId, gate, and stageSequence",
      });
    }

    const stageWiseLot = await prisma.stageWiseLot.create({
      data: {
        masterLotId,
        gate,
        stageName,
        stageSequence: parsedSequence,
        allocatedQty: parsedAllocatedQty,
        ...(completedQty !== undefined && {
          completedQty: completedQty === null ? null : Number(completedQty),
        }),
        ...(rejectedQty !== undefined && {
          rejectedQty: rejectedQty === null ? null : Number(rejectedQty),
        }),
        ...(scheduledStartAt !== undefined && {
          scheduledStartAt: scheduledStartAt ? new Date(scheduledStartAt) : null,
        }),
        ...(scheduledEndAt !== undefined && {
          scheduledEndAt: scheduledEndAt ? new Date(scheduledEndAt) : null,
        }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
        createdBy: userId,
      },
      include: {
        masterLot: true,
      },
    });

    await logRackRetentionActivity(
      req,
      "CREATE" as AuditActionType,
      `Created stage-wise lot record ${stageWiseLot.id} for MasterLot ${masterLotId} (${gate} - stage ${parsedSequence})`,
      userId
    );

    return res.status(201).json({
      success: true,
      message: "Stage-wise lot created successfully",
      data: stageWiseLot,
    });
  } catch (error: any) {
    console.error("Create StageWiseLot Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create stage-wise lot",
    });
  }
};

// ==========================================
// 2. GET ALL STAGE-WISE LOTS
// ==========================================

export const getAllStageWiseLots = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);

    const { masterLotId, gate, status } = req.query;

    const where: any = {};
    if (typeof masterLotId === "string" && masterLotId.trim()) {
      where.masterLotId = masterLotId.trim();
    }
    if (typeof gate === "string" && gate.trim()) {
      where.gate = gate.trim();
    }
    if (typeof status === "string" && status.trim()) {
      where.status = status.trim();
    }

    const stageWiseLots = await prisma.stageWiseLot.findMany({
      where,
      include: {
        masterLot: true,
      },
      orderBy: [
        { masterLotId: "asc" },
        { gate: "asc" },
        { stageSequence: "asc" },
      ],
    });

    await logRackRetentionActivity(
      req,
      "READ" as AuditActionType,
      "Retrieved all stage-wise lot records",
      userId
    );

    return res.status(200).json({
      success: true,
      count: stageWiseLots.length,
      data: stageWiseLots,
    });
  } catch (error: any) {
    console.error("Get All StageWiseLots Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve stage-wise lots",
    });
  }
};

// ==========================================
// 3. GET STAGE-WISE LOT BY ID
// ==========================================

export const getStageWiseLotById = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);
    const id = getParamId(req);

    const stageWiseLot = await prisma.stageWiseLot.findUnique({
      where: { id },
      include: {
        masterLot: true,
      },
    });

    if (!stageWiseLot) {
      return res.status(404).json({
        success: false,
        message: "Stage-wise lot record not found",
      });
    }

    await logRackRetentionActivity(
      req,
      "READ" as AuditActionType,
      `Retrieved stage-wise lot record ${id}`,
      userId
    );

    return res.status(200).json({
      success: true,
      data: stageWiseLot,
    });
  } catch (error: any) {
    console.error("Get StageWiseLot By ID Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve stage-wise lot",
    });
  }
};

// ==========================================
// 4. UPDATE STAGE-WISE LOT
// ==========================================

export const updateStageWiseLot = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);
    const id = getParamId(req);

    const {
      masterLotId,
      gate,
      stageName,
      stageSequence,
      allocatedQty,
      completedQty,
      rejectedQty,
      scheduledStartAt,
      scheduledEndAt,
      status,
      notes,
    } = req.body;

    const existingLot = await prisma.stageWiseLot.findUnique({
      where: { id },
    });

    if (!existingLot) {
      return res.status(404).json({
        success: false,
        message: "Stage-wise lot record not found",
      });
    }

    const nextMasterLotId = masterLotId ?? existingLot.masterLotId;
    const nextGate = gate ?? existingLot.gate;
    const nextSequence =
      stageSequence !== undefined
        ? Number(stageSequence)
        : existingLot.stageSequence;

    if (Number.isNaN(nextSequence)) {
      return res.status(400).json({
        success: false,
        message: "stageSequence must be a valid number",
      });
    }

    if (masterLotId !== undefined) {
      const masterLot = await prisma.masterLot.findUnique({
        where: { id: masterLotId },
      });
      if (!masterLot) {
        return res.status(404).json({
          success: false,
          message: "Master lot not found",
        });
      }
    }

    const isUniqueKeyChanged =
      nextMasterLotId !== existingLot.masterLotId ||
      nextGate !== existingLot.gate ||
      nextSequence !== existingLot.stageSequence;

    if (isUniqueKeyChanged) {
      const duplicateStageLot = await prisma.stageWiseLot.findUnique({
        where: {
          masterLotId_gate_stageSequence: {
            masterLotId: nextMasterLotId,
            gate: nextGate,
            stageSequence: nextSequence,
          },
        },
      });

      if (duplicateStageLot && duplicateStageLot.id !== id) {
        return res.status(409).json({
          success: false,
          message:
            "Another stage-wise lot already uses this masterLotId, gate, and stageSequence",
        });
      }
    }

    const updateData: any = {
      updatedBy: userId,
    };

    if (masterLotId !== undefined) updateData.masterLotId = masterLotId;
    if (gate !== undefined) updateData.gate = gate;
    if (stageName !== undefined) updateData.stageName = stageName;
    if (stageSequence !== undefined) updateData.stageSequence = nextSequence;
    if (allocatedQty !== undefined) {
      const parsedAllocated = Number(allocatedQty);
      if (Number.isNaN(parsedAllocated)) {
        return res.status(400).json({
          success: false,
          message: "allocatedQty must be a valid number",
        });
      }
      updateData.allocatedQty = parsedAllocated;
    }
    if (completedQty !== undefined) {
      updateData.completedQty =
        completedQty === null ? null : Number(completedQty);
    }
    if (rejectedQty !== undefined) {
      updateData.rejectedQty =
        rejectedQty === null ? null : Number(rejectedQty);
    }
    if (scheduledStartAt !== undefined) {
      updateData.scheduledStartAt = scheduledStartAt
        ? new Date(scheduledStartAt)
        : null;
    }
    if (scheduledEndAt !== undefined) {
      updateData.scheduledEndAt = scheduledEndAt
        ? new Date(scheduledEndAt)
        : null;
    }
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    const updatedLot = await prisma.stageWiseLot.update({
      where: { id },
      data: updateData,
      include: {
        masterLot: true,
      },
    });

    await logRackRetentionActivity(
      req,
      "UPDATE" as AuditActionType,
      `Updated stage-wise lot record ${id}`,
      userId
    );

    return res.status(200).json({
      success: true,
      message: "Stage-wise lot updated successfully",
      data: updatedLot,
    });
  } catch (error: any) {
    console.error("Update StageWiseLot Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update stage-wise lot",
    });
  }
};

// ==========================================
// 5. DELETE STAGE-WISE LOT
// ==========================================

export const deleteStageWiseLot = async (req: Request, res: Response) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);
    const id = getParamId(req);

    const existingLot = await prisma.stageWiseLot.findUnique({
      where: { id },
    });

    if (!existingLot) {
      return res.status(404).json({
        success: false,
        message: "Stage-wise lot record not found",
      });
    }

    await prisma.stageWiseLot.delete({
      where: { id },
    });

    await logRackRetentionActivity(
      req,
      "DELETE" as AuditActionType,
      `Deleted stage-wise lot record ${id}`,
      userId
    );

    return res.status(200).json({
      success: true,
      message: "Stage-wise lot deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete StageWiseLot Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete stage-wise lot",
    });
  }
};


const transitionMasterLotGate = async (
  req: Request,
  res: Response,
  targetGate: ActiveGate
) => {
  try {
    const accessToken = getAccessToken(req);
    const userId = getUserId(accessToken);
    const id = getParamId(req);
    const { remarks, isApproved } = req.body ?? {};

    const existingLot = await prisma.masterLot.findUnique({
      where: { id },
    });

    if (!existingLot) {
      return res.status(404).json({
        success: false,
        message: "Master lot record not found",
      });
    }

    if (existingLot.activeGate === targetGate) {
      return res.status(409).json({
        success: false,
        message: `Master lot is already at ${targetGate}`,
      });
    }

    const updatedLot = await prisma.masterLot.update({
      where: { id },
      data: {
        activeGate: targetGate,
        updatedBy: userId,
        ...(typeof isApproved === "boolean" && { isApproved }),
        ...(remarks !== undefined && { remarks }),
      },
      include: {
        tna: true,
        stageLots: {
          orderBy: {
            stageSequence: "asc",
          },
        },
      },
    });

    await logRackRetentionActivity(
      req,
      "UPDATE" as AuditActionType,
      `Transitioned master lot ${id} (${existingLot.lotCode}) from ${existingLot.activeGate} to ${targetGate}`,
      userId
    );

    return res.status(200).json({
      success: true,
      message: `Master lot transitioned to ${targetGate} successfully`,
      data: updatedLot,
    });
  } catch (error: any) {
    console.error(`Transition MasterLot to ${targetGate} Error:`, error);
    return res.status(500).json({
      success: false,
      message: error.message || `Failed to transition master lot to ${targetGate}`,
    });
  }
};

// ==========================================
// 6. TRANSITION MASTER LOT TO GATE A
// ==========================================

export const transitionMasterLotToGateA = async (
  req: Request,
  res: Response
) => {
  return transitionMasterLotGate(req, res, ActiveGate.GATE_A);
};

// ==========================================
// 7. TRANSITION MASTER LOT TO GATE B
// ==========================================

export const transitionMasterLotToGateB = async (
  req: Request,
  res: Response
) => {
  return transitionMasterLotGate(req, res, ActiveGate.GATE_B);
};

// ==========================================
// 8. TRANSITION MASTER LOT TO GATE C
// ==========================================

export const transitionMasterLotToGateC = async (
  req: Request,
  res: Response
) => {
  return transitionMasterLotGate(req, res, ActiveGate.GATE_C);
};