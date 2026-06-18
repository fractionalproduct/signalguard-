import type { HistogramLayout } from "../../../lib/sparkline-view";

/**
 * Bipolar histogram for MACD histogram series. Positive bars grow up from the
 * zero baseline; negative bars grow down. Bar fills inherit the sign-driven
 * .stat-value.{positive,negative,flat} classes already used elsewhere in the
 * dashboard.
 */
export function MacdHistogramBars({
  layout,
  ariaLabel,
}: {
  layout: HistogramLayout;
  ariaLabel: string;
}) {
  if (layout.bars.length === 0) {
    return (
      <span className="muted" role="img" aria-label={`${ariaLabel}: no data`}>
        —
      </span>
    );
  }
  return (
    <svg
      width={layout.width}
      height={layout.height}
      viewBox={layout.viewBox}
      role="img"
      aria-label={ariaLabel}
      style={{ display: "block", maxWidth: "100%" }}
    >
      <line
        x1={0}
        x2={layout.width}
        y1={layout.zeroY}
        y2={layout.zeroY}
        stroke="currentColor"
        strokeOpacity={0.4}
      />
      {layout.bars.map((bar, idx) => (
        <rect
          key={idx}
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          className={`stat-value ${bar.sign}`}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
