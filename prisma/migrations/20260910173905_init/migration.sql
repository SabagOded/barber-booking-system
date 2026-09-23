-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "businessName" TEXT NOT NULL,
    "barberName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsappPhone" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
    "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "priceAgorot" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "WorkingHours" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekday" INTEGER NOT NULL,
    "isOpen" BOOLEAN NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ClosedDate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "reason" TEXT
);

-- CreateTable
CREATE TABLE "TimeBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "reason" TEXT
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" DATETIME,
    CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkingHours_weekday_key" ON "WorkingHours"("weekday");

-- CreateIndex
CREATE UNIQUE INDEX "ClosedDate_date_key" ON "ClosedDate"("date");
