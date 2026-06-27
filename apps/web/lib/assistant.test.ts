import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSISTANT_MODEL,
  ASSISTANT_SYSTEM,
  ASSISTANT_TOOLS,
  ASSISTANT_TOOL_NAMES,
  buildAssistantRequest,
  extractAssistantText,
  toProviderMessages,
} from "./assistant";

/**
 * Unit tests for the PURE half of the read-only assistant: the request shape,
 * the tool schemas (strict, no smuggled fields), the transcript mapping, and
 * text extraction. The I/O tool-loop lives in the server action and is not
 * exercised here.
 */

test("buildAssistantRequest pins the model, adaptive thinking, system, and tools", () => {
  const req = buildAssistantRequest([{ role: "user", content: "hi" }]);
  assert.equal(req.model, ASSISTANT_MODEL);
  assert.deepEqual(req.thinking, { type: "adaptive" });
  assert.equal(req.system, ASSISTANT_SYSTEM);
  assert.equal(req.tools, ASSISTANT_TOOLS);
  assert.deepEqual(req.messages, [{ role: "user", content: "hi" }]);
  // max_tokens is bounded (an interactive turn, not a long generation).
  assert.equal(typeof req.max_tokens, "number");
  assert.ok((req.max_tokens as number) > 0);
});

test("every tool schema is strict and well-formed", () => {
  for (const tool of ASSISTANT_TOOLS) {
    assert.equal(typeof tool.name, "string");
    assert.ok(tool.description.length > 0, `${tool.name} needs a description`);
    const schema = tool.input_schema;
    assert.equal(schema.type, "object");
    // Strict: the model cannot add fields we don't dispatch on.
    assert.equal(schema.additionalProperties, false, `${tool.name} must be strict`);
    assert.ok(Array.isArray(schema.required));
    // Every required key must actually be declared in properties.
    for (const key of schema.required) {
      assert.ok(
        key in schema.properties,
        `${tool.name}: required "${key}" missing from properties`,
      );
    }
  }
});

test("get_research requires a symbol; the read-only tools take no args", () => {
  const byName = new Map(ASSISTANT_TOOLS.map((t) => [t.name, t]));
  assert.deepEqual(byName.get("get_research")?.input_schema.required, ["symbol"]);
  assert.deepEqual(byName.get("get_portfolio")?.input_schema.required, []);
  assert.deepEqual(byName.get("list_proposals")?.input_schema.required, []);
});

test("tool names are unique and exported in sync", () => {
  const names = ASSISTANT_TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length, "tool names must be unique");
  assert.deepEqual(ASSISTANT_TOOL_NAMES, names);
});

test("the system prompt holds the two safety lanes", () => {
  // Report-don't-advise lane and the never-execute lane must both be present —
  // these are load-bearing, not decoration.
  assert.match(ASSISTANT_SYSTEM, /deterministic/i);
  assert.match(ASSISTANT_SYSTEM, /cannot place, size, cancel, or execute/i);
});

test("toProviderMessages maps text turns 1:1", () => {
  assert.deepEqual(
    toProviderMessages([
      { role: "user", text: "how is AAPL" },
      { role: "assistant", text: "Pulling it up." },
    ]),
    [
      { role: "user", content: "how is AAPL" },
      { role: "assistant", content: "Pulling it up." },
    ],
  );
});

test("extractAssistantText joins text blocks and ignores thinking/tool_use", () => {
  const text = extractAssistantText({
    content: [
      { type: "thinking", text: "(hidden reasoning)" },
      { type: "text", text: "Your AAPL position is up 3%." },
      { type: "tool_use", text: undefined },
      { type: "text", text: "No pending proposals." },
    ],
  });
  assert.equal(text, "Your AAPL position is up 3%.\nNo pending proposals.");
});

test("extractAssistantText returns empty string when there is no text block", () => {
  assert.equal(extractAssistantText({ content: [{ type: "tool_use" }] }), "");
  assert.equal(extractAssistantText({}), "");
});
