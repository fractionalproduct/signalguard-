import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PaperTradingBanner } from "./components/PaperTradingBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalGuard AI",
  description: "Private AI-assisted paper-trading intelligence platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Always visible on every page — a non-negotiable safety affordance. */}
        <PaperTradingBanner />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
