import { PrismaClient } from '../generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
    }),
});

export const createPpsRecord = async (req, res) => {
  try {
    const {
      icnNo,
      sampleType,
      owiId,
      rackId,
      qcStatus,
      dispatchDate
    } = req.body;

    // Validate required fields from request body
    if (!icnNo || !sampleType || !owiId || !rackId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: icnNo, sampleType, owiId, and rackId are mandatory.'
      });
    }

    // Find the latest PPS record for this icnNo to determine the current version
    const latestPps = await prisma.preProductionSample.findFirst({
      where: { icnNo },
      orderBy: { ppsVersion: 'desc' },
      select: { ppsVersion: true }
    });

    // Calculate the next version number
    const nextPpsVersion = latestPps ? latestPps.ppsVersion + 1 : 1;

    // Create new PPS record with system defaults for excluded fields
    const newPpsRecord = await prisma.preProductionSample.create({
      data: {
        icnNo,
        sampleType,
        owiId,
        rackId,
        qcStatus: qcStatus || 'PENDING',
        dispatchDate: dispatchDate ? new Date(dispatchDate) : null,
        ppsVersion: nextPpsVersion
        // isApproved defaults to false
        // status defaults to PENDING
        // reasonCategory, remarks, receivedDate left null
      }
    });

    return res.status(201).json({
      success: true,
      message: `PPS Record version ${nextPpsVersion} created successfully.`,
      data: newPpsRecord
    });
  } catch (error) {
    console.error('Error creating PPS record:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while creating PPS record.',
      error: error.message
    });
  }
};

/**
 * Get a lightweight list of all PPS records.
 * Selects essential summary fields for high-level dashboard views.
 */
export const getAllPPS = async (req, res) => {
  try {
    const ppsList = await prisma.preProductionSample.findMany({
      select: {
        id: true,
        icnNo: true,
        sampleType: true,
        ppsVersion: true,
        owiId: true,
        rackId: true,
        qcStatus: true,
        isApproved: true,
        status: true,
        dispatchDate: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      count: ppsList.length,
      data: ppsList
    });
  } catch (error) {
    console.error('Error fetching PPS list:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching PPS list.',
      error: error.message
    });
  }
};

/**
 * Get complete details of a single PPS record by ID,
 * including related OWI technical context.
 */
export const getPPSById = async (req, res) => {
  try {
    const { id } = req.params;

    const ppsRecord = await prisma.preProductionSample.findUnique({
      where: { id },
      include: {
        owi: true // Includes full related OWI document details
      }
    });

    if (!ppsRecord) {
      return res.status(404).json({
        success: false,
        message: `PPS record with ID ${id} not found.`
      });
    }

    return res.status(200).json({
      success: true,
      data: ppsRecord
    });
  } catch (error) {
    console.error('Error fetching PPS details:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching PPS details.',
      error: error.message
    });
  }
};

/**
 * Update general fields of an unlocked PPS record.
 * Rejects updates if the record is already locked.
 */
export const updatePpsRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if the record exists and is locked
    const existingPps = await prisma.preProductionSample.findUnique({
      where: { id }
    });

    if (!existingPps) {
      return res.status(404).json({
        success: false,
        message: `PPS record with ID ${id} not found.`
      });
    }

    if (existingPps.isLocked) {
      return res.status(400).json({
        success: false,
        message: 'This PPS record is locked and cannot be modified.'
      });
    }

    // Update the record with provided payload
    const updatedPps = await prisma.preProductionSample.update({
      where: { id },
      data: {
        ...updateData,
        // Ensure date field is converted properly if provided
        ...(updateData.dispatchDate && { dispatchDate: new Date(updateData.dispatchDate) }),
        ...(updateData.receivedDate && { receivedDate: new Date(updateData.receivedDate) })
      }
    });

    return res.status(200).json({
      success: true,
      message: 'PPS record updated successfully.',
      data: updatedPps
    });
  } catch (error) {
    console.error('Error updating PPS record:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating PPS record.',
      error: error.message
    });
  }
};

/**
 * Mark PPS as complete/reviewed by Marketing.
 * Updates customer feedback fields (status, reasonCategory, remarks, receivedDate)
 * and sets `isLocked: true` to freeze the record.
 */
