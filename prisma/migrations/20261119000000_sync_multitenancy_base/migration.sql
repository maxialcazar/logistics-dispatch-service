-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'admin';

-- DropForeignKey
ALTER TABLE "Package" DROP CONSTRAINT "Package_zoneId_fkey";

-- DropIndex
DROP INDEX "Package_trackingCode_key";

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "addressCity" TEXT,
ADD COLUMN     "addressFloor" TEXT,
ADD COLUMN     "addressNumber" TEXT,
ADD COLUMN     "addressReferences" TEXT,
ADD COLUMN     "addressStreet" TEXT,
ADD COLUMN     "addressZip" TEXT,
ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deliveryWindowEnd" TIMESTAMP(3),
ADD COLUMN     "deliveryWindowStart" TIMESTAMP(3),
ADD COLUMN     "estimatedDeliveryAt" TIMESTAMP(3),
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "recipientAddress" TEXT NOT NULL,
ADD COLUMN     "recipientEmail" TEXT,
ADD COLUMN     "recipientName" TEXT NOT NULL,
ADD COLUMN     "recipientPhone" TEXT NOT NULL,
ADD COLUMN     "senderAddress" TEXT,
ADD COLUMN     "senderName" TEXT,
ADD COLUMN     "senderPhone" TEXT,
ADD COLUMN     "signatureUrl" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "volume" DOUBLE PRECISION,
ADD COLUMN     "weight" DOUBLE PRECISION,
ALTER COLUMN "status" SET DEFAULT 'pending',
ALTER COLUMN "zoneId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageHistory" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "status" "PackageStatus" NOT NULL,
    "userId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "PackageHistory_packageId_createdAt_idx" ON "PackageHistory"("packageId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PackageHistory_userId_idx" ON "PackageHistory"("userId");

-- CreateIndex
CREATE INDEX "Driver_companyId_idx" ON "Driver"("companyId");

-- CreateIndex
CREATE INDEX "Package_companyId_status_idx" ON "Package"("companyId", "status");

-- CreateIndex
CREATE INDEX "Package_companyId_zoneId_idx" ON "Package"("companyId", "zoneId");

-- CreateIndex
CREATE INDEX "Package_companyId_updatedAt_idx" ON "Package"("companyId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Package_trackingCode_companyId_key" ON "Package"("trackingCode", "companyId");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "Zone_companyId_idx" ON "Zone"("companyId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageHistory" ADD CONSTRAINT "PackageHistory_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageHistory" ADD CONSTRAINT "PackageHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
