"use client";

import { Menu, Search } from "lucide-react";
import { useDashboard } from "@/components/dashboard/DashboardContext";

export default function TopBar() {
  const { isMobile, mobileMenuOpen, setMobileMenuOpen, cmdOpen, setCmdOpen } =
    useDashboard();

  return (
    <header className="sticky top-0 z-40 h-14 flex items-center justify-between gap-3 px-4 md:px-6 border-b border-[rgba(255,255,255,0.08)] bg-[rgba(13,13,19,0.7)] backdrop-blur-md">
      {/* Left: Logo + Hamburger */}
      <div className="flex items-center gap-3 min-w-0">
        {isMobile && (
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] hover:bg-[#27272a] transition-colors"
            aria-label="Toggle menu"
          >
            <Menu size={16} />
          </button>
        )}

        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#818cf8] flex items-center justify-center shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
            <div className="w-2.5 h-2.5 rounded-sm bg-[#0a0a10] transform rotate-45" />
          </div>
          <div className="flex items-baseline gap-1 whitespace-nowrap hidden sm:flex">
            <span className="text-sm font-bold text-[#f4f4f5]">CrossPost</span>
            <span className="text-sm font-medium text-[#71717a]">Studio</span>
          </div>
        </div>
      </div>

      {/* Center: Search */}
      {!isMobile && (
        <div
          onClick={() => setCmdOpen(true)}
          className="flex-1 max-w-xs flex items-center gap-2 h-9 px-3 bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] rounded-lg cursor-pointer hover:border-[rgba(255,255,255,0.12)] transition-colors"
        >
          <Search size={12} className="text-[#71717a] flex-shrink-0" />
          <span className="text-sm text-[#71717a] flex-1">Ask or search…</span>
          <div className="flex gap-1">
            <kbd className="text-xs font-medium text-[#71717a] bg-[#27272a] border border-[rgba(255,255,255,0.08)] px-1.5 py-0.5 rounded">
              ⌘
            </kbd>
            <kbd className="text-xs font-medium text-[#71717a] bg-[#27272a] border border-[rgba(255,255,255,0.08)] px-1.5 py-0.5 rounded">
              K
            </kbd>
          </div>
        </div>
      )}

      {/* Right: Search (mobile) + Theme + Avatar */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isMobile && (
          <button
            onClick={() => setCmdOpen(true)}
            className="p-2 rounded-lg bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] hover:bg-[#27272a]"
          >
            <Search size={16} />
          </button>
        )}

        {/* Theme toggle placeholder */}
        <div className="w-16 h-8 rounded-lg bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] flex items-center p-0.5 gap-1 hidden md:flex text-xs font-semibold">
          <button className="flex-1 rounded-md bg-gradient-to-br from-[#a78bfa] to-[#67e8f9] text-[#0a0a10] py-1">
            Desktop
          </button>
          <button className="flex-1 rounded-md text-[#a1a1aa] py-1">Mobile</button>
        </div>

        <div className="w-px h-5 bg-[rgba(255,255,255,0.08)] hidden md:block" />

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#67e8f9] flex items-center justify-center text-xs font-bold text-[#0a0a10] flex-shrink-0">
          JM
        </div>
      </div>
    </header>
  );
}
