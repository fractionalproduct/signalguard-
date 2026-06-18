import { ProposalDetail } from "../../../components/ProposalDetail";
import { loadProposalDetailState } from "../../../../lib/proposal-detail";

export const dynamic = "force-dynamic";

export default async function ProposalDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const state = await loadProposalDetailState(params.id);
  return <ProposalDetail state={state} />;
}
