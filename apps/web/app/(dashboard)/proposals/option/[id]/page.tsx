import { OptionProposalDetail } from "../../../../components/OptionProposalDetail";
import { loadOptionProposalDetailState } from "../../../../../lib/option-proposals";

export const dynamic = "force-dynamic";

export default async function OptionProposalDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const state = await loadOptionProposalDetailState(params.id);
  return <OptionProposalDetail state={state} />;
}
