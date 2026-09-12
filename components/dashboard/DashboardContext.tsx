"use client";

import { createContext, useContext } from "react";

export interface DashboardContextType {
  currentPage: string;
  setCurrentPage: (page: string) => void;
  isMobile: boolean;
  setIsMobile: (mobile: boolean) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  cmdOpen: boolean;
  setCmdOpen: (open: boolean) => void;
}

export const DashboardContext = createContext<DashboardContextType | null>(null);

export const useDashboard = () => {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardLayout");
  return ctx;
};
