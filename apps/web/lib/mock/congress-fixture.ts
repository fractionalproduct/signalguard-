/**
 * Realistic fake congressional disclosures for mock mode (MOCK_DATA=1). Fed
 * through the same buildDisclosuresView() as real DB rows, so the inbox renders
 * fully populated with NO database access. Rows span both chambers (House,
 * Senate) and all transaction types the view labels (PURCHASE / SALE /
 * EXCHANGE). Amounts are in INTEGER CENTS (the view divides by 100). Dates are
 * recent and relative to load time, newest-filed first.
 */
import type { DisclosureRecord } from "../congress-view";

const DAY = 86_400_000;

/** Dollars → integer cents, for readable amount-range literals. */
function usd(dollars: number): number {
  return dollars * 100;
}

/** Demo disclosures across both chambers and all transaction types. */
export const MOCK_DISCLOSURES: DisclosureRecord[] = [
  {
    id: "mock-disc-1",
    representative: "Nancy Pelosi",
    chamber: "HOUSE",
    symbol: "NVDA",
    assetDescription: "NVIDIA Corporation — Common Stock",
    transactionType: "PURCHASE",
    amountRangeLow: usd(1_000_001),
    amountRangeHigh: usd(5_000_000),
    transactionDate: new Date(Date.now() - 4 * DAY),
    filedDate: new Date(Date.now() - 1 * DAY),
  },
  {
    id: "mock-disc-2",
    representative: "Dan Crenshaw",
    chamber: "HOUSE",
    symbol: "MSFT",
    assetDescription: "Microsoft Corporation — Common Stock",
    transactionType: "PURCHASE",
    amountRangeLow: usd(15_001),
    amountRangeHigh: usd(50_000),
    transactionDate: new Date(Date.now() - 6 * DAY),
    filedDate: new Date(Date.now() - 2 * DAY),
  },
  {
    id: "mock-disc-3",
    representative: "Ro Khanna",
    chamber: "HOUSE",
    symbol: "AAPL",
    assetDescription: "Apple Inc. — Common Stock",
    transactionType: "SALE",
    amountRangeLow: usd(1_001),
    amountRangeHigh: usd(15_000),
    transactionDate: new Date(Date.now() - 8 * DAY),
    filedDate: new Date(Date.now() - 3 * DAY),
  },
  {
    id: "mock-disc-4",
    representative: "Marjorie Taylor Greene",
    chamber: "HOUSE",
    symbol: "XOM",
    assetDescription: "Exxon Mobil Corporation — Common Stock",
    transactionType: "PURCHASE",
    amountRangeLow: usd(50_001),
    amountRangeHigh: usd(100_000),
    transactionDate: new Date(Date.now() - 9 * DAY),
    filedDate: new Date(Date.now() - 4 * DAY),
  },
  {
    id: "mock-disc-5",
    representative: "Josh Gottheimer",
    chamber: "HOUSE",
    symbol: "JPM",
    assetDescription: "JPMorgan Chase & Co. — Common Stock",
    transactionType: "SALE",
    amountRangeLow: usd(100_001),
    amountRangeHigh: usd(250_000),
    transactionDate: new Date(Date.now() - 11 * DAY),
    filedDate: new Date(Date.now() - 5 * DAY),
  },
  {
    id: "mock-disc-6",
    representative: "Michael McCaul",
    chamber: "HOUSE",
    symbol: null,
    assetDescription: "iShares Core U.S. Aggregate Bond ETF — exchange of fund units",
    transactionType: "EXCHANGE",
    amountRangeLow: usd(15_001),
    amountRangeHigh: usd(50_000),
    transactionDate: new Date(Date.now() - 13 * DAY),
    filedDate: new Date(Date.now() - 6 * DAY),
  },
  {
    id: "mock-disc-7",
    representative: "Tommy Tuberville",
    chamber: "SENATE",
    symbol: "LMT",
    assetDescription: "Lockheed Martin Corporation — Common Stock",
    transactionType: "PURCHASE",
    amountRangeLow: usd(250_001),
    amountRangeHigh: usd(500_000),
    transactionDate: new Date(Date.now() - 14 * DAY),
    filedDate: new Date(Date.now() - 7 * DAY),
  },
  {
    id: "mock-disc-8",
    representative: "Sheldon Whitehouse",
    chamber: "SENATE",
    symbol: "AMZN",
    assetDescription: "Amazon.com, Inc. — Common Stock",
    transactionType: "SALE",
    amountRangeLow: usd(1_001),
    amountRangeHigh: usd(15_000),
    transactionDate: new Date(Date.now() - 16 * DAY),
    filedDate: new Date(Date.now() - 8 * DAY),
  },
  {
    id: "mock-disc-9",
    representative: "Markwayne Mullin",
    chamber: "SENATE",
    symbol: "XOM",
    assetDescription: "Exxon Mobil Corporation — Common Stock",
    transactionType: "PURCHASE",
    amountRangeLow: usd(15_001),
    amountRangeHigh: usd(50_000),
    transactionDate: new Date(Date.now() - 18 * DAY),
    filedDate: new Date(Date.now() - 9 * DAY),
  },
  {
    id: "mock-disc-10",
    representative: "Gary Peters",
    chamber: "SENATE",
    symbol: "JPM",
    assetDescription: "JPMorgan Chase & Co. — Common Stock",
    transactionType: "SALE",
    amountRangeLow: usd(50_001),
    amountRangeHigh: usd(100_000),
    transactionDate: new Date(Date.now() - 21 * DAY),
    filedDate: new Date(Date.now() - 11 * DAY),
  },
];
