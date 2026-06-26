/**
 * Phase 5 — the "Fuse" stage. A pure, SUBTRACTIVE reconciliation that runs
 * AFTER the deterministic gate has already produced a draft. It weighs the
 * SignalGuard BUY intent against TradingAgents' own verdict and the multi-LLM
 * consensus and emits ONE advisory label.
 *
 * THE LOAD-BEARING INVARIANT: the result is a LABEL ONLY. It never changes
 * entry/stop/target/sampleSize/probability/quantity/confidence, never changes
 * the proposal status (never APPROVE, never promote), and never causes
 * execution or bypasses any gate. It can only annotate (aligned), flag (mild
 * dissent), or escalate (strong dissent). Fusion can only SUBTRACT — it can
 * downgrade/escalate, never upgrade/promote.
 *
 * No I/O, no side effects — mirrors the style of `classifyCandidate` in
 * ta-ingest.ts. The route/pipeline does the persistence.
 */
export interface FuseInput {
  /** TradingAgents' own BUY/SELL/HOLD verdict, or null/absent. */
  taVerdict?: string | null;
  /** The multi-LLM consensus tally carried from the candidate, or null/absent. */
  consensusTally?: {
    tally?: { BUY: number; SELL: number; HOLD: number };
    decision?: string | null;
    /** 0..1 agreement fraction, or null/absent. */
    agreement?: number | null;
  } | null;
}

export type FuseTier = "aligned" | "flag" | "escalate";

export interface FuseVerdict {
  tier: FuseTier;
  note: string;
}

export function computeFuseVerdict(input: FuseInput): FuseVerdict | null {
  const tv = input.taVerdict?.toUpperCase();
  const cd = input.consensusTally?.decision?.toUpperCase() ?? null;
  const agr = input.consensusTally?.agreement ?? null;

  // Nothing to fuse: neither source expressed a usable opinion.
  if (!tv && !cd) return null;

  // Strong dissent → escalate. Either source actively saying SELL is the
  // loudest signal we can surface; it always wins.
  if (tv === "SELL" || cd === "SELL") {
    return {
      tier: "escalate",
      note:
        "⚠️ TradingAgents actively disagrees (verdict " +
        (tv ?? "?") +
        ", consensus " +
        (cd ?? "n/a") +
        ") — review before approving",
    };
  }

  // Mild dissent / ambiguity → flag. A neutral verdict, a HOLD or missing
  // group decision, or weak agreement all warrant a closer look.
  if (tv === "HOLD" || cd === "HOLD" || cd === null || (agr !== null && agr < 0.6)) {
    return {
      tier: "flag",
      note: "TradingAgents neutral / mixed signal — review closely",
    };
  }

  // Sources agree on a constructive read.
  return { tier: "aligned", note: "Sources aligned" };
}
