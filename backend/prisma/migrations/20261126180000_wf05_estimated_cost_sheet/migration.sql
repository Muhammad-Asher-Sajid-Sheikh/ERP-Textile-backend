BEGIN;

-- CreateEnum
CREATE TYPE "EcsStatus" AS ENUM ('DRAFT_DATA_PENDING', 'PRELIMINARY_PROVISIONAL', 'PRICE_DEFERRED', 'READY_FOR_APPROVAL', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "EcsCostCategory" AS ENUM ('YARN', 'FABRIC', 'PROCESSING', 'LABOUR', 'CONFECTION', 'VALUE_ADDITION', 'TRIM_ACCESSORY', 'PACKING', 'OVERHEAD', 'FREIGHT', 'FINANCE', 'RISK_ALLOWANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "EcsChargingBasis" AS ENUM ('QUANTITY_RATE', 'FIXED_ORDER', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "EcsQuantityBasis" AS ENUM ('INHERITED_CONSUMPTION', 'INHERITED_QUANTITY', 'EXPLICIT');

-- CreateEnum
CREATE TYPE "EcsApplicability" AS ENUM ('CHARGE', 'INCLUDED_IN_OTHER', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "EcsRateClassification" AS ENUM ('UNREVIEWED', 'CURRENT_WORKING', 'HISTORICAL', 'REVALIDATION_REQUIRED');

-- CreateTable
CREATE TABLE "EstimatedCostSheet" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimatedCostSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcsVersion" (
    "id" TEXT NOT NULL,
    "ecsId" TEXT NOT NULL,
    "baselineVersionId" TEXT NOT NULL,
    "feasibilityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" TEXT,
    "alternativeKey" TEXT NOT NULL,
    "alternativeDescription" TEXT,
    "status" "EcsStatus" NOT NULL DEFAULT 'DRAFT_DATA_PENDING',
    "costingCurrency" TEXT NOT NULL,
    "quotationCurrency" TEXT NOT NULL,
    "exchangeRate" DECIMAL(38,12),
    "exchangeRateSource" TEXT,
    "exchangeRateDate" TIMESTAMP(3),
    "paymentTerms" TEXT,
    "commercialAssumptions" TEXT[],
    "outstandingConditions" TEXT[],
    "costCoverageNotes" TEXT,
    "notes" TEXT,
    "changeReason" TEXT NOT NULL,
    "dispositionReason" TEXT,
    "preparedAt" TIMESTAMP(3),
    "preparedById" TEXT,
    "submissionReason" TEXT,
    "createdById" TEXT NOT NULL,
    "calculatedRevision" INTEGER,
    "calculatedAt" TIMESTAMP(3),
    "calculationSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcsVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcsArticle" (
    "id" TEXT NOT NULL,
    "ecsVersionId" TEXT NOT NULL,
    "feasibilityArticleId" TEXT NOT NULL,
    "articleCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productFamily" TEXT NOT NULL,
    "productKind" "FeasibilityProductKind" NOT NULL,
    "quantity" DECIMAL(38,12),
    "quantityUnit" TEXT,
    "engineeringSnapshot" JSONB NOT NULL,
    "proposedSellingPrice" DECIMAL(38,12),
    "pricingNotes" TEXT,
    "assumptions" TEXT[],

    CONSTRAINT "EcsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcsCostItem" (
    "id" TEXT NOT NULL,
    "ecsArticleId" TEXT NOT NULL,
    "feasibilityMaterialId" TEXT,
    "feasibilityProcessId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "EcsCostCategory" NOT NULL,
    "componentRole" TEXT,
    "materialSpecification" JSONB,
    "chargingBasis" "EcsChargingBasis",
    "quantityBasis" "EcsQuantityBasis",
    "quantity" DECIMAL(38,12),
    "quantityUnit" TEXT,
    "quantityBasisReference" TEXT,
    "allowStandardUnitConversion" BOOLEAN NOT NULL DEFAULT false,
    "orderCostReference" TEXT,
    "allocationPercent" DECIMAL(38,12),
    "unitRate" DECIMAL(38,12),
    "rateUnit" TEXT,
    "rateCurrency" TEXT,
    "rateSource" TEXT,
    "rateSourceType" TEXT,
    "rateSourceAttribution" TEXT,
    "rateDate" TIMESTAMP(3),
    "rateClassification" "EcsRateClassification" NOT NULL DEFAULT 'UNREVIEWED',
    "rateReviewReason" TEXT,
    "rateReviewedAt" TIMESTAMP(3),
    "rateReviewedById" TEXT,
    "percentage" DECIMAL(38,12),
    "percentageBaseItemIds" TEXT[],
    "applicability" "EcsApplicability" NOT NULL DEFAULT 'CHARGE',
    "applicabilityReason" TEXT,
    "includedInItemId" TEXT,
    "formulaDependency" TEXT,
    "assumptions" TEXT[],
    "notes" TEXT,

    CONSTRAINT "EcsCostItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EstimatedCostSheet_inquiryId_key" ON "EstimatedCostSheet"("inquiryId");

-- CreateIndex
CREATE INDEX "EcsVersion_ecsId_alternativeKey_version_idx" ON "EcsVersion"("ecsId", "alternativeKey", "version");

-- CreateIndex
CREATE INDEX "EcsVersion_baselineVersionId_idx" ON "EcsVersion"("baselineVersionId");

-- CreateIndex
CREATE INDEX "EcsVersion_feasibilityId_idx" ON "EcsVersion"("feasibilityId");

-- CreateIndex
CREATE INDEX "EcsVersion_previousVersionId_idx" ON "EcsVersion"("previousVersionId");

-- CreateIndex
CREATE INDEX "EcsVersion_createdById_idx" ON "EcsVersion"("createdById");

-- CreateIndex
CREATE INDEX "EcsVersion_preparedById_idx" ON "EcsVersion"("preparedById");

-- CreateIndex
CREATE UNIQUE INDEX "EcsVersion_ecsId_version_key" ON "EcsVersion"("ecsId", "version");

-- CreateIndex
CREATE INDEX "EcsArticle_feasibilityArticleId_idx" ON "EcsArticle"("feasibilityArticleId");

-- CreateIndex
CREATE UNIQUE INDEX "EcsArticle_ecsVersionId_feasibilityArticleId_key" ON "EcsArticle"("ecsVersionId", "feasibilityArticleId");

-- CreateIndex
CREATE UNIQUE INDEX "EcsArticle_ecsVersionId_articleCode_key" ON "EcsArticle"("ecsVersionId", "articleCode");

-- CreateIndex
CREATE INDEX "EcsCostItem_feasibilityMaterialId_idx" ON "EcsCostItem"("feasibilityMaterialId");

-- CreateIndex
CREATE INDEX "EcsCostItem_feasibilityProcessId_idx" ON "EcsCostItem"("feasibilityProcessId");

-- CreateIndex
CREATE INDEX "EcsCostItem_includedInItemId_ecsArticleId_idx" ON "EcsCostItem"("includedInItemId", "ecsArticleId");

-- CreateIndex
CREATE INDEX "EcsCostItem_rateReviewedById_idx" ON "EcsCostItem"("rateReviewedById");

-- CreateIndex
CREATE UNIQUE INDEX "EcsCostItem_id_ecsArticleId_key" ON "EcsCostItem"("id", "ecsArticleId");

-- CreateIndex
CREATE UNIQUE INDEX "EcsCostItem_ecsArticleId_code_key" ON "EcsCostItem"("ecsArticleId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "EcsCostItem_ecsArticleId_feasibilityMaterialId_key" ON "EcsCostItem"("ecsArticleId", "feasibilityMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "EcsCostItem_ecsArticleId_feasibilityProcessId_key" ON "EcsCostItem"("ecsArticleId", "feasibilityProcessId");

-- AddForeignKey
ALTER TABLE "EstimatedCostSheet" ADD CONSTRAINT "EstimatedCostSheet_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimatedCostSheet" ADD CONSTRAINT "EstimatedCostSheet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcsVersion" ADD CONSTRAINT "EcsVersion_ecsId_fkey" FOREIGN KEY ("ecsId") REFERENCES "EstimatedCostSheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcsVersion" ADD CONSTRAINT "EcsVersion_baselineVersionId_fkey" FOREIGN KEY ("baselineVersionId") REFERENCES "RequirementBaselineVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcsVersion" ADD CONSTRAINT "EcsVersion_feasibilityId_fkey" FOREIGN KEY ("feasibilityId") REFERENCES "FeasibilityAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcsVersion" ADD CONSTRAINT "EcsVersion_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "EcsVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcsVersion" ADD CONSTRAINT "EcsVersion_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcsVersion" ADD CONSTRAINT "EcsVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcsArticle" ADD CONSTRAINT "EcsArticle_ecsVersionId_fkey" FOREIGN KEY ("ecsVersionId") REFERENCES "EcsVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcsArticle" ADD CONSTRAINT "EcsArticle_feasibilityArticleId_fkey" FOREIGN KEY ("feasibilityArticleId") REFERENCES "FeasibilityArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcsCostItem" ADD CONSTRAINT "EcsCostItem_ecsArticleId_fkey" FOREIGN KEY ("ecsArticleId") REFERENCES "EcsArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcsCostItem" ADD CONSTRAINT "EcsCostItem_feasibilityMaterialId_fkey" FOREIGN KEY ("feasibilityMaterialId") REFERENCES "FeasibilityMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcsCostItem" ADD CONSTRAINT "EcsCostItem_feasibilityProcessId_fkey" FOREIGN KEY ("feasibilityProcessId") REFERENCES "FeasibilityProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcsCostItem" ADD CONSTRAINT "EcsCostItem_rateReviewedById_fkey" FOREIGN KEY ("rateReviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcsCostItem" ADD CONSTRAINT "EcsCostItem_includedInItemId_ecsArticleId_fkey" FOREIGN KEY ("includedInItemId", "ecsArticleId") REFERENCES "EcsCostItem"("id", "ecsArticleId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EcsVersion" ADD CONSTRAINT "ecs_version_values" CHECK (
    "version" > 0 AND "revision" > 0
    AND ("exchangeRate" IS NULL OR "exchangeRate" > 0)
    AND ("costingCurrency" <> "quotationCurrency" OR "exchangeRate" IS NULL OR "exchangeRate" = 1)
    AND ("calculatedRevision" IS NULL OR "calculatedRevision" = "revision")
);
ALTER TABLE "EcsVersion" ADD CONSTRAINT "ecs_preparation_consistent" CHECK (
    ("preparedAt" IS NULL AND "preparedById" IS NULL AND "submissionReason" IS NULL AND "status" <> 'READY_FOR_APPROVAL')
    OR ("preparedAt" IS NOT NULL AND "preparedById" IS NOT NULL AND "submissionReason" IS NOT NULL
        AND "status" IN ('READY_FOR_APPROVAL', 'SUPERSEDED') AND "calculationSnapshot" IS NOT NULL)
);
ALTER TABLE "EcsArticle" ADD CONSTRAINT "ecs_article_values" CHECK (
    ("quantity" IS NULL OR "quantity" > 0)
    AND ("proposedSellingPrice" IS NULL OR "proposedSellingPrice" > 0)
);
ALTER TABLE "EcsCostItem" ADD CONSTRAINT "ecs_cost_item_values" CHECK (
    ("quantity" IS NULL OR "quantity" > 0)
    AND ("unitRate" IS NULL OR "unitRate" >= 0)
    AND ("percentage" IS NULL OR "percentage" >= 0)
    AND ("allocationPercent" IS NULL OR ("allocationPercent" > 0 AND "allocationPercent" <= 100))
    AND ("feasibilityMaterialId" IS NULL OR "feasibilityProcessId" IS NULL)
    AND ("includedInItemId" IS NULL OR "includedInItemId" <> "id")
);

COMMIT;
