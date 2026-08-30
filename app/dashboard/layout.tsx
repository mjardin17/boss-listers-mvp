"use client";

import { useState, ReactNode } from "react";
import { DashboardContext } from "@/components/dashboard/DashboardContext";
import Sidebar from "@/components/dashboard/Sidebar";
import TopBar from "@/components/dashboard/TopBar";
import MobileMenu from "@/components/dashboard/MobileMenu";
import BottomTabBar from "@/components/dashboard/BottomTabBar";
import CommandPalette from "@/components/dashboard/CommandPalette";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  return (
    <DashboardContext.Provider
      value={{
        currentPage,
        setCurrentPage,
        isMobile,
        setIsMobile,
        mobileMenuOpen,
        setMobileMenuOpen,
        cmdOpen,
        setCmdOpen,
      }}
    >
      <div className="flex flex-col h-screen bg-[#08080c] text-[#f4f4f5] overflow-hidden">
        <TopBar />

        <div className="flex flex-1 min-h-0">
          {!isMobile && <Sidebar />}
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto p-6 md:p-8 pb-24 md:pb-16">
              {children}
            </div>
          </main>
        </div>

        {isMobile && mobileMenuOpen && <MobileMenu />}
        {isMobile && <BottomTabBar />}

        <CommandPalette />
      </div>
    </DashboardContext.Provider>
  );
}
