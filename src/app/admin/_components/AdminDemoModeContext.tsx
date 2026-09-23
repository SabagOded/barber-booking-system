"use client";

import { createContext, useContext, type ReactNode } from "react";

const AdminDemoModeContext = createContext(false);

export function AdminDemoModeProvider({
  children,
  demoMode,
}: {
  children: ReactNode;
  demoMode: boolean;
}) {
  return (
    <AdminDemoModeContext.Provider value={demoMode}>
      {children}
    </AdminDemoModeContext.Provider>
  );
}

export function useAdminDemoMode(): boolean {
  return useContext(AdminDemoModeContext);
}
