import { test } from "node:test";
import assert from "node:assert/strict";
import { PromptRegistry } from "./prompts.js";

test("stores versions and returns the active one", () => {
  const reg = new PromptRegistry();
  reg.add({ agentId: "a", version: "v1", body: "old", active: false });
  reg.add({ agentId: "a", version: "v2", body: "new", active: true });
  assert.equal(reg.getActive("a").version, "v2");
  assert.equal(reg.listVersions("a").length, 2);
});

test("versions are immutable (no overwrite)", () => {
  const reg = new PromptRegistry();
  reg.add({ agentId: "a", version: "v1", body: "x", active: true });
  assert.throws(
    () => reg.add({ agentId: "a", version: "v1", body: "y", active: false }),
    /immutable/,
  );
});

test("only one active version per agent", () => {
  const reg = new PromptRegistry();
  reg.add({ agentId: "a", version: "v1", body: "x", active: true });
  assert.throws(
    () => reg.add({ agentId: "a", version: "v2", body: "y", active: true }),
    /already has an active prompt/,
  );
});

test("getActive throws when none active", () => {
  const reg = new PromptRegistry();
  reg.add({ agentId: "a", version: "v1", body: "x", active: false });
  assert.throws(() => reg.getActive("a"), /No active prompt/);
});
