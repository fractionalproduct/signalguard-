import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHistogram, buildSparkline } from "./sparkline-view";

test("buildSparkline returns null path for empty input", () => {
  const out = buildSparkline([]);
  assert.equal(out.path, null);
  assert.equal(out.minValue, 0);
  assert.equal(out.maxValue, 0);
  assert.equal(out.referenceLines.length, 0);
});

test("buildSparkline returns null path when every entry is null", () => {
  const out = buildSparkline([null, null, null]);
  assert.equal(out.path, null);
});

test("buildSparkline draws a single M+L path for a normal rising series", () => {
  const out = buildSparkline([1, 2, 3, 4, 5], {
    width: 100,
    height: 100,
    padding: 0,
  });
  // 5 points, M then 4 L commands.
  const moves = out.path?.split(" ") ?? [];
  assert.equal(moves.length, 5);
  assert.ok(moves[0]?.startsWith("M"));
  assert.ok(moves[1]?.startsWith("L"));
  assert.ok(moves[4]?.startsWith("L"));
  // First point at x=0, last at x=100 (uniform).
  assert.match(moves[0]!, /^M0,/);
  assert.match(moves[4]!, /^L100,/);
});

test("buildSparkline breaks the path on null gaps", () => {
  // Sequence: value, null, value -> two M's, no L bridging the gap.
  const out = buildSparkline([1, null, 3], {
    width: 100,
    height: 100,
    padding: 0,
  });
  const tokens = out.path?.split(" ") ?? [];
  // Two emitted points, both with M (the second M resumes after the gap).
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0]?.startsWith("M"));
  assert.ok(tokens[1]?.startsWith("M"));
});

test("buildSparkline centers a flat series vertically", () => {
  const out = buildSparkline([10, 10, 10], {
    width: 100,
    height: 100,
    padding: 0,
  });
  // All y values should be at the center (50).
  const ys = out.path
    ?.split(" ")
    .map((token) => Number(token.replace(/[ML]/, "").split(",")[1]));
  assert.deepEqual(ys, [50, 50, 50]);
});

test("buildSparkline folds reference values into min/max range and emits ref lines", () => {
  const out = buildSparkline([40, 50, 60], {
    width: 100,
    height: 100,
    padding: 0,
    referenceValues: [
      { value: 30, label: "oversold" },
      { value: 70, label: "overbought" },
    ],
  });
  assert.equal(out.minValue, 30);
  assert.equal(out.maxValue, 70);
  assert.equal(out.referenceLines.length, 2);
  // y at value 30 (the min) should be at the bottom (100), and y at 70 at top (0).
  const oversold = out.referenceLines.find((r) => r.label === "oversold");
  const overbought = out.referenceLines.find((r) => r.label === "overbought");
  assert.equal(oversold?.y, 100);
  assert.equal(overbought?.y, 0);
});

test("buildHistogram returns no bars on empty / all-null input", () => {
  assert.equal(buildHistogram([]).bars.length, 0);
  assert.equal(buildHistogram([null, null]).bars.length, 0);
});

test("buildHistogram emits positive bars above zero and negative below", () => {
  const out = buildHistogram([1, -1, 0, 2, -2], {
    width: 100,
    height: 100,
    padding: 0,
  });
  // 0-value slot is skipped per the spec (no bar for zero).
  assert.equal(out.bars.length, 4);
  const signs = out.bars.map((b) => b.sign);
  assert.deepEqual(signs, ["positive", "negative", "positive", "negative"]);
  // zeroY at the vertical center for this geometry.
  assert.equal(out.zeroY, 50);
  // Positive bars start above zero; negative start at zero.
  for (const bar of out.bars) {
    if (bar.sign === "positive") {
      assert.ok(bar.y < out.zeroY);
    } else {
      assert.equal(bar.y, out.zeroY);
    }
  }
});

test("buildHistogram skips null entries without shifting other bars", () => {
  // Slot indexes 0, 1 null, 2, 3 null, 4 -> 3 bars at positions 0/4, 2/4, 4/4.
  const out = buildHistogram([1, null, 2, null, 3], {
    width: 100,
    height: 100,
    padding: 0,
  });
  assert.equal(out.bars.length, 3);
  // Each emitted bar should be roughly proportional to its value (1, 2, 3 of 3).
  const heights = out.bars.map((b) => b.height);
  assert.ok(heights[0]! < heights[1]!);
  assert.ok(heights[1]! < heights[2]!);
});
