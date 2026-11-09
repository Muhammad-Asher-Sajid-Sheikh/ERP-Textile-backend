-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('MERCHANDISING', 'SCM', 'PRODUCTION', 'QUALITY', 'ACCOUNTS');

-- CreateTable
CREATE TABLE "time_action_plans" (
    "id" TEXT NOT NULL,
    "icnNo" TEXT NOT NULL,
    "owiId" TEXT NOT NULL,
    "owi" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "shipmentDeadline" TIMESTAMP(3) NOT NULL,
    "totalLeadTimeDays" INTEGER NOT NULL,
    "taVersion" INTEGER NOT NULL DEFAULT 1,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "criticalPathFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_action_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_action_stages" (
    "id" TEXT NOT NULL,
    "timeActionPlanId" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "actualStartDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "responsibleDepartment" "Department",
    "status" "StageStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "time_action_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_action_plans_icnNo_idx" ON "time_action_plans"("icnNo");

-- CreateIndex
CREATE INDEX "time_action_plans_owiId_idx" ON "time_action_plans"("owiId");

-- CreateIndex
CREATE INDEX "time_action_stages_timeActionPlanId_idx" ON "time_action_stages"("timeActionPlanId");

-- CreateIndex
CREATE INDEX "time_action_stages_status_idx" ON "time_action_stages"("status");

-- CreateIndex
CREATE INDEX "time_action_stages_responsibleDepartment_idx" ON "time_action_stages"("responsibleDepartment");

-- AddForeignKey
ALTER TABLE "time_action_stages" ADD CONSTRAINT "time_action_stages_timeActionPlanId_fkey" FOREIGN KEY ("timeActionPlanId") REFERENCES "time_action_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
