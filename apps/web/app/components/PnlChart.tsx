import { formatSignedUsd } from "../../lib/money";
import type { PnlSeries } from "../../lib/pnl-series";

/**
 * Hand-rolled SVG chart of cumulative realized P&L over time (Phase 7). Pure
 * presentational: no chart library, no client JS. Draws a filled area + line
 * over the cumulative-P&L curve with one dot per closed trade, and captions the
 * running trade count. The line/area are coloured by the FINAL cumulative
 * value's sign (positive = green, negative = red), reusing the existing
 * positive/negative tone classes via `currentColor`.
 *
 * Coordinate scaling lives here (the builder returns raw points, not layout):
 * x is evenly spaced by trade index (the curve is event-ordered, not
 * time-proportional, so a long quiet gap doesn't stretch the line); y maps the
 * cumulative-cents range onto the viewBox with a baseline at zero P&L.
 */

const W = 600;
const H = 180;
const PAD = 12;

export function PnlChart({ series }: { series: PnlSeries }) {
  const { points, tradeCount } = series;

  if (points.length === 0) {
    return (
      <section className="page-card">
        <p className="eyebrow">Equity curve · realized</p>
        <h2>Cumulative realized P&amp;L</h2>
        <div className="empty-state" role="status">
          No closed trades yet — the curve appears once protective exits fill.
        </div>
      </section>
    );
  }

  const finalCents = points[points.length - 1]!.cumCents;
  const tone =
    finalCents > 0 ? "positive" : finalCents < 0 ? "negative" : "flat";

  // y-domain spans the cumulative range AND zero, so the baseline is visible.
  const values = points.map((p) => p.cumCents);
  const maxV = Math.max(0, ...values);
  const minV = Math.min(0, ...values);
  const span = maxV - minV || 1; // avoid divide-by-zero on a flat line

  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  // Single point would have no x-step; place it mid-canvas.
  const xFor = (i: number): number =>
    points.length === 1
      ? PAD + innerW / 2
      : PAD + (i / (points.length - 1)) * innerW;
  const yFor = (cents: number): number =>
    PAD + innerH - ((cents - minV) / span) * innerH;

  const zeroY = yFor(0);
  const linePts = points.map((p, i) => `${xFor(i)},${yFor(p.cumCents)}`);
  // Area: line, then drop to the zero baseline and back to the start.
  const areaPath =
    `M ${xFor(0)},${zeroY} ` +
    `L ${points.map((p, i) => `${xFor(i)},${yFor(p.cumCents)}`).join(" L ")} ` +
    `L ${xFor(points.length - 1)},${zeroY} Z`;

  return (
    <section className="page-card pnl-chart">
      <p className="eyebrow">Equity curve · realized</p>
      <h2>Cumulative realized P&amp;L</h2>
      <svg
        className={`pnl-chart__svg ${tone}`}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Cumulative realized profit and loss over ${tradeCount} closed trade${
          tradeCount === 1 ? "" : "s"
        }, ending at ${formatSignedUsd(finalCents)}`}
        preserveAspectRatio="none"
      >
        {/* zero baseline */}
        <line
          x1={PAD}
          x2={W - PAD}
          y1={zeroY}
          y2={zeroY}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeDasharray="3 3"
        />
        <path d={areaPath} fill="currentColor" fillOpacity={0.12} stroke="none" />
        <polyline
          points={linePts.join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle
            key={`${p.t}-${i}`}
            cx={xFor(i)}
            cy={yFor(p.cumCents)}
            r={2.5}
            fill="currentColor"
          />
        ))}
      </svg>
      <p className="muted pnl-chart__caption">
        {tradeCount} closed trade{tradeCount === 1 ? "" : "s"} · ending{" "}
        <span className={tone}>{formatSignedUsd(finalCents)}</span>
      </p>
    </section>
  );
}
