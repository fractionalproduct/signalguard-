import { ProposalsList } from "../../components/ProposalsList";
import { loadProposalsState } from "../../../lib/proposals";

export const dynamic = "force-dynamic";

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const state = await loadProposalsState();
  const activeTab = searchParams.tab === "bad" ? "bad" : "good";
  return <ProposalsList state={state} activeTab={activeTab} />;
}
