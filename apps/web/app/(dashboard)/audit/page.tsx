import { AuditLog } from "../../components/AuditLog";

// Reads audit events from the DB at request time — never static.
export const dynamic = "force-dynamic";

/**
 * Audit / decision-ledger page (Phase 7). The `?type=` query param is a simple
 * server-rendered type-prefix filter (e.g. `?type=autopilot.`); no client state.
 * In Next 14.2 `searchParams` is a plain sync object (not a Promise).
 */
export default function AuditPage({
  searchParams,
}: {
  searchParams?: { type?: string };
}) {
  const type = typeof searchParams?.type === "string" ? searchParams.type : "";
  return <AuditLog typePrefix={type} />;
}
