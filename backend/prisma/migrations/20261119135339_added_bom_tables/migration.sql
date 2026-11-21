-- CreateEnum
CREATE TYPE "BomCategory" AS ENUM ('YARN', 'FABRIC', 'DYE_CHEMICAL', 'TRIM_ACCESSORY', 'PACKING', 'OTHER');

-- CreateEnum
CREATE TYPE "BomStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REVISED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ChargingCriteria" AS ENUM ('PER_PIECE', 'PER_SET', 'PER_KG_WEIGHT', 'OWF_PERCENT', 'PER_CARTON', 'FIXED_ORDER_TOTAL');

-- CreateTable
CREATE TABLE "order_boms" (
    "id" TEXT NOT NULL,
    "icnNo" TEXT NOT NULL,
    "atxScIon" TEXT,
    "skuId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "BomStatus" NOT NULL DEFAULT 'DRAFT',
    "revisionReason" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_boms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_bom_items" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "category" "BomCategory" NOT NULL,
    "componentRole" TEXT,
    "materialCode" TEXT,
    "materialName" TEXT NOT NULL,
    "specification" TEXT,
    "stageCode" TEXT,
    "applicableShade" TEXT,
    "applicableSize" TEXT,
    "chargingCriteria" "ChargingCriteria" NOT NULL,
    "uom" TEXT NOT NULL,
    "baseQuantity" DECIMAL(12,4) NOT NULL,
    "consumptionRate" DECIMAL(10,4) NOT NULL,
    "allowancePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "purchaseUom" TEXT,
    "conversionFactor" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "estimatedRequiredQty" DECIMAL(12,4) NOT NULL,
    "actualFirstBatchRate" DECIMAL(10,4),
    "actualConsumedQty" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "procuredQty" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "usableStockQty" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "ecsLineItemId" TEXT,
    "ecsFrozenUnitRate" DECIMAL(12,4) NOT NULL,
    "totalBudgetedCost" DECIMAL(14,2) NOT NULL,
    "extraAttributes" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_bom_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_boms_icnNo_idx" ON "order_boms"("icnNo");

-- CreateIndex
CREATE INDEX "order_boms_atxScIon_idx" ON "order_boms"("atxScIon");

-- CreateIndex
CREATE UNIQUE INDEX "order_boms_icnNo_skuId_version_key" ON "order_boms"("icnNo", "skuId", "version");

-- CreateIndex
CREATE INDEX "order_bom_items_bomId_stageCode_idx" ON "order_bom_items"("bomId", "stageCode");

-- AddForeignKey
ALTER TABLE "order_bom_items" ADD CONSTRAINT "order_bom_items_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "order_boms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
