import { test } from "node:test";
import assert from "node:assert/strict";
import { HumanReviewQueue } from "./review.js";

function sample() {
  return {
    runId: "r1",
    agentId: "a",
    agentVersion: "v1",
    reason: "low confidence",
    output: { summary: "x" },
    confidence: 0.3,
  };
}

test("enqueues pending items", () => {
  const q = new HumanReviewQueue();
  const item = q.enqueue(sample());
  assert.equal(item.status, "pending");
  assert.equal(q.pending().length, 1);
});

test("approve/reject moves an item out of pending", () => {
  const q = new HumanReviewQueue();
  const item = q.enqueue(sample());
  q.decide(item.id, "approved");
  assert.equal(q.get(item.id).status, "approved");
  assert.equal(q.pending().length, 0);
});

test("cannot decide twice", () => {
  const q = new HumanReviewQueue();
  const item = q.enqueue(sample());
  q.decide(item.id, "rejected");
  assert.throws(() => q.decide(item.id, "approved"), /already rejected/);
});
