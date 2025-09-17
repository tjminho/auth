/*
  Warnings:

  - You are about to alter the column `password` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `mfaSecret` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `identifier` on the `Verification` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.

*/
-- AlterTable
ALTER TABLE "auth_db"."User" ALTER COLUMN "password" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "mfaSecret" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "auth_db"."Verification" ALTER COLUMN "identifier" SET DATA TYPE VARCHAR(255);

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "auth_db"."Account"("userId");

-- CreateIndex
CREATE INDEX "Company_createdBy_idx" ON "auth_db"."Company"("createdBy");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "auth_db"."Session"("userId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "auth_db"."User"("email");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "auth_db"."Verification"("identifier");

-- CreateIndex
CREATE INDEX "VerifiedEmail_userId_idx" ON "auth_db"."VerifiedEmail"("userId");
