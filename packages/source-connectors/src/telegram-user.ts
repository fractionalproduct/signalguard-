import type { TelegramBotClient, TelegramMessage } from "./telegram.js";

/**
 * Telegram ingestion via a USER account (MTProto), not a bot.
 *
 * Why: the Bot API only delivers `channel_post` updates for channels the bot
 * administers — it cannot read arbitrary third-party public channels. A user
 * account (MTProto) can read any public channel it has joined, so this is the
 * path for ingesting channels the owner subscribes to (TradingView, Benzinga,
 * Stocktwits, Unusual Whales, …).
 *
 * The actual MTProto/GramJS connection is isolated behind `MtprotoReader` (an
 * injectable seam) so the mapping + cursor logic here is unit-testable without
 * GramJS. The real GramJS-backed reader is wired in the worker (slice 2), where
 * the credentials and a stable-IP host live.
 *
 * Compliance (AGENTS.md §2/§15): read-only; every post is hostile data handled
 * downstream; a `Source` still needs an approved `DataSourceConfiguration`
 * before this runs in production.
 */

/** One channel message as an MTProto reader yields it (provider-neutral). */
export interface MtprotoMessage {
  /** Per-channel message id — monotonic; the cursor and ordering key.
   * (MTProto has no global update_id like the Bot API.) */
  id: number;
  /** When the post was published. */
  date: Date;
  /** Post text (or caption); empty/whitespace posts are dropped by the client. */
  text: string;
}

/**
 * Reads messages from one channel via MTProto (a user account). The real impl
 * wraps GramJS; tests inject a fake. `minId` is the exclusive cursor — return
 * only messages with a greater id.
 */
export interface MtprotoReader {
  getMessages(channel: string, minId: number): Promise<MtprotoMessage[]>;
}

/**
 * A `TelegramBotClient` backed by a user account. Drops straight into the
 * existing `TelegramConnector` (same interface), so the connector, RawItem
 * mapping, dedupe, and the whole Signal→Proposal pipeline are unchanged. The
 * Bot API's `update_id` cursor is represented here by the per-channel
 * `message_id` (used for both `updateId` and `messageId`).
 */
export class UserApiTelegramClient implements TelegramBotClient {
  constructor(private readonly reader: MtprotoReader) {}

  async getChannelMessages(
    channel: string,
    sinceUpdateId?: number,
  ): Promise<TelegramMessage[]> {
    const minId = sinceUpdateId ?? 0;
    const handle = channel.replace(/^@/, "");
    const messages = await this.reader.getMessages(handle, minId);
    return messages
      .filter(
        (m) =>
          m.id > minId && typeof m.text === "string" && m.text.trim() !== "",
      )
      .map((m) => ({
        updateId: m.id,
        messageId: m.id,
        date: m.date,
        text: m.text,
      }))
      .sort((a, b) => a.updateId - b.updateId);
  }
}
