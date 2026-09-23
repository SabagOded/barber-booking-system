import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadProtectedAdmin } from "@/lib/adminSession";
import { prisma } from "@/lib/prisma";
import { ShopDesk } from "./ShopDesk";

export const metadata: Metadata = {
  title: "עריכת פרטי החנות",
};

export default async function AdminShopPage() {
  const gate = await loadProtectedAdmin(await cookies());
  if (!gate.ok) {
    redirect("/admin/login");
  }

  const settings = await prisma.settings.findUnique({
    where: { id: 1 },
    select: {
      businessName: true,
      providerName: true,
      tagline: true,
      address: true,
      phone: true,
      whatsappPhone: true,
      calendarNote: true,
      doorNotice: true,
      doorNoticeUntil: true,
    },
  });

  if (!settings) {
    redirect("/admin");
  }

  return (
    <ShopDesk
      shopName={settings.businessName}
      details={{
        businessName: settings.businessName,
        providerName: settings.providerName,
        tagline: settings.tagline,
        address: settings.address,
        phone: settings.phone,
        whatsappPhone: settings.whatsappPhone,
      }}
      calendarNote={settings.calendarNote}
      notice={{ text: settings.doorNotice, until: settings.doorNoticeUntil }}
    />
  );
}
