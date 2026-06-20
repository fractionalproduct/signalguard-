import assert from "node:assert/strict";
import { test } from "node:test";
import { formatOccSymbol, parseOccSymbol } from "./occ.js";

test("formatOccSymbol builds the META example from the docs", () => {
  assert.equal(
    formatOccSymbol({
      underlying: "META",
      expiration: new Date(Date.UTC(2026, 6, 18)), // 2026-07-18
      right: "CALL",
      strikeCents: 72000, // $720.00
    }),
    "META260718C00720000",
  );
});

test("formatOccSymbol builds the F fractional-strike example", () => {
  assert.equal(
    formatOccSymbol({
      underlying: "F",
      expiration: new Date(Date.UTC(2026, 0, 16)), // 2026-01-16
      right: "PUT",
      strikeCents: 750, // $7.50
    }),
    "F260116P00007500",
  );
});

test("formatOccSymbol uppercases the root", () => {
  assert.equal(
    formatOccSymbol({
      underlying: "meta",
      expiration: new Date(Date.UTC(2026, 6, 18)),
      right: "CALL",
      strikeCents: 72000,
    }),
    "META260718C00720000",
  );
});

test("parseOccSymbol parses the META example", () => {
  const parts = parseOccSymbol("META260718C00720000");
  assert.ok(parts !== null);
  assert.equal(parts.underlying, "META");
  assert.equal(parts.right, "CALL");
  assert.equal(parts.strikeCents, 72000);
  assert.equal(parts.expiration.toISOString(), "2026-07-18T00:00:00.000Z");
});

test("parseOccSymbol parses the F fractional-strike example", () => {
  const parts = parseOccSymbol("F260116P00007500");
  assert.ok(parts !== null);
  assert.equal(parts.underlying, "F");
  assert.equal(parts.right, "PUT");
  assert.equal(parts.strikeCents, 750);
  assert.equal(parts.expiration.toISOString(), "2026-01-16T00:00:00.000Z");
});

test("format∘parse round-trips the OCC string for several contracts", () => {
  for (const occ of [
    "META260718C00720000",
    "F260116P00007500",
    "SPXW261218P05000000",
    "AAPL270115C00150500",
  ]) {
    const parts = parseOccSymbol(occ);
    assert.ok(parts !== null, `parse failed for ${occ}`);
    assert.equal(formatOccSymbol(parts), occ);
  }
});

test("parse∘format round-trips the object form (UTC-midnight Date)", () => {
  const original = {
    underlying: "TSLA",
    expiration: new Date(Date.UTC(2026, 11, 18)),
    right: "PUT" as const,
    strikeCents: 30000,
  };
  const reparsed = parseOccSymbol(formatOccSymbol(original));
  assert.deepEqual(reparsed, original);
});

test("parseOccSymbol returns null on malformed input", () => {
  assert.equal(parseOccSymbol(""), null);
  assert.equal(parseOccSymbol("NOTANOPTION"), null);
  assert.equal(parseOccSymbol("META260718X00720000"), null); // bad right
  assert.equal(parseOccSymbol("META2607C00720000"), null); // short date
  assert.equal(parseOccSymbol("META260718C0072000"), null); // 7-digit strike
  assert.equal(parseOccSymbol("meta260718C00720000"), null); // lowercase root
  assert.equal(parseOccSymbol("META261318C00720000"), null); // month 13
});
