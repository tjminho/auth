/*
  Warnings:

  - A unique constraint covering the columns `[identifier,type]` on the table `Verification` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "auth_db"."Role" ADD VALUE 'SUBSCRIBER';

-- DropForeignKey
ALTER TABLE "auth_db"."Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropForeignKey
ALTER TABLE "auth_db"."Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "auth_db"."VerifiedEmail" DROP CONSTRAINT "VerifiedEmail_userId_fkey";

-- DropIndex
DROP INDEX "auth_db"."User_email_idx";

-- DropIndex
DROP INDEX "auth_db"."User_trustedEmail_idx";

-- DropIndex
DROP INDEX "auth_db"."Verification_value_key";

-- AlterTable
ALTER TABLE "auth_db"."User" ADD COLUMN     "subscriptionExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Verification_value_idx" ON "auth_db"."Verification"("value");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_identifier_type_key" ON "auth_db"."Verification"("identifier", "type");

-- AddForeignKey
ALTER TABLE "auth_db"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_db"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_db"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_db"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_db"."VerifiedEmail" ADD CONSTRAINT "VerifiedEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_db"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
