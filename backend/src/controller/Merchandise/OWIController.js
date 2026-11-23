import { PrismaClient } from '../../generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
    }),
});


// Fields that can be edited when creating a new OWI revision
const editableFields = [
  "icnNo",
  "atxScIon",
  "skuId",
  "orderBomId",
  "productFamily",
  "construction",
  "composition",
  "gsmOrWeight",
  "dimensions",
  "shadeOrColour",
  "finish",
  "packingSpec",
  "mongoPayloadId",
  "revisionReason",
];


// ==========================================
// 1. CREATE OWI
// ==========================================
export const createOWI = async (req, res) => {
  try {
    const {
      icnNo,
      atxScIon,
      skuId,
      orderBomId,
      productFamily,
      construction,
      composition,
      gsmOrWeight,
      dimensions,
      shadeOrColour,
      finish,
      packingSpec,
      mongoPayloadId,
      revisionReason,
    } = req.body;

    const userId = process.env.TESTUSER; // Replace with req.id when authentication is implemented

    if (!icnNo || !skuId || !mongoPayloadId) {
      return res.status(400).json({
        success: false,
        message: "icnNo, skuId and mongoPayloadId are required.",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const owi = await tx.orderWorkingInstruction.create({
        data: {
          icnNo,
          atxScIon,
          skuId,
          orderBomId,
          productFamily,
          construction,
          composition,
          gsmOrWeight,
          dimensions,
          shadeOrColour,
          finish,
          packingSpec,
          mongoPayloadId,
          revisionReason,

          version: 1,
          status: "DRAFT",
          isActive: false,

          createdById: userId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          actionType: "OWI_CREATED",
          actionDetails:
            `Created OWI | ID: ${owi.id} | ICN: ${icnNo} | SKU: ${skuId} | Version: 1`,
          performedBy: userId,
          ipAddress: req.ip,
        },
      });

      return owi;
    });

    return res.status(201).json({
      success: true,
      message: "OWI created successfully.",
      data: result,
    });

  } catch (error) {
    console.error("Create OWI Error:", error);

    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "An OWI with this ICN, SKU and version already exists.",
      });
    }

    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        message: "Invalid Order BOM reference.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create OWI.",
      error: error.message,
    });
  }
};


// ==========================================
// 2. GET ALL OWIs
// ==========================================
export const getAllOWIs = async (req, res) => {
  try {
    const owis = await prisma.orderWorkingInstruction.findMany({
      orderBy: [
        { icnNo: "asc" },
        { skuId: "asc" },
        { version: "desc" },
      ],
      include: {
        orderBom: true,
      },
    });

    return res.status(200).json({
      success: true,
      count: owis.length,
      data: owis,
    });

  } catch (error) {
    console.error("Get All OWIs Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve OWIs.",
      error: error.message,
    });
  }
};


// ==========================================
// 3. READ OWI BY ID
// ==========================================
export const readById = async (req, res) => {
  try {
    const { id } = req.params;

    const owi = await prisma.orderWorkingInstruction.findUnique({
      where: { id },
      include: {
        orderBom: true,
      },
    });

    if (!owi) {
      return res.status(404).json({
        success: false,
        message: "OWI not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: owi,
    });

  } catch (error) {
    console.error("Read OWI By ID Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve OWI.",
      error: error.message,
    });
  }
};


