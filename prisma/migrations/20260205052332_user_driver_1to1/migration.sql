/*
  Warnings:

  - A unique constraint covering the columns `[driverId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "User_driverId_key" ON "User"("driverId");
