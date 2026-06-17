import { ResearchSymbolDashboard } from "../../../components/ResearchSymbolDashboard";
import { loadResearchSymbolState } from "../../../../lib/research-symbol";

export const dynamic = "force-dynamic";

export default async function ResearchSymbolPage({
  params,
}: {
  params: { symbol: string };
}) {
  const state = await loadResearchSymbolState(params.symbol);
  return <ResearchSymbolDashboard state={state} />;
}
