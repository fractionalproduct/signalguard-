import { redirect } from "next/navigation";
import { getPendingMfaOwnerId } from "../../../lib/mfa";
import { MfaForm } from "./mfa-form";

export const dynamic = "force-dynamic";

export default function MfaPage() {
  // Only reachable mid-login (after a correct password).
  if (!getPendingMfaOwnerId()) redirect("/login");

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Two-step verification</h1>
        <p className="muted">One more step to confirm it&apos;s you.</p>
        <MfaForm />
      </div>
    </div>
  );
}
