import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDisclosuresView,
  chamberLabel,
  displaySymbol,
  formatAmountRange,
  formatDateUtc,
  formatUsd,
  transactionLabel,
  type DisclosureRecord,
} from "./congress-view";

function rec(over: Partial<DisclosureRecord>): DisclosureRecord {
  return {
    id: "d1",
    representative: "Jane Member",
    chamber: "HOUSE",
    symbol: "AAPL",
    assetDescription: "Apple Inc. - Common Stock",
    transactionType: "PURCHASE",
    amountRangeLow: 100_100,
    amountRangeHigh: 1_500_000,
    transactionDate: new Date("2026-05-01T00:00:00Z"),
    filedDate: new Date("2026-05-20T00:00:00Z"),
    ...over,
  };
}

test("formatUsd renders whole dollars with thousands separators", () => {
  assert.equal(formatUsd(100_100), "$1,001");
  assert.equal(formatUsd(1_500_000), "$15,000");
  assert.equal(formatUsd(5_000_000_100), "$50,000,001");
  assert.equal(formatUsd(0), "$0");
});

test("formatAmountRange joins low and high with an en dash", () => {
  assert.equal(formatAmountRange(100_100, 1_500_000), "$1,001 – $15,000");
});

test("labels fall back gracefully", () => {
  assert.equal(chamberLabel("HOUSE"), "House");
  assert.equal(chamberLabel("MOON"), "MOON");
  assert.equal(transactionLabel("SALE"), "Sale");
  assert.equal(transactionLabel("WEIRD"), "WEIRD");
  assert.equal(displaySymbol(null), "—");
  assert.equal(displaySymbol("TSLA"), "TSLA");
});

test("formatDateUtc is deterministic UTC date-only", () => {
  assert.equal(formatDateUtc(new Date("2026-01-05T23:30:00Z")), "2026-01-05");
});

test("buildDisclosuresView groups by chamber (House before Senate), omitting empties", () => {
  const view = buildDisclosuresView([
    rec({ id: "a", chamber: "SENATE" }),
    rec({ id: "b", chamber: "HOUSE" }),
    rec({ id: "c", chamber: "HOUSE" }),
  ]);
  assert.equal(view.total, 3);
  assert.equal(view.isEmpty, false);
  assert.deepEqual(
    view.groups.map((g) => g.chamber),
    ["HOUSE", "SENATE"],
  );
  assert.equal(view.groups[0]?.rows.length, 2);
  assert.equal(view.groups[0]?.label, "House");
});

test("buildDisclosuresView preserves incoming order within a group and maps row fields", () => {
  const view = buildDisclosuresView([
    rec({ id: "first" }),
    rec({ id: "second", symbol: null, transactionType: "SALE" }),
  ]);
  const rows = view.groups[0]?.rows;
  assert.deepEqual(rows?.map((r) => r.id), ["first", "second"]);
  assert.equal(rows?.[0]?.amount, "$1,001 – $15,000");
  assert.equal(rows?.[0]?.transactionDateLabel, "2026-05-01");
  assert.equal(rows?.[0]?.filedDateLabel, "2026-05-20");
  assert.equal(rows?.[1]?.symbol, "—");
  assert.equal(rows?.[1]?.transaction, "Sale");
});

test("empty input yields an empty view", () => {
  const view = buildDisclosuresView([]);
  assert.equal(view.isEmpty, true);
  assert.equal(view.total, 0);
  assert.deepEqual(view.groups, []);
});
