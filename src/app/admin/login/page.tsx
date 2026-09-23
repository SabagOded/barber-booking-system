import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/adminSession";
import { isDemoMode } from "@/lib/demoMode";
import { buildImplementerGmailUrl, buildImplementerMailto } from "@/lib/implementerMailto";
import { prisma } from "@/lib/prisma";
import { LoginForm } from "../_components/LoginForm";

export const metadata: Metadata = {
  title: "כניסת ניהול",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminLoginPage() {
  if (isDemoMode()) {
    redirect("/admin");
  }

  const session = await readSession(await cookies());
  if (session) {
    redirect("/admin");
  }

  const settings = await prisma.settings.findUnique({
    where: { id: 1 },
    select: { businessName: true },
  });
  const implementerEmail = process.env.IMPLEMENTER_EMAIL ?? "";
  const shopName = settings?.businessName ?? "";
  const mailtoHref = buildImplementerMailto(implementerEmail, shopName);
  const gmailHref = buildImplementerGmailUrl(implementerEmail, shopName);

  return <LoginForm shopName={shopName} mailtoHref={mailtoHref} gmailHref={gmailHref} />;
}
