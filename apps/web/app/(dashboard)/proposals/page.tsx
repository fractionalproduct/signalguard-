import { ProposalsList } from "../../components/ProposalsList";
import { loadProposalsState } from "../../../lib/proposals";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const state = await loadProposalsState();
  return <ProposalsList state={state} />;
}
