import React from "react";
import "../styles/globals.css";
import "./globals.css";

export const metadata = {
  title: "Boss Listers AI",
  description: "Mobile reseller sourcing scanner and inventory workflow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-950 text-neutral-50 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
