import { ProposalsList } from "../../components/ProposalsList";
import { OptionProposalsList } from "../../components/OptionProposalsList";
import { loadProposalsState } from "../../../lib/proposals";
import { loadOptionProposalsState } from "../../../lib/option-proposals";

export const dynamic = "force-dynamic";

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const [state, optionState] = await Promise.all([
    loadProposalsState(),
    loadOptionProposalsState(),
  ]);
  const activeTab = searchParams.tab === "bad" ? "bad" : "good";
  return (
    <>
      <ProposalsList state={state} activeTab={activeTab} />
      <OptionProposalsList state={optionState} />
    </>
  );
}
