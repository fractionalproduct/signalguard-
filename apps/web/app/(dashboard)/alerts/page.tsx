import { AlertsList } from "../../components/AlertsList";
import { loadAlertsState } from "../../../lib/alerts";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const state = await loadAlertsState();
  return <AlertsList state={state} />;
}
