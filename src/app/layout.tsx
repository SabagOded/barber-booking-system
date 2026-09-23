import type { Metadata, Viewport } from "next";
import { Assistant, Frank_Ruhl_Libre } from "next/font/google";
import "./globals.css";
import { isDemoMode } from "@/lib/demoMode";
import { DemoNotice } from "./demo/DemoNotice";

const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700"],
});

const frank = Frank_Ruhl_Libre({
  variable: "--font-frank",
  subsets: ["hebrew", "latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "קביעת תור",
  description: "קביעת תור בלי הרשמה",
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const demoMode = isDemoMode();
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${assistant.variable} ${frank.variable} h-full antialiased`}
    >
      <body className={`${assistant.className} min-h-full flex flex-col bg-bg text-cream`}>
        {demoMode ? <DemoNotice /> : null}
        {children}
      </body>
    </html>
  );
}
