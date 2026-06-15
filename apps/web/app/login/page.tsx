import { redirect } from "next/navigation";
import { getCurrentOwner } from "../../lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in? Skip the form.
  if (await getCurrentOwner()) redirect("/home");

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>SignalGuard AI</h1>
        <p className="muted">Sign in to your private trading-intelligence portal.</p>
        <LoginForm />
        <p className="login-note muted">
          This is a private, single-owner system. Public registration is disabled.
        </p>
      </div>
    </div>
  );
}
