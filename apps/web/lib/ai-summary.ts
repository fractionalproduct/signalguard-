/**
 * AI trade-summary — the plain-English "AI half" of the analysis gate (the
 * deterministic verdict is the load-bearing half; this explains it readably).
 *
 * Provider-agnostic via a thin fetch (no SDK). Defaults to Anthropic; the prompt
 * is grounded in the proposal + the DETERMINISTIC verdict so the model explains
 * what the gate already decided rather than deciding anything itself. Returns
 * null on no-key / failure — the deterministic verdict always stands on its own.
 */

export interface SummaryProposal {
  symbol: string;
  entryCents: number;
  stopCents: number;
  targetCents: number;
  pTargetFirstPoint: number | null;
  confidence: string;
  sampleSize: number;
}

export interface SummaryAnalysis {
  verdict: string; // PASS | CAUTION | AVOID
  score: number;
  evR: number;
  risks: ReadonlyArray<string>;
}

const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/** Pure: the user prompt. Kept separate so it's unit-testable without an API call. */
export function buildSummaryPrompt(
  p: SummaryProposal,
  a: SummaryAnalysis,
): string {
  const prob = p.pTargetFirstPoint === null ? "unknown" : `${(p.pTargetFirstPoint * 100).toFixed(0)}%`;
  const risks = a.risks.length > 0 ? a.risks.join("; ") : "none flagged";
  return [
    "In 1–2 plain-English sentences, explain this PAPER-trading stock setup and its single biggest risk, for a non-expert owner. Be direct, no preamble, no disclaimers, and do NOT give a buy/sell recommendation — a deterministic risk gate already decided; you only explain it.",
    "",
    `Setup: ${p.symbol} long — entry ${usd(p.entryCents)}, stop ${usd(p.stopCents)}, target ${usd(p.targetCents)}; ~${prob} chance to hit target first; confidence "${p.confidence}", sample size ${p.sampleSize}.`,
    `Gate verdict: ${a.verdict} (score ${a.score}/100, expected value ${a.evR >= 0 ? "+" : ""}${a.evR.toFixed(2)}R). Flagged risks: ${risks}.`,
  ].join("\n");
}

/** System framing — keeps the model in "explain, don't advise" lane. */
const SYSTEM =
  "You are a concise trading analyst for a single-owner PAPER-trading app. You explain setups and risks plainly. You never give financial advice or a buy/sell call; a deterministic gate already decided. Keep to 1–2 sentences.";

/**
 * Generate the summary. Anthropic by default (configurable model). null when
 * ANTHROPIC_API_KEY is unset or the call fails — never throws to the caller.
 */
export async function generateProposalSummary(
  p: SummaryProposal,
  a: SummaryAnalysis,
): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.AI_SUMMARY_MODEL ?? "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: SYSTEM,
        messages: [{ role: "user", content: buildSummaryPrompt(p, a) }],
      }),
    });
    if (!res.ok) {
      console.error("[ai-summary] provider error", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = data.content?.find((b) => b.type === "text")?.text;
    return typeof text === "string" && text.trim().length > 0 ? text.trim() : null;
  } catch (err) {
    console.error("[ai-summary] call failed", err);
    return null;
  }
}
