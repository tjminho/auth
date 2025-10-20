/*
  Warnings:

  - A unique constraint covering the columns `[identifier,type,consumedAt]` on the table `Verification` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "auth_db"."Verification_identifier_type_key";

-- CreateIndex
CREATE UNIQUE INDEX "Verification_identifier_type_consumedAt_key" ON "auth_db"."Verification"("identifier", "type", "consumedAt");
