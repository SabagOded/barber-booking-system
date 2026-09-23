import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadProtectedAdmin } from "@/lib/adminSession";
import { prisma } from "@/lib/prisma";
import { ServicesDesk } from "./ServicesDesk";

export const metadata: Metadata = {
  title: "שירותים ומחירים",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminServicesPage() {
  const gate = await loadProtectedAdmin(await cookies());
  if (!gate.ok) {
    redirect("/admin/login");
  }

  const [settings, services] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 }, select: { businessName: true } }),
    prisma.service.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        priceAgorot: true,
        active: true,
        sortOrder: true,
      },
    }),
  ]);

  if (!settings) {
    redirect("/admin");
  }

  return (
    <ServicesDesk
      shopName={settings.businessName}
      activeServices={services.filter((service) => service.active)}
      removedServices={services.filter((service) => !service.active)}
    />
  );
}
