/*
  Warnings:

  - You are about to drop the `ProductFamily` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Products` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ActiveGate" AS ENUM ('GATE_A', 'GATE_B', 'GATE_C');

-- CreateEnum
CREATE TYPE "StageLotStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'HOLD');

-- DropForeignKey
ALTER TABLE "ProductFamily" DROP CONSTRAINT "ProductFamily_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Products" DROP CONSTRAINT "Products_orderId_fkey";

-- DropTable
DROP TABLE "ProductFamily";

-- DropTable
DROP TABLE "Products";

-- CreateTable
CREATE TABLE "master_lots" (
    "id" TEXT NOT NULL,
    "lotCode" TEXT NOT NULL,
    "tnaId" TEXT NOT NULL,
    "activeGate" "ActiveGate" NOT NULL DEFAULT 'GATE_A',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "targetQuantity" INTEGER,
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "remarks" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_wise_lots" (
    "id" TEXT NOT NULL,
    "masterLotId" TEXT NOT NULL,
    "gate" "ActiveGate" NOT NULL,
    "stageName" TEXT NOT NULL,
    "stageSequence" INTEGER NOT NULL,
    "allocatedQty" INTEGER NOT NULL,
    "completedQty" INTEGER DEFAULT 0,
    "rejectedQty" INTEGER DEFAULT 0,
    "scheduledStartAt" TIMESTAMP(3),
    "scheduledEndAt" TIMESTAMP(3),
    "status" "StageLotStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stage_wise_lots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "master_lots_lotCode_key" ON "master_lots"("lotCode");

-- CreateIndex
CREATE INDEX "master_lots_tnaId_idx" ON "master_lots"("tnaId");

-- CreateIndex
CREATE INDEX "master_lots_activeGate_idx" ON "master_lots"("activeGate");

-- CreateIndex
CREATE INDEX "stage_wise_lots_masterLotId_idx" ON "stage_wise_lots"("masterLotId");

-- CreateIndex
CREATE INDEX "stage_wise_lots_gate_idx" ON "stage_wise_lots"("gate");

-- CreateIndex
CREATE INDEX "stage_wise_lots_status_idx" ON "stage_wise_lots"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stage_wise_lots_masterLotId_gate_stageSequence_key" ON "stage_wise_lots"("masterLotId", "gate", "stageSequence");

-- AddForeignKey
ALTER TABLE "master_lots" ADD CONSTRAINT "master_lots_tnaId_fkey" FOREIGN KEY ("tnaId") REFERENCES "time_action_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_wise_lots" ADD CONSTRAINT "stage_wise_lots_masterLotId_fkey" FOREIGN KEY ("masterLotId") REFERENCES "master_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
