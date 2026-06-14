# SignalGuard AI

A private, single-user, AI-assisted trading-intelligence and **paper-trading**
platform. It monitors approved market sources and congressional disclosures, turns
them into structured trade signals, runs analysis, applies a deterministic risk
engine, and (only with owner approval) places **simulated** orders to Alpaca paper
trading. It runs entirely in the cloud and does not depend on the owner's laptop.

> ⚠️ **PAPER TRADING — NO REAL MONEY IS BEING USED.** This system never performs
> live trading, options, margin, shorting, or crypto. See `AGENTS.md`.

## Status

**Milestone 0 — Repository & cloud readiness.** Foundation files are in place; no
application code or trading logic exists yet. See `docs/service-readiness.md` for
what to set up next.

## Start here

- **`AGENTS.md`** — the authoritative build instructions and safety rules.
- **`docs/setup-guide.md`** — plain-language setup for a non-technical owner.
- **`docs/service-readiness.md`** — the account/service checklist (what's done,
  what's needed now, what's needed later).
- **`docs/cloud-services.md`** — which cloud service does what, and costs.
- **`docs/architecture.md`** — how the pieces fit together.

## Local path & backup

- Local: `C:\projects\SignalGuard`  ·  Remote: `github.com/fractionalproduct/signalguard-`
- GitHub is the off-machine backup. Push often; if the laptop is lost, clone from
  GitHub on any machine or open the repo in GitHub Codespaces and continue.
- **Secrets never go in Git.** They live in host settings + a password manager.
