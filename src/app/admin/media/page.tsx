import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadProtectedAdmin } from "@/lib/adminSession";
import { getMediaStorage } from "@/lib/media/storage";
import { prisma } from "@/lib/prisma";
import { MediaDesk } from "./MediaDesk";

export const metadata: Metadata = {
  title: "תמונות ומיתוג",
};

export default async function AdminMediaPage() {
  const gate = await loadProtectedAdmin(await cookies());
  if (!gate.ok) redirect("/admin/login");

  const [settings, portfolioImages] = await Promise.all([
    prisma.settings.findUnique({
      where: { id: 1 },
      select: {
        businessName: true,
        logoStorageKey: true,
        logoDisplaySize: true,
      },
    }),
    prisma.portfolioImage.findMany({
      where: { settingsId: 1 },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  if (!settings) redirect("/admin");

  const storage = await getMediaStorage();
  return (
    <MediaDesk
      shopName={settings.businessName}
      initialLogoUrl={
        settings.logoStorageKey ? storage.resolvePublicUrl(settings.logoStorageKey) : null
      }
      initialLogoDisplaySize={settings.logoDisplaySize}
      initialPortfolio={portfolioImages.map((image) => ({
        id: image.id,
        url: storage.resolvePublicUrl(image.storageKey),
        sortOrder: image.sortOrder,
        focalX: image.focalX,
        focalY: image.focalY,
      }))}
    />
  );
}
