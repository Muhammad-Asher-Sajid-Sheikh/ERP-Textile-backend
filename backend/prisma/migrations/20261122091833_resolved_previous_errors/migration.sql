/*
  Warnings:

  - You are about to drop the column `productFamily` on the `ProductFamily` table. All the data in the column will be lost.
  - Added the required column `normalMaterial` to the `ProductFamily` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productList` to the `ProductFamily` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productType` to the `ProductFamily` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OwiStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditActionType" ADD VALUE 'OWI_CREATED';
ALTER TYPE "AuditActionType" ADD VALUE 'OWI_UPDATED';
ALTER TYPE "AuditActionType" ADD VALUE 'OWI_DELETED';

-- AlterTable
ALTER TABLE "ProductFamily" DROP COLUMN "productFamily",
ADD COLUMN     "normalMaterial" TEXT NOT NULL,
ADD COLUMN     "productList" TEXT NOT NULL,
ADD COLUMN     "productType" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "order_wip_instructions" (
    "id" TEXT NOT NULL,
    "icnNo" TEXT NOT NULL,
    "atxScIon" TEXT,
    "skuId" TEXT NOT NULL,
    "orderBomId" TEXT,
    "productFamily" TEXT,
    "construction" TEXT,
    "composition" TEXT,
    "gsmOrWeight" TEXT,
    "dimensions" TEXT,
    "shadeOrColour" TEXT,
    "finish" TEXT,
    "packingSpec" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "OwiStatus" NOT NULL DEFAULT 'DRAFT',
    "mongoPayloadId" TEXT NOT NULL,
    "revisionReason" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_wip_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_wip_instructions_icnNo_idx" ON "order_wip_instructions"("icnNo");

-- CreateIndex
CREATE INDEX "order_wip_instructions_atxScIon_idx" ON "order_wip_instructions"("atxScIon");

-- CreateIndex
CREATE UNIQUE INDEX "order_wip_instructions_icnNo_skuId_version_key" ON "order_wip_instructions"("icnNo", "skuId", "version");

-- AddForeignKey
ALTER TABLE "order_wip_instructions" ADD CONSTRAINT "order_wip_instructions_orderBomId_fkey" FOREIGN KEY ("orderBomId") REFERENCES "order_boms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFamily" ADD CONSTRAINT "ProductFamily_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
