/**
 * Pure evening-briefing builder (M15). Turns plain end-of-day data — open
 * positions with their cost basis, today's closed positions with realized P&L,
 * counts of new proposals / approvals / authorizations, and any critical
 * alerts — into a structured `Briefing { title, summaryLines, sections }`.
 *
 * PURE: no I/O, no clock, no Prisma / @signalguard/performance imports. The
 * cron does the DB reads and the performance math, then passes scalars in. The
 * returned structure is plain text (NOT HTML) — React auto-escapes it in the
 * /notifications surface, and the email path HTML-escapes it at its own
 * boundary (AGENTS.md §2). Money is integer cents throughout; formatting to
 * "$X.YZ" happens here, at the display edge.
 */

/** One open paper position, summarized to its cost basis (no live mark). */
export interface OpenPositionSummary {
  symbol: string;
  quantity: number;
  /** Average entry price, integer cents. */
  avgEntryPriceCents: number;
}

/** One position closed today, with its realized P&L (integer cents). */
export interface ClosedPositionSummary {
  symbol: string;
  /** Realized P&L for the close, integer cents (may be negative). */
  realizedPnlCents: number;
}

/** A critical alert worth surfacing in the digest. */
export interface BriefingAlert {
  symbol: string;
  /** Friendly label, e.g. "Pump-and-dump pattern". */
  label: string;
}

export interface EveningBriefingInput {
  /** Local calendar date the briefing covers, e.g. "2026-06-18". */
  date: string;
  openPositions: ReadonlyArray<OpenPositionSummary>;
  closedPositions: ReadonlyArray<ClosedPositionSummary>;
  /** Realized P&L across today's closes, integer cents. Caller supplies the
   * @signalguard/performance sum so the builder stays dependency-free. */
  realizedPnlCents: number;
  /** New proposals created today. */
  newProposalCount: number;
  /** Proposals approved today. */
  approvalCount: number;
  /** Proposals authorized (orders placed) today. */
  authorizationCount: number;
  criticalAlerts: ReadonlyArray<BriefingAlert>;
}

export interface BriefingSection {
  heading: string;
  lines: ReadonlyArray<string>;
}

export interface Briefing {
  title: string;
  /** Headline summary lines (the digest at a glance). */
  summaryLines: ReadonlyArray<string>;
  sections: ReadonlyArray<BriefingSection>;
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatUsd(cents: number): string {
  return USD.format(cents / 100);
}

/** "+$12.00" / "-$3.40" / "$0.00" — sign carries meaning for P&L. */
function formatSignedUsd(cents: number): string {
  if (cents === 0) return USD.format(0);
  const sign = cents > 0 ? "+" : "-";
  return `${sign}${USD.format(Math.abs(cents) / 100)}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/**
 * Build the structured evening briefing. Always returns a well-formed
 * Briefing, including the quiet-day case (no positions, no activity, no
 * alerts) — the digest then explicitly says there was nothing to report rather
 * than rendering empty sections.
 */
export function buildEveningBriefing(input: EveningBriefingInput): Briefing {
  const title = `Evening briefing — ${input.date}`;

  const openCount = input.openPositions.length;
  const closedCount = input.closedPositions.length;
  const costBasisCents = input.openPositions.reduce(
    (sum, p) => sum + p.avgEntryPriceCents * p.quantity,
    0,
  );

  const quietDay =
    openCount === 0 &&
    closedCount === 0 &&
    input.newProposalCount === 0 &&
    input.approvalCount === 0 &&
    input.authorizationCount === 0 &&
    input.criticalAlerts.length === 0;

  const summaryLines: string[] = [];
  if (quietDay) {
    summaryLines.push("Quiet day — no open positions, no activity, no alerts.");
  } else {
    summaryLines.push(
      `${closedCount} ${plural(closedCount, "position")} closed today, realized P&L ${formatSignedUsd(
        input.realizedPnlCents,
      )}.`,
    );
    summaryLines.push(
      `${openCount} open ${plural(openCount, "position")} (cost basis ${formatUsd(
        costBasisCents,
      )}).`,
    );
    if (input.criticalAlerts.length > 0) {
      summaryLines.push(
        `${input.criticalAlerts.length} critical ${plural(
          input.criticalAlerts.length,
          "alert",
        )} today.`,
      );
    }
  }

  const sections: BriefingSection[] = [];

  // Realized P&L / closed positions.
  if (closedCount > 0) {
    const lines = input.closedPositions.map(
      (p) => `${p.symbol}: ${formatSignedUsd(p.realizedPnlCents)}`,
    );
    lines.push(`Total realized: ${formatSignedUsd(input.realizedPnlCents)}`);
    sections.push({ heading: "Closed today", lines });
  } else {
    sections.push({
      heading: "Closed today",
      lines: ["No positions closed today."],
    });
  }

  // Open positions (cost basis only — no live mark in this cron).
  if (openCount > 0) {
    const lines = input.openPositions.map(
      (p) =>
        `${p.symbol}: ${p.quantity} ${plural(p.quantity, "share")} @ ${formatUsd(
          p.avgEntryPriceCents,
        )} (basis ${formatUsd(p.avgEntryPriceCents * p.quantity)})`,
    );
    lines.push(`Total cost basis: ${formatUsd(costBasisCents)}`);
    sections.push({ heading: "Open positions", lines });
  } else {
    sections.push({
      heading: "Open positions",
      lines: ["No open positions."],
    });
  }

  // Proposal pipeline activity.
  sections.push({
    heading: "Proposal activity",
    lines: [
      `New proposals: ${input.newProposalCount}`,
      `Approved: ${input.approvalCount}`,
      `Authorized: ${input.authorizationCount}`,
    ],
  });

  // Critical alerts.
  if (input.criticalAlerts.length > 0) {
    sections.push({
      heading: "Critical alerts",
      lines: input.criticalAlerts.map((a) => `${a.symbol}: ${a.label}`),
    });
  } else {
    sections.push({
      heading: "Critical alerts",
      lines: ["No critical alerts today."],
    });
  }

  return { title, summaryLines, sections };
}
