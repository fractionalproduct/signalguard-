import { AssistantChat } from "../../components/AssistantChat";

// The chat calls a server action that reads live DB/account state at request
// time; nothing here should be statically rendered at build.
export const dynamic = "force-dynamic";

export default function AssistantPage() {
  return <AssistantChat />;
}
