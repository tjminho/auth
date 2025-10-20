/*
  Warnings:

  - You are about to drop the column `adminEmail` on the `Company` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[provider,email]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,email]` on the table `VerifiedEmail` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `adminId` to the `Company` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Verification` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "auth_db"."Role" ADD VALUE 'SUPER_ADMIN';

-- AlterEnum
ALTER TYPE "auth_db"."UserStatus" ADD VALUE 'BLOCKED';

-- DropIndex
DROP INDEX "auth_db"."User_email_key";

-- DropIndex
DROP INDEX "auth_db"."Verification_identifier_type_consumedAt_key";

-- DropIndex
DROP INDEX "auth_db"."VerifiedEmail_email_key";

-- AlterTable
ALTER TABLE "auth_db"."Company" DROP COLUMN "adminEmail",
ADD COLUMN     "adminId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "auth_db"."User" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "auth_db"."Verification" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Company_adminId_idx" ON "auth_db"."Company"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "User_provider_email_key" ON "auth_db"."User"("provider", "email");

-- CreateIndex
CREATE UNIQUE INDEX "VerifiedEmail_userId_email_key" ON "auth_db"."VerifiedEmail"("userId", "email");

-- AddForeignKey
ALTER TABLE "auth_db"."Company" ADD CONSTRAINT "Company_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "auth_db"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
