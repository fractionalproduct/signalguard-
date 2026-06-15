import { SignalsInbox } from "../components/SignalsInbox";
import { loadSignalsState } from "../../lib/signals";

// The inbox reads signal rows at request time; never statically render it at
// build (there is no DATABASE_URL during `next build`).
export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const state = await loadSignalsState();
  return <SignalsInbox state={state} />;
}
