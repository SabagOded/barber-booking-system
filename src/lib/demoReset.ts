import { demoServices, demoSettings, demoWorkingHours } from "../../prisma/demoBaseline";
import { retryOnBusy } from "./booking";
import { isDemoMode } from "./demoMode";
import { prisma } from "./prisma";

const RESET_INTERVAL_MS = 60 * 60 * 1000;

async function resetDemo(force: boolean, now: Date): Promise<boolean> {
  if (!isDemoMode()) return false;

  return retryOnBusy(() => prisma.$transaction(async (tx) => {
    // Serialize reset attempts with the same Settings row lock used for booking writes.
    const locked = await tx.$executeRaw`
      UPDATE "Settings" SET "businessName" = "businessName" WHERE "id" = 1
    `;
    if (locked === 0) return false;

    const settings = await tx.settings.findUniqueOrThrow({
      where: { id: 1 }, select: { demoResetAt: true },
    });
    if (!force && settings.demoResetAt && now.getTime() - settings.demoResetAt.getTime() < RESET_INTERVAL_MS) {
      return false;
    }

    await tx.appointment.deleteMany();
    await tx.timeBlock.deleteMany();
    await tx.closedDate.deleteMany();
    await tx.hoursOverride.deleteMany();
    await tx.portfolioImage.deleteMany();
    await tx.service.deleteMany();
    await tx.workingHours.deleteMany();
    await tx.settings.update({ where: { id: 1 }, data: { ...demoSettings, demoResetAt: now } });
    await tx.service.createMany({ data: demoServices });
    await tx.workingHours.createMany({ data: demoWorkingHours });
    return true;
  }, { timeout: 10_000, maxWait: 10_000 }));
}

export async function resetDemoManually(): Promise<boolean> {
  return resetDemo(true, new Date());
}

export async function resetDemoIfExpired(
  now = new Date(),
  prefetchedSettings?: { demoResetAt: Date | null } | null,
): Promise<boolean> {
  if (!isDemoMode()) return false;
  const settings = prefetchedSettings === undefined
    ? await prisma.settings.findUnique({
        where: { id: 1 }, select: { demoResetAt: true },
      })
    : prefetchedSettings;
  if (!settings || (settings.demoResetAt && now.getTime() - settings.demoResetAt.getTime() < RESET_INTERVAL_MS)) {
    return false;
  }
  return resetDemo(false, now);
}
