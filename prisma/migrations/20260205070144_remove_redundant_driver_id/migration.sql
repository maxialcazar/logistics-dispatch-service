/*
  Warnings:

  - You are about to drop the column `driverId` on the `Package` table. All the data in the column will be lost.
  - You are about to drop the `_DriverZones` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Package" DROP CONSTRAINT "Package_driverId_fkey";

-- DropForeignKey
ALTER TABLE "_DriverZones" DROP CONSTRAINT "_DriverZones_A_fkey";

-- DropForeignKey
ALTER TABLE "_DriverZones" DROP CONSTRAINT "_DriverZones_B_fkey";

-- AlterTable
ALTER TABLE "Package" DROP COLUMN "driverId";

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN     "driverId" TEXT;

-- DropTable
DROP TABLE "_DriverZones";

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
