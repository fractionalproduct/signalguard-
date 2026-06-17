import type { SparklineLayout } from "../../../lib/sparkline-view";

/**
 * Generic inline sparkline — line chart over a series with optional
 * horizontal reference lines (e.g. RSI 30/70). Empty / all-null series
 * render an "—" placeholder so the page layout stays stable.
 */
export function Sparkline({
  layout,
  ariaLabel,
}: {
  layout: SparklineLayout;
  ariaLabel: string;
}) {
  if (!layout.path) {
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
      {layout.referenceLines.map((ref) => (
        <g key={ref.label}>
          <line
            x1={0}
            x2={layout.width}
            y1={ref.y}
            y2={ref.y}
            stroke="currentColor"
            strokeOpacity={0.2}
            strokeDasharray="3 3"
          />
          <text
            x={4}
            y={ref.y - 2}
            fontSize={10}
            fill="currentColor"
            opacity={0.5}
          >
            {ref.label}
          </text>
        </g>
      ))}
      <path
        d={layout.path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
