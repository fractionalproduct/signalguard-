import assert from "node:assert/strict";
import test from "node:test";

import {
  OTHER_SECTOR,
  canonicalTheme,
  classifySymbol,
  filterByTheme,
  groupBySector,
  listThemes,
} from "./classification";

/** Unit tests for the pure symbol-classification layer (sector + themes). */

test("classifySymbol resolves a known symbol's sector and themes (sorted)", () => {
  const lmt = classifySymbol("LMT");
  assert.equal(lmt.sector, "Industrials");
  assert.deepEqual(lmt.themes, ["Defense"]);

  // A symbol can carry several themes; they come back sorted.
  const nvda = classifySymbol("NVDA");
  assert.equal(nvda.sector, "Technology");
  assert.deepEqual(nvda.themes, ["Big Tech", "Semiconductors"]);
});

test("classifySymbol is case/space-insensitive", () => {
  assert.deepEqual(classifySymbol("  sq "), classifySymbol("SQ"));
  assert.equal(classifySymbol("sq").themes.includes("Fintech"), true);
});

test("unknown symbol falls back to Other sector and no themes (never dropped)", () => {
  const x = classifySymbol("ZZZZ");
  assert.equal(x.sector, OTHER_SECTOR);
  assert.deepEqual(x.themes, []);
});

test("groupBySector sorts sectors alphabetically with Other pinned last", () => {
  const rows = [
    { symbol: "ZZZZ" }, // Other
    { symbol: "LMT" }, // Industrials
    { symbol: "AAPL" }, // Technology
    { symbol: "JPM" }, // Financials
  ];
  const groups = groupBySector(rows);
  assert.deepEqual(
    groups.map((g) => g.sector),
    ["Financials", "Industrials", "Technology", OTHER_SECTOR],
  );
});

test("groupBySector preserves incoming row order within a sector", () => {
  const rows = [{ symbol: "AAPL" }, { symbol: "MSFT" }, { symbol: "NVDA" }];
  const tech = groupBySector(rows).find((g) => g.sector === "Technology");
  assert.deepEqual(tech?.rows.map((r) => r.symbol), ["AAPL", "MSFT", "NVDA"]);
});

test("filterByTheme keeps only symbols carrying the theme; blank = no filter", () => {
  const rows = [{ symbol: "LMT" }, { symbol: "SQ" }, { symbol: "AAPL" }];
  assert.deepEqual(
    filterByTheme(rows, "defense").map((r) => r.symbol),
    ["LMT"],
  );
  assert.deepEqual(
    filterByTheme(rows, "fintech").map((r) => r.symbol),
    ["SQ"],
  );
  // Blank / null -> everything, as a copy.
  assert.equal(filterByTheme(rows, "").length, 3);
  assert.equal(filterByTheme(rows, null).length, 3);
});

test("listThemes returns the sorted theme labels", () => {
  const themes = listThemes();
  assert.ok(themes.includes("Fintech"));
  assert.ok(themes.includes("Defense"));
  // Sorted.
  assert.deepEqual(themes, [...themes].sort((a, b) => a.localeCompare(b)));
});

test("canonicalTheme maps a loose query value to the display label, else null", () => {
  assert.equal(canonicalTheme("defense"), "Defense");
  assert.equal(canonicalTheme("  FINTECH "), "Fintech");
  assert.equal(canonicalTheme("not-a-theme"), null);
  assert.equal(canonicalTheme(""), null);
  assert.equal(canonicalTheme(null), null);
});
