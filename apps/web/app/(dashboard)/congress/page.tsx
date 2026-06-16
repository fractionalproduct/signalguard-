import { CongressInbox } from "../../components/CongressInbox";
import { loadCongressState } from "../../../lib/congress";

// The inbox reads disclosure rows at request time; never statically render it at
// build (there is no DATABASE_URL during `next build`).
export const dynamic = "force-dynamic";

export default async function CongressPage() {
  const state = await loadCongressState();
  return <CongressInbox state={state} />;
}
