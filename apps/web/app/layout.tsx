import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PaperTradingBanner } from "./components/PaperTradingBanner";
import { MockToggle } from "./components/MockToggle";
import { isMockMode } from "../lib/mock/mock-mode";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalGuard AI",
  description: "Private AI-assisted paper-trading intelligence platform",
};

// Dev-only: the mock toggle reads the cookie. `process.env.NODE_ENV` is inlined
// at build, so in a production build this whole branch is dead-code-eliminated
// and isMockMode()/cookies() are never called — the root layout stays static.
const showMockToggle = process.env.NODE_ENV !== "production";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Always visible on every page — a non-negotiable safety affordance. */}
        <PaperTradingBanner />
        {showMockToggle ? <MockToggle active={isMockMode()} /> : null}
        {/* The authenticated app shell is added by the (dashboard) layout; the
            login page renders without it. */}
        {children}
      </body>
    </html>
  );
}
