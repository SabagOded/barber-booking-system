import { execSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";

export function prepareTestDb(): void {
  const databasePath = path.resolve(process.cwd(), "prisma", "test.db");
  closeSync(openSync(databasePath, "a"));

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}

export async function resetTestDb(): Promise<void> {
  await prisma.$transaction([
    prisma.appointment.deleteMany(),
    prisma.portfolioImage.deleteMany(),
    prisma.timeBlock.deleteMany(),
    prisma.closedDate.deleteMany(),
    prisma.hoursOverride.deleteMany(),
    prisma.workingHours.deleteMany(),
    prisma.service.deleteMany(),
    prisma.settings.deleteMany(),
  ]);
}
