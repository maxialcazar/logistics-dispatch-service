-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Driver" DROP CONSTRAINT "Driver_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Zone" DROP CONSTRAINT "Zone_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Package" DROP CONSTRAINT "Package_companyId_fkey";

-- DropForeignKey
ALTER TABLE "PackageHistory" DROP CONSTRAINT "PackageHistory_packageId_fkey";

-- DropForeignKey
ALTER TABLE "PackageHistory" DROP CONSTRAINT "PackageHistory_userId_fkey";

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "driverId" TEXT;

-- AlterTable
ALTER TABLE "PackageHistory" ALTER COLUMN "userId" DROP NOT NULL;

-- Backfill direct driverId on existing non-pending packages from their current zone
UPDATE "Package" p
SET "driverId" = z."driverId"
FROM "Zone" z
WHERE p."zoneId" = z."id"
  AND p."driverId" IS NULL
  AND p."status" IN ('assigned', 'in_transit', 'delivered', 'cancelled')
  AND z."driverId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "Zone_companyId_isActive_idx" ON "Zone"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "Zone_companyId_driverId_idx" ON "Zone"("companyId", "driverId");

-- CreateIndex
CREATE INDEX "Package_companyId_driverId_idx" ON "Package"("companyId", "driverId");

-- CreateIndex
CREATE INDEX "Package_companyId_isArchived_createdAt_idx" ON "Package"("companyId", "isArchived", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Package_trackingCode_idx" ON "Package"("trackingCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageHistory" ADD CONSTRAINT "PackageHistory_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageHistory" ADD CONSTRAINT "PackageHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