// ==========================================
// 4. UPDATE OWI (CREATE NEW VERSION)
// ==========================================
export const updateOWI = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.id;

    // Build update payload using only allowed fields
    const updateData = {};

    for (const field of editableFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updateData[field] = req.body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for revision.",
      });
    }

    const result = await prisma.$transaction(
      async (tx) => {

        // 1. Find the existing OWI
        const existingOWI =
          await tx.orderWorkingInstruction.findUnique({
            where: { id },
          });

        if (!existingOWI) {
          return { notFound: true };
        }

        // ICN and SKU identify the version sequence
        const icnNo = existingOWI.icnNo;
        const skuId = existingOWI.skuId;

        // 2. Find the latest version for this ICN + SKU
        const latestOWI =
          await tx.orderWorkingInstruction.findFirst({
            where: {
              icnNo,
              skuId,
            },
            orderBy: {
              version: "desc",
            },
          });

        if (!latestOWI) {
          return { notFound: true };
        }

        // Prevent creating a revision from an outdated version
        if (latestOWI.id !== existingOWI.id) {
          return { outdatedVersion: true, latestVersion: latestOWI.version };
        }

        // 3. Prepare the new version's data
        // Start with the latest OWI's existing values
        const newVersionData = {
          icnNo: latestOWI.icnNo,
          atxScIon: latestOWI.atxScIon,
          skuId: latestOWI.skuId,
          orderBomId: latestOWI.orderBomId,

          productFamily: latestOWI.productFamily,
          construction: latestOWI.construction,
          composition: latestOWI.composition,
          gsmOrWeight: latestOWI.gsmOrWeight,
          dimensions: latestOWI.dimensions,
          shadeOrColour: latestOWI.shadeOrColour,
          finish: latestOWI.finish,
          packingSpec: latestOWI.packingSpec,

          mongoPayloadId: latestOWI.mongoPayloadId,
          revisionReason: latestOWI.revisionReason,
        };

        // 4. Apply only the fields supplied by the user
        Object.assign(newVersionData, updateData);

        // Keep the version sequence consistent with the original ICN + SKU.
        // The identifiers cannot be changed during revision.
        newVersionData.icnNo = latestOWI.icnNo;
        newVersionData.skuId = latestOWI.skuId;

        // 5. Mark the previous version as superseded
        await tx.orderWorkingInstruction.update({
          where: { id: latestOWI.id },
          data: {
            status: "SUPERSEDED",
            isActive: false,
          },
        });

        // 6. Create a completely NEW OWI record
        const newOWI = await tx.orderWorkingInstruction.create({
          data: {
            ...newVersionData,

            version: latestOWI.version + 1,
            status: "DRAFT",
            isActive: false,

            // The user who created this revision
            createdById: userId,

            // A new revision is not an approval
            approvedById: null,
            approvedAt: null,
          },
        });

        // 7. Create audit log
        await tx.auditLog.create({
          data: {
            userId,
            actionType: "OWI_UPDATED",
            actionDetails:
              `Created new OWI revision | ICN: ${icnNo} | SKU: ${skuId} | Previous Version: ${latestOWI.version} | New Version: ${newOWI.version} | Previous ID: ${latestOWI.id} | New ID: ${newOWI.id} | Updated Fields: ${Object.keys(updateData).join(", ")}`,
            performedBy: userId,
            ipAddress: req.ip,
          },
        });

        return {
          previousVersion: latestOWI.version,
          newOWI,
        };
      },
      {
        isolationLevel: "Serializable",
      }
    );

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "OWI not found.",
      });
    }

    if (result.outdatedVersion) {
      return res.status(409).json({
        success: false,
        message: "Cannot edit an outdated OWI version. Please retrieve the latest version.",
        latestVersion: result.latestVersion,
      });
    }

    return res.status(201).json({
      success: true,
      message: "New OWI revision created successfully.",
      previousVersion: result.previousVersion,
      data: result.newOWI,
    });

  } catch (error) {
    console.error("Update OWI Error:", error);

    if (error.code === "P2002" || error.code === "P2034") {
      return res.status(409).json({
        success: false,
        message: "A concurrent OWI revision may have been created. Please retrieve the latest version and try again.",
      });
    }

    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        message: "Invalid Order BOM reference.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create OWI revision.",
      error: error.message,
    });
  }
};


// ==========================================
// 5. DELETE ALL OWI VERSIONS BY ICN
// ==========================================
export const deleteOWI = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.id;

    const result = await prisma.$transaction(async (tx) => {

      // 1. Find the OWI selected for deletion
      const selectedOWI =
        await tx.orderWorkingInstruction.findUnique({
          where: { id },
        });

      if (!selectedOWI) {
        return null;
      }

      // 2. ICN is the main order tracker.
      // Every OWI version and SKU under this ICN will be deleted.
      const allOWIVersions =
        await tx.orderWorkingInstruction.findMany({
          where: {
            icnNo: selectedOWI.icnNo,
          },
          select: {
            id: true,
            skuId: true,
            version: true,
          },
        });

      // 3. Delete every OWI belonging to this ICN
      const deletion = await tx.orderWorkingInstruction.deleteMany({
        where: {
          icnNo: selectedOWI.icnNo,
        },
      });

      // 4. Create audit log
      await tx.auditLog.create({
        data: {
          userId,
          actionType: "OWI_DELETED",
          actionDetails:
            `Deleted all OWI records for ICN: ${selectedOWI.icnNo} | Total Records: ${deletion.count} | Deleted Versions: ${JSON.stringify(allOWIVersions)}`,
          performedBy: userId,
          ipAddress: req.ip,
        },
      });

      return {
        icnNo: selectedOWI.icnNo,
        deletedCount: deletion.count,
        deletedRecords: allOWIVersions,
      };
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "OWI not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "All OWI versions belonging to this ICN have been deleted successfully.",
      data: result,
    });

  } catch (error) {
    console.error("Delete OWI Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete OWI records.",
      error: error.message,
    });
  }
};


// ==========================================
// EXPORT CONTROLLER METHODS
// ==========================================
// module.exports = {
//   createOWI,
//   getAllOWIs,
//   readById,
//   updateOWI,
//   deleteOWI,
// };
