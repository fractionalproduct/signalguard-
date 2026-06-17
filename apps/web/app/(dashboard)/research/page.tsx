import { ResearchDashboard } from "../../components/ResearchDashboard";
import { loadResearchState } from "../../../lib/research";

// Reads live (and possibly-empty) DB state at request time, so it must never
// be statically rendered at build — DATABASE_URL is not available during
// `next build`.
export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const state = await loadResearchState();
  return <ResearchDashboard state={state} />;
}
