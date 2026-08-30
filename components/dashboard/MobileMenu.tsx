"use client";

import { useDashboard } from "@/components/dashboard/DashboardContext";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "dot" },
  { id: "inventory", label: "Inventory", icon: "stack" },
  { id: "editor", label: "Listing Editor", icon: "pencil" },
  { id: "crosspost", label: "Cross-Posting", icon: "nodes" },
  { id: "analytics", label: "Analytics", icon: "bars" },
  { id: "aicommand", label: "AI Command", icon: "spark" },
];

function Glyph({ type }: { type: string }) {
  const color = "#818cf8";
  const size = 16;

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
          className="absolute"
          style={{
            width: size * 0.6,
            height: size * 0.6,
            left: size * 0.2,
            top: size * 0.2,
            background: color,
            transform: "rotate(45deg)",
            borderRadius: 2,
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

export default function MobileMenu() {
  const { currentPage, setCurrentPage, setMobileMenuOpen } = useDashboard();

  const handleNav = (pageId: string) => {
    setCurrentPage(pageId);
    setMobileMenuOpen(false);
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-[rgba(0,0,0,0.55)] backdrop-blur-sm z-40"
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Menu */}
      <div className="fixed top-14 left-0 bottom-0 w-64 bg-[#18181b] border-r border-[rgba(255,255,255,0.08)] z-50 flex flex-col p-4 animate-in slide-in-from-left-full duration-200">
        <div className="text-xs font-bold uppercase letter-spacing tracking-wide text-[#71717a] mb-3">
          Navigate
        </div>

        <div className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                  active
                    ? "bg-[#1f1f23] border border-[rgba(255,255,255,0.08)]"
                    : "hover:bg-[#1f1f23]/50"
                }`}
              >
                <div
                  className="relative w-4 h-4"
                  style={{
                    color: active ? "#818cf8" : "#a1a1aa",
                  }}
                >
                  <Glyph type={item.icon} />
                </div>
                <span
                  className={`text-sm ${
                    active
                      ? "font-semibold text-[#f4f4f5]"
                      : "font-medium text-[#a1a1aa]"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
