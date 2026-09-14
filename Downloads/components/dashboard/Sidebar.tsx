"use client";

import { useDashboard } from "@/components/dashboard/DashboardContext";
import { Activity, Inbox, Edit, Share2, BarChart3, Zap } from "lucide-react";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "dot" },
  { id: "inventory", label: "Inventory", icon: "stack" },
  { id: "editor", label: "Listing Editor", icon: "pencil" },
  { id: "crosspost", label: "Cross-Posting", icon: "nodes" },
  { id: "analytics", label: "Analytics", icon: "bars" },
  { id: "aicommand", label: "AI Command", icon: "spark", badge: "AI" },
];

function Glyph({ type, active }: { type: string; active: boolean }) {
  const color = active ? "#818cf8" : "#a1a1aa";
  const size = 14;

  switch (type) {
    case "dot":
      return (
        <div
          className="rounded-full"
          style={{
            width: size * 0.56,
            height: size * 0.56,
            background: color,
          }}
        />
      );
    case "stack":
      return (
        <div className="relative" style={{ width: size, height: size }}>
          <div
            className="rounded absolute"
            style={{
              left: 0,
              right: 0,
              top: size * 0.1,
              height: size * 0.3,
              background: color,
              opacity: 0.5,
            }}
          />
          <div
            className="rounded absolute"
            style={{
              left: 0,
              right: 0,
              bottom: size * 0.1,
              height: size * 0.3,
              background: color,
            }}
          />
        </div>
      );
    case "pencil":
      return (
        <div
          className="rounded absolute"
          style={{
            width: size * 0.6,
            height: size * 0.6,
            left: size * 0.2,
            top: size * 0.2,
            background: color,
            transform: "rotate(45deg)",
          }}
        />
      );
    case "nodes":
      return (
        <div className="relative" style={{ width: size, height: size }}>
          {[
            { left: 0, top: size * 0.15 },
            { right: 0, top: size * 0.15 },
            { left: size * 0.38, bottom: 0 },
          ].map((pos, i) => (
            <div
              key={i}
              className="rounded-full absolute"
              style={{
                width: size * 0.24,
                height: size * 0.24,
                background: color,
                ...pos,
              }}
            />
          ))}
        </div>
      );
    case "bars":
      return (
        <div className="relative" style={{ width: size, height: size }}>
          {[
            { left: 0, height: 0.5, opacity: 0.55 },
            { left: size * 0.39, height: 0.9, opacity: 1 },
            { left: size * 0.78, height: 0.68, opacity: 0.75 },
          ].map((bar, i) => (
            <div
              key={i}
              className="rounded absolute bottom-0"
              style={{
                width: size * 0.22,
                height: `${bar.height * 100}%`,
                background: color,
                opacity: bar.opacity,
                left: bar.left,
              }}
            />
          ))}
        </div>
      );
    case "spark":
      return (
        <div
          className="absolute inset-0"
          style={{
            background: color,
            clipPath:
              "polygon(50% 0%, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0% 50%, 38% 38%)",
          }}
        />
      );
    default:
      return null;
  }
}

export default function Sidebar() {
  const { currentPage, setCurrentPage } = useDashboard();

  return (
    <aside className="hidden md:flex w-56 flex-shrink-0 flex-col border-r border-[rgba(255,255,255,0.08)] bg-[#18181b] sticky top-14 h-[calc(100vh-56px)]">
      {/* Nav Items */}
      <div className="flex flex-col gap-0.5 p-3.5">
        {NAV_ITEMS.map((item) => {
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`flex items-center gap-3 px-2.5 py-2 rounded-lg transition-all ${
                active
                  ? "bg-[#1f1f23] border border-[rgba(255,255,255,0.08)]"
                  : "hover:bg-[#1f1f23]/50"
              }`}
            >
              <div
                className="relative flex-shrink-0 w-4 h-4"
                style={{ color: active ? "#818cf8" : "#a1a1aa" }}
              >
                <Glyph type={item.icon} active={active} />
              </div>
              <span
                className={`text-sm flex-1 text-left ${
                  active
                    ? "font-semibold text-[#f4f4f5]"
                    : "font-medium text-[#a1a1aa]"
                }`}
              >
                {item.label}
              </span>
              {item.badge && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-[rgba(99,102,241,0.15)] border border-[rgba(99,102,241,0.3)] text-[#6366f1]">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* AI Credits */}
      <div className="mt-auto p-3.5 border-t border-[rgba(255,255,255,0.08)]">
        <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-gradient-to-br from-[rgba(139,92,246,0.14)] to-[rgba(34,211,238,0.06)] border border-[rgba(139,92,246,0.22)]">
          <span className="text-xs font-bold text-[#f4f4f5]">AI Credits</span>
          <span className="text-xs text-[#71717a]">2,840 / 5,000 used</span>
          <div className="h-1.5 rounded-full bg-[#27272a] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#6366f1] to-[#818cf8]"
              style={{ width: "57%" }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
