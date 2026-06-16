import { redirect } from "next/navigation";

import { AddSourceForm } from "../components/AddSourceForm";
import {
  addTelegramChannel,
  isSourcesAdminEnabled,
  type AddChannelResult,
} from "../../lib/sources-admin";

// The form writes at request time and reads the admin flag from the environment;
// never statically render it at build (there is no DATABASE_URL during build, and
// the flag could differ per environment).
export const dynamic = "force-dynamic";

/**
 * Owner-facing "Add a Telegram channel" page. The server action is fail-closed:
 * addTelegramChannel() itself refuses unless SOURCES_ADMIN_ENABLED === "true".
 * The result of the last submission is round-tripped through the query string so
 * this stays a plain server component with no client state.
 */
export default async function SourcesPage({
  searchParams,
}: {
  searchParams?: { status?: string; message?: string; handle?: string };
}) {
  const enabled = isSourcesAdminEnabled();

  async function addChannelAction(formData: FormData) {
    "use server";
    const raw = String(formData.get("handle") ?? "");
    const result = await addTelegramChannel(raw);
    redirect(`/sources?${resultToQuery(result)}`);
  }

  return (
    <AddSourceForm
      enabled={enabled}
      action={addChannelAction}
      result={queryToResult(searchParams)}
    />
  );
}

function resultToQuery(result: AddChannelResult): string {
  const params = new URLSearchParams({ status: result.status });
  if (result.status === "ok") params.set("handle", result.handle);
  if (result.status === "error") params.set("message", result.message);
  return params.toString();
}

function queryToResult(
  searchParams?: { status?: string; message?: string; handle?: string },
): AddChannelResult | undefined {
  if (!searchParams?.status) return undefined;
  if (searchParams.status === "ok") {
    return { status: "ok", handle: searchParams.handle ?? "" };
  }
  if (searchParams.status === "error") {
    return { status: "error", message: searchParams.message ?? "Unknown error." };
  }
  if (searchParams.status === "disabled") {
    return { status: "disabled" };
  }
  return undefined;
}
