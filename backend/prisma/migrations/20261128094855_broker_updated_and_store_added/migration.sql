-- CreateEnum
CREATE TYPE "BrokerPartyType" AS ENUM ('BROKER', 'AGENT', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "StoreInventoryStatus" AS ENUM ('RECEIVED', 'QA_HOLD', 'ACCEPTED_AVAILABLE', 'RESERVED', 'ISSUED', 'CONSUMED');

-- AlterTable
ALTER TABLE "brokers" ADD COLUMN     "partyType" "BrokerPartyType" NOT NULL DEFAULT 'BROKER';

-- CreateTable
CREATE TABLE "store_inventory" (
    "id" TEXT NOT NULL,
    "icnNo" TEXT,
    "materialType" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "status" "StoreInventoryStatus" NOT NULL DEFAULT 'RECEIVED',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_inventory_icnNo_idx" ON "store_inventory"("icnNo");

-- CreateIndex
CREATE INDEX "store_inventory_status_idx" ON "store_inventory"("status");
