import { redirect } from "next/navigation";
import { getCurrentOwner } from "../../../../lib/session";
import { MfaSetup } from "./mfa-setup";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const owner = await getCurrentOwner();
  if (!owner) redirect("/login");

  return (
    <section className="page-card">
      <p className="eyebrow">Settings</p>
      <h1>Security</h1>
      <p className="lead">Protect your account with a second sign-in step.</p>
      <MfaSetup initiallyEnabled={owner.mfaEnabled} />
    </section>
  );
}
