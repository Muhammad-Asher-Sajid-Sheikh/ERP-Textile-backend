import { PrismaClient } from '../generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
    }),
});


export async function getProductList() {
    try {
        const products = await prisma.ProductFamily.findMany();
        return products;
    } catch (error) {
        console.error(error);
        throw new Error('Internal Server Error');
    }
}

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