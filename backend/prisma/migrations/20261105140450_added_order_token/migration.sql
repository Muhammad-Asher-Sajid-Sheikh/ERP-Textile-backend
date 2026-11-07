-- CreateTable
CREATE TABLE "OrderToken" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderToken_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProductFamily" ADD CONSTRAINT "ProductFamily_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
