BEGIN;

-- CreateEnum
CREATE TYPE "FeasibilityOutcome" AS ENUM ('FEASIBLE', 'FEASIBLE_WITH_CONDITIONS', 'ALTERNATIVE_REQUIRED', 'TRIAL_SAMPLE_REQUIRED', 'NOT_FEASIBLE');

-- CreateEnum
CREATE TYPE "FeasibilityProductKind" AS ENUM ('TOWEL', 'WOVEN_MADE_UP', 'OTHER');

-- CreateEnum
CREATE TYPE "FeasibilityExecution" AS ENUM ('INTERNAL', 'OUTSOURCED');

-- CreateEnum
CREATE TYPE "FeasibilityConsumptionBasis" AS ENUM ('FINISHED_DYED_WEIGHT', 'FABRIC_WIDTH', 'OTHER');

-- CreateTable
CREATE TABLE "FeasibilityAssessment" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "baselineVersionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" TEXT,
    "createdById" TEXT NOT NULL,
    "productionReviewerId" TEXT NOT NULL,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "outcome" "FeasibilityOutcome",
    "submissionReason" TEXT,
    "changeReason" TEXT NOT NULL,
    "conditions" TEXT[],
    "assumptions" TEXT[],
    "uncertainties" TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeasibilityAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeasibilityArticle" (
    "riskAssessment" TEXT,
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productFamily" TEXT NOT NULL,
    "productKind" "FeasibilityProductKind" NOT NULL,
    "quantity" DECIMAL(24,8),
    "quantityUnit" TEXT,
    "technicalAttributes" JSONB NOT NULL,
    "internalCapability" TEXT,
    "externalCapability" TEXT,
    "supplierAvailability" TEXT,
    "sampleFeasibility" TEXT,
    "capacityAssessment" TEXT,
    "estimatedLeadTimeDays" DECIMAL(24,8),
    "capabilityLimitations" TEXT[],
    "assumptions" TEXT[],
    "uncertainties" TEXT[],

    CONSTRAINT "FeasibilityArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeasibilityMaterial" (
    "applicableAdjustments" TEXT[],
    "adjustmentApplicabilityReason" TEXT,
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "materialType" TEXT NOT NULL,
    "composition" TEXT,
    "construction" TEXT,
    "colour" TEXT,
    "yarnCount" TEXT,
    "quantity" DECIMAL(24,8),
    "quantityUnit" TEXT,
    "consumptionBasis" "FeasibilityConsumptionBasis",
    "consumptionQuantity" DECIMAL(24,8),
    "consumptionUnit" TEXT,
    "perQuantity" DECIMAL(24,8),
    "perUnit" TEXT,
    "basisDescription" TEXT,
    "fabricWidth" DECIMAL(24,8),
    "fabricWidthUnit" TEXT,
    "finishedWeight" DECIMAL(24,8),
    "finishedWeightUnit" TEXT,
    "gsm" DECIMAL(24,8),
    "allowancePercent" DECIMAL(24,8),
    "processLossPercent" DECIMAL(24,8),
    "shrinkagePercent" DECIMAL(24,8),
    "wastagePercent" DECIMAL(24,8),
    "minimumProcessingQuantity" DECIMAL(24,8),
    "minimumProcessingUnit" TEXT,
    "technicalAttributes" JSONB NOT NULL,
    "assumptions" TEXT[],
    "uncertainties" TEXT[],

    CONSTRAINT "FeasibilityMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeasibilityProcess" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "execution" "FeasibilityExecution",
    "capability" TEXT,
    "processor" TEXT,
    "estimatedLeadTimeDays" DECIMAL(24,8),
    "technicalDetails" TEXT,
    "assumptions" TEXT[],
    "limitations" TEXT[],

    CONSTRAINT "FeasibilityProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeasibilityRisk" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mitigation" TEXT NOT NULL,
    "alternativeRoute" TEXT,
    "requiresManagementAcceptance" BOOLEAN NOT NULL,

    CONSTRAINT "FeasibilityRisk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeasibilityAssessment_productionReviewerId_submittedAt_idx" ON "FeasibilityAssessment"("productionReviewerId", "submittedAt");

-- CreateIndex
CREATE INDEX "FeasibilityAssessment_baselineVersionId_idx" ON "FeasibilityAssessment"("baselineVersionId");

-- CreateIndex
CREATE INDEX "FeasibilityAssessment_previousVersionId_idx" ON "FeasibilityAssessment"("previousVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "FeasibilityAssessment_inquiryId_version_key" ON "FeasibilityAssessment"("inquiryId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "FeasibilityArticle_assessmentId_code_key" ON "FeasibilityArticle"("assessmentId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FeasibilityMaterial_articleId_code_key" ON "FeasibilityMaterial"("articleId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FeasibilityProcess_articleId_sequence_key" ON "FeasibilityProcess"("articleId", "sequence");

-- CreateIndex
CREATE INDEX "FeasibilityRisk_articleId_idx" ON "FeasibilityRisk"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementBaselineVersion_id_inquiryId_key" ON "RequirementBaselineVersion"("id", "inquiryId");

-- AddForeignKey
ALTER TABLE "FeasibilityAssessment" ADD CONSTRAINT "FeasibilityAssessment_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeasibilityAssessment" ADD CONSTRAINT "FeasibilityAssessment_baselineVersionId_inquiryId_fkey" FOREIGN KEY ("baselineVersionId", "inquiryId") REFERENCES "RequirementBaselineVersion"("id", "inquiryId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeasibilityAssessment" ADD CONSTRAINT "FeasibilityAssessment_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "FeasibilityAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeasibilityAssessment" ADD CONSTRAINT "FeasibilityAssessment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeasibilityAssessment" ADD CONSTRAINT "FeasibilityAssessment_productionReviewerId_fkey" FOREIGN KEY ("productionReviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeasibilityAssessment" ADD CONSTRAINT "FeasibilityAssessment_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeasibilityArticle" ADD CONSTRAINT "FeasibilityArticle_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "FeasibilityAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeasibilityMaterial" ADD CONSTRAINT "FeasibilityMaterial_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "FeasibilityArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeasibilityProcess" ADD CONSTRAINT "FeasibilityProcess_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "FeasibilityArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeasibilityRisk" ADD CONSTRAINT "FeasibilityRisk_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "FeasibilityArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Allocation uses the inquiry's customer lock; this also protects against a second draft at database level.
CREATE UNIQUE INDEX "FeasibilityAssessment_one_draft" ON "FeasibilityAssessment" ("inquiryId") WHERE "submittedAt" IS NULL;
ALTER TABLE "FeasibilityAssessment" ADD CONSTRAINT "feasibility_positive_version" CHECK ("version" > 0 AND "revision" > 0);
ALTER TABLE "FeasibilityAssessment" ADD CONSTRAINT "feasibility_submission_consistent" CHECK (
    ("submittedAt" IS NULL AND "outcome" IS NULL AND "submittedById" IS NULL AND "submissionReason" IS NULL)
    OR ("submittedAt" IS NOT NULL AND "outcome" IS NOT NULL AND "submittedById" IS NOT NULL AND "submissionReason" IS NOT NULL)
);
ALTER TABLE "FeasibilityArticle" ADD CONSTRAINT "feasibility_article_measurements" CHECK (
    ("quantity" IS NULL OR "quantity" > 0)
    AND ("estimatedLeadTimeDays" IS NULL OR "estimatedLeadTimeDays" >= 0)
);
ALTER TABLE "FeasibilityMaterial" ADD CONSTRAINT "feasibility_material_measurements" CHECK (
    ("quantity" IS NULL OR "quantity" > 0)
    AND ("consumptionQuantity" IS NULL OR "consumptionQuantity" > 0)
    AND ("perQuantity" IS NULL OR "perQuantity" > 0)
    AND ("fabricWidth" IS NULL OR "fabricWidth" > 0)
    AND ("finishedWeight" IS NULL OR "finishedWeight" > 0)
    AND ("gsm" IS NULL OR "gsm" > 0)
    AND ("minimumProcessingQuantity" IS NULL OR "minimumProcessingQuantity" > 0)
    AND ("allowancePercent" IS NULL OR "allowancePercent" >= 0)
    AND ("processLossPercent" IS NULL OR "processLossPercent" >= 0)
    AND ("shrinkagePercent" IS NULL OR "shrinkagePercent" >= 0)
    AND ("wastagePercent" IS NULL OR "wastagePercent" >= 0)
);
ALTER TABLE "FeasibilityProcess" ADD CONSTRAINT "feasibility_process_sequence" CHECK (
    "sequence" > 0 AND ("estimatedLeadTimeDays" IS NULL OR "estimatedLeadTimeDays" >= 0)
);

COMMIT;
