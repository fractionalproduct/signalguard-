import assert from "node:assert/strict";
import { test } from "node:test";
import { isPositionMonitorEnabled } from "./position-monitor-flag";

test("default ON when the flag is unset", () => {
  assert.equal(isPositionMonitorEnabled({}), true);
});

test("falsy values pause placement", () => {
  for (const v of ["false", "0", "off", "no", "FALSE", "Off", " no "]) {
    assert.equal(
      isPositionMonitorEnabled({ POSITION_MONITOR_ENABLED: v }),
      false,
      `"${v}" should disable`,
    );
  }
});

test("truthy / other values keep it enabled", () => {
  for (const v of ["true", "on", "1", "yes", "enabled", ""]) {
    assert.equal(
      isPositionMonitorEnabled({ POSITION_MONITOR_ENABLED: v }),
      true,
      `"${v}" should keep enabled`,
    );
  }
});