export const markPPSAsDone = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reasonCategory, remarks, receivedDate } = req.body;

    // Validate required fields
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Customer feedback status (APPROVED / DISAPPROVED) is mandatory.'
      });
    }

    // Check existing record
    const existingPps = await prisma.preProductionSample.findUnique({
      where: { id }
    });

    if (!existingPps) {
      return res.status(404).json({
        success: false,
        message: `PPS record with ID ${id} not found.`
      });
    }

    if (existingPps.isLocked) {
      return res.status(400).json({
        success: false,
        message: 'This PPS record is already locked.'
      });
    }

    // Update feedback and lock the record
    const lockedPps = await prisma.preProductionSample.update({
      where: { id },
      data: {
        status,
        reasonCategory: status === 'DISAPPROVED' ? reasonCategory : null,
        remarks,
        receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
        isLocked: true
      }
    });

    return res.status(200).json({
      success: true,
      message: `PPS record marked as ${status} and locked successfully.`,
      data: lockedPps
    });
  } catch (error) {
    console.error('Error locking PPS record:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while marking PPS as done.',
      error: error.message
    });
  }
};


/**
 * 1. Create a Time & Action Plan header.
 * Automatically calculates totalLeadTimeDays from orderDate and shipmentDeadline.
 */
export const createTimeActionPlan = async (req, res) => {
  try {
    const { icnNo, owiId, orderDate, shipmentDeadline, taVersion } = req.body;

    if (!icnNo || !owiId || !orderDate || !shipmentDeadline) {
      return res.status(400).json({
        success: false,
        message: 'Missing mandatory fields: icnNo, owiId, orderDate, and shipmentDeadline are required.'
      });
    }

    const start = new Date(orderDate);
    const end = new Date(shipmentDeadline);

    // Calculate total lead time in days
    const diffTime = Math.abs(end - start);
    const totalLeadTimeDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const newTaPlan = await prisma.timeActionPlan.create({
      data: {
        icnNo,
        owiId,
        orderDate: start,
        shipmentDeadline: end,
        totalLeadTimeDays,
        taVersion: taVersion || 1
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Time & Action Plan created successfully.',
      data: newTaPlan
    });
  } catch (error) {
    console.error('Error creating T&A plan:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while creating T&A plan.',
      error: error.message
    });
  }
};

/**
 * 2. Upsert all stages for a given Time & Action Plan.
 * Expects an array of stages in the request body. If an ID is provided, it updates; otherwise, it creates.
 */
export const upsertTimeActionStages = async (req, res) => {
  try {
    const { timeActionPlanId } = req.params;
    const { stages } = req.body; // Expects an array of stage objects

    if (!Array.isArray(stages) || stages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid array of stages is required.'
      });
    }

    // Verify the T&A plan exists and is not locked
    const taPlan = await prisma.timeActionPlan.findUnique({
      where: { id: timeActionPlanId }
    });

    if (!taPlan) {
      return res.status(404).json({
        success: false,
        message: `Time & Action Plan with ID ${timeActionPlanId} not found.`
      });
    }

    if (taPlan.isLocked) {
      return res.status(400).json({
        success: false,
        message: 'This T&A Plan is locked. Stages cannot be modified.'
      });
    }

    // Execute upserts in a transaction to ensure atomic batch updates
    const upsertOperations = stages.map((stage) => {
      const stageId = stage.id || 'new-stage-placeholder';

      return prisma.timeActionStage.upsert({
        where: { id: stageId },
        update: {
          stageName: stage.stageName,
          plannedStartDate: stage.plannedStartDate ? new Date(stage.plannedStartDate) : null,
          plannedEndDate: stage.plannedEndDate ? new Date(stage.plannedEndDate) : null,
          actualStartDate: stage.actualStartDate ? new Date(stage.actualStartDate) : null,
          actualEndDate: stage.actualEndDate ? new Date(stage.actualEndDate) : null,
          responsibleDepartment: stage.responsibleDepartment || null,
          status: stage.status || 'PENDING'
        },
        create: {
          timeActionPlanId,
          stageName: stage.stageName,
          plannedStartDate: stage.plannedStartDate ? new Date(stage.plannedStartDate) : null,
          plannedEndDate: stage.plannedEndDate ? new Date(stage.plannedEndDate) : null,
          actualStartDate: stage.actualStartDate ? new Date(stage.actualStartDate) : null,
          actualEndDate: stage.actualEndDate ? new Date(stage.actualEndDate) : null,
          responsibleDepartment: stage.responsibleDepartment || null,
          status: stage.status || 'PENDING'
        }
      });
    });

    const results = await prisma.$transaction(upsertOperations);

    return res.status(200).json({
      success: true,
      message: `${results.length} stages successfully processed (upserted).`,
      data: results
    });
  } catch (error) {
    console.error('Error upserting T&A stages:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while processing T&A stages.',
      error: error.message
    });
  }
};

