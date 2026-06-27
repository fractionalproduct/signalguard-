import assert from "node:assert/strict";
import test from "node:test";
import {
  UserApiTelegramClient,
  type MtprotoMessage,
  type MtprotoReader,
} from "../src/telegram-user.js";

function fakeReader(messages: MtprotoMessage[]): MtprotoReader {
  return {
    async getMessages(_channel, minId) {
      // The real reader filters by minId server-side; the fake returns all so
      // the client's own cursor filter is exercised.
      void minId;
      return messages;
    },
  };
}

const d = (s: string) => new Date(s);

test("maps MTProto messages to TelegramMessage with id as the cursor", async () => {
  const client = new UserApiTelegramClient(
    fakeReader([
      { id: 11, date: d("2026-06-19T10:00:00Z"), text: "AAPL breaking out" },
      { id: 12, date: d("2026-06-19T10:05:00Z"), text: "NVDA flow heavy" },
    ]),
  );
  const out = await client.getChannelMessages("@somechannel");
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((m) => [m.updateId, m.messageId, m.text]),
    [
      [11, 11, "AAPL breaking out"],
      [12, 12, "NVDA flow heavy"],
    ],
  );
});

test("strips a leading @ from the channel handle", async () => {
  let seen = "";
  const reader: MtprotoReader = {
    async getMessages(channel) {
      seen = channel;
      return [];
    },
  };
  await new UserApiTelegramClient(reader).getChannelMessages("@Benzinga");
  assert.equal(seen, "Benzinga");
});

test("the cursor is exclusive — only ids greater than sinceUpdateId pass", async () => {
  const client = new UserApiTelegramClient(
    fakeReader([
      { id: 5, date: d("2026-06-19T09:00:00Z"), text: "old" },
      { id: 6, date: d("2026-06-19T09:01:00Z"), text: "boundary" },
      { id: 7, date: d("2026-06-19T09:02:00Z"), text: "new" },
    ]),
  );
  const out = await client.getChannelMessages("c", 6);
  assert.deepEqual(out.map((m) => m.text), ["new"]);
});

test("drops empty / whitespace-only posts (e.g. media with no caption)", async () => {
  const client = new UserApiTelegramClient(
    fakeReader([
      { id: 1, date: d("2026-06-19T09:00:00Z"), text: "" },
      { id: 2, date: d("2026-06-19T09:01:00Z"), text: "   " },
      { id: 3, date: d("2026-06-19T09:02:00Z"), text: "real signal" },
    ]),
  );
  const out = await client.getChannelMessages("c");
  assert.deepEqual(out.map((m) => m.text), ["real signal"]);
});

test("returns messages ascending by id regardless of reader order", async () => {
  const client = new UserApiTelegramClient(
    fakeReader([
      { id: 20, date: d("2026-06-19T11:00:00Z"), text: "third" },
      { id: 10, date: d("2026-06-19T10:00:00Z"), text: "first" },
      { id: 15, date: d("2026-06-19T10:30:00Z"), text: "second" },
    ]),
  );
  const out = await client.getChannelMessages("c");
  assert.deepEqual(out.map((m) => m.updateId), [10, 15, 20]);
});
