import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "../login/actions";

const navItems = [
  { href: "/home", label: "Home" },
  { href: "/research", label: "Research" },
  { href: "/trading", label: "Trading" },
  { href: "/performance", label: "Performance" },
  { href: "/risk", label: "Risk" },
  { href: "/settings", label: "Settings" },
];

function StatusPill({ label }: { label: string }) {
  return (
    <span className="status-pill" aria-label={`${label}: not connected yet`}>
      <span>{label}</span>
      <strong>—</strong>
    </span>
  );
}

export function AppShell({
  children,
  ownerEmail,
}: {
  children: ReactNode;
  ownerEmail: string;
}) {
  return (
    <div className="app-shell">
      <header className="global-header" aria-label="Global status header">
        <div className="brand-block">
          <Link className="brand-link" href="/home" aria-label="SignalGuard home">
            SignalGuard AI
          </Link>
          <span className="paper-badge">Paper Trading</span>
        </div>

        <div className="header-statuses" aria-label="System status placeholders">
          <StatusPill label="Market" />
          <StatusPill label="Broker" />
          <StatusPill label="Market data" />
        </div>

        <div className="header-actions">
          <button className="icon-button" type="button" aria-label="Notifications placeholder">
            🔔
          </button>
          <span className="tooltip-wrap" title="Wired up in a later milestone">
            <button
              className="emergency-stop"
              type="button"
              disabled
              aria-label="Emergency Stop disabled: Wired up in a later milestone"
            >
              Emergency Stop
            </button>
          </span>
          <div className="user-menu">
            <span className="user-email" title={ownerEmail}>
              {ownerEmail}
            </span>
            <form action={logoutAction}>
              <button className="signout-button" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="shell-body">
        <nav className="side-nav" aria-label="Beginner navigation">
          {navItems.map((item) => (
            <Link className="nav-link" href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="content-panel">{children}</main>
      </div>
    </div>
  );
}
