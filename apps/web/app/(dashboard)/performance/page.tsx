import { PerformanceDashboard } from "../../components/PerformanceDashboard";
import { PnlChart } from "../../components/PnlChart";
import { loadPerformanceState } from "../../../lib/performance";
import { loadBenchmarkComparison, type BenchmarkState } from "../../../lib/benchmark";
import { loadPnlSeries } from "../../../lib/pnl-series-loader";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const [state, benchmark, pnlSeries] = await Promise.all([
    loadPerformanceState(),
    loadBenchmarkComparison(),
    loadPnlSeries(),
  ]);
  return (
    <>
      <PnlChart series={pnlSeries} />
      <PerformanceDashboard state={state} />
      <BenchmarkPanel benchmark={benchmark} />
    </>
  );
}

/**
 * Independent "vs SPY" benchmark panel. Renders realized portfolio return,
 * SPY return, and the raw excess (tone-coloured) when the loader succeeds, or a
 * small muted line otherwise. Never affects the dashboard above it.
 */
function BenchmarkPanel({ benchmark }: { benchmark: BenchmarkState }) {
  if (benchmark.status === "unavailable") {
    return (
      <section className="page-card">
        <p className="eyebrow">Benchmark · vs SPY</p>
        <p className="muted">Benchmark unavailable: {benchmark.reason}</p>
      </section>
    );
  }

  const { view } = benchmark;
  return (
    <section className="page-card">
      <p className="eyebrow">Benchmark · vs SPY</p>
      <h2>Benchmark — vs SPY</h2>
      <div className="account-summary" aria-label="Benchmark vs SPY">
        <div className="stat">
          <p className="stat-label">Realized return (on current equity)</p>
          <p className={`stat-value ${excessToneClass(portfolioTone(view))}`}>
            {view.portfolioLabel}
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">SPY return</p>
          <p className="stat-value">{view.spyLabel}</p>
        </div>
        <div className="stat">
          <p className="stat-label">Excess vs SPY</p>
          <p className={`stat-value ${excessToneClass(view.excessTone)}`}>
            {view.excessLabel}
          </p>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        Portfolio figure is realized P&amp;L as a % of current equity.
      </p>
    </section>
  );
}

/** Tone for the portfolio return cell, derived from the sign of its label. */
function portfolioTone(view: {
  portfolioReturnPct: number;
}): "positive" | "negative" | "flat" {
  if (view.portfolioReturnPct > 0) return "positive";
  if (view.portfolioReturnPct < 0) return "negative";
  return "flat";
}

function excessToneClass(tone: "positive" | "negative" | "flat"): string {
  if (tone === "positive") return "positive";
  if (tone === "negative") return "negative";
  return "";
}