/**
 * 3. Update the Time & Action Plan header.
 * Checks if the plan is locked (blocks edits if true) and increments taVersion.
 */
export const updateTimeActionPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { orderDate, shipmentDeadline, criticalPathFlag } = req.body;

    const existingPlan = await prisma.timeActionPlan.findUnique({
      where: { id }
    });

    if (!existingPlan) {
      return res.status(404).json({
        success: false,
        message: `Time & Action Plan with ID ${id} not found.`
      });
    }

    if (existingPlan.isLocked) {
      return res.status(400).json({
        success: false,
        message: 'This T&A Plan is locked and cannot be edited.'
      });
    }

    const start = orderDate ? new Date(orderDate) : existingPlan.orderDate;
    const end = shipmentDeadline ? new Date(shipmentDeadline) : existingPlan.shipmentDeadline;

    // Recalculate total lead time if dates change
    const diffTime = Math.abs(end - start);
    const totalLeadTimeDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const updatedPlan = await prisma.timeActionPlan.update({
      where: { id },
      data: {
        ...(orderDate && { orderDate: start }),
        ...(shipmentDeadline && { shipmentDeadline: end }),
        totalLeadTimeDays,
        taVersion: existingPlan.taVersion + 1, // Increment version on update
        ...(criticalPathFlag !== undefined && { criticalPathFlag })
      }
    });

    return res.status(200).json({
      success: true,
      message: `T&A Plan updated successfully. Version incremented to v${updatedPlan.taVersion}.`,
      data: updatedPlan
    });
  } catch (error) {
    console.error('Error updating T&A plan:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating T&A plan.',
      error: error.message
    });
  }
};

/**
 * 4. Update Time & Action Stages identified by stageName and timeActionPlanId.
 * Blocks updates if the parent plan is locked.
 */
export const updateTimeActionStages = async (req, res) => {
  try {
    const { timeActionPlanId } = req.params;
    const { stages } = req.body; // Expects an array of stage update objects containing stageName

    if (!Array.isArray(stages) || stages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid array of stages with stageName is required.'
      });
    }

    // Verify parent plan and check lock status
    const taPlan = await prisma.timeActionPlan.findUnique({
      where: { id: timeActionPlanId }
    });

    if (!taPlan) {
      return res.status(404).json({
        success: false,
        message: `Time & Action Plan with ID ${timeActionPlanId} not found.`
      });
    }

    if (taPlan.isLocked) {
      return res.status(400).json({
        success: false,
        message: 'This T&A Plan is locked. Stages cannot be modified.'
      });
    }

    // Process updates by matching timeActionPlanId and stageName
    const updatePromises = stages.map(async (stageData) => {
      const { stageName, ...fieldsToUpdate } = stageData;

      if (!stageName) return null;

      // Find the specific stage row using composite criteria (timeActionPlanId + stageName)
      const existingStage = await prisma.timeActionStage.findFirst({
        where: {
          timeActionPlanId,
          stageName
        }
      });

      if (!existingStage) return null;

      return prisma.timeActionStage.update({
        where: { id: existingStage.id },
        data: {
          ...(fieldsToUpdate.plannedStartDate && { plannedStartDate: new Date(fieldsToUpdate.plannedStartDate) }),
          ...(fieldsToUpdate.plannedEndDate && { plannedEndDate: new Date(fieldsToUpdate.plannedEndDate) }),
          ...(fieldsToUpdate.actualStartDate && { actualStartDate: new Date(fieldsToUpdate.actualStartDate) }),
          ...(fieldsToUpdate.actualEndDate && { actualEndDate: new Date(fieldsToUpdate.actualEndDate) }),
          ...(fieldsToUpdate.responsibleDepartment && { responsibleDepartment: fieldsToUpdate.responsibleDepartment }),
          ...(fieldsToUpdate.status && { status: fieldsToUpdate.status })
        }
      });
    });

    const results = (await Promise.all(updatePromises)).filter(Boolean);

    return res.status(200).json({
      success: true,
      message: `${results.length} stages updated successfully based on stage names.`,
      data: results
    });
  } catch (error) {
    console.error('Error updating T&A stages:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating T&A stages.',
      error: error.message
    });
  }
};