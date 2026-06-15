/**
 * Pure view-model builder for the read-only portfolio dashboard.
 *
 * Takes provider-neutral broker data (account, positions, orders) and derives
 * everything the UI needs: formatted strings, sign classes, totals, sort order.
 * No I/O and no broker access — the network call lives in ./portfolio.ts. This
 * separation keeps the display logic deterministic and unit-testable.
 */
import type {
  BrokerAccount,
  BrokerPosition,
  BrokerOrder,
} from "@signalguard/broker-adapters";
import { formatSignedUsd, formatUsd, formatQuantity, signClass } from "./money";

export interface AccountSummaryView {
  portfolioValue: string;
  cash: string;
  equity: string;
  buyingPower: string;
  isPaper: boolean;
  tradingBlocked: boolean;
  statusLabel: string;
}

export interface PositionRowView {
  symbol: string;
  side: "long" | "short";
  quantity: string;
  avgEntryPrice: string;
  currentPrice: string;
  marketValue: string;
  unrealizedPl: string;
  unrealizedPlClass: "positive" | "negative" | "flat";
}

export interface OrderRowView {
  id: string;
  symbol: string;
  side: string;
  type: string;
  quantity: string;
  status: string;
  submittedAt: string | null;
}

export interface PortfolioView {
  account: AccountSummaryView;
  positions: PositionRowView[];
  totalUnrealizedPl: string;
  totalUnrealizedPlClass: "positive" | "negative" | "flat";
  recentOrders: OrderRowView[];
}

function buildAccountSummary(account: BrokerAccount): AccountSummaryView {
  return {
    portfolioValue: formatUsd(account.portfolioValueCents),
    cash: formatUsd(account.cashCents),
    equity: formatUsd(account.equityCents),
    buyingPower: formatUsd(account.buyingPowerCents),
    isPaper: account.isPaper,
    tradingBlocked: account.tradingBlocked,
    statusLabel: account.status,
  };
}

function buildPositionRow(p: BrokerPosition): PositionRowView {
  return {
    symbol: p.symbol,
    side: p.side,
    quantity: formatQuantity(p.quantity),
    avgEntryPrice: formatUsd(p.avgEntryPriceCents),
    currentPrice: formatUsd(p.currentPriceCents),
    marketValue: formatUsd(p.marketValueCents),
    unrealizedPl: formatSignedUsd(p.unrealizedPlCents),
    unrealizedPlClass: signClass(p.unrealizedPlCents),
  };
}

function buildOrderRow(o: BrokerOrder): OrderRowView {
  return {
    id: o.brokerOrderId,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    quantity: formatQuantity(o.quantity),
    status: o.status,
    submittedAt: o.submittedAt,
  };
}

/** Most-recent first; nulls (no timestamp) sort last. */
function bySubmittedAtDesc(a: BrokerOrder, b: BrokerOrder): number {
  if (!a.submittedAt) return 1;
  if (!b.submittedAt) return -1;
  return a.submittedAt < b.submittedAt ? 1 : a.submittedAt > b.submittedAt ? -1 : 0;
}

export function buildPortfolioView(
  account: BrokerAccount,
  positions: BrokerPosition[],
  orders: BrokerOrder[],
  recentOrderLimit = 10,
): PortfolioView {
  const positionRows = [...positions]
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map(buildPositionRow);

  const totalUnrealizedPlCents = positions.reduce(
    (sum, p) => sum + p.unrealizedPlCents,
    0,
  );

  const recentOrders = [...orders]
    .sort(bySubmittedAtDesc)
    .slice(0, recentOrderLimit)
    .map(buildOrderRow);

  return {
    account: buildAccountSummary(account),
    positions: positionRows,
    totalUnrealizedPl: formatSignedUsd(totalUnrealizedPlCents),
    totalUnrealizedPlClass: signClass(totalUnrealizedPlCents),
    recentOrders,
  };
}
