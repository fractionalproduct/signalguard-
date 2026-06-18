/**
 * Pure view-model builders for the M7 research-drill-down inline charts.
 *
 * No React, no SVG — just SVG path strings and bar geometry. The components
 * in app/components/charts/ render the output verbatim. Keeping this layer
 * pure lets us unit-test the geometry math without standing up jsdom.
 *
 * All chart series are rendered oldest-on-the-left, newest-on-the-right.
 * Callers should reverse a history array if it arrives newest-first.
 */

const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 120;
const DEFAULT_PADDING = 4;

export interface SparklineRefLine {
  value: number;
  y: number;
  label: string;
}

export interface SparklineLayout {
  width: number;
  height: number;
  viewBox: string;
  /** SVG path "M ... L ... L ..." string, or null when no data. */
  path: string | null;
  /** Min observed value (for axis hints; may equal max on flat series). */
  minValue: number;
  maxValue: number;
  /** Reference lines (e.g. RSI 30 / 70). */
  referenceLines: ReadonlyArray<SparklineRefLine>;
}

export interface SparklineOptions {
  width?: number;
  height?: number;
  padding?: number;
  /**
   * Optional reference values in the same units as the input series. Each is
   * rendered as a horizontal line at the matching y in the chart and is
   * included in the min/max range so the line is always visible.
   */
  referenceValues?: ReadonlyArray<{ value: number; label: string }>;
}

/**
 * Project a series of (nullable) values into an SVG path string. Null gaps
 * break the path so we don't draw a fake line across warmup or missing data.
 */
export function buildSparkline(
  values: ReadonlyArray<number | null>,
  options: SparklineOptions = {},
): SparklineLayout {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const padding = options.padding ?? DEFAULT_PADDING;
  const refs = options.referenceValues ?? [];

  const numericValues = values.filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (numericValues.length === 0) {
    return {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      path: null,
      minValue: 0,
      maxValue: 0,
      referenceLines: [],
    };
  }

  // Reference values are folded into the min/max so they always render
  // inside the chart frame.
  const refValues = refs.map((r) => r.value);
  const minValue = Math.min(...numericValues, ...refValues);
  const maxValue = Math.max(...numericValues, ...refValues);
  const yScale = makeYScale(minValue, maxValue, padding, height);

  // X positions are uniform across all input slots (including null gaps);
  // that keeps the chart aligned with the table beneath.
  const innerWidth = width - 2 * padding;
  const xFor = (i: number): number =>
    values.length <= 1
      ? padding + innerWidth / 2
      : padding + (i / (values.length - 1)) * innerWidth;

  let path = "";
  let penUp = true;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) {
      penUp = true;
      continue;
    }
    const x = xFor(i);
    const y = yScale(v as number);
    path += `${penUp ? "M" : "L"}${formatCoord(x)},${formatCoord(y)} `;
    penUp = false;
  }

  return {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    path: path.trim() || null,
    minValue,
    maxValue,
    referenceLines: refs.map((r) => ({
      value: r.value,
      y: yScale(r.value),
      label: r.label,
    })),
  };
}

export interface HistogramBar {
  x: number;
  y: number;
  width: number;
  height: number;
  sign: "positive" | "negative" | "flat";
}

export interface HistogramLayout {
  width: number;
  height: number;
  viewBox: string;
  /** Y coordinate of the zero baseline. */
  zeroY: number;
  bars: ReadonlyArray<HistogramBar>;
}

export interface HistogramOptions {
  width?: number;
  height?: number;
  padding?: number;
  /** Minimum visual height for a non-zero bar (px). Default 1. */
  minBarHeight?: number;
}

/**
 * Render a bipolar histogram (e.g. MACD histogram). Positive values grow up
 * from a zero baseline, negative values grow down. Null / non-finite values
 * are skipped (no bar emitted) so warmup gaps don't add visual noise.
 */
export function buildHistogram(
  values: ReadonlyArray<number | null>,
  options: HistogramOptions = {},
): HistogramLayout {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const padding = options.padding ?? DEFAULT_PADDING;
  const minBarHeight = options.minBarHeight ?? 1;

  const numericValues = values.filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (numericValues.length === 0 || values.length === 0) {
    return {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      zeroY: height / 2,
      bars: [],
    };
  }

  const absMax = Math.max(...numericValues.map((v) => Math.abs(v)));
  const innerHeight = height - 2 * padding;
  const zeroY = padding + innerHeight / 2;
  const innerWidth = width - 2 * padding;

  const slotWidth = innerWidth / values.length;
  // Bar width: ~70% of the per-slot width, with a 1px floor so very dense
  // series still render visible bars.
  const barWidth = Math.max(1, slotWidth * 0.7);

  const bars: HistogramBar[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) continue;
    const slotCenter = padding + (i + 0.5) * slotWidth;
    const x = slotCenter - barWidth / 2;
    if (v === 0) continue;
    const sign: HistogramBar["sign"] = v > 0 ? "positive" : "negative";
    const heightPx =
      absMax === 0
        ? minBarHeight
        : Math.max(minBarHeight, (Math.abs(v) / absMax) * (innerHeight / 2));
    const y = v > 0 ? zeroY - heightPx : zeroY;
    bars.push({ x, y, width: barWidth, height: heightPx, sign });
  }

  return {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    zeroY,
    bars,
  };
}

/** Build a y-scale fn mapping [minValue, maxValue] to [padding, height-padding] inverted. */
function makeYScale(
  minValue: number,
  maxValue: number,
  padding: number,
  height: number,
): (v: number) => number {
  const innerHeight = height - 2 * padding;
  const range = maxValue - minValue;
  if (range === 0) {
    // Flat series — center the line vertically.
    return () => padding + innerHeight / 2;
  }
  return (v: number) => padding + (1 - (v - minValue) / range) * innerHeight;
}

/** Trim noisy float decimals from SVG coordinates (1.234567 -> 1.23). */
function formatCoord(n: number): string {
  return Math.round(n * 100) / 100 + "";
}
