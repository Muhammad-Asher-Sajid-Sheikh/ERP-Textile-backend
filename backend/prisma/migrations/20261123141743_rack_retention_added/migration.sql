/*
  Warnings:

  - You are about to drop the column `rackId` on the `pre_production_samples` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "pre_production_samples" DROP COLUMN "rackId";

-- CreateTable
CREATE TABLE "rack_retentions" (
    "id" TEXT NOT NULL,
    "ppsId" TEXT NOT NULL,
    "sampleCode" TEXT NOT NULL,
    "rackLocation" TEXT NOT NULL,
    "custodianId" TEXT NOT NULL,
    "markingNotes" TEXT,
    "photoUrls" TEXT[],
    "retainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supersededReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rack_retentions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rack_retentions_ppsId_key" ON "rack_retentions"("ppsId");

-- CreateIndex
CREATE INDEX "rack_retentions_rackLocation_idx" ON "rack_retentions"("rackLocation");

-- AddForeignKey
ALTER TABLE "rack_retentions" ADD CONSTRAINT "rack_retentions_ppsId_fkey" FOREIGN KEY ("ppsId") REFERENCES "pre_production_samples"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
