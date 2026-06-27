"use server";

import { revalidatePath } from "next/cache";
import { createAlpacaMarketDataFromEnv } from "@signalguard/alpaca-market-data";
import { recordAuditEvent } from "@signalguard/audit";
import { getDb } from "@signalguard/database";
import { getCurrentOwner } from "../../../lib/session";
import { loadPortfolioState } from "../../../lib/portfolio";
import { loadProposalsState } from "../../../lib/proposals";
import { loadResearchSymbolState } from "../../../lib/research-symbol";
import { generateAndPersistProposal } from "../../../lib/proposal-generation";
import {
  MAX_TOOL_ROUNDS,
  buildAssistantRequest,
  extractAssistantText,
  toProviderMessages,
  type AssistantTurn,
  type ProviderMessage,
} from "../../../lib/assistant";

/**
 * Server action behind the owner chat assistant.
 *
 * Runs the Messages-API tool-use loop against the tools defined in
 * lib/assistant.ts. The pure request/response logic is unit-tested there; this
 * file is the I/O around it: auth gate, the provider call, and dispatching tool
 * calls to the existing loaders / proposal-generation core.
 *
 * SAFETY: there is no execution client and no order submission anywhere in this
 * file. The read tools only read. The one write tool, propose_trade, runs the
 * SAME analysis-gate pipeline as the deterministic "Generate" button
 * (generateAndPersistProposal) and persists a DRAFT proposal — which is
 * owner-approvable but NOT in autopilot's selection set (autopilot lists only
 * PENDING_APPROVAL). So an assistant-drafted trade can never auto-approve or
 * auto-execute; approval is always an explicit owner act on /proposals.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export type AskAssistantResult =
  | { status: "ok"; reply: string }
  | { status: "error"; message: string };

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ProviderResponse {
  stop_reason?: string;
  content?: Array<{ type?: string; id?: string; name?: string; input?: unknown }>;
}

/**
 * Answer one owner turn. Takes the full text transcript (the chat UI holds it),
 * runs the tool loop for the latest message, and returns the assistant's reply.
 * Tool rounds happen inside this call; only the final text is returned to the UI.
 */
export async function askAssistant(
  turns: AssistantTurn[],
): Promise<AskAssistantResult> {
  // Auth gate: owner only. (Single-owner app, but never run un-authenticated.)
  const owner = await getCurrentOwner();
  if (!owner) return { status: "error", message: "Not signed in." };

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      status: "error",
      message: "The assistant isn't configured yet (no API key on the server).",
    };
  }

  const messages: ProviderMessage[] = toProviderMessages(turns);

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(buildAssistantRequest(messages)),
      });

      if (!res.ok) {
        console.error("[assistant] provider error", res.status, (await res.text()).slice(0, 300));
        return { status: "error", message: "The assistant is unavailable right now." };
      }

      const data = (await res.json()) as ProviderResponse;

      if (data.stop_reason === "tool_use") {
        // Echo the assistant turn back VERBATIM (preserves thinking + tool_use
        // blocks, which adaptive thinking requires on the next request), then
        // answer every tool_use with a tool_result.
        messages.push({ role: "assistant", content: data.content });
        const toolUses = (data.content ?? []).filter(
          (b): b is ToolUseBlock => b.type === "tool_use",
        );
        const results = await Promise.all(
          toolUses.map((b) => runTool(b, owner.id)),
        );
        messages.push({ role: "user", content: results });
        continue;
      }

      // end_turn (or anything else terminal): return the visible text.
      const reply = extractAssistantText(data);
      return {
        status: "ok",
        reply: reply || "(no answer)",
      };
    }

    return {
      status: "error",
      message: "The assistant took too many steps; please rephrase or try again.",
    };
  } catch (err) {
    console.error("[assistant] call failed", err);
    return { status: "error", message: "The assistant hit an error; please try again." };
  }
}

/** A single tool_result block for the provider. */
interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Dispatch ONE tool call and return its result as a JSON tool_result. The read
 * tools wrap dashboard loaders; propose_trade runs the analysis-gate pipeline
 * and persists a DRAFT proposal (no execution). An unknown tool or thrown error
 * is returned as an error block — never thrown into the loop.
 */
async function runTool(block: ToolUseBlock, ownerId: string): Promise<ToolResult> {
  try {
    switch (block.name) {
      case "get_portfolio": {
        const state = await loadPortfolioState();
        return ok(block.id, state);
      }
      case "list_proposals": {
        const state = await loadProposalsState();
        return ok(block.id, state);
      }
      case "get_research": {
        const symbol = normalizeSymbol(block.input?.symbol);
        if (!symbol) return err(block.id, "Missing required 'symbol'.");
        const state = await loadResearchSymbolState(symbol);
        return ok(block.id, state);
      }
      case "propose_trade":
        return await proposeTrade(block, ownerId);
      default:
        return err(block.id, `Unknown tool: ${block.name}`);
    }
  } catch (e) {
    return err(block.id, `Tool failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * propose_trade: run the SAME pipeline as the deterministic "Generate" button
 * (fresh snapshot + Alpaca bars -> M9 scanner -> persist) and create a DRAFT
 * proposal tagged source "ASSISTANT". DRAFT is owner-approvable but invisible to
 * autopilot, so this can never auto-execute. The tool_result distinguishes
 * created vs declined so the model reports the truth, not "queued" on a decline.
 */
async function proposeTrade(
  block: ToolUseBlock,
  ownerId: string,
): Promise<ToolResult> {
  const symbol = normalizeSymbol(block.input?.symbol);
  if (!symbol) return err(block.id, "Missing required 'symbol'.");

  const marketData = createAlpacaMarketDataFromEnv();
  if (!marketData) {
    return ok(block.id, {
      created: false,
      symbol,
      reason: "market_data_not_configured",
      message: "Market data isn't configured, so I can't draft a proposal.",
    });
  }

  const db = getDb();
  const { created } = await generateAndPersistProposal(db, marketData, symbol, {
    source: "ASSISTANT",
    notes: "Drafted via the assistant on the owner's request.",
  });

  await recordAuditEvent({
    type: "proposal.generated",
    source: "web",
    ownerId,
    metadata: { symbol, source: "ASSISTANT", created, via: "assistant" },
  });

  if (created) {
    revalidatePath("/proposals");
    return ok(block.id, {
      created: true,
      symbol,
      status: "DRAFT",
      message:
        "Added a DRAFT proposal to the queue. The owner approves it on the Proposals page; nothing trades until then.",
    });
  }

  return ok(block.id, {
    created: false,
    symbol,
    reason: "gate_declined",
    message:
      "The analysis gate declined (insufficient price history or the setup didn't pass) — no proposal was created.",
  });
}

/** Uppercased ticker, restricted to the ticker charset; "" if empty/invalid. */
function normalizeSymbol(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "");
}

function ok(toolUseId: string, value: unknown): ToolResult {
  return { type: "tool_result", tool_use_id: toolUseId, content: JSON.stringify(value) };
}

function err(toolUseId: string, message: string): ToolResult {
  return { type: "tool_result", tool_use_id: toolUseId, content: message, is_error: true };
}
