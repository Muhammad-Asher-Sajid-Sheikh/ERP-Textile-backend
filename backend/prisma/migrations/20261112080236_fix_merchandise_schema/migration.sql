/*
  Warnings:

  - A unique constraint covering the columns `[timeActionPlanId,stageName]` on the table `time_action_stages` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "pre_production_samples" ALTER COLUMN "owi" DROP NOT NULL;

-- AlterTable
ALTER TABLE "time_action_plans" ALTER COLUMN "owi" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "time_action_stages_timeActionPlanId_stageName_key" ON "time_action_stages"("timeActionPlanId", "stageName");
