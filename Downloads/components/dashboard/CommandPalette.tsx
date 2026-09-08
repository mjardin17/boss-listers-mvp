"use client";

import { useState, useEffect } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";

const COMMANDS = [
  { label: "List everything on eBay", tag: "Bulk publish", icon: "nodes" },
  { label: "Relist stale inventory", tag: "Automation", icon: "stack" },
  { label: "Update prices", tag: "Pricing", icon: "bars" },
  { label: "Find items worth buying", tag: "Sourcing", icon: "dot" },
  { label: "Show today's profit", tag: "Analytics", icon: "spark" },
];

export default function CommandPalette() {
  const { cmdOpen, setCmdOpen } = useDashboard();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
      if (e.key === "Escape") {
        setCmdOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setCmdOpen]);

  if (!cmdOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[rgba(4,4,8,0.7)] backdrop-blur-md z-50"
        onClick={() => {
          setCmdOpen(false);
          setQuery("");
        }}
      />

      {/* Panel */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 md:pt-20">
        <div
          className="w-full max-w-lg mx-auto px-4 md:px-0 bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[rgba(255,255,255,0.08)]">
            <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#4f46e5] flex-shrink-0 shadow-[0_0_14px_rgba(139,92,246,0.5)]" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tell CrossPost AI what to do…"
              className="flex-1 bg-transparent border-none outline-none text-base font-medium text-[#f4f4f5] placeholder-[#71717a]"
            />
            <kbd className="text-xs font-medium text-[#71717a] bg-[#27272a] border border-[rgba(255,255,255,0.08)] px-1.5 py-1 rounded">
              ESC
            </kbd>
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            <div className="p-2.5">
              <div className="text-xs font-bold uppercase letter-spacing text-[#71717a] px-2.5 py-1.5">
                Suggested
              </div>
              {COMMANDS.map((cmd, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setQuery(cmd.label);
                    setCmdOpen(false);
                  }}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#1f1f23] cursor-pointer transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-[#27272a] flex items-center justify-center flex-shrink-0 text-[#818cf8] text-sm">
                    {cmd.icon.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-[#f4f4f5] flex-1">{cmd.label}</span>
                  <span className="text-xs text-[#71717a]">{cmd.tag}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
