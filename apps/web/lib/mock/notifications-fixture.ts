/**
 * Mock-mode fixture for the /notifications page (M15).
 *
 * Realistic notification rows used when `MOCK_DATA=1`, fed through the SAME
 * pure view-builder as real DB data. No database, broker, or market API call.
 *
 * Severities use the view's expected values: "INFO" | "WARNING" | "CRITICAL".
 */
import type { NotificationInput } from "../notifications-view";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const now = Date.now();

export const MOCK_NOTIFICATIONS: NotificationInput[] = [
  {
    id: "ntf_01",
    type: "manipulation.alert",
    severity: "CRITICAL",
    title: "Possible manipulation detected on NVDA",
    body: "Anomalous order-book layering and rapid cancel/replace activity spotted on NVDA. Auto-trading paused for this symbol pending review.",
    read: false,
    createdAt: new Date(now - 4 * MINUTE),
    readAt: null,
  },
  {
    id: "ntf_02",
    type: "emergency_stop.activated",
    severity: "CRITICAL",
    title: "Emergency stop activated",
    body: "Global emergency stop was triggered. All open orders cancelled and new order submission is blocked until manually re-enabled.",
    read: false,
    createdAt: new Date(now - 22 * MINUTE),
    readAt: null,
  },
  {
    id: "ntf_03",
    type: "order.submitted",
    severity: "INFO",
    title: "Order submitted: BUY 50 AAPL",
    body: "Limit order to buy 50 shares of AAPL at $191.20 was submitted to the broker and is now working.",
    read: false,
    createdAt: new Date(now - 1 * HOUR - 12 * MINUTE),
    readAt: null,
  },
  {
    id: "ntf_04",
    type: "order.submitted",
    severity: "INFO",
    title: "Order filled: SELL 30 MSFT",
    body: "Market order to sell 30 shares of MSFT filled at an average price of $447.85.",
    read: true,
    createdAt: new Date(now - 3 * HOUR),
    readAt: new Date(now - 2 * HOUR - 40 * MINUTE),
  },
  {
    id: "ntf_05",
    type: "risk.threshold_breached",
    severity: "WARNING",
    title: "Daily drawdown approaching limit",
    body: "Portfolio drawdown reached 4.2% today, nearing the configured 5% soft limit. Position sizing will be reduced for new entries.",
    read: false,
    createdAt: new Date(now - 5 * HOUR),
    readAt: null,
  },
  {
    id: "ntf_06",
    type: "briefing.evening",
    severity: "INFO",
    title: "Evening briefing ready",
    body: "Your end-of-day briefing is available: 3 positions closed, net P&L +$1,284, and 5 candidate setups flagged for tomorrow's open.",
    read: true,
    createdAt: new Date(now - 18 * HOUR),
    readAt: new Date(now - 17 * HOUR - 30 * MINUTE),
  },
  {
    id: "ntf_07",
    type: "broker.connection_lost",
    severity: "WARNING",
    title: "Broker connection temporarily lost",
    body: "Lost connection to the broker gateway for 38 seconds. Connection has been restored and order state was reconciled successfully.",
    read: true,
    createdAt: new Date(now - 1 * DAY - 2 * HOUR),
    readAt: new Date(now - 1 * DAY - 1 * HOUR),
  },
  {
    id: "ntf_08",
    type: "briefing.morning",
    severity: "INFO",
    title: "Morning briefing ready",
    body: "Pre-market briefing is available: futures up 0.4%, 2 earnings events in your watchlist, and overnight news scanned for 12 holdings.",
    read: true,
    createdAt: new Date(now - 1 * DAY - 14 * HOUR),
    readAt: new Date(now - 1 * DAY - 13 * HOUR - 45 * MINUTE),
  },
  {
    id: "ntf_09",
    type: "manipulation.alert",
    severity: "WARNING",
    title: "Elevated spoofing signal on TSLA",
    body: "Spoofing heuristics flagged elevated activity on TSLA. No action taken automatically, but new entries on this symbol require manual confirmation.",
    read: true,
    createdAt: new Date(now - 2 * DAY - 6 * HOUR),
    readAt: new Date(now - 2 * DAY - 5 * HOUR),
  },
  {
    id: "ntf_10",
    type: "system.update",
    severity: "INFO",
    title: "Strategy parameters updated",
    body: "Your mean-reversion strategy parameters were updated. The new configuration takes effect at the next market open.",
    read: false,
    createdAt: new Date(now - 3 * DAY),
    readAt: null,
  },
];
