import { PortfolioDashboard } from "../components/PortfolioDashboard";
import { loadPortfolioState } from "../../lib/portfolio";

// The dashboard reads live (paper) broker data at request time, so it must never
// be statically rendered at build — there are no credentials during `next build`.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const state = await loadPortfolioState();
  return <PortfolioDashboard state={state} />;
}
