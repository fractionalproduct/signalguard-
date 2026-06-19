import { NotificationsList } from "../../components/NotificationsList";
import { loadNotificationsState } from "../../../lib/notifications";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const state = await loadNotificationsState();
  return <NotificationsList state={state} />;
}
