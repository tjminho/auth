-- AlterTable
ALTER TABLE "VerificationSession" ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "VerificationSession" ADD CONSTRAINT "VerificationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
