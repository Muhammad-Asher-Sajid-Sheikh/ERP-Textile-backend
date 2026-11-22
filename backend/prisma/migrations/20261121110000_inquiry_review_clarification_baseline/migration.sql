-- CreateEnum
CREATE TYPE "TechnicalReviewOutcome" AS ENUM ('COMPLETE_FOR_CLARIFICATION_BASELINE', 'CUSTOMER_CLARIFICATION_REQUIRED', 'TECHNICAL_REVIEW_PENDING', 'FEASIBLE_WITH_ASSUMPTIONS', 'NOT_FEASIBLE');

-- CreateEnum
CREATE TYPE "RequirementState" AS ENUM ('VERIFIED', 'UNVERIFIED', 'MISSING', 'ASSUMED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "RequirementArea" AS ENUM ('PRODUCT', 'QUANTITY', 'COMMERCIAL', 'TIMING', 'PACKING', 'QUALITY');

-- CreateEnum
CREATE TYPE "RequirementStage" AS ENUM ('QUOTATION', 'SAMPLE', 'ORDER_ACTIVATION');

-- CreateEnum
CREATE TYPE "ConsultationConclusion" AS ENUM ('SUPPORTED', 'TECHNICAL_HOLD', 'NOT_FEASIBLE');

-- CreateEnum
CREATE TYPE "ConfirmationState" AS ENUM ('UNANSWERED', 'WRITTEN_CONFIRMATION_PENDING', 'WRITTEN_CONFIRMED');

-- CreateEnum
CREATE TYPE "BaselineOutcome" AS ENUM ('BASELINE_READY_FOR_FEASIBILITY', 'CLARIFICATION_PENDING', 'CUSTOMER_HOLD');

-- CreateEnum
CREATE TYPE "ProvisionalDisposition" AS ENUM ('REJECTED', 'RETURNED_FOR_INFORMATION');

-- CreateTable
CREATE TABLE "InquiryTechnicalReview" (
    "submittedById" TEXT,
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "productFamily" TEXT NOT NULL,
    "applicabilityReference" TEXT,
    "assumptions" TEXT[],
    "notes" TEXT,
    "outcome" "TechnicalReviewOutcome",
    "submittedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "productionReviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InquiryTechnicalReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalReviewItem" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "area" "RequirementArea" NOT NULL,
    "label" TEXT NOT NULL,
    "state" "RequirementState" NOT NULL,
    "value" TEXT,
    "requiredFor" "RequirementStage"[],
    "applicabilityReason" TEXT NOT NULL,
    "needsProduction" BOOLEAN NOT NULL DEFAULT false,
    "evidenceId" TEXT,
    "ownerId" TEXT,
    "dueAt" TIMESTAMP(3),
    "followUpAt" TIMESTAMP(3),
    "escalationReason" TEXT,

    CONSTRAINT "TechnicalReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionConsultation" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reviewRevision" INTEGER NOT NULL,
    "conclusion" "ConsultationConclusion" NOT NULL,
    "findings" TEXT NOT NULL,
    "assumptions" TEXT[],
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionConsultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerClarification" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "followUpAt" TIMESTAMP(3) NOT NULL,
    "responsibleId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "customerHold" BOOLEAN NOT NULL DEFAULT false,
    "escalationReason" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerClarification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClarificationQuestion" (
    "id" TEXT NOT NULL,
    "clarificationId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "reviewItemId" TEXT,
    "confirmation" "ConfirmationState" NOT NULL DEFAULT 'UNANSWERED',

    CONSTRAINT "ClarificationQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClarificationResponse" (
    "sequence" INTEGER NOT NULL,
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "confirmation" "ConfirmationState" NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClarificationResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementBaselineVersion" (
    "sourceFingerprint" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" TEXT,
    "assumptions" TEXT[],
    "openQuestions" TEXT[],
    "changeReason" TEXT NOT NULL,
    "outcome" "BaselineOutcome" NOT NULL DEFAULT 'CLARIFICATION_PENDING',
    "frozenAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementBaselineVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaselineAssertion" (
    "id" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL,
    "evidenceId" TEXT NOT NULL,

    CONSTRAINT "BaselineAssertion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvisionalReviewRequest" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "missingInformation" JSONB NOT NULL,
    "proposedActivity" TEXT NOT NULL,
    "unaffectedScope" TEXT NOT NULL,
    "assumptions" TEXT[],
    "risks" TEXT[],
    "requestedById" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProvisionalReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvisionalReviewDecision" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "disposition" "ProvisionalDisposition" NOT NULL,
    "reason" TEXT NOT NULL,
    "conditions" TEXT[],
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProvisionalReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InquiryTechnicalReview_productionReviewerId_idx" ON "InquiryTechnicalReview"("productionReviewerId");

-- CreateIndex
CREATE INDEX "InquiryTechnicalReview_outcome_submittedAt_idx" ON "InquiryTechnicalReview"("outcome", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InquiryTechnicalReview_inquiryId_version_key" ON "InquiryTechnicalReview"("inquiryId", "version");

-- CreateIndex
CREATE INDEX "TechnicalReviewItem_ownerId_dueAt_idx" ON "TechnicalReviewItem"("ownerId", "dueAt");

-- CreateIndex
CREATE INDEX "TechnicalReviewItem_evidenceId_idx" ON "TechnicalReviewItem"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalReviewItem_reviewId_key_key" ON "TechnicalReviewItem"("reviewId", "key");

-- CreateIndex
CREATE INDEX "ProductionConsultation_reviewId_reviewRevision_createdAt_idx" ON "ProductionConsultation"("reviewId", "reviewRevision", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerClarification_inquiryId_createdAt_idx" ON "CustomerClarification"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerClarification_responsibleId_dueAt_idx" ON "CustomerClarification"("responsibleId", "dueAt");

-- CreateIndex
CREATE INDEX "CustomerClarification_escalatedAt_idx" ON "CustomerClarification"("escalatedAt");

-- CreateIndex
CREATE INDEX "ClarificationQuestion_clarificationId_confirmation_idx" ON "ClarificationQuestion"("clarificationId", "confirmation");

-- CreateIndex
CREATE INDEX "ClarificationQuestion_reviewItemId_idx" ON "ClarificationQuestion"("reviewItemId");

-- CreateIndex
CREATE INDEX "ClarificationResponse_questionId_createdAt_idx" ON "ClarificationResponse"("questionId", "createdAt");

-- CreateIndex
CREATE INDEX "ClarificationResponse_evidenceId_idx" ON "ClarificationResponse"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ClarificationResponse_questionId_sequence_key" ON "ClarificationResponse"("questionId", "sequence");

-- CreateIndex
CREATE INDEX "RequirementBaselineVersion_reviewId_idx" ON "RequirementBaselineVersion"("reviewId");

-- CreateIndex
CREATE INDEX "RequirementBaselineVersion_previousVersionId_idx" ON "RequirementBaselineVersion"("previousVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementBaselineVersion_inquiryId_version_key" ON "RequirementBaselineVersion"("inquiryId", "version");

-- CreateIndex
CREATE INDEX "BaselineAssertion_evidenceId_idx" ON "BaselineAssertion"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "BaselineAssertion_baselineId_key_key" ON "BaselineAssertion"("baselineId", "key");

-- CreateIndex
CREATE INDEX "ProvisionalReviewRequest_inquiryId_createdAt_idx" ON "ProvisionalReviewRequest"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "ProvisionalReviewRequest_reviewerId_expiresAt_idx" ON "ProvisionalReviewRequest"("reviewerId", "expiresAt");

-- CreateIndex
CREATE INDEX "ProvisionalReviewRequest_reviewId_idx" ON "ProvisionalReviewRequest"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisionalReviewDecision_requestId_key" ON "ProvisionalReviewDecision"("requestId");

-- AddForeignKey
ALTER TABLE "InquiryTechnicalReview" ADD CONSTRAINT "InquiryTechnicalReview_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryTechnicalReview" ADD CONSTRAINT "InquiryTechnicalReview_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryTechnicalReview" ADD CONSTRAINT "InquiryTechnicalReview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryTechnicalReview" ADD CONSTRAINT "InquiryTechnicalReview_productionReviewerId_fkey" FOREIGN KEY ("productionReviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalReviewItem" ADD CONSTRAINT "TechnicalReviewItem_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "InquiryTechnicalReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalReviewItem" ADD CONSTRAINT "TechnicalReviewItem_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "InquiryEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalReviewItem" ADD CONSTRAINT "TechnicalReviewItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionConsultation" ADD CONSTRAINT "ProductionConsultation_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "InquiryTechnicalReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionConsultation" ADD CONSTRAINT "ProductionConsultation_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerClarification" ADD CONSTRAINT "CustomerClarification_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerClarification" ADD CONSTRAINT "CustomerClarification_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerClarification" ADD CONSTRAINT "CustomerClarification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClarificationQuestion" ADD CONSTRAINT "ClarificationQuestion_clarificationId_fkey" FOREIGN KEY ("clarificationId") REFERENCES "CustomerClarification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClarificationQuestion" ADD CONSTRAINT "ClarificationQuestion_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "TechnicalReviewItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClarificationResponse" ADD CONSTRAINT "ClarificationResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ClarificationQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClarificationResponse" ADD CONSTRAINT "ClarificationResponse_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "InquiryEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClarificationResponse" ADD CONSTRAINT "ClarificationResponse_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementBaselineVersion" ADD CONSTRAINT "RequirementBaselineVersion_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementBaselineVersion" ADD CONSTRAINT "RequirementBaselineVersion_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "InquiryTechnicalReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementBaselineVersion" ADD CONSTRAINT "RequirementBaselineVersion_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "RequirementBaselineVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementBaselineVersion" ADD CONSTRAINT "RequirementBaselineVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaselineAssertion" ADD CONSTRAINT "BaselineAssertion_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "RequirementBaselineVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaselineAssertion" ADD CONSTRAINT "BaselineAssertion_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "InquiryEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisionalReviewRequest" ADD CONSTRAINT "ProvisionalReviewRequest_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisionalReviewRequest" ADD CONSTRAINT "ProvisionalReviewRequest_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "InquiryTechnicalReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisionalReviewRequest" ADD CONSTRAINT "ProvisionalReviewRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisionalReviewRequest" ADD CONSTRAINT "ProvisionalReviewRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisionalReviewDecision" ADD CONSTRAINT "ProvisionalReviewDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProvisionalReviewRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisionalReviewDecision" ADD CONSTRAINT "ProvisionalReviewDecision_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One working draft per inquiry. Allocation is also serialized by the customer lock.
CREATE UNIQUE INDEX "InquiryTechnicalReview_one_draft" ON "InquiryTechnicalReview" ("inquiryId") WHERE "submittedAt" IS NULL;
CREATE UNIQUE INDEX "RequirementBaselineVersion_one_draft" ON "RequirementBaselineVersion" ("inquiryId") WHERE "frozenAt" IS NULL;
ALTER TABLE "InquiryTechnicalReview" ADD CONSTRAINT "review_version_positive" CHECK ("version" > 0 AND "revision" > 0);
ALTER TABLE "RequirementBaselineVersion" ADD CONSTRAINT "baseline_version_positive" CHECK ("version" > 0 AND "revision" > 0);
