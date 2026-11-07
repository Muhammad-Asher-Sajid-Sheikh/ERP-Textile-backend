-- CreateTable
CREATE TABLE "ProductFamily" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "productList" TEXT NOT NULL,
    "normalMaterial" TEXT NOT NULL,
    "productStage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductFamily_pkey" PRIMARY KEY ("id")
);
