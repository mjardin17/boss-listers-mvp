"use client";

import { useDashboard } from "@/components/dashboard/DashboardContext";

const NAV_ITEMS = [
  { id: "dashboard", label: "Home", icon: "dot" },
  { id: "inventory", label: "Stock", icon: "stack" },
  { id: "editor", label: "Editor", icon: "pencil" },
  { id: "crosspost", label: "Post", icon: "nodes" },
  { id: "analytics", label: "Stats", icon: "bars" },
  { id: "aicommand", label: "AI", icon: "spark" },
];

function TabGlyph({ type, active }: { type: string; active: boolean }) {
  const color = active ? "#818cf8" : "#71717a";
  const size = 18;

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
          className="absolute rounded"
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

export default function BottomTabBar() {
  const { currentPage, setCurrentPage } = useDashboard();

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 md:hidden z-30 bg-[rgba(13,13,19,0.92)] backdrop-blur-lg border-t border-[rgba(255,255,255,0.08)] flex items-center justify-around px-2">
      {NAV_ITEMS.map((item) => {
        const active = currentPage === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setCurrentPage(item.id)}
            className="flex flex-col items-center justify-center gap-1 py-1.5 px-2 flex-1"
          >
            <div
              className="relative w-5 h-5"
              style={{
                color: active ? "#818cf8" : "#71717a",
              }}
            >
              <TabGlyph type={item.icon} active={active} />
            </div>
            <span
              className={`text-xs ${
                active
                  ? "font-bold text-[#f4f4f5]"
                  : "font-medium text-[#71717a]"
              }`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
