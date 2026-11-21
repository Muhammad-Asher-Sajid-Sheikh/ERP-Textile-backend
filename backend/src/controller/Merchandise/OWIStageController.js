import { PrismaClient } from '../../generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
//import getAuditContext from '../../middleware/rbac.js';

const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
    }),
});

function getAuditContext(req) {
  const user = req.user || TestUser;
  if (!user || !user.id) {
    throw new Error('UNAUTHORIZED');
  }

  const ipAddress =
    (req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].split(',')[0].trim()) ||
    req.socket?.remoteAddress ||
    null;

  return {
    userId: user.id,
    performedBy: user.email || user.name || user.id,
    ipAddress,
  };
}

function normalizeStages(stages = []) {
  if (!Array.isArray(stages)) {
    throw new Error('INVALID_STAGES: stages must be an array.');
  }

  return stages
    .map((stage, idx) => {
      if (!stage.stageCode || !stage.stageName) {
        throw new Error('INVALID_STAGES: Each stage requires stageCode and stageName.');
      }

      const executionMode = stage.executionMode === 'OUTSOURCED' ? 'OUTSOURCED' : 'IN_HOUSE';

      return {
        stageCode: String(stage.stageCode).trim(),
        stageName: String(stage.stageName).trim(),
        sequence: stage.sequence !== undefined ? Number(stage.sequence) : idx + 1,
        executionMode,
        processorId: executionMode === 'OUTSOURCED' ? stage.processorId || null : null,
        details: stage.details && typeof stage.details === 'object' ? stage.details : {},
        qa: stage.qa && typeof stage.qa === 'object' ? stage.qa : {},
      };
    })
    .sort((a, b) => a.sequence - b.sequence);
}

/**
 * 1. CREATE MongoDB Stage Spec + link mongoPayloadId on PostgreSQL OWI + AuditLog
 * POST /api/owi-stages
 */
