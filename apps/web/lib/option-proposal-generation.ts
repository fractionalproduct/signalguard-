import "server-only";
import {
  createOptionProposal,
  getOptionConfig,
  type PrismaClient,
} from "@signalguard/database";
import type { MarketDataReadClient } from "@signalguard/market-data";
import type { AlpacaOptionsData } from "@signalguard/alpaca-market-data";
import { computeFuseVerdict, type FuseInput } from "./fuse";
import { evaluateOptionEntry } from "./option-risk";
import { selectOptionContract } from "./option-select";

/**
 * Generate + persist a single LONG single-leg OPTION proposal from a
 * TradingAgents verdict (BUY → CALL, SELL → PUT). The options analogue of
 * generateAndPersistProposal, but with TWO read clients:
 *
 *  - `marketData` (equity MarketDataReadClient) supplies the UNDERLYING price
 *    — the option read client only exposes contracts + per-option snapshots, so
 *    it cannot price the equity. We reuse the proven equity path (1d bars, last
 *    close) the equity generator already uses against the real Alpaca adapter.
 *  - `optionsData` (AlpacaOptionsData) supplies the chain + the selected
 *    contract's quote (mark/spread/iv) — the SAME read client the options
 *    autopilot uses.
 *
 * The deterministic options gate (evaluateOptionEntry) is AUTHORITATIVE: a
 * proposal is created ONLY on ALLOW. Single-leg long calls/puts only — defined
 * risk = premium paid, so premiumAtRiskCents IS the maximum loss. This creates a
 * proposal ONLY; NO order / buy-to-open is ever placed here (Slice B).
 *
 * DEFENSIVE: every external call is wrapped; this function NEVER throws to the
 * caller (unlike the equity generateAndPersistProposal, which lets IO throw and
 * relies on the route's try/catch). Any failure returns { created:false }.
 */
