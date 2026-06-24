import {
  getAutopilotConfig,
  getDb,
  isEmergencyStopActive,
  listRecentAuditEvents,
} from "@signalguard/database";
import { isMockMode } from "../../../lib/mock/mock-mode";

// Reads live Emergency-Stop state + config at request time.
export const dynamic = "force-dynamic";

function usd(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** The always-on deterministic guardrails, in plain English. */
const GUARDRAILS: { title: string; body: string }[] = [
  {
    title: "Paper-only, long-only",
    body: "Every order is simulated against an Alpaca paper account. The system can only BUY to open — no shorting, margin, or selling what you don't hold.",
  },
  {
    title: "Market-session checks",
    body: "Orders are gated to valid sessions. Extended-hours trading is off unless you explicitly enable it; closed, holiday, and early-close sessions never trade.",
  },
  {
    title: "Spread & movement gates",
    body: "A trade is held if the quote is too wide or the stock has moved too far too fast — the bias is to HOLD rather than chase a bad fill.",
  },
  {
    title: "Manipulation-risk gating",
    body: "Pump-and-dump and gap-and-fade flags from the latest snapshot block a trade; unusual-volume flags downgrade it. The signal must look clean.",
  },
  {
    title: "Loss-limit circuit breakers",
    body: "Net realized losses are tracked per day, per week, and per month. Crossing a limit transiently blocks new entries (a HOLD), it never force-sells.",
  },
  {
    title: "Position sizing",
    body: "Size is computed from your risk profile and current equity — a trade can't deploy more than its sized share count allows.",
  },
];

export default async function RiskPage() {
  let emergencyStop = false;
  let caps:
    | {
        dailyCapitalCapCents: number | null;
        dailyProfitTargetCents: number | null;
        maxNewPositionsPerDay: number | null;
        profitLockEnabled: boolean;
        extendedHoursEnabled: boolean;
      }
    | null = null;
  let events: { id: string; type: string; source: string; createdAt: Date }[] = [];
  let loadError: string | null = null;

  if (!isMockMode()) {
    try {
      const db = getDb();
      const [stop, config, recent] = await Promise.all([
        isEmergencyStopActive(db),
        getAutopilotConfig(db),
        listRecentAuditEvents(db, { limit: 100 }),
      ]);
      emergencyStop = stop;
      caps = config;
      events = recent
        .filter((e) => /emergency_stop|risk|block|loss|halt/i.test(e.type))
        .slice(0, 15);
    } catch (err) {
      loadError = err instanceof Error ? err.message : "Failed to read risk state.";
    }
  }

  return (
    <section className="page-card">
      <h1>Risk &amp; guardrails</h1>

      {loadError ? (
        <p className="hub-muted">Couldn&apos;t read live risk state: {loadError}</p>
      ) : null}

      <div className="hub-grid">
        <div className="hub-card">
          <h3>Emergency Stop</h3>
          <p className={emergencyStop ? "status-off" : "status-on"}>
            {emergencyStop
              ? "⛔ ACTIVE — new orders blocked"
              : "✓ Inactive — trading allowed"}
          </p>
          <p className="hub-muted">
            The header button blocks new orders, cancels unfilled entries, and sells
            open options to close — while preserving protective exits.
          </p>
        </div>

        <div className="hub-card">
          <h3>Daily capital cap</h3>
          <p className="hub-stat">{usd(caps?.dailyCapitalCapCents)}</p>
          <p className="hub-muted">
            Max new capital autopilot may deploy per day. &ldquo;—&rdquo; means no cap
            set.
          </p>
        </div>

        <div className="hub-card">
          <h3>Daily profit target / lock</h3>
          <p className="hub-stat">{usd(caps?.dailyProfitTargetCents)}</p>
          <p className="hub-muted">
            Profit-lock is {caps?.profitLockEnabled ? "ON" : "off"} — once hit, new
            entries pause for the day.
          </p>
        </div>

        <div className="hub-card">
          <h3>Max new positions / day</h3>
          <p className="hub-stat">{caps?.maxNewPositionsPerDay ?? "—"}</p>
          <p className="hub-muted">
            Extended-hours trading is {caps?.extendedHoursEnabled ? "ENABLED" : "off"}.
          </p>
        </div>
      </div>

      <h2 style={{ marginTop: 28 }}>How the risk engine protects you</h2>
      <div className="hub-grid">
        {GUARDRAILS.map((g) => (
          <div className="hub-card" key={g.title}>
            <h3>{g.title}</h3>
            <p className="hub-muted">{g.body}</p>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 28 }}>Recent risk events</h2>
      {events.length === 0 ? (
        <p className="hub-muted">No recent risk-related events.</p>
      ) : (
        <ul>
          {events.map((e) => (
            <li key={e.id}>
              <code>{e.type}</code> · {e.source} ·{" "}
              {new Date(e.createdAt).toLocaleString("en-US")}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
