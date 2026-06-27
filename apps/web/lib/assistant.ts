/**
 * The owner-facing chat assistant. The assistant answers questions about the
 * paper portfolio, a symbol's latest analysis snapshot, and the proposal queue
 * (read-only tools, Slice 1), and can DRAFT a trade proposal for a symbol via
 * the existing analysis gate (propose_trade, Slice 2). It NEVER sizes the final
 * order or executes a trade.
 *
 * Design invariant for this whole feature:
 *   every tool either READS data, or CREATES a proposal the owner must approve.
 *   No tool ever calls an execution client. propose_trade creates a DRAFT
 *   proposal — DRAFT is owner-approvable but is NOT in autopilot's selection set
 *   (autopilot lists only PENDING_APPROVAL), so an assistant-drafted trade can
 *   never auto-approve or auto-execute. Approval (and the order it triggers) is
 *   always an explicit owner act on the Proposals page.
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
  "Drafting a trade: when the owner asks to buy or trade a symbol, call propose_trade. It runs the analysis gate for that symbol and, if the setup passes, adds a long-entry proposal to the queue for the owner to approve. The gate computes the entry, stop, target, and size — you do NOT choose them. It is long-only; arbitrary share counts, short sells, and conditional exits like 'sell if it dips 15%' are not supported yet, so say so plainly if asked.",
  "",
  "The gate may DECLINE (no proposal created). Report what actually happened from the tool result — 'I've added an AAPL proposal to your queue; approve it on the Proposals page' vs 'the gate declined, so I didn't create one' — never imply a trade was queued when it wasn't.",
  "",
  "You can DRAFT proposals but you cannot approve, size the final order, or execute trades, and you must never claim to. Approval and execution are the owner's, done from the Proposals page; a drafted proposal does nothing until the owner approves it.",
  "",
  "Be concise and direct. Lead with the answer. This is paper trading, so skip disclaimers.",
].join("\n");

/**
 * Tool surface. Each schema is strict (additionalProperties:false) so the model
 * can't smuggle unexpected fields. Three reads + one write: propose_trade is the
 * only mutating tool, and it only ever CREATES a DRAFT proposal (owner-approvable,
 * not autopilot-eligible). No tool reaches an execution path.
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
  {
    name: "propose_trade",
    description:
      "Draft a LONG trade proposal for one stock symbol by running the analysis gate. If the setup passes, a DRAFT proposal is added to the queue for the owner to approve (the gate computes entry/stop/target/size — not you). The gate may DECLINE and create nothing. This never sizes the final order or executes a trade. Use when the owner asks to buy or trade a symbol.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker to draft a long-entry proposal for, e.g. AAPL.",
        },
      },
      required: ["symbol"],
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