export async function generateAndPersistOptionProposal(
  db: PrismaClient,
  marketData: MarketDataReadClient,
  optionsData: AlpacaOptionsData,
  underlying: string,
  direction: "CALL" | "PUT",
  opts: {
    source?: string;
    taVerdict?: string | null;
    taSummary?: string | null;
    consensusTally?: unknown;
    analysisReport?: unknown;
    fuseVerdict?: unknown;
    notes?: string | null;
  } = {},
): Promise<{ created: boolean; id?: string; reason?: string }> {
  const now = new Date();

  // --- Options gate thresholds (manual singleton, NOT the autopilot config). ---
  let config;
  try {
    config = await getOptionConfig(db);
  } catch (err) {
    console.error("[option-proposal-gen] config read failed", underlying, err);
    return { created: false, reason: "config_unreadable" };
  }

  // --- Underlying price (last 1d close) via the equity read client. ---
  let underlyingPriceCents: number | null = null;
  try {
    const end = new Date(now.getTime());
    const start = new Date(end.getTime() - 30 * 86_400_000);
    const bars = await marketData.getBars({
      symbol: underlying,
      interval: "1d",
      start: start.toISOString(),
      end: end.toISOString(),
      limit: 30,
    });
    const last = bars.at(-1);
    if (last && last.closeCents > 0) underlyingPriceCents = last.closeCents;
  } catch (err) {
    console.error("[option-proposal-gen] underlying price fetch failed", underlying, err);
    return { created: false, reason: "no_underlying_price" };
  }
  if (underlyingPriceCents === null) {
    return { created: false, reason: "no_underlying_price" };
  }

  // --- Option chain via the options read client. ---
  let chain;
  try {
    chain = await optionsData.listOptionContracts(underlying);
  } catch (err) {
    console.error("[option-proposal-gen] chain fetch failed", underlying, err);
    return { created: false, reason: "chain_fetch_failed" };
  }
  if (!chain || chain.length === 0) {
    return { created: false, reason: "no_chain" };
  }

  // --- Select the near-ATM contract inside the gate's DTE window. ---
  const selected = selectOptionContract(
    { right: direction, underlyingPriceCents, chain, now },
    { minDte: config.minDte, maxDte: config.maxDte },
  );
  if (!selected) {
    return { created: false, reason: "no_contract_in_window" };
  }

  // --- Quote for the selected contract. No usable mark -> the gate would
  //     NO_QUOTE; skip the create entirely. ---
  let snap;
  try {
    snap = (await optionsData.getOptionSnapshots([selected.occSymbol])).get(
      selected.occSymbol,
    );
  } catch (err) {
    console.error("[option-proposal-gen] quote fetch failed", selected.occSymbol, err);
    return { created: false, reason: "quote_fetch_failed" };
  }
  if (!snap || snap.markCents <= 0) {
    return { created: false, reason: "no_quote" };
  }

  // --- The deterministic options gate is AUTHORITATIVE: create only on ALLOW. ---
  const decision = evaluateOptionEntry(
    {
      contract: {
        right: direction,
        strikeCents: selected.strikeCents,
        expiration: selected.expiration,
        // OI lives on the contract; the snapshot's is always null.
        openInterest: snap.openInterest ?? selected.openInterest,
      },
      quote: {
        markCents: snap.markCents,
        spreadBps: snap.spreadBps,
        ivPercent: snap.ivPercent,
      },
      // Size by the per-trade premium budget; the gate caps contracts down.
      requestedContracts: Number.MAX_SAFE_INTEGER,
      riskBudgetCents: config.maxPremiumPerTradeCents,
    },
    config,
    now,
  );
  if (decision.decision !== "ALLOW") {
    return { created: false, reason: `gate_block:${decision.reasons.join(",")}` };
  }

  // --- Upsert the OptionContract (occSymbol is the natural key), then persist
  //     the proposal with the sized contracts + premium-at-risk + TA metadata. ---
  let optionContractId: string | null = null;
  try {
    const contractRow = await db.optionContract.upsert({
      where: { occSymbol: selected.occSymbol },
      create: {
        occSymbol: selected.occSymbol,
        underlying: underlying.toUpperCase(),
        right: direction,
        strikeCents: selected.strikeCents,
        expiration: selected.expiration,
      },
      update: {},
      select: { id: true },
    });
    optionContractId = contractRow.id;
  } catch (err) {
    console.error("[option-proposal-gen] contract upsert failed", selected.occSymbol, err);
    return { created: false, reason: "contract_upsert_failed" };
  }

  // Fuse advisory label — SUBTRACTIVE display-only annotation, computed only
  // when a verdict/consensus is present. Never gates or sizes anything.
  let fuseVerdict = opts.fuseVerdict;
  if (fuseVerdict === undefined && (opts.taVerdict != null || opts.consensusTally != null)) {
    fuseVerdict = computeFuseVerdict({
      taVerdict: opts.taVerdict,
      consensusTally: opts.consensusTally as FuseInput["consensusTally"],
    });
  }

  try {
    const { id } = await createOptionProposal(db, {
      underlying: underlying.toUpperCase(),
      right: direction,
      occSymbol: selected.occSymbol,
      strikeCents: selected.strikeCents,
      expiration: selected.expiration,
      limitPremiumCents: snap.markCents,
      contracts: decision.sizedContracts,
      premiumAtRiskCents: decision.premiumAtRiskCents,
      status: "PENDING_APPROVAL",
      source: opts.source ?? "TRADING_AGENTS",
      notes: opts.notes ?? null,
      taVerdict: opts.taVerdict ?? null,
      taSummary: opts.taSummary ?? null,
      consensusTally: opts.consensusTally,
      analysisReport: opts.analysisReport,
      fuseVerdict,
      optionContractId,
    });
    return { created: true, id };
  } catch (err) {
    console.error("[option-proposal-gen] persist failed", selected.occSymbol, err);
    return { created: false, reason: "persist_failed" };
  }
}
