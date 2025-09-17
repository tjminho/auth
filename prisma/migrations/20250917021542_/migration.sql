/*
  Warnings:

  - A unique constraint covering the columns `[trustedEmail]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "auth_db"."User" ADD COLUMN     "lastVerificationSentAt" TIMESTAMP(3),
ADD COLUMN     "trustedEmail" TEXT;

-- AlterTable
ALTER TABLE "auth_db"."Verification" ADD COLUMN     "consumedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_trustedEmail_key" ON "auth_db"."User"("trustedEmail");

-- CreateIndex
CREATE INDEX "User_trustedEmail_idx" ON "auth_db"."User"("trustedEmail");
