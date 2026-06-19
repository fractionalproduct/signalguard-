import { PerformanceDashboard } from "../../components/PerformanceDashboard";
import { loadPerformanceState } from "../../../lib/performance";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const state = await loadPerformanceState();
  return <PerformanceDashboard state={state} />;
}
