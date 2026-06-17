import type { OhlcvBar } from "@signalguard/market-data";
import {
  detectGapAndFade,
  detectPumpAndDump,
  detectUnusualVolume,
} from "@signalguard/manipulation-detection";
import { classifyMarketRegime } from "@signalguard/market-regime";
import {
  calculateBollingerBands,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateSMA,
} from "@signalguard/technical-analysis";
import type { WatchlistAnalysisSnapshot } from "./types.js";

export interface AnalyzeWatchlistSymbolInput {
  symbol: string;
  bars: ReadonlyArray<OhlcvBar>;
  /** Defaults to `new Date()`. Inject for deterministic test snapshots. */
  computedAt?: Date;
}

/**
 * Run every M7 deterministic analyzer over a bar series and emit a
 * single snapshot. Each analyzer tolerates short input internally —
 * fields without enough history fall through as null / false rather
 * than throwing, so a caller never has to track warmup state.
 */
export function analyzeWatchlistSymbol(
  input: AnalyzeWatchlistSymbolInput,
): WatchlistAnalysisSnapshot {
  const { symbol, bars } = input;
  const computedAt = (input.computedAt ?? new Date()).toISOString();
  const last = bars.length > 0 ? bars[bars.length - 1]! : null;

  // Indicators — each analyzer returns [] when bars are shorter than its
  // warmup period, so a length>0 check picks the latest value safely.
  const smaSeries = calculateSMA(bars, 20);
  const sma20 =
    smaSeries.length > 0 ? smaSeries[smaSeries.length - 1]!.value : null;
  const emaSeries = calculateEMA(bars, 20);
  const ema20 =
    emaSeries.length > 0 ? emaSeries[emaSeries.length - 1]!.value : null;
  const rsiSeries = calculateRSI(bars, 14);
  const rsi14 =
    rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1]!.value : null;

  const macdSeries = calculateMACD(bars);
  const macd =
    macdSeries.length > 0
      ? (() => {
          const m = macdSeries[macdSeries.length - 1]!;
          return { macd: m.macd, signal: m.signal, histogram: m.histogram };
        })()
      : null;

  const bbSeries = calculateBollingerBands(bars);
  const bollinger =
    bbSeries.length > 0
      ? (() => {
          const b = bbSeries[bbSeries.length - 1]!;
          return { upper: b.upper, middle: b.middle, lower: b.lower };
        })()
      : null;

  const regimeSeries = classifyMarketRegime(bars);
  const regime =
    regimeSeries.length > 0
      ? (() => {
          const r = regimeSeries[regimeSeries.length - 1]!;
          return { trend: r.trend, volatility: r.volatility };
        })()
      : null;

  const uv = detectUnusualVolume(bars);
  const pd = detectPumpAndDump(bars);
  const gf = detectGapAndFade(bars);

  return {
    symbol,
    computedAt,
    barCount: bars.length,
    latestBarTimestamp: last?.timestamp ?? null,
    latestBarCloseCents: last?.closeCents ?? null,
    technical: { sma20, ema20, rsi14, macd, bollinger },
    regime,
    manipulation: {
      unusualVolume:
        uv.length > 0 ? uv[uv.length - 1]!.detected : false,
      pumpAndDump:
        pd.length > 0 ? pd[pd.length - 1]!.detected : false,
      gapAndFade:
        gf.length > 0 ? gf[gf.length - 1]!.detected : false,
    },
  };
}
