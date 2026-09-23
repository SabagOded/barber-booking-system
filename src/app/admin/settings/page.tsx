import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadProtectedAdmin } from "@/lib/adminSession";
import { prisma } from "@/lib/prisma";
import { SettingsDesk } from "./SettingsDesk";

export const metadata: Metadata = {
  title: "הגדרות החנות",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminSettingsPage() {
  const gate = await loadProtectedAdmin(await cookies());
  if (!gate.ok) {
    redirect("/admin/login");
  }

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  if (!settings) {
    redirect("/admin");
  }

  return (
    <SettingsDesk
      shopName={settings.businessName}
      interval={settings.slotIntervalMinutes}
    />
  );
}
