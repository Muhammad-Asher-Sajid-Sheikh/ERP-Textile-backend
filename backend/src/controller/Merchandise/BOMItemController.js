import { PrismaClient } from '../generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
    }),
});


/**
 * Helper: Extracts authenticated user ID and IP address for the AuditLog
 */
function getAuditContext(req) {
  const user = req.user; // Populated by your JWT auth middleware
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

/**
 * Helper: Calculates estimatedRequiredQty and totalBudgetedCost based on ChargingCriteria
 */
function calculateBomItemMetrics(item) {
  const base = new Decimal(item.baseQuantity || 0);
  const rate = new Decimal(item.consumptionRate || 0);
  const allowance = new Decimal(item.allowancePercent || 0);
  const unitRate = new Decimal(item.ecsFrozenUnitRate || 0);

  let netQty;

  switch (item.chargingCriteria) {
    case 'OWF_PERCENT':
      // On Weight of Fabric: baseQuantity (kg) * (rate / 100)
      netQty = base.mul(rate.div(100));
      break;
    case 'FIXED_ORDER_TOTAL':
      // Flat quantity regardless of baseQuantity
      netQty = rate;
      break;
    case 'PER_PIECE':
    case 'PER_SET':
    case 'PER_KG_WEIGHT':
    case 'PER_CARTON':
    default:
      netQty = base.mul(rate);
      break;
  }

  const multiplier = new Decimal(1).plus(allowance.div(100));
  const estimatedRequiredQty = netQty.mul(multiplier).toDecimalPlaces(4);
  const totalBudgetedCost = estimatedRequiredQty.mul(unitRate).toDecimalPlaces(2);

  return {
    baseQuantity: base,
    consumptionRate: rate,
    allowancePercent: allowance,
    conversionFactor: new Decimal(item.conversionFactor || 1),
    estimatedRequiredQty,
    ecsFrozenUnitRate: unitRate,
    totalBudgetedCost,
  };
}

/**
 * 1. CREATE OrderBomItem + AuditLog
 * POST /api/bom-items
 */
const createBOMItem = async (req, res) => {
  try {
    const audit = getAuditContext(req);
    const {
      bomId,
      category,
      componentRole,
      materialCode,
      materialName,
      specification,
      stageCode,
      applicableShade,
      applicableSize,
      chargingCriteria,
      uom,
      baseQuantity,
      consumptionRate,
      allowancePercent,
      purchaseUom,
      conversionFactor,
      ecsLineItemId,
      ecsFrozenUnitRate,
      extraAttributes,
      remarks,
    } = req.body;

    if (!bomId || !category || !materialName || !chargingCriteria || !uom) {
      return res.status(400).json({
        success: false,
        message: 'bomId, category, materialName, chargingCriteria, and uom are required.',
      });
    }

    const createdItem = await prisma.$transaction(async (tx) => {
      const parentBom = await tx.orderBom.findUnique({ where: { id: bomId } });

      if (!parentBom) {
        throw new Error('BOM_NOT_FOUND');
      }

      if (parentBom.status === 'APPROVED' || parentBom.status === 'SUPERSEDED') {
        throw new Error(
          'IMMUTABLE_BOM: Cannot add items to an APPROVED or SUPERSEDED BOM. Create a new BOM version first.'
        );
      }

      const metrics = calculateBomItemMetrics({
        chargingCriteria,
        baseQuantity,
        consumptionRate,
        allowancePercent,
        conversionFactor,
        ecsFrozenUnitRate,
      });

      const item = await tx.orderBomItem.create({
        data: {
          bomId,
          category,
          componentRole: componentRole || null,
          materialCode: materialCode || null,
          materialName,
          specification: specification || null,
          stageCode: stageCode || null,
          applicableShade: applicableShade || null,
          applicableSize: applicableSize || null,
          chargingCriteria,
          uom,
          purchaseUom: purchaseUom || null,
          ecsLineItemId: ecsLineItemId || null,
          extraAttributes: extraAttributes || undefined,
          remarks: remarks || null,
          ...metrics,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: audit.userId,
          actionType: 'BOM_UPDATED',
          actionDetails: `Added BOM Item "${item.materialName}" (ID: ${item.id}, Category: ${item.category}) to OrderBOM ${parentBom.id} (ICN: ${parentBom.icnNo}, v${parentBom.version}).`,
          performedBy: audit.performedBy,
          ipAddress: audit.ipAddress,
        },
      });

      return item;
    });

    return res.status(201).json({ success: true, data: createdItem });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (error.message === 'BOM_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Parent OrderBOM not found.' });
    }
    if (error.message.startsWith('IMMUTABLE_BOM')) {
      return res.status(403).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 2. READ ALL OrderBomItems (with optional filters)
 * GET /api/bom-items
 */
const getAllBOMItems = async (req, res) => {
  try {
    const { category, stageCode, componentRole, includeInactive } = req.query;

    const items = await prisma.orderBomItem.findMany({
      where: {
        ...(includeInactive !== 'true' && { isActive: true }),
        ...(category && { category }),
        ...(stageCode && { stageCode }),
        ...(componentRole && { componentRole }),
      },
      include: {
        bom: {
          select: {
            id: true,
            icnNo: true,
            atxScIon: true,
            skuId: true,
            version: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return res.status(200).json({ success: true, count: items.length, data: items });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 3. READ BY ORDER BOM ID (includes all active items for that BOM + procurement balance & cost summary)
 * GET /api/bom-items/bom/:orderBomId
 */
const getBOMItemsByOrderBomId = async (req, res) => {
  try {
    const { orderBomId } = req.params;
    const { stageCode, category } = req.query;

    const parentBom = await prisma.orderBom.findUnique({
      where: { id: orderBomId },
      select: { id: true, icnNo: true, atxScIon: true, skuId: true, version: true, status: true },
    });

    if (!parentBom) {
      return res.status(404).json({ success: false, message: 'OrderBOM not found.' });
    }

    const items = await prisma.orderBomItem.findMany({
      where: {
        bomId: orderBomId,
        isActive: true,
        ...(stageCode && { stageCode }),
        ...(category && { category }),
      },
      orderBy: { createdAt: 'asc' },
    });

    // Attach live procurement balance (WF-13 Section E formula) & total budgeted cost
    let totalBudgetedCost = new Decimal(0);

    const enrichedItems = items.map((item) => {
      const balanceToProcure = new Decimal(item.estimatedRequiredQty)
        .minus(item.actualConsumedQty)
        .minus(item.usableStockQty)
        .minus(item.procuredQty)
        .toDecimalPlaces(4);

      totalBudgetedCost = totalBudgetedCost.plus(item.totalBudgetedCost);

      return {
        ...item,
        balanceToProcure: balanceToProcure.toString(),
      };
    });

    return res.status(200).json({
      success: true,
      bom: parentBom,
      count: enrichedItems.length,
      totalBudgetedCost: totalBudgetedCost.toFixed(2),
      data: enrichedItems,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 4. UPDATE OrderBomItem + Recalculate Metrics + AuditLog
 * PUT /api/bom-items/:id
 */
const updateBOMItem = async (req, res) => {
  try {
    const audit = getAuditContext(req);
    const { id } = req.params;
    const payload = req.body;

    const updatedItem = await prisma.$transaction(async (tx) => {
      const existing = await tx.orderBomItem.findUnique({
        where: { id },
        include: { bom: true },
      });

      if (!existing) {
        throw new Error('NOT_FOUND');
      }

      if (existing.bom.status === 'APPROVED' || existing.bom.status === 'SUPERSEDED') {
        throw new Error(
          'IMMUTABLE_BOM: Cannot modify items of an APPROVED or SUPERSEDED BOM. Create a new BOM version first.'
        );
      }

      // Merge existing calculation inputs with any updated values so partial updates recalculate accurately
      const metrics = calculateBomItemMetrics({
        chargingCriteria: payload.chargingCriteria ?? existing.chargingCriteria,
        baseQuantity: payload.baseQuantity ?? existing.baseQuantity,
        consumptionRate: payload.consumptionRate ?? existing.consumptionRate,
        allowancePercent: payload.allowancePercent ?? existing.allowancePercent,
        conversionFactor: payload.conversionFactor ?? existing.conversionFactor,
        ecsFrozenUnitRate: payload.ecsFrozenUnitRate ?? existing.ecsFrozenUnitRate,
      });

      const item = await tx.orderBomItem.update({
        where: { id },
        data: {
          ...(payload.category !== undefined && { category: payload.category }),
          ...(payload.componentRole !== undefined && { componentRole: payload.componentRole }),
          ...(payload.materialCode !== undefined && { materialCode: payload.materialCode }),
          ...(payload.materialName !== undefined && { materialName: payload.materialName }),
          ...(payload.specification !== undefined && { specification: payload.specification }),
          ...(payload.stageCode !== undefined && { stageCode: payload.stageCode }),
          ...(payload.applicableShade !== undefined && { applicableShade: payload.applicableShade }),
          ...(payload.applicableSize !== undefined && { applicableSize: payload.applicableSize }),
          ...(payload.chargingCriteria !== undefined && { chargingCriteria: payload.chargingCriteria }),
          ...(payload.uom !== undefined && { uom: payload.uom }),
          ...(payload.purchaseUom !== undefined && { purchaseUom: payload.purchaseUom }),
          ...(payload.ecsLineItemId !== undefined && { ecsLineItemId: payload.ecsLineItemId }),
          ...(payload.actualFirstBatchRate !== undefined && {
            actualFirstBatchRate: new Decimal(payload.actualFirstBatchRate),
          }),
          ...(payload.actualConsumedQty !== undefined && {
            actualConsumedQty: new Decimal(payload.actualConsumedQty),
          }),
          ...(payload.procuredQty !== undefined && {
            procuredQty: new Decimal(payload.procuredQty),
          }),
          ...(payload.usableStockQty !== undefined && {
            usableStockQty: new Decimal(payload.usableStockQty),
          }),
          ...(payload.extraAttributes !== undefined && { extraAttributes: payload.extraAttributes }),
          ...(payload.remarks !== undefined && { remarks: payload.remarks }),
          ...metrics,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: audit.userId,
          actionType: 'BOM_UPDATED',
          actionDetails: `Updated BOM Item "${item.materialName}" (ID: ${item.id}) on OrderBOM ${existing.bom.id} (ICN: ${existing.bom.icnNo}, v${existing.bom.version}).`,
          performedBy: audit.performedBy,
          ipAddress: audit.ipAddress,
        },
      });

      return item;
    });

    return res.status(200).json({ success: true, data: updatedItem });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'OrderBomItem not found.' });
    }
    if (error.message.startsWith('IMMUTABLE_BOM')) {
      return res.status(403).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 5. DELETE (Soft-Delete) OrderBomItem + AuditLog
 * DELETE /api/bom-items/:id
 */
const deleteBOMItem = async (req, res) => {
  try {
    const audit = getAuditContext(req);
    const { id } = req.params;

    const deletedItem = await prisma.$transaction(async (tx) => {
      const existing = await tx.orderBomItem.findUnique({
        where: { id },
        include: { bom: true },
      });

      if (!existing) {
        throw new Error('NOT_FOUND');
      }

      if (existing.bom.status === 'APPROVED' || existing.bom.status === 'SUPERSEDED') {
        throw new Error(
          'IMMUTABLE_BOM: Cannot delete items from an APPROVED or SUPERSEDED BOM. Create a new BOM version first.'
        );
      }

      // Soft-deactivate item to preserve audit compliance (BBTI F-29)
      const item = await tx.orderBomItem.update({
        where: { id },
        data: {
          isActive: false,
          remarks: existing.remarks
            ? `${existing.remarks} | Deactivated by user`
            : 'Deactivated by user',
        },
      });

      await tx.auditLog.create({
        data: {
          userId: audit.userId,
          actionType: 'BOM_DELETED',
          actionDetails: `Soft-deleted BOM Item "${item.materialName}" (ID: ${item.id}) from OrderBOM ${existing.bom.id} (ICN: ${existing.bom.icnNo}, v${existing.bom.version}).`,
          performedBy: audit.performedBy,
          ipAddress: audit.ipAddress,
        },
      });

      return item;
    });

    return res.status(200).json({
      success: true,
      message: 'BOM item deactivated and logged to audit trail.',
      data: deletedItem,
    });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'OrderBomItem not found.' });
    }
    if (error.message.startsWith('IMMUTABLE_BOM')) {
      return res.status(403).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createBOMItem,
  getAllBOMItems,
  getBOMItemsByOrderBomId,
  updateBOMItem,
  deleteBOMItem,
};