-- CreateTable
CREATE TABLE "brokers" (
    "id" TEXT NOT NULL,
    "brokerName" TEXT NOT NULL,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brokers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broker_third_party_records" (
    "id" TEXT NOT NULL,
    "icnNo" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "priceCost" DOUBLE PRECISION NOT NULL,
    "dateToSent" TIMESTAMP(3),
    "dateToReceive" TIMESTAMP(3),
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broker_third_party_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broker_third_party_records_icnNo_idx" ON "broker_third_party_records"("icnNo");

-- CreateIndex
CREATE INDEX "broker_third_party_records_brokerId_idx" ON "broker_third_party_records"("brokerId");

-- AddForeignKey
ALTER TABLE "broker_third_party_records" ADD CONSTRAINT "broker_third_party_records_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
