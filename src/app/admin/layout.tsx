import { resetDemoIfExpired } from "@/lib/demoReset";
import { isDemoMode } from "@/lib/demoMode";
import { AdminDemoModeProvider } from "./_components/AdminDemoModeContext";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await resetDemoIfExpired();
  return (
    <AdminDemoModeProvider demoMode={isDemoMode()}>
      <div className="shop-shell mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 py-10">
        {children}
      </div>
    </AdminDemoModeProvider>
  );
}
