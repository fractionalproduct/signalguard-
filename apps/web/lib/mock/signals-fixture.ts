/**
 * Realistic fake signals for mock mode (MOCK_DATA=1). Fed through the same
 * buildSignalsView() as real DB rows, so the inbox renders fully populated with
 * NO database access. Rows span every status group the view knows about and
 * confidence values across the high (>=0.7) / medium (>=0.4) / low (<0.4)
 * thresholds. Timestamps are recent and relative to load time.
 */
import type { SignalRecord } from "../signals-view";

const HOUR = 3600_000;

/** Demo signals across statuses and confidence bands. Newest-first. */
export const MOCK_SIGNALS: SignalRecord[] = [
  {
    id: "mock-1",
    symbol: "NVDA",
    summary: "Unusual call volume ahead of GTC keynote; momentum breakout above 50-day MA.",
    confidence: 0.92,
    status: "READY_FOR_REVIEW",
    createdAt: new Date(Date.now() - 1 * HOUR),
  },
  {
    id: "mock-2",
    symbol: "MSFT",
    summary: "Azure cloud bookings re-accelerating; analyst upgrade with raised price target.",
    confidence: 0.78,
    status: "READY_FOR_REVIEW",
    createdAt: new Date(Date.now() - 2 * HOUR),
  },
  {
    id: "mock-3",
    symbol: "AAPL",
    summary: "Supply-chain checks hint at stronger iPhone build orders into the quarter.",
    confidence: 0.64,
    status: "NEW",
    createdAt: new Date(Date.now() - 3 * HOUR),
  },
  {
    id: "mock-4",
    symbol: "AMD",
    summary: "MI300 datacenter traction; mixed signals on consumer GPU channel inventory.",
    confidence: 0.45,
    status: "NEW",
    createdAt: new Date(Date.now() - 5 * HOUR),
  },
  {
    id: "mock-5",
    symbol: "TSLA",
    summary: "Delivery whisper numbers soft; price action coiling near support, low conviction.",
    confidence: 0.33,
    status: "NEW",
    createdAt: new Date(Date.now() - 6 * HOUR),
  },
  {
    id: "mock-6",
    symbol: "AMZN",
    summary: "AWS margin expansion plus ad-revenue strength flagged by sentiment model.",
    confidence: 0.71,
    status: "PROCESSING",
    createdAt: new Date(Date.now() - 8 * HOUR),
  },
  {
    id: "mock-7",
    symbol: "META",
    summary: "Reels monetization improving; awaiting confirmation from engagement feed.",
    confidence: 0.58,
    status: "PROCESSING",
    createdAt: new Date(Date.now() - 10 * HOUR),
  },
  {
    id: "mock-8",
    symbol: "GOOGL",
    summary: "Search share stable, Gemini rollout positive; approved for watchlist sizing.",
    confidence: 0.83,
    status: "APPROVED",
    createdAt: new Date(Date.now() - 14 * HOUR),
  },
  {
    id: "mock-9",
    symbol: "NVDA",
    summary: "Prior earnings-gap fade thesis; rejected after risk review on stretched valuation.",
    confidence: 0.38,
    status: "REJECTED",
    createdAt: new Date(Date.now() - 20 * HOUR),
  },
  {
    id: "mock-10",
    symbol: "MSFT",
    summary: "Short-dated options skew signal expired before a confirmation trigger fired.",
    confidence: 0.49,
    status: "EXPIRED",
    createdAt: new Date(Date.now() - 30 * HOUR),
  },
  {
    id: "mock-11",
    symbol: null,
    summary: "Broad market breadth thrust detected; index-level, no single ticker attached.",
    confidence: 0.55,
    status: "ARCHIVED",
    createdAt: new Date(Date.now() - 40 * HOUR),
  },
];
