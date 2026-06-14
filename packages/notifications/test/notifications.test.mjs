import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryNotificationTransport } from "../dist/index.js";

const baseEvent = {
  id: "evt_001",
  occurredAt: "2026-06-14T00:00:00.000Z",
  title: "Proposal awaiting approval",
  message: "A paper-trade proposal is ready for review.",
  severity: "info",
  type: "proposal_awaiting_approval",
  proposalId: "proposal_001",
  symbol: "SPY",
};

test("InMemoryNotificationTransport records sent notifications", async () => {
  const transport = new InMemoryNotificationTransport();

  const result = await transport.send({
    event: baseEvent,
    channels: ["in_app", "email"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.transportId, "in-memory-1");
  assert.deepEqual(result.acceptedChannels, ["in_app", "email"]);
  assert.equal(transport.sent.length, 1);
  assert.deepEqual(transport.sent[0].event, baseEvent);
});

test("InMemoryNotificationTransport can clear recorded notifications", async () => {
  const transport = new InMemoryNotificationTransport();

  await transport.send({ event: baseEvent, channels: ["in_app"] });
  transport.clear();

  assert.equal(transport.sent.length, 0);
});
