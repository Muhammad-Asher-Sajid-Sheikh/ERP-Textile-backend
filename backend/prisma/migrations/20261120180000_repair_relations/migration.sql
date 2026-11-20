-- Additive repair. ProductFamily's original columns and foreign key already exist
-- in the applied migration history; they are restored in schema.prisma, not recreated.
CREATE TABLE "Products" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "productList" TEXT,
    "normalMaterial" TEXT,
    "productStage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Products_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProductFamily_orderId_idx" ON "ProductFamily"("orderId");
CREATE INDEX "Products_orderId_idx" ON "Products"("orderId");
ALTER TABLE "Products" ADD CONSTRAINT "Products_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "OrderToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
