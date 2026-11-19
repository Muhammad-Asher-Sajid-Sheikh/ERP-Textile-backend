import { PrismaClient } from '../../generated/client.js';
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
  const user = req.user || "TestUser"; // Populated by your auth middleware
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
 * 1. CREATE OrderBOM + Items + AuditLog
 * POST /api/boms
 */
const createBOM = async (req, res) => {
  try {
    const audit = getAuditContext(req);
    const { icnNo, atxScIon, skuId, items } = req.body;

    if (!icnNo || !skuId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'icnNo, skuId, and at least one BOM item are required.',
      });
    }

    const createdBom = await prisma.$transaction(async (tx) => {
      // Find latest version for (icnNo, skuId) to auto-increment version safely
      const latestBom = await tx.orderBom.findFirst({
        where: { icnNo, skuId },
        orderBy: { version: 'desc' },
      });
      const nextVersion = latestBom ? latestBom.version + 1 : 1;

      const preparedItems = items.map((item) => {
        const metrics = calculateBomItemMetrics(item);
        return {
          category: item.category,
          componentRole: item.componentRole || null,
          materialCode: item.materialCode || null,
          materialName: item.materialName,
          specification: item.specification || null,
          stageCode: item.stageCode || null,
          applicableShade: item.applicableShade || null,
          applicableSize: item.applicableSize || null,
          chargingCriteria: item.chargingCriteria,
          uom: item.uom,
          purchaseUom: item.purchaseUom || null,
          ecsLineItemId: item.ecsLineItemId || null,
          extraAttributes: item.extraAttributes || undefined,
          remarks: item.remarks || null,
          ...metrics,
        };
      });

      const bom = await tx.orderBom.create({
        data: {
          icnNo,
          atxScIon: atxScIon || null,
          skuId,
          version: nextVersion,
          status: 'DRAFT',
          createdById: audit.userId,
          items: {
            create: preparedItems,
          },
        },
        include: {
          items: { where: { isActive: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: audit.userId,
          actionType: 'BOM_CREATED',
          actionDetails: `Created OrderBOM (ID: ${bom.id}) v${bom.version} for ICN: ${bom.icnNo}, SKU: ${bom.skuId} with ${preparedItems.length} items.`,
          performedBy: audit.performedBy,
          ipAddress: audit.ipAddress,
        },
      });

      return bom;
    });

    return res.status(201).json({ success: true, data: createdBom });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 2. READ ALL OrderBOMs (with optional query filters & total FBS budget)
 * GET /api/boms
 */
const getAllBOMs = async (req, res) => {
  try {
    const { icnNo, skuId, status, atxScIon } = req.query;

    const boms = await prisma.orderBom.findMany({
      where: {
        ...(icnNo && { icnNo }),
        ...(skuId && { skuId }),
        ...(status && { status }),
        ...(atxScIon && { atxScIon }),
      },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ icnNo: 'asc' }, { version: 'desc' }],
    });

    const formatted = boms.map((bom) => {
      const totalBudget = bom.items.reduce(
        (sum, item) => sum.plus(item.totalBudgetedCost),
        new Decimal(0)
      );
      return { ...bom, totalBudgetedCost: totalBudget.toFixed(2) };
    });

    return res.status(200).json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 3. READ BY ID (includes active items + category-wise FBS budget summary)
 * GET /api/boms/:id
 */
const getBOMById = async (req, res) => {
  try {
    const { id } = req.params;

    const bom = await prisma.orderBom.findUnique({
      where: { id },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!bom) {
      return res.status(404).json({ success: false, message: 'OrderBOM not found.' });
    }

    const categoryTotals = {};
    let grandTotal = new Decimal(0);

    for (const item of bom.items) {
      const current = new Decimal(categoryTotals[item.category] || 0);
      const updated = current.plus(item.totalBudgetedCost);
      categoryTotals[item.category] = updated.toFixed(2);
      grandTotal = grandTotal.plus(item.totalBudgetedCost);
    }

    return res.status(200).json({
      success: true,
      data: {
        ...bom,
        fbsSummary: {
          byCategory: categoryTotals,
          grandTotalBudget: grandTotal.toFixed(2),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 4. UPDATE OrderBOM + Items + AuditLog
 * PUT /api/boms/:id
 */
const updateBOM = async (req, res) => {
  try {
    const audit = getAuditContext(req);
    const { id } = req.params;
    const { atxScIon, status, revisionReason, items } = req.body;

    const updatedBom = await prisma.$transaction(async (tx) => {
      const existing = await tx.orderBom.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existing) {
        throw new Error('NOT_FOUND');
      }

      if (existing.status === 'APPROVED' || existing.status === 'SUPERSEDED') {
        throw new Error(
          'IMMUTABLE_VERSION: Approved or superseded BOMs cannot be edited directly. Create a new version instead.'
        );
      }

      if (Array.isArray(items)) {
        const incomingIds = items.filter((i) => i.id).map((i) => i.id);

        // Soft-deactivate items omitted from the payload (preserves audit trail)
        await tx.orderBomItem.updateMany({
          where: {
            bomId: id,
            id: { notIn: incomingIds },
            isActive: true,
          },
          data: { isActive: false },
        });

        for (const item of items) {
          const metrics = calculateBomItemMetrics(item);

          if (item.id) {
            await tx.orderBomItem.update({
              where: { id: item.id },
              data: {
                category: item.category,
                componentRole: item.componentRole || null,
                materialCode: item.materialCode || null,
                materialName: item.materialName,
                specification: item.specification || null,
                stageCode: item.stageCode || null,
                applicableShade: item.applicableShade || null,
                applicableSize: item.applicableSize || null,
                chargingCriteria: item.chargingCriteria,
                uom: item.uom,
                purchaseUom: item.purchaseUom || null,
                ecsLineItemId: item.ecsLineItemId || null,
                extraAttributes: item.extraAttributes || undefined,
                remarks: item.remarks || null,
                isActive: item.isActive !== undefined ? item.isActive : true,
                ...metrics,
              },
            });
          } else {
            await tx.orderBomItem.create({
              data: {
                bomId: id,
                category: item.category,
                componentRole: item.componentRole || null,
                materialCode: item.materialCode || null,
                materialName: item.materialName,
                specification: item.specification || null,
                stageCode: item.stageCode || null,
                applicableShade: item.applicableShade || null,
                applicableSize: item.applicableSize || null,
                chargingCriteria: item.chargingCriteria,
                uom: item.uom,
                purchaseUom: item.purchaseUom || null,
                ecsLineItemId: item.ecsLineItemId || null,
                extraAttributes: item.extraAttributes || undefined,
                remarks: item.remarks || null,
                ...metrics,
              },
            });
          }
        }
      }

      const bom = await tx.orderBom.update({
        where: { id },
        data: {
          ...(atxScIon !== undefined && { atxScIon }),
          ...(status && {
            status,
            ...(status === 'APPROVED' && {
              approvedById: audit.userId,
              approvedAt: new Date(),
            }),
          }),
          ...(revisionReason !== undefined && { revisionReason }),
        },
        include: {
          items: { where: { isActive: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: audit.userId,
          actionType: status === 'APPROVED' ? 'APPROVED' : 'BOM_UPDATED',
          actionDetails: `Updated OrderBOM (ID: ${bom.id}) v${bom.version} for ICN: ${bom.icnNo}. Status: ${bom.status}.${
            revisionReason ? ` Reason: ${revisionReason}` : ''
          }`,
          performedBy: audit.performedBy,
          ipAddress: audit.ipAddress,
        },
      });

      return bom;
    });

    return res.status(200).json({ success: true, data: updatedBom });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'OrderBOM not found.' });
    }
    if (error.message.startsWith('IMMUTABLE_VERSION')) {
      return res.status(403).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 5. DELETE (Soft-Delete / Supersede) OrderBOM + AuditLog
 * DELETE /api/boms/:id
 */
const deleteBOM = async (req, res) => {
  try {
    const audit = getAuditContext(req);
    const { id } = req.params;

    const deletedBom = await prisma.$transaction(async (tx) => {
      const existing = await tx.orderBom.findUnique({ where: { id } });

      if (!existing) {
        throw new Error('NOT_FOUND');
      }

      if (existing.status === 'APPROVED') {
        throw new Error(
          'FORBIDDEN_DELETE: Approved BOM records cannot be deleted. Supersede via a new version instead.'
        );
      }

      await tx.orderBomItem.updateMany({
        where: { bomId: id },
        data: { isActive: false },
      });

      const bom = await tx.orderBom.update({
        where: { id },
        data: {
          status: 'SUPERSEDED',
          revisionReason: existing.revisionReason || 'Draft BOM deactivated/deleted by user',
        },
      });

      await tx.auditLog.create({
        data: {
          userId: audit.userId,
          actionType: 'BOM_DELETED',
          actionDetails: `Soft-deleted/deactivated Draft OrderBOM (ID: ${bom.id}) v${bom.version} for ICN: ${bom.icnNo}, SKU: ${bom.skuId}.`,
          performedBy: audit.performedBy,
          ipAddress: audit.ipAddress,
        },
      });

      return bom;
    });

    return res.status(200).json({
      success: true,
      message: 'Draft OrderBOM deactivated and logged to audit trail.',
      data: deletedBom,
    });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'OrderBOM not found.' });
    }
    if (error.message.startsWith('FORBIDDEN_DELETE')) {
      return res.status(403).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createBOM,
  getAllBOMs,
  getBOMById,
  updateBOM,
  deleteBOM,
};