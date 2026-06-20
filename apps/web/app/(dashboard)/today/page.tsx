import { loadTodayState, type TodayState } from "../../../lib/today";
import { buildTodayView, type TodayView } from "../../../lib/today-view";

/** Today's data + a live broker read; must never be statically prerendered. */
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const state = await loadTodayState();
  return <TodayContent state={state} />;
}

function TodayContent({ state }: { state: TodayState }) {
  if (state.status === "error") return <ErrorCard message={state.message} />;
  if (state.status === "not-configured") return <NotConfiguredCard />;
  return <TodayCard view={buildTodayView(state.view)} />;
}

function NotConfiguredCard() {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · PAPER TRADING</p>
      <h1>Today</h1>
      <div className="empty-state" role="status">
        Set a daily profit target or capital cap in{" "}
        <strong>Settings</strong> to start tracking today&apos;s progress.
        Until then there&apos;s no goal to measure against.
      </div>
    </section>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view</p>
      <h1>Today</h1>
      <div className="empty-state" role="alert">
        Couldn&apos;t read today&apos;s P&amp;L from the database.
        <br />
        <span className="muted">Details: {message}</span>
      </div>
    </section>
  );
}

function toneClass(tone: TodayView["net"]["tone"]): string {
  if (tone === "positive") return "positive";
  if (tone === "negative") return "negative";
  return "";
}

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={{
        background: "var(--surface-muted, #e5e7eb)",
        borderRadius: 999,
        height: 10,
        overflow: "hidden",
        marginTop: 6,
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: "var(--accent, #16a34a)",
          borderRadius: 999,
          transition: "width 200ms ease",
        }}
      />
    </div>
  );
}

function TodayCard({ view }: { view: TodayView }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · PAPER TRADING</p>
      <h1>Today</h1>
      <p className="lead">
        Your profit-and-loss for today (US Eastern time): realized from closed
        positions plus unrealized on open ones. Paper-only.
      </p>

      <div style={{ margin: "16px 0" }}>
        <p className="stat-label">Net today</p>
        <p
          className={`stat-value ${toneClass(view.net.tone)}`}
          style={{ fontSize: "2.4rem", lineHeight: 1.1 }}
        >
          {view.net.label}
        </p>
      </div>

      <div className="account-summary" aria-label="Today's P&L breakdown">
        <div className="stat">
          <p className="stat-label">Realized</p>
          <p className={`stat-value ${toneClass(view.realized.tone)}`}>
            {view.realized.label}
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">Unrealized</p>
          <p className={`stat-value ${toneClass(view.unrealized.tone)}`}>
            {view.unrealized.label}
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">Deployed today</p>
          <p className="stat-value">
            {view.deployed}
            {view.cap !== "—" ? (
              <span className="muted"> / {view.cap} cap</span>
            ) : null}
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">Profit target</p>
          <p className="stat-value">{view.profitTarget}</p>
        </div>
      </div>

      {view.unrealizedUnavailable ? (
        <p className="muted" style={{ marginTop: 8 }}>
          Unrealized P&amp;L is unavailable — no paper broker is connected, so
          only realized P&amp;L is shown.
        </p>
      ) : null}

      {view.targetProgressPct !== null ? (
        <div style={{ marginTop: 16 }}>
          <p className="stat-label">
            Progress toward profit target ({view.profitTarget})
          </p>
          <ProgressBar
            pct={view.targetProgressPct}
            label="Net P&L progress toward daily profit target"
          />
          <p className="muted" style={{ marginTop: 4 }}>
            {view.targetProgressPct.toFixed(0)}% of target
          </p>
        </div>
      ) : null}

      {view.capProgressPct !== null ? (
        <div style={{ marginTop: 16 }}>
          <p className="stat-label">Capital deployed vs cap ({view.cap})</p>
          <ProgressBar
            pct={view.capProgressPct}
            label="Capital deployed today vs daily cap"
          />
          <p className="muted" style={{ marginTop: 4 }}>
            {view.capProgressPct.toFixed(0)}% of cap used
          </p>
        </div>
      ) : null}
    </section>
  );
}
