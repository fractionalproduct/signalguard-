import type { RawItem } from "@signalguard/signals";

import type { Connector } from "./connector.js";

/** One channel post as the bot client yields it. */
export interface TelegramMessage {
  /** Telegram update_id — monotonic; the cursor and ordering key. */
  updateId: number;
  /** Message id within the channel. */
  messageId: number;
  /** When the post was published. */
  date: Date;
  text: string;
}

/**
 * Minimal Telegram seam. The real impl wraps the Bot API; tests inject a fake.
 *
 * Compliance note (AGENTS.md §15): a bot only receives `channel_post` updates
 * for channels it has been **added to as admin** — there is no arbitrary
 * public-channel read, and no scraping.
 */
export interface TelegramBotClient {
  /**
   * New posts for one channel. `channel` is the @username or numeric chat id.
   * `sinceUpdateId` is the cursor — return only posts with a greater update_id.
   */
  getChannelMessages(channel: string, sinceUpdateId?: number): Promise<TelegramMessage[]>;
}

export interface TelegramConnectorOptions {
  /** Highest update_id already ingested for this channel. */
  sinceUpdateId?: number;
}

/**
 * Reads new posts from ONE Telegram channel via a bot the owner controls.
 * Read-only; one instance = one channel. Cursor + dedupe keep re-polls cheap.
 */
export class TelegramConnector implements Connector {
  readonly kind = "TELEGRAM" as const;

  constructor(
    private readonly client: TelegramBotClient,
    private readonly channel: string,
    private readonly options: TelegramConnectorOptions = {},
  ) {}

  async fetch(): Promise<RawItem[]> {
    const messages = await this.client.getChannelMessages(
      this.channel,
      this.options.sinceUpdateId,
    );
    return messages.map((m) => ({
      rawText: m.text,
      publishedAt: m.date,
      metadata: { channel: this.channel, updateId: m.updateId, messageId: m.messageId },
    }));
  }
}

/** Subset of `fetch` this client needs — injectable for tests. */
export type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export interface BotApiOptions {
  token: string;
  /** Override the HTTP client (defaults to global fetch). */
  fetchImpl?: FetchLike;
  /** Base URL override (defaults to the public Bot API). */
  baseUrl?: string;
}

/**
 * Real TelegramBotClient over the Bot API `getUpdates` endpoint. Requests only
 * `channel_post` updates and filters to the requested channel. Never advances
 * the server-side offset cursor (callers track `sinceUpdateId` themselves), so
 * it is side-effect-free and safe to call per channel.
 */
export class BotApiTelegramClient implements TelegramBotClient {
  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;

  constructor(opts: BotApiOptions) {
    if (!opts.token) throw new Error("Telegram bot token is required");
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.baseUrl = opts.baseUrl ?? "https://api.telegram.org";
  }

  async getChannelMessages(
    channel: string,
    sinceUpdateId?: number,
  ): Promise<TelegramMessage[]> {
    const params = new URLSearchParams({ allowed_updates: '["channel_post"]', timeout: "0" });
    if (sinceUpdateId !== undefined) params.set("offset", String(sinceUpdateId + 1));
    const url = `${this.baseUrl}/bot${this.token}/getUpdates?${params.toString()}`;

    const res = await this.fetchImpl(url);
    const body = (await res.json()) as TelegramGetUpdatesResponse;
    if (!res.ok || !body.ok) {
      throw new Error(`Telegram getUpdates failed: ${body.description ?? "unknown error"}`);
    }

    const wanted = channel.replace(/^@/, "");
    const messages: TelegramMessage[] = [];
    for (const update of body.result ?? []) {
      const post = update.channel_post;
      if (!post) continue;
      const chat = post.chat ?? {};
      const matches = chat.username === wanted || String(chat.id) === wanted;
      const text = post.text ?? post.caption;
      if (!matches || typeof text !== "string" || text.trim() === "") continue;
      messages.push({
        updateId: update.update_id,
        messageId: post.message_id,
        date: new Date(post.date * 1000),
        text,
      });
    }
    messages.sort((a, b) => a.updateId - b.updateId);
    return messages;
  }
}

interface TelegramGetUpdatesResponse {
  ok: boolean;
  description?: string;
  result?: Array<{
    update_id: number;
    channel_post?: {
      message_id: number;
      date: number;
      text?: string;
      caption?: string;
      chat?: { id?: number | string; username?: string };
    };
  }>;
}
