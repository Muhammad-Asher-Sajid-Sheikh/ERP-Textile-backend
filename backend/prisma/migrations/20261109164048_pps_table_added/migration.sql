/*
  Warnings:

  - You are about to drop the `ProductFamily` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SampleType" AS ENUM ('APPROVAL_SAMPLE', 'PHOTO_SAMPLE', 'PPS', 'PACKING_SAMPLE');

-- CreateEnum
CREATE TYPE "InternalQcStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "CustomerSampleStatus" AS ENUM ('PENDING', 'APPROVED', 'DISAPPROVED');

-- CreateEnum
CREATE TYPE "ReasonCategory" AS ENUM ('SHADE_MISMATCH', 'MEASUREMENT_DEFECT', 'CONSTRUCTION_ERROR', 'FABRIC_QUALITY', 'TRIM_PACKING_DEFECT', 'OTHER');

-- DropForeignKey
ALTER TABLE "ProductFamily" DROP CONSTRAINT "ProductFamily_orderId_fkey";

-- DropTable
DROP TABLE "ProductFamily";

-- CreateTable
CREATE TABLE "pre_production_samples" (
    "id" TEXT NOT NULL,
    "icnNo" TEXT NOT NULL,
    "sampleType" "SampleType" NOT NULL DEFAULT 'PPS',
    "ppsVersion" INTEGER NOT NULL DEFAULT 1,
    "owiId" TEXT NOT NULL,
    "owi" TEXT NOT NULL,
    "rackId" TEXT NOT NULL,
    "qcStatus" "InternalQcStatus" NOT NULL DEFAULT 'PENDING',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "dispatchDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "status" "CustomerSampleStatus" NOT NULL DEFAULT 'PENDING',
    "reasonCategory" "ReasonCategory",
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_production_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pre_production_samples_icnNo_idx" ON "pre_production_samples"("icnNo");

-- CreateIndex
CREATE INDEX "pre_production_samples_owiId_idx" ON "pre_production_samples"("owiId");
