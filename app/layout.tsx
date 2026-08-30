import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boss Listers - Post Everywhere Instantly",
  description: "Auto-post your items to 27 marketplaces and 8 social platforms with AI-powered extraction.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
