/**
 * Single source of truth for the left-nav structure AND the per-page
 * description banner. The sidebar (`SideNav`) renders this tree; `PageIntro`
 * looks a path up in it to show "what this page does" at the top of every page.
 *
 * Keeping both in one place means a page's label and its one-line description
 * never drift apart.
 */

export interface NavLeaf {
  href: string;
  label: string;
  /** Plain-English "what this page does", shown as the page's intro banner. */
  description: string;
}

export interface NavGroup {
  label: string;
  /** Optional landing page for the group header itself (e.g. the Trading hub). */
  href?: string;
  description?: string;
  items: NavLeaf[];
}

export type NavEntry = NavLeaf | NavGroup;

export function isGroup(entry: NavEntry): entry is NavGroup {
  return (entry as NavGroup).items !== undefined;
}

export const NAV: NavEntry[] = [
  {
    href: "/home",
    label: "Home",
    description:
      "Your paper portfolio at a glance — live positions, equity, and profit/loss read straight from the broker.",
  },
  {
    label: "Trading",
    href: "/trading",
    description:
      "Your trading workflow in one place — proposals awaiting action, open positions with their stops and targets, and recent orders.",
    items: [
      {
        href: "/signals",
        label: "Signals",
        description:
          "An inbox of structured trade signals the system distilled from the sources it monitors.",
      },
      {
        href: "/proposals",
        label: "Proposals",
        description:
          "Candidate trades, each with an analysis verdict (PASS / CAUTION / AVOID), a score, the risks, and a plain-English AI summary — approve or authorize a trade here.",
      },
      {
        href: "/options",
        label: "Options",
        description:
          "Manual options trading — your open option positions, a buy form, and your total premium at risk (your max loss).",
      },
      {
        href: "/today",
        label: "Today",
        description:
          "Today's money view — realized P/L from positions closed today, unrealized mark-to-market on open ones, capital deployed versus your cap, and progress toward the daily profit target.",
      },
      {
        href: "/performance",
        label: "Performance",
        description:
          "Your long-run scorecard — total P/L, win rate, profit factor, expectancy, max drawdown, and your return versus the S&P 500.",
      },
    ],
  },
  {
    label: "Intel Gathering",
    description:
      "Where the system's trade ideas come from — market sources, congressional disclosures, and the alerts they raise.",
    items: [
      {
        href: "/research",
        label: "Research",
        description:
          "Per-symbol research — dig into a symbol for deeper data like insider transactions.",
      },
      {
        href: "/congress",
        label: "Congress",
        description: "An inbox of congressional trading disclosures.",
      },
      {
        href: "/alerts",
        label: "Alerts",
        description:
          "Alerts tied to watched symbols, each linking through to that symbol's research.",
      },
      {
        href: "/sources",
        label: "Sources",
        description:
          "The sources SignalGuard monitors for signals — add new ones, review them, and enable or disable them.",
      },
    ],
  },
  {
    label: "System",
    description: "Your notifications and the app's control panel.",
    items: [
      {
        href: "/notifications",
        label: "Notifications",
        description:
          "Your in-app feed — order events, critical warnings, and the evening briefing, with an unread count.",
      },
      {
        href: "/settings",
        label: "Settings",
        description:
          "The control panel — autopilot, options, extended-hours, and risk thresholds. Security (password / MFA) lives in a sub-page.",
      },
      {
        href: "/audit",
        label: "Audit",
        description:
          "The decision ledger — a read-only record of what the system did (autopilot decisions, discovery cycles, risk events, owner actions), filterable by event type.",
      },
    ],
  },
  {
    href: "/risk",
    label: "Risk",
    description:
      "Your guardrails — the paper-trading limits in force, Emergency Stop status, and recent risk blocks, with plain-English explanations of how the deterministic risk engine protects you.",
  },
];

/** Extra descriptions for routes that aren't their own nav entry. */
const EXTRA_META: NavLeaf[] = [
  {
    href: "/settings/security",
    label: "Security",
    description:
      "Your account security — change your password and manage multi-factor authentication (MFA).",
  },
];

/** Flattened leaves (+ group landing pages + extras), for path lookups. */
function allLeaves(): NavLeaf[] {
  const out: NavLeaf[] = [];
  for (const entry of NAV) {
    if (isGroup(entry)) {
      if (entry.href) {
        out.push({
          href: entry.href,
          label: entry.label,
          description: entry.description ?? "",
        });
      }
      out.push(...entry.items);
    } else {
      out.push(entry);
    }
  }
  out.push(...EXTRA_META);
  return out;
}

/**
 * Find the page metadata for a pathname, matching the most specific (longest)
 * href that the path starts with — so `/research/AAPL` resolves to Research and
 * `/settings/security` to Security (not Settings).
 */
export function findPageMeta(pathname: string): NavLeaf | null {
  const leaves = allLeaves();
  let best: NavLeaf | null = null;
  for (const leaf of leaves) {
    if (
      (pathname === leaf.href || pathname.startsWith(`${leaf.href}/`)) &&
      (!best || leaf.href.length > best.href.length)
    ) {
      best = leaf;
    }
  }
  return best;
}
