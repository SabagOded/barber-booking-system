-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "logoStorageKey" TEXT;

-- CreateTable
CREATE TABLE "PortfolioImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "settingsId" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "focalX" REAL NOT NULL DEFAULT 50,
    "focalY" REAL NOT NULL DEFAULT 50,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioImage_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "Settings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioImage_storageKey_key" ON "PortfolioImage"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioImage_settingsId_sortOrder_key" ON "PortfolioImage"("settingsId", "sortOrder");

-- CreateIndex
CREATE INDEX "PortfolioImage_settingsId_sortOrder_idx" ON "PortfolioImage"("settingsId", "sortOrder");
