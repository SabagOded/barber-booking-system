-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "tagline" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN "doorNotice" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN "doorNoticeUntil" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "HoursOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "HoursOverride_date_key" ON "HoursOverride"("date");
