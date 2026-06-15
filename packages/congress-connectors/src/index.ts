/**
 * @signalguard/congress-connectors — Milestone 6 (M6c) congressional disclosure
 * ingestion adapter.
 *
 * A thin, congress-specific layer over the generic connector machinery in
 * `@signalguard/source-connectors`: it reuses that package's `Connector`
 * interface, licensing gate, and `runConnector` (gate → fetch → dedupe) and adds
 *
 *  - `CongressDisclosureConnector` — turns raw PTR filing records (House Clerk /
 *    Senate eFD) into canonical, hashable `RawItem`s. Fixture-driven this
 *    milestone; live HTTP fetch is a later, separately-gated step.
 *  - `canonicalFilingText` — deterministic serialization so the same trade across
 *    overlapping feed windows hashes identically.
 *  - `parseFilingItem` — bridges a deduplicated `RawItem` back to a validated
 *    `CongressionalDisclosureDraft` via `@signalguard/congress` (M6b).
 *
 * Read-only, deny-by-default: nothing here submits orders, and an unapproved
 * source never fetches (the gate throws first inside `runConnector`).
 */
export { CongressDisclosureConnector } from "./connector.js";
export { canonicalFilingText } from "./canonical.js";
export { parseFilingItem } from "./parse-bridge.js";
