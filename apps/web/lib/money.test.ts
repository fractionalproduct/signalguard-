import { test } from "node:test";
import assert from "node:assert/strict";
import {
  centsToDollars,
  formatUsd,
  formatSignedUsd,
  signClass,
  formatQuantity,
  formatPercentOf,
} from "./money";

test("centsToDollars converts integer cents", () => {
  assert.equal(centsToDollars(123456), 1234.56);
  assert.equal(centsToDollars(0), 0);
});

test("formatUsd formats with thousands separators", () => {
  assert.equal(formatUsd(123456), "$1,234.56");
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatUsd(-500), "-$5.00");
});

test("formatSignedUsd carries an explicit sign except at zero", () => {
  assert.equal(formatSignedUsd(1200), "+$12.00");
  assert.equal(formatSignedUsd(-340), "-$3.40");
  assert.equal(formatSignedUsd(0), "$0.00");
});

test("signClass maps sign to a css class", () => {
  assert.equal(signClass(1), "positive");
  assert.equal(signClass(-1), "negative");
  assert.equal(signClass(0), "flat");
});

test("formatQuantity trims needless decimals", () => {
  assert.equal(formatQuantity(10), "10");
  assert.equal(formatQuantity(1.5), "1.5");
  assert.equal(formatQuantity(0.2500), "0.25");
});

test("formatPercentOf guards divide-by-zero", () => {
  assert.equal(formatPercentOf(50, 200), "25.0%");
  assert.equal(formatPercentOf(1, 0), "—");
  assert.equal(formatPercentOf(1, Number.NaN), "—");
});
