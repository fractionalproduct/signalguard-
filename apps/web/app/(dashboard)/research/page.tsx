import { redirect } from "next/navigation";

import { ResearchDashboard } from "../../components/ResearchDashboard";
import { loadResearchState } from "../../../lib/research";

// Reads live (and possibly-empty) DB state at request time, so it must never
// be statically rendered at build — DATABASE_URL is not available during
// `next build`.
export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const state = await loadResearchState();

  // Symbol lookup: a server action keeps this a plain server component (no client
  // JS), mirroring the /sources add-channel pattern. We sanitize to the ticker
  // charset (letters, digits, dot, hyphen — e.g. BRK.B) and redirect into the
  // existing /research/[symbol] route. A blank/garbage entry just reloads.
  async function searchAction(formData: FormData) {
    "use server";
    const symbol = String(formData.get("symbol") ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9.\-]/g, "");
    if (!symbol) redirect("/research");
    redirect(`/research/${encodeURIComponent(symbol)}`);
  }

  return <ResearchDashboard state={state} searchAction={searchAction} />;
}
