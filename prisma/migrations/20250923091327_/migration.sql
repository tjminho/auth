-- AlterTable
ALTER TABLE "auth_db"."User" ADD COLUMN     "unverified" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "User_status_idx" ON "auth_db"."User"("status");
