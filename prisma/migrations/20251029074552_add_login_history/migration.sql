/*
  Warnings:

  - You are about to drop the column `fcmToken` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Guide` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Term` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_GuideTerms` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "auth_db"."_GuideTerms" DROP CONSTRAINT "_GuideTerms_A_fkey";

-- DropForeignKey
ALTER TABLE "auth_db"."_GuideTerms" DROP CONSTRAINT "_GuideTerms_B_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "fcmToken";

-- DropTable
DROP TABLE "auth_db"."Guide";

-- DropTable
DROP TABLE "auth_db"."Term";

-- DropTable
DROP TABLE "auth_db"."_GuideTerms";

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- AddForeignKey
ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
