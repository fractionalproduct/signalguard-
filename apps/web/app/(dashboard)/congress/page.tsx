import { CongressInbox } from "../../components/CongressInbox";
import { loadCongressState } from "../../../lib/congress";
import { parseDisclosureDateRange } from "../../../lib/congress-view";

// The inbox reads disclosure rows at request time; never statically render it at
// build (there is no DATABASE_URL during `next build`).
export const dynamic = "force-dynamic";

export default async function CongressPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string };
}) {
  const range = parseDisclosureDateRange(searchParams ?? {});
  const state = await loadCongressState(range);
  return <CongressInbox state={state} range={range} />;
}
