import assert from "node:assert/strict";
import test from "node:test";

import type { DataSourceApprovalStatus } from "@signalguard/domain";

import {
  BotApiTelegramClient,
  TelegramConnector,
  runConnector,
  type FetchLike,
  type LicensingInfo,
  type TelegramBotClient,
  type TelegramMessage,
} from "../src/index.js";

const lic = (approvalStatus: DataSourceApprovalStatus): LicensingInfo => ({
  provider: "Telegram",
  dataset: "@chan",
  approvalStatus,
});

function fakeClient(messages: TelegramMessage[]): TelegramBotClient & { lastSince?: number } {
  const client = {
    lastSince: undefined as number | undefined,
    async getChannelMessages(_channel: string, since?: number) {
      client.lastSince = since;
      return messages;
    },
  };
  return client;
}

const msg = (over: Partial<TelegramMessage>): TelegramMessage => ({
  updateId: 1,
  messageId: 10,
  date: new Date("2026-06-15T12:00:00Z"),
  text: "AAPL looks strong",
  ...over,
});

test("TelegramConnector reports kind TELEGRAM and maps posts to RawItems", async () => {
  const connector = new TelegramConnector(fakeClient([msg({})]), "@chan");
  assert.equal(connector.kind, "TELEGRAM");

  const items = await connector.fetch();
  assert.equal(items.length, 1);
  assert.equal(items[0]?.rawText, "AAPL looks strong");
  assert.deepEqual(items[0]?.metadata, { channel: "@chan", updateId: 1, messageId: 10 });
});

test("TelegramConnector passes the sinceUpdateId cursor through", async () => {
  const client = fakeClient([]);
  await new TelegramConnector(client, "@chan", { sinceUpdateId: 42 }).fetch();
  assert.equal(client.lastSince, 42);
});

test("runs through the licensing gate + dedupe", async () => {
  const connector = new TelegramConnector(
    fakeClient([msg({ updateId: 1, text: "dup" }), msg({ updateId: 2, text: "dup" })]),
    "@chan",
  );
  const result = await runConnector(connector, lic("APPROVED_FOR_PRODUCTION"), {
    env: "production",
  });
  assert.equal(result.items.length, 1); // identical text deduped
  assert.equal(result.duplicatesDropped, 1);
});

// --- BotApiTelegramClient (injected fetch — no network) -----------------------

function fetchReturning(body: unknown, ok = true): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    return { ok, json: async () => body };
  };
  return { fetchImpl, urls };
}

test("BotApiTelegramClient requires a token", () => {
  assert.throws(() => new BotApiTelegramClient({ token: "" }), /token is required/);
});

test("BotApiTelegramClient builds the right getUpdates URL with offset", async () => {
  const { fetchImpl, urls } = fetchReturning({ ok: true, result: [] });
  const client = new BotApiTelegramClient({ token: "T", fetchImpl, baseUrl: "https://api.test" });
  await client.getChannelMessages("@chan", 99);

  const url = urls[0] ?? "";
  assert.match(url, /^https:\/\/api\.test\/botT\/getUpdates\?/);
  assert.match(url, /offset=100/); // sinceUpdateId + 1
  assert.match(url, /channel_post/);
});

test("BotApiTelegramClient parses channel_post, filters by channel, skips non-text", async () => {
  const { fetchImpl } = fetchReturning({
    ok: true,
    result: [
      {
        update_id: 5,
        channel_post: {
          message_id: 1,
          date: 1_780_000_000,
          text: "in scope",
          chat: { id: -100, username: "chan" },
        },
      },
      {
        update_id: 6,
        channel_post: {
          message_id: 2,
          date: 1_780_000_100,
          text: "other channel",
          chat: { username: "somewhere_else" },
        },
      },
      {
        update_id: 7,
        channel_post: { message_id: 3, date: 1_780_000_200, chat: { username: "chan" } },
      },
    ],
  });
  const client = new BotApiTelegramClient({ token: "T", fetchImpl });

  const messages = await client.getChannelMessages("@chan");
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.text, "in scope");
  assert.equal(messages[0]?.updateId, 5);
  assert.equal(messages[0]?.date.getTime(), 1_780_000_000 * 1000);
});

test("BotApiTelegramClient throws on an API error response", async () => {
  const { fetchImpl } = fetchReturning({ ok: false, description: "Unauthorized" });
  const client = new BotApiTelegramClient({ token: "T", fetchImpl });
  await assert.rejects(client.getChannelMessages("@chan"), /Unauthorized/);
});
