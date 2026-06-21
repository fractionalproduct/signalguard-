import assert from "node:assert/strict";
import test from "node:test";
import { mapInsiderTransactions } from "./alphavantage-insider";

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    transaction_date: "2026-06-01",
    ticker: "IBM",
    executive: "JANE DOE",
    executive_title: "CFO",
    security_type: "Common Stock",
    acquisition_or_disposal: "A",
    shares: "100.0",
    share_price: "45.67",
    ...over,
  };
}

test("maps acquisition_or_disposal 'A' to ACQUIRE", () => {
  const got = mapInsiderTransactions({ data: [row({ acquisition_or_disposal: "A" })] });
  assert.equal(got.length, 1);
  assert.equal(got[0].type, "ACQUIRE");
});

test("maps acquisition_or_disposal 'D' to DISPOSE", () => {
  const got = mapInsiderTransactions({ data: [row({ acquisition_or_disposal: "D" })] });
  assert.equal(got.length, 1);
  assert.equal(got[0].type, "DISPOSE");
});

test("converts share_price dollars to integer cents", () => {
  const got = mapInsiderTransactions({ data: [row({ share_price: "45.67" })] });
  assert.equal(got[0].priceCents, 4567);
});

test("rounds fractional cents to the nearest cent", () => {
  const got = mapInsiderTransactions({ data: [row({ share_price: "10.005" })] });
  // 10.005 * 100 = 1000.4999... -> Math.round -> 1000 (float), still an integer
  assert.ok(Number.isInteger(got[0].priceCents));
});

test("parses shares as a number", () => {
  const got = mapInsiderTransactions({ data: [row({ shares: "123.0" })] });
  assert.equal(got[0].shares, 123);
});

test("skips rows whose shares are NaN", () => {
  const got = mapInsiderTransactions({
    data: [row({ shares: "not-a-number" }), row({ shares: "50" })],
  });
  assert.equal(got.length, 1);
  assert.equal(got[0].shares, 50);
});

test("skips rows whose share_price is NaN", () => {
  const got = mapInsiderTransactions({
    data: [row({ share_price: "bad" }), row({ share_price: "12.00" })],
  });
  assert.equal(got.length, 1);
  assert.equal(got[0].priceCents, 1200);
});

test("skips rows with an unknown acquisition_or_disposal code", () => {
  const got = mapInsiderTransactions({
    data: [row({ acquisition_or_disposal: "X" }), row({ acquisition_or_disposal: "D" })],
  });
  assert.equal(got.length, 1);
  assert.equal(got[0].type, "DISPOSE");
});

test("returns [] when there is no data array", () => {
  assert.deepEqual(mapInsiderTransactions({}), []);
  assert.deepEqual(mapInsiderTransactions(null), []);
  assert.deepEqual(mapInsiderTransactions("nope"), []);
});

test("treats an AlphaVantage error/limit object (no data array) as []", () => {
  assert.deepEqual(
    mapInsiderTransactions({ Information: "rate limit reached" }),
    [],
  );
  assert.deepEqual(mapInsiderTransactions({ Note: "throttled" }), []);
  assert.deepEqual(
    mapInsiderTransactions({ "Error Message": "invalid symbol" }),
    [],
  );
});

test("preserves executive, title, and date strings", () => {
  const got = mapInsiderTransactions({
    data: [
      row({
        executive: "JOHN SMITH",
        executive_title: "CEO",
        transaction_date: "2026-05-15",
      }),
    ],
  });
  assert.equal(got[0].executive, "JOHN SMITH");
  assert.equal(got[0].title, "CEO");
  assert.equal(got[0].date, "2026-05-15");
});

test("defaults missing string fields to empty strings", () => {
  const got = mapInsiderTransactions({
    data: [{ acquisition_or_disposal: "A", shares: "10", share_price: "1.00" }],
  });
  assert.equal(got.length, 1);
  assert.equal(got[0].executive, "");
  assert.equal(got[0].title, "");
  assert.equal(got[0].date, "");
});
