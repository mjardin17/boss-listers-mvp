"use client";

import { useDashboard } from "@/components/dashboard/DashboardContext";
import Dashboard from "@/components/dashboard/pages/Dashboard";
import Inventory from "@/components/dashboard/pages/Inventory";
import ListingEditor from "@/components/dashboard/pages/ListingEditor";
import CrossPostingCenter from "@/components/dashboard/pages/CrossPostingCenter";
import Analytics from "@/components/dashboard/pages/Analytics";
import AICommandCenter from "@/components/dashboard/pages/AICommandCenter";

export default function DashboardPage() {
  const { currentPage } = useDashboard();

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <Dashboard />;
      case "inventory":
        return <Inventory />;
      case "editor":
        return <ListingEditor />;
      case "crosspost":
        return <CrossPostingCenter />;
      case "analytics":
        return <Analytics />;
      case "aicommand":
        return <AICommandCenter />;
      default:
        return <Dashboard />;
    }
  };

  return renderPage();
}