export const createOWIStages = async (req, res) => {
  try {
    const audit = getAuditContext(req);
    const { postgresOwiId, stages } = req.body;

    if (!postgresOwiId || !Array.isArray(stages) || stages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'postgresOwiId and a non-empty stages array are required.',
      });
    }

    const normalizedStages = normalizeStages(stages);

    const result = await prisma.$transaction(async (tx) => {
      const pgOwi = await tx.orderWipInstruction.findUnique({
        where: { id: postgresOwiId },
      });

      if (!pgOwi) {
        throw new Error('OWI_NOT_FOUND');
      }

      if (pgOwi.status === 'SUPERSEDED' || !pgOwi.isActive) {
        throw new Error('IMMUTABLE_OWI: Cannot attach stage specs to an inactive or SUPERSEDED OWI.');
      }

      const existingSpec = await OwiStageSpec.findOne({
        postgresOwiId: pgOwi.id,
        version: pgOwi.version,
      });

      if (existingSpec) {
        throw new Error('STAGE_SPEC_EXISTS: Stage spec already exists for this OWI version. Use update instead.');
      }

      const mongoDoc = await OwiStageSpec.create({
        postgresOwiId: pgOwi.id,
        icnNo: pgOwi.icnNo,
        atxScIon: pgOwi.atxScIon,
        skuId: pgOwi.skuId,
        version: pgOwi.version,
        isActive: true,
        stages: normalizedStages,
      });

      const updatedPgOwi = await tx.orderWipInstruction.update({
        where: { id: pgOwi.id },
        data: { mongoPayloadId: mongoDoc._id.toString() },
      });

      await tx.auditLog.create({
        data: {
          userId: audit.userId,
          actionType: 'OWI_CREATED',
          actionDetails: `Created MongoDB OWI stage spec (${mongoDoc._id.toString()}) with ${normalizedStages.length} stages for OrderWipInstruction ${pgOwi.id} (ICN: ${pgOwi.icnNo}, v${pgOwi.version}).`,
          performedBy: audit.performedBy,
          ipAddress: audit.ipAddress,
        },
      });

      return { owi: updatedPgOwi, stageSpec: mongoDoc };
    });

    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (error.message === 'OWI_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'PostgreSQL OrderWipInstruction not found.' });
    }
    if (error.message.startsWith('INVALID_STAGES') || error.message.startsWith('STAGE_SPEC_EXISTS')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.message.startsWith('IMMUTABLE_OWI')) {
      return res.status(403).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 2. READ ALL MongoDB Stage Specs
 * GET /api/owi-stages
 */
export const getAllOWIStages = async (req, res) => {
  try {
    const { icnNo, skuId, atxScIon, postgresOwiId, includeInactive } = req.query;

    const query = {
      ...(includeInactive !== 'true' && { isActive: true }),
      ...(icnNo && { icnNo }),
      ...(skuId && { skuId }),
      ...(atxScIon && { atxScIon }),
      ...(postgresOwiId && { postgresOwiId }),
    };

    const specs = await OwiStageSpec.find(query).sort({ icnNo: 1, version: -1 });

    return res.status(200).json({ success: true, count: specs.length, data: specs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 3. READ BY ID (MongoDB _id or postgresOwiId)
 * GET /api/owi-stages/:id
 */
export const getOWIStageById = async (req, res) => {
  try {
    const { id } = req.params;

    let spec = null;
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      spec = await OwiStageSpec.findById(id);
    }
    if (!spec) {
      spec = await OwiStageSpec.findOne({ postgresOwiId: id, isActive: true }).sort({ version: -1 });
    }

    if (!spec) {
      return res.status(404).json({ success: false, message: 'OWI stage specification not found.' });
    }

    return res.status(200).json({ success: true, data: spec });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 4. UPDATE Stages + Increment Version in PostgreSQL & MongoDB + AuditLog
 * PUT /api/owi-stages/:id
 */
export const updateOWIStages = async (req, res) => {
  try {
    const audit = getAuditContext(req);
    const { id } = req.params;
    const { stages, revisionReason } = req.body;

    if (!Array.isArray(stages) || stages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A non-empty stages array is required to update stage specifications.',
      });
    }

    const normalizedStages = normalizeStages(stages);

    const updated = await prisma.$transaction(async (tx) => {
      let currentSpec = null;
      if (/^[0-9a-fA-F]{24}$/.test(id)) {
        currentSpec = await OwiStageSpec.findById(id);
      }
      if (!currentSpec) {
        currentSpec = await OwiStageSpec.findOne({ postgresOwiId: id, isActive: true }).sort({ version: -1 });
      }

      if (!currentSpec) {
        throw new Error('NOT_FOUND');
      }

      const pgOwi = await tx.orderWipInstruction.findUnique({
        where: { id: currentSpec.postgresOwiId },
      });

      if (!pgOwi) {
        throw new Error('OWI_NOT_FOUND');
      }

      if (pgOwi.status === 'SUPERSEDED') {
        throw new Error('IMMUTABLE_VERSION: SUPERSEDED OWI versions cannot be edited.');
      }

      const latestVersionRow = await tx.orderWipInstruction.findFirst({
        where: { icnNo: pgOwi.icnNo, skuId: pgOwi.skuId },
        orderBy: { version: 'desc' },
      });
      const nextVersion = (latestVersionRow ? latestVersionRow.version : pgOwi.version) + 1;

      if (pgOwi.status === 'APPROVED') {
        await tx.orderWipInstruction.update({
          where: { id: pgOwi.id },
          data: { status: 'SUPERSEDED' },
        });

        const newPgOwi = await tx.orderWipInstruction.create({
          data: {
            icnNo: pgOwi.icnNo,
            atxScIon: pgOwi.atxScIon,
            skuId: pgOwi.skuId,
            orderBomId: pgOwi.orderBomId,
            productFamily: pgOwi.productFamily,
            construction: pgOwi.construction,
            composition: pgOwi.composition,
            gsmOrWeight: pgOwi.gsmOrWeight,
            dimensions: pgOwi.dimensions,
            shadeOrColour: pgOwi.shadeOrColour,
            finish: pgOwi.finish,
            packingSpec: pgOwi.packingSpec,
            version: nextVersion,
            status: 'DRAFT',
            mongoPayloadId: 'pending-mongo',
            revisionReason: revisionReason || `Stage specification updated from v${pgOwi.version}`,
            createdById: audit.userId,
          },
        });

        const newMongoSpec = await OwiStageSpec.create({
          postgresOwiId: newPgOwi.id,
          icnNo: newPgOwi.icnNo,
          atxScIon: newPgOwi.atxScIon,
          skuId: newPgOwi.skuId,
          version: nextVersion,
          isActive: true,
          stages: normalizedStages,
        });

        const finalPgOwi = await tx.orderWipInstruction.update({
          where: { id: newPgOwi.id },
          data: { mongoPayloadId: newMongoSpec._id.toString() },
        });

        await tx.auditLog.create({
          data: {
            userId: audit.userId,
            actionType: 'OWI_UPDATED',
            actionDetails: `Updated stages on APPROVED OWI ${pgOwi.id} (v${pgOwi.version} -> SUPERSEDED); created v${nextVersion} (${finalPgOwi.id}, Mongo: ${newMongoSpec._id.toString()}) with ${normalizedStages.length} stages.${
              revisionReason ? ` Reason: ${revisionReason}` : ''
            }`,
            performedBy: audit.performedBy,
            ipAddress: audit.ipAddress,
          },
        });

        return { owi: finalPgOwi, stageSpec: newMongoSpec };
      }

      const bumpedPgOwi = await tx.orderWipInstruction.update({
        where: { id: pgOwi.id },
        data: {
          version: nextVersion,
          ...(revisionReason !== undefined && { revisionReason }),
        },
      });

      const updatedMongoSpec = await OwiStageSpec.findByIdAndUpdate(
        currentSpec._id,
        {
          version: nextVersion,
          stages: normalizedStages,
        },
        { new: true }
      );

      await tx.auditLog.create({
        data: {
          userId: audit.userId,
          actionType: 'OWI_UPDATED',
          actionDetails: `Updated stages on DRAFT OWI ${bumpedPgOwi.id} (ICN: ${bumpedPgOwi.icnNo}), bumped to v${nextVersion} with ${normalizedStages.length} stages.${
            revisionReason ? ` Reason: ${revisionReason}` : ''
          }`,
          performedBy: audit.performedBy,
          ipAddress: audit.ipAddress,
        },
      });

      return { owi: bumpedPgOwi, stageSpec: updatedMongoSpec };
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (error.message === 'NOT_FOUND' || error.message === 'OWI_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'OWI stage specification not found.' });
    }
    if (error.message.startsWith('INVALID_STAGES')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.message.startsWith('IMMUTABLE_VERSION')) {
      return res.status(403).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 5. DELETE (Soft-Deactivate) MongoDB Stage Spec + AuditLog
 * DELETE /api/owi-stages/:id
 */
export const deleteOWIStages = async (req, res) => {
  try {
    const audit = getAuditContext(req);
    const { id } = req.params;

    const deleted = await prisma.$transaction(async (tx) => {
      let spec = null;
      if (/^[0-9a-fA-F]{24}$/.test(id)) {
        spec = await OwiStageSpec.findById(id);
      }
      if (!spec) {
        spec = await OwiStageSpec.findOne({ postgresOwiId: id, isActive: true }).sort({ version: -1 });
      }

      if (!spec) {
        throw new Error('NOT_FOUND');
      }

      const pgOwi = await tx.orderWipInstruction.findUnique({
        where: { id: spec.postgresOwiId },
      });

      if (pgOwi && pgOwi.status === 'APPROVED') {
        throw new Error(
          'FORBIDDEN_DELETE: Stage specifications of an APPROVED OWI cannot be deleted. Create a new revision instead.'
        );
      }

      const deactivatedSpec = await OwiStageSpec.findByIdAndUpdate(
        spec._id,
        { isActive: false },
        { new: true }
      );

      await tx.auditLog.create({
        data: {
          userId: audit.userId,
          actionType: 'OWI_DELETED',
          actionDetails: `Soft-deactivated MongoDB OWI stage spec ${deactivatedSpec._id.toString()} (v${deactivatedSpec.version}) for ICN: ${deactivatedSpec.icnNo}, SKU: ${deactivatedSpec.skuId}.`,
          performedBy: audit.performedBy,
          ipAddress: audit.ipAddress,
        },
      });

      return deactivatedSpec;
    });

    return res.status(200).json({
      success: true,
      message: 'OWI stage specification deactivated and logged to audit trail.',
      data: deleted,
    });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'OWI stage specification not found.' });
    }
    if (error.message.startsWith('FORBIDDEN_DELETE')) {
      return res.status(403).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};