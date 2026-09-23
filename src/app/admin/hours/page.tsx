import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadProtectedAdmin } from "@/lib/adminSession";
import { prisma } from "@/lib/prisma";
import { listUpcomingExceptions } from "@/lib/shopHours";
import { HoursDesk } from "./HoursDesk";

export const metadata: Metadata = {
  title: "שעות פעילות",
};

export default async function AdminHoursPage() {
  const gate = await loadProtectedAdmin(await cookies());
  if (!gate.ok) {
    redirect("/admin/login");
  }

  const [settings, hours, exceptions] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.workingHours.findMany({ orderBy: { weekday: "asc" } }),
    listUpcomingExceptions(new Date()),
  ]);

  if (!settings) {
    redirect("/admin");
  }

  const week = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const row = hours.find((item) => item.weekday === weekday);
    return {
      weekday,
      isOpen: row?.isOpen ?? weekday !== 6,
      openTime: row?.openTime ?? "09:00",
      closeTime: row?.closeTime ?? "19:00",
    };
  });

  return (
    <HoursDesk
      shopName={settings.businessName}
      week={week}
      exceptions={exceptions}
    />
  );
}
