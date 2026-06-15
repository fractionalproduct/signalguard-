# Data Licensing

Do **not** assume publicly visible data may be scraped, stored, or redistributed.
Every data provider must have a `DataSourceConfiguration` record and an explicit
approval status before its connector runs — especially in production.

## `DataSourceConfiguration` fields

Provider · Dataset · Plan · Terms · Permitted uses · Prohibited uses · Storage
rights · Historical retention · Derived-data rights · Display rights · Attribution
· Redistribution · Commercial use · Rate limits · Review date · Approval status.

## Approval statuses

The authoritative set is the `DataSourceApprovalStatus` enum in
`@signalguard/domain` (and the matching Prisma enum) — code is the runtime
contract, so this doc tracks it, not the other way around:

`NOT_REVIEWED` → `PENDING_REVIEW` → `APPROVED_FOR_DEVELOPMENT` →
`APPROVED_FOR_PRODUCTION` · plus `REJECTED` and `SUSPENDED` (a previously
approved source pulled out of service, e.g. on terms change or license expiry;
it returns to `PENDING_REVIEW` before any re-approval).

> Earlier drafts of this doc used `PROPOSED`/`TERMS_REVIEW_REQUIRED` (now
> `NOT_REVIEWED`/`PENDING_REVIEW`) and listed `RESTRICTED`/`EXPIRED`; those are
> folded into `SUSPENDED`. Use the enum values above.

**Production connectors must not run without `APPROVED_FOR_PRODUCTION`.** This is
enforced in code by `isApprovedForProduction(...)` from `@signalguard/domain`,
checked at connector runtime (not just at deploy time).

## Source rules

- **Market data:** use an approved licensed provider only, after confirming
  coverage, real-time vs. delayed status, historical depth, storage rights,
  derived-data rights, display rights, and commercial-use rights.
- **X (Twitter):** official X APIs only — no unauthorized scraping.
- **Telegram:** authorized bots or approved providers only.
- **Congressional disclosures:** official government records are the authoritative
  source.
- Store only the **minimum** third-party content the applicable terms permit.

## Provider register (to be filled as providers are added)

| Provider | Dataset | Plan | Storage | Derived | Display | Commercial | Status | Review date |
|----------|---------|------|---------|---------|---------|------------|--------|-------------|
| _(none yet)_ | | | | | | | | |

Each new provider is added here with its terms summarized and a status assigned
before any connector is enabled.
