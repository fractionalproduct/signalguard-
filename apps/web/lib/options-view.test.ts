import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatOptionContract,
  buildOptionPositionView,
  type OptionContractInput,
  type OptionPositionWithContractInput,
} from "./options-view";

function contract(
  overrides: Partial<OptionContractInput> = {},
): OptionContractInput {
  return {
    id: "c_meta",
    occSymbol: "META260718C00720000",
    underlying: "META",
    right: "CALL",
    strikeCents: 72000,
    expiration: new Date("2026-07-18T00:00:00.000Z"),
    multiplier: 100,
    ...overrides,
  };
}

function row(
  positionOverrides: Partial<OptionPositionWithContractInput["position"]> = {},
  contractOverrides: Partial<OptionContractInput> = {},
): OptionPositionWithContractInput {
  return {
    position: {
      id: "p_meta",
      contracts: 2,
      avgPremiumPaidCents: 1250, // $12.50 / share
      premiumPaidCents: 250000, // $2,500.00 total = max loss
      status: "OPEN",
      openedAt: new Date("2026-06-10T15:00:00.000Z"),
      closedAt: null,
      ...positionOverrides,
    },
    contract: contract(contractOverrides),
  };
}

test("formatOptionContract: a whole-dollar CALL renders the example label", () => {
  assert.equal(formatOptionContract(contract()), "META 2026-07-18 $720 CALL");
});

test("formatOptionContract: a PUT renders the PUT right", () => {
  const label = formatOptionContract(
    contract({ underlying: "SPY", right: "PUT", strikeCents: 45000 }),
  );
  assert.equal(label, "SPY 2026-07-18 $450 PUT");
});

test("formatOptionContract: a fractional strike keeps the cents", () => {
  const label = formatOptionContract(contract({ strikeCents: 750 })); // $7.50
  assert.equal(label, "META 2026-07-18 $7.50 CALL");
});

test("formatOptionContract: the multiplier is NOT in the label", () => {
  const label = formatOptionContract(contract({ multiplier: 100 }));
  assert.ok(!label.includes("100"), "label must not fold in the multiplier");
});

test("buildOptionPositionView: a row's costBasis is the premium paid (max loss)", () => {
  const { rows } = buildOptionPositionView([row()]);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.costBasis, "$2,500.00"); // premiumPaidCents formatted directly
  assert.equal(r.costBasisCents, 250000); // numeric source for summing rows
  assert.equal(r.avgPremium, "$12.50"); // per-share average
  assert.equal(r.contracts, 2);
  assert.equal(r.label, "META 2026-07-18 $720 CALL");
  assert.equal(r.right, "CALL");
  assert.equal(r.underlying, "META");
});

test("buildOptionPositionView: the multiplier is surfaced on the row (not in the label)", () => {
  const { rows } = buildOptionPositionView([row()]);
  assert.equal(rows[0].multiplier, 100);
  assert.ok(!rows[0].label.includes("100"), "multiplier stays out of the label");
});

test("buildOptionPositionView: openedAt is a full ISO string, expiration is YYYY-MM-DD", () => {
  const { rows } = buildOptionPositionView([row()]);
  assert.equal(rows[0].openedAt, "2026-06-10T15:00:00.000Z");
  assert.equal(rows[0].expiration, "2026-07-18");
});

test("buildOptionPositionView: a PUT row carries right=PUT", () => {
  const { rows } = buildOptionPositionView([
    row({}, { right: "PUT", strikeCents: 45000, underlying: "SPY" }),
  ]);
  assert.equal(rows[0].right, "PUT");
  assert.equal(rows[0].label, "SPY 2026-07-18 $450 PUT");
});

test("buildOptionPositionView: empty input yields empty rows", () => {
  assert.deepEqual(buildOptionPositionView([]), { rows: [] });
});
