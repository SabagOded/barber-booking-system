import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { calendarDateInZone } from "@/lib/bookingWindow";
import { getMediaStorage } from "@/lib/media/storage";
import {
  clockToMinutes,
  formatTemplateHoursParts,
  getEffectiveHours,
  isDoorNoticeActive,
  listUpcomingExceptions,
} from "@/lib/shopHours";
import { BookingFlow } from "./_components/BookingFlow";
import { resetDemoIfExpired } from "@/lib/demoReset";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  return {
    title: settings?.businessName ?? "קביעת תור",
    description: "קביעת תור בלי הרשמה",
  };
}

export default async function HomePage() {
  await resetDemoIfExpired();
  const [settings, services, workingHours, portfolioImages] = await Promise.all([
    prisma.settings.findUnique({
      where: { id: 1 },
      select: {
        businessName: true,
        providerName: true,
        phone: true,
        whatsappPhone: true,
        address: true,
        calendarNote: true,
        tagline: true,
        doorNotice: true,
        doorNoticeUntil: true,
        timezone: true,
        logoStorageKey: true,
        logoDisplaySize: true,
      },
    }),
    prisma.service.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.workingHours.findMany({ orderBy: { weekday: "asc" } }),
    prisma.portfolioImage.findMany({
      where: { settingsId: 1 },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  if (!settings) {
    return (
      <main className="flex flex-1 items-center justify-center px-6">
        <p className="text-center text-muted">המערכת עדיין לא הוגדרה.</p>
      </main>
    );
  }

  const today = calendarDateInZone(new Date(), settings.timezone);
  const todayHours = await getEffectiveHours(today);
  const currentTime = formatInTimeZone(new Date(), settings.timezone, "HH:mm");
  const todayIsOpen =
    todayHours.isOpen &&
    clockToMinutes(currentTime) >= clockToMinutes(todayHours.openTime) &&
    clockToMinutes(currentTime) < clockToMinutes(todayHours.closeTime);
  const doorNotice = isDoorNoticeActive(settings.doorNotice, settings.doorNoticeUntil, today)
    ? settings.doorNotice.trim()
    : "";
  const effectiveWhatsAppPhone = settings.whatsappPhone.trim() || settings.phone;
  const exceptions = await listUpcomingExceptions(new Date());
  const storage = await getMediaStorage();

  return (
    <BookingFlow
      settings={{
        businessName: settings.businessName,
        providerName: settings.providerName,
        phone: settings.phone,
        whatsappPhone: effectiveWhatsAppPhone,
        address: settings.address ?? "",
        calendarNote: settings.calendarNote ?? "",
        tagline: settings.tagline ?? "",
        timezone: settings.timezone,
      }}
      hoursParts={formatTemplateHoursParts(workingHours)}
      todayHours={todayHours}
      todayIsOpen={todayIsOpen}
      doorNotice={doorNotice}
      logoUrl={settings.logoStorageKey ? storage.resolvePublicUrl(settings.logoStorageKey) : null}
      logoDisplaySize={settings.logoDisplaySize}
      portfolio={portfolioImages.map((image) => ({
        id: image.id,
        url: storage.resolvePublicUrl(image.storageKey),
        focalX: image.focalX,
        focalY: image.focalY,
      }))}
      exceptions={exceptions.map((row) => ({ date: row.date, dateLabel: row.dateLabel, rule: row.rule }))}
      services={services.map((service) => ({
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
        priceAgorot: service.priceAgorot,
      }))}
    />
  );
}
