-- CreateEnum
CREATE TYPE "InquirySource" AS ENUM ('EMAIL', 'WHATSAPP', 'WEBSITE', 'BUYING_AGENT', 'MEETING', 'TELEPHONE', 'OTHER');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('RECEIVED', 'REGISTERED', 'ACKNOWLEDGED', 'DUPLICATE_LINKED', 'ON_HOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "InquiryPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CommercialPartyRole" AS ENUM ('LEGAL_BUYER', 'BUYER', 'AGENT', 'ACCOUNT_OWNER', 'REMITTER', 'CONSIGNEE', 'ULTIMATE_CUSTOMER');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "customerType" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "designation" TEXT,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRelationship" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "role" "CommercialPartyRole" NOT NULL,

    CONSTRAINT "CustomerRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IrnSequence" (
    "customerId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL,

    CONSTRAINT "IrnSequence_pkey" PRIMARY KEY ("customerId","year")
);

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "irn" TEXT NOT NULL,
    "irnYear" INTEGER NOT NULL,
    "irnSerial" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "source" "InquirySource" NOT NULL,
    "sourceReference" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "productCategory" TEXT,
    "seasonProgram" TEXT,
    "destination" TEXT,
    "estimatedQuantity" DECIMAL(20,4),
    "quantityUnit" TEXT,
    "targetDate" DATE,
    "merchandiserId" TEXT NOT NULL,
    "priority" "InquiryPriority" NOT NULL DEFAULT 'NORMAL',
    "responseDueAt" TIMESTAMP(3) NOT NULL,
    "nextAction" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'REGISTERED',
    "statusReason" TEXT,
    "duplicateOfId" TEXT,
    "originalEvidenceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InquiryEvidence" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "source" "InquirySource" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "message" TEXT,
    "reference" TEXT,
    "correctsEvidenceId" TEXT,
    "filename" TEXT,
    "mediaType" TEXT,
    "byteSize" INTEGER,
    "attachmentBytes" BYTEA,
    "attachmentSha256" TEXT,
    "contentSha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InquiryEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InquiryAcknowledgement" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL,
    "channel" "InquirySource" NOT NULL,
    "recipient" TEXT NOT NULL,
    "message" TEXT,
    "reference" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InquiryAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InquiryStatusHistory" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "previousStatus" "InquiryStatus",
    "newStatus" "InquiryStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InquiryStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "reason" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE INDEX "Customer_active_name_idx" ON "Customer"("active", "name");

-- CreateIndex
CREATE INDEX "CustomerContact_customerId_idx" ON "CustomerContact"("customerId");

-- CreateIndex
CREATE INDEX "CustomerRelationship_partyId_idx" ON "CustomerRelationship"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRelationship_customerId_partyId_role_key" ON "CustomerRelationship"("customerId", "partyId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Inquiry_irn_key" ON "Inquiry"("irn");

-- CreateIndex
CREATE INDEX "Inquiry_customerId_createdAt_idx" ON "Inquiry"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Inquiry_merchandiserId_status_idx" ON "Inquiry"("merchandiserId", "status");

-- CreateIndex
CREATE INDEX "Inquiry_status_responseDueAt_idx" ON "Inquiry"("status", "responseDueAt");

-- CreateIndex
CREATE INDEX "Inquiry_customerId_originalEvidenceHash_idx" ON "Inquiry"("customerId", "originalEvidenceHash");

-- CreateIndex
CREATE INDEX "Inquiry_customerId_sourceReference_idx" ON "Inquiry"("customerId", "sourceReference");

-- CreateIndex
CREATE INDEX "Inquiry_duplicateOfId_idx" ON "Inquiry"("duplicateOfId");

-- CreateIndex
CREATE UNIQUE INDEX "Inquiry_customerId_irnYear_irnSerial_key" ON "Inquiry"("customerId", "irnYear", "irnSerial");

-- CreateIndex
CREATE INDEX "InquiryEvidence_inquiryId_createdAt_idx" ON "InquiryEvidence"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "InquiryEvidence_correctsEvidenceId_idx" ON "InquiryEvidence"("correctsEvidenceId");

-- CreateIndex
CREATE INDEX "InquiryAcknowledgement_inquiryId_createdAt_idx" ON "InquiryAcknowledgement"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "InquiryStatusHistory_inquiryId_createdAt_idx" ON "InquiryStatusHistory"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessAuditLog_entityType_entityId_createdAt_idx" ON "BusinessAuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessAuditLog_actorId_createdAt_idx" ON "BusinessAuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRelationship" ADD CONSTRAINT "CustomerRelationship_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRelationship" ADD CONSTRAINT "CustomerRelationship_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IrnSequence" ADD CONSTRAINT "IrnSequence_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_merchandiserId_fkey" FOREIGN KEY ("merchandiserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryEvidence" ADD CONSTRAINT "InquiryEvidence_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryEvidence" ADD CONSTRAINT "InquiryEvidence_correctsEvidenceId_fkey" FOREIGN KEY ("correctsEvidenceId") REFERENCES "InquiryEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryEvidence" ADD CONSTRAINT "InquiryEvidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryAcknowledgement" ADD CONSTRAINT "InquiryAcknowledgement_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryAcknowledgement" ADD CONSTRAINT "InquiryAcknowledgement_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryStatusHistory" ADD CONSTRAINT "InquiryStatusHistory_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryStatusHistory" ADD CONSTRAINT "InquiryStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessAuditLog" ADD CONSTRAINT "BusinessAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additional invariants not expressible in the Prisma schema.
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_serial_positive" CHECK ("irnSerial" BETWEEN 1 AND 999);
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_quantity_positive" CHECK ("estimatedQuantity" IS NULL OR "estimatedQuantity" > 0);
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_deadline_after_receipt" CHECK ("responseDueAt" >= "receivedAt");
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_duplicate_not_self" CHECK ("duplicateOfId" IS NULL OR "duplicateOfId" <> "id");
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_link_required" CHECK ("status" <> 'DUPLICATE_LINKED' OR "duplicateOfId" IS NOT NULL);
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_reason_required" CHECK ("status" NOT IN ('ON_HOLD', 'CLOSED') OR length(trim("statusReason")) > 0 AND "statusReason" IS NOT NULL);
ALTER TABLE "CustomerRelationship" ADD CONSTRAINT "CustomerRelationship_not_self" CHECK ("customerId" <> "partyId");
ALTER TABLE "InquiryEvidence" ADD CONSTRAINT "InquiryEvidence_original_required" CHECK (coalesce(length(trim("message")), 0) > 0 OR "attachmentBytes" IS NOT NULL);
ALTER TABLE "InquiryEvidence" ADD CONSTRAINT "InquiryEvidence_attachment_consistency" CHECK (
  ("attachmentBytes" IS NULL AND "filename" IS NULL AND "mediaType" IS NULL AND "byteSize" IS NULL AND "attachmentSha256" IS NULL)
  OR ("attachmentBytes" IS NOT NULL AND "filename" IS NOT NULL AND "mediaType" IS NOT NULL
      AND "byteSize" IS NOT NULL AND "attachmentSha256" IS NOT NULL
      AND "byteSize" = octet_length("attachmentBytes") AND "byteSize" BETWEEN 1 AND 5242880)
);
ALTER TABLE "IrnSequence" ADD CONSTRAINT "IrnSequence_positive" CHECK ("lastValue" > 0);

CREATE FUNCTION "wf01_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'WF-01 evidence and history are append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "InquiryEvidence_append_only" BEFORE UPDATE OR DELETE ON "InquiryEvidence" FOR EACH ROW EXECUTE FUNCTION "wf01_append_only"();
CREATE TRIGGER "InquiryAcknowledgement_append_only" BEFORE UPDATE OR DELETE ON "InquiryAcknowledgement" FOR EACH ROW EXECUTE FUNCTION "wf01_append_only"();
CREATE TRIGGER "InquiryStatusHistory_append_only" BEFORE UPDATE OR DELETE ON "InquiryStatusHistory" FOR EACH ROW EXECUTE FUNCTION "wf01_append_only"();
CREATE TRIGGER "BusinessAuditLog_append_only" BEFORE UPDATE OR DELETE ON "BusinessAuditLog" FOR EACH ROW EXECUTE FUNCTION "wf01_append_only"();

CREATE FUNCTION "wf01_inquiry_identity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Issued inquiries cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF ROW(NEW."id", NEW."irn", NEW."irnYear", NEW."irnSerial", NEW."customerId", NEW."source", NEW."sourceReference", NEW."receivedAt", NEW."originalEvidenceHash", NEW."createdById", NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."id", OLD."irn", OLD."irnYear", OLD."irnSerial", OLD."customerId", OLD."source", OLD."sourceReference", OLD."receivedAt", OLD."originalEvidenceHash", OLD."createdById", OLD."createdAt") THEN
    RAISE EXCEPTION 'Issued inquiry identity and original receipt are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Inquiry_identity_immutable" BEFORE UPDATE OR DELETE ON "Inquiry" FOR EACH ROW EXECUTE FUNCTION "wf01_inquiry_identity"();

CREATE FUNCTION "wf01_customer_code"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code" THEN
    RAISE EXCEPTION 'Customer codes are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Customer_code_immutable" BEFORE UPDATE ON "Customer" FOR EACH ROW EXECUTE FUNCTION "wf01_customer_code"();

CREATE FUNCTION "wf01_sequence_monotonic"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IRN sequences cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF NEW."customerId" IS DISTINCT FROM OLD."customerId" OR NEW."year" IS DISTINCT FROM OLD."year" OR NEW."lastValue" < OLD."lastValue" THEN
    RAISE EXCEPTION 'IRN sequences cannot be rewound or reassigned' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "IrnSequence_monotonic" BEFORE UPDATE OR DELETE ON "IrnSequence" FOR EACH ROW EXECUTE FUNCTION "wf01_sequence_monotonic"();
