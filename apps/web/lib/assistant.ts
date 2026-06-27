/**
 * The owner-facing chat assistant — Slice 1 (READ-ONLY Q&A over real account
 * data). The assistant answers questions about the paper portfolio, a symbol's
 * latest analysis snapshot, and the proposal queue by calling read-only tools
 * that wrap the existing dashboard loaders. It NEVER places, sizes, or executes
 * a trade.
 *
 * Design invariant for this whole feature (holds across future slices):
 *   every tool either READS data, or CREATES a PENDING_APPROVAL artifact that
 *   the owner must approve. No tool in the assistant ever calls an execution
 *   client. Slice 2 will add a single `propose_trade`-style tool that routes
 *   through the existing analysis gate into the approval queue — the tool list
 *   below is the seam where it plugs in.
 *
 * This module is the PURE half (system prompt, tool schemas, request builder,
 * response extraction) so the prompt-injection boundary and request shape are
 * unit-testable without an API call. The I/O half (the tool-use loop and the
 * loader dispatch) lives in app/(dashboard)/assistant/actions.ts.
 */

/** Default to the most capable model; overridable per environment. */
export const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL ?? "claude-opus-4-8";

/** Hard cap on tool-use rounds per turn — a runaway loop can never bill forever. */
export const MAX_TOOL_ROUNDS = 5;

/**
 * System framing. Two deliberate lanes (decided, not accidental):
 *  - REPORT + EXPLAIN, don't ADVISE. The deterministic risk gate — not the LLM —
 *    decides what is tradeable; the assistant surfaces what the gate already
 *    flagged (proposals, analysis snapshots) and explains it. It does not invent
 *    its own buy/sell calls or price targets. This matches the rest of the app
 *    (see lib/ai-summary.ts: "a deterministic gate already decided; you only
 *    explain it").
 *  - NEVER claims to place or execute a trade. Discretionary order entry from
 *    the assistant does not exist yet; when it does (Slice 2) it will only ever
 *    create a proposal the owner must approve.
 */
export const ASSISTANT_SYSTEM = [
  "You are SignalGuard's assistant for a single owner running a PAPER-trading account. You help them understand their account by reading real data through your tools.",
  "",
  "Grounding: answer from tool results, not memory. If you don't have a tool that can answer, say so plainly rather than guessing. Today's prices, news, and any figure that would change the answer must come from a tool — never fabricate numbers, tickers, or dates.",
  "",
  "Lane — report and explain, do not advise: a deterministic risk gate (not you) decides what is tradeable. When asked 'what's a good buy', surface what the gate has ALREADY flagged — pending proposals and analysis snapshots — and explain them. Do not invent your own buy/sell recommendations or price targets.",
  "",
  "You cannot place, size, cancel, or execute trades, and you must never claim to. If the owner asks you to buy or sell, explain that order entry from the assistant isn't available yet; when it is, it will only create a proposal they must approve — it will never trade on its own.",
  "",
  "Be concise and direct. Lead with the answer. This is paper trading, so skip disclaimers.",
].join("\n");

/**
 * Read-only tool surface. Each schema is strict (additionalProperties:false) so
 * the model can't smuggle unexpected fields. NB: this list is the Slice-2 seam —
 * a future `propose_trade` tool (create a PENDING_APPROVAL proposal via the
 * analysis gate) is added HERE, and nowhere does a tool reach an execution path.
 */
export const ASSISTANT_TOOLS = [
  {
    name: "get_portfolio",
    description:
      "Read the owner's current paper portfolio: account equity, cash, open positions, and recent orders. Use for questions about how the account or a held position is doing.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_research",
    description:
      "Read the latest analysis snapshot(s) for one stock symbol (trend, volatility, indicators, and any flags the analysis pipeline computed). Use for questions about how a specific ticker looks.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker, e.g. AAPL. Case-insensitive.",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "list_proposals",
    description:
      "Read the trade-proposal queue: what the analysis gate has surfaced for the owner to review, with status (pending approval, approved, etc.). Use for 'what's pending' or 'what has the gate flagged'.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
] as const;

/** The set of tool names the action knows how to dispatch (kept in sync above). */
export const ASSISTANT_TOOL_NAMES = ASSISTANT_TOOLS.map((t) => t.name);

/** A provider Messages-API message (role + content; content is text or blocks). */
export interface ProviderMessage {
  role: "user" | "assistant";
  content: unknown;
}

/** The app-facing transcript turn the chat UI holds and round-trips. */
export interface AssistantTurn {
  role: "user" | "assistant";
  text: string;
}

/**
 * Build the Messages-API request body. Pure and deterministic so the request
 * shape (model, adaptive thinking, the trusted system prompt, the read-only
 * tool list) is testable without a network call. Adaptive thinking is left ON
 * (Opus 4.8 may otherwise leak reasoning into the visible answer); effort is
 * "medium" to keep an interactive assistant snappy and cheap.
 */
export function buildAssistantRequest(
  messages: ProviderMessage[],
): Record<string, unknown> {
  return {
    model: ASSISTANT_MODEL,
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: ASSISTANT_SYSTEM,
    tools: ASSISTANT_TOOLS,
    messages,
  };
}

/** Map the app transcript to provider messages (text-only turns). */
export function toProviderMessages(turns: AssistantTurn[]): ProviderMessage[] {
  return turns.map((t) => ({ role: t.role, content: t.text }));
}

interface ResponseBlock {
  type?: string;
  text?: string;
}

/**
 * Pull the visible answer out of a Messages-API response: concatenate the text
 * blocks, ignore thinking / tool_use blocks. Returns "" if there is no text.
 */
export function extractAssistantText(response: {
  content?: ResponseBlock[];
}): string {
  return (response.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();
}
