"use server";

import { getCurrentOwner } from "../../../lib/session";
import { loadPortfolioState } from "../../../lib/portfolio";
import { loadProposalsState } from "../../../lib/proposals";
import { loadResearchSymbolState } from "../../../lib/research-symbol";
import {
  MAX_TOOL_ROUNDS,
  buildAssistantRequest,
  extractAssistantText,
  toProviderMessages,
  type AssistantTurn,
  type ProviderMessage,
} from "../../../lib/assistant";

/**
 * Server action behind the owner chat assistant — Slice 1 (READ-ONLY Q&A).
 *
 * Runs the Messages-API tool-use loop against the read-only tools defined in
 * lib/assistant.ts. The pure request/response logic is unit-tested there; this
 * file is the I/O around it: auth gate, the provider call, and dispatching tool
 * calls to the existing dashboard loaders.
 *
 * SAFETY: every tool here only READS. There is no execution client, no order
 * submission, and no proposal mutation in this file — by construction the
 * assistant cannot move money. (Slice 2's propose_trade tool will create a
 * PENDING_APPROVAL proposal only; it will still never execute.)
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
        const results = await Promise.all(toolUses.map((b) => runReadTool(b)));
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
 * Dispatch ONE read-only tool call to the matching dashboard loader and return
 * its state as a JSON tool_result. Every branch is read-only; an unknown tool
 * is returned as an error block (never throws into the loop).
 */
async function runReadTool(block: ToolUseBlock): Promise<ToolResult> {
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
        const symbol = String(block.input?.symbol ?? "").trim();
        if (!symbol) return err(block.id, "Missing required 'symbol'.");
        const state = await loadResearchSymbolState(symbol);
        return ok(block.id, state);
      }
      default:
        return err(block.id, `Unknown tool: ${block.name}`);
    }
  } catch (e) {
    return err(block.id, `Tool failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function ok(toolUseId: string, value: unknown): ToolResult {
  return { type: "tool_result", tool_use_id: toolUseId, content: JSON.stringify(value) };
}

function err(toolUseId: string, message: string): ToolResult {
  return { type: "tool_result", tool_use_id: toolUseId, content: message, is_error: true };
}
