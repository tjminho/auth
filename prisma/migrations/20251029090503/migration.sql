/*
  Warnings:

  - Added the required column `provider` to the `LoginHistory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LoginHistory" ADD COLUMN     "provider" TEXT NOT NULL;
