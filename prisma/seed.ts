import { prisma } from "../src/lib/prisma";
import { demoServices, demoSettings, demoWorkingHours } from "./demoBaseline";

async function main() {
  const seedSettings = {
    businessName: demoSettings.businessName,
    providerName: demoSettings.providerName,
    phone: demoSettings.phone,
    whatsappPhone: demoSettings.whatsappPhone,
    address: demoSettings.address,
    calendarNote: demoSettings.calendarNote,
    timezone: demoSettings.timezone,
    slotIntervalMinutes: demoSettings.slotIntervalMinutes,
  };
  await prisma.settings.upsert({
    where: { id: 1 },
    update: seedSettings,
    create: { id: 1, ...seedSettings },
  });

  const existingServices = await prisma.service.count();
  if (existingServices === 0) {
    await prisma.service.createMany({ data: demoServices });
  }

  for (const hours of demoWorkingHours) {
    await prisma.workingHours.upsert({
      where: { weekday: hours.weekday },
      update: hours,
      create: hours,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
