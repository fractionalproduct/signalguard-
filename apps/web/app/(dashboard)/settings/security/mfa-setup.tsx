"use client";

import { useState, type FormEvent } from "react";
import { confirmEnrollmentAction, startEnrollmentAction } from "./actions";

type Step = "idle" | "scan" | "recovery";

export function MfaSetup({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const [step, setStep] = useState<Step>("idle");
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  async function start() {
    setBusy(true);
    setError("");
    try {
      const challenge = await startEnrollmentAction();
      setQr(challenge.qrDataUrl);
      setSecret(challenge.secret);
      setStep("scan");
    } catch {
      setError("Could not start setup. Is the server's encryption key configured?");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await confirmEnrollmentAction(code);
    setBusy(false);
    if (result.ok && result.recoveryCodes) {
      setRecoveryCodes(result.recoveryCodes);
      setEnabled(true);
      setStep("recovery");
    } else {
      setError(result.error ?? "Verification failed.");
    }
  }

  if (enabled && step !== "recovery") {
    return (
      <div className="settings-panel">
        <div>
          <h2>Two-factor authentication</h2>
          <p className="muted">Enabled — you&apos;ll be asked for a code from your authenticator app at login.</p>
        </div>
        <span className="status-pill">
          <span>Status</span>
          <strong>On</strong>
        </span>
      </div>
    );
  }

  return (
    <div className="settings-panel" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div>
        <h2>Two-factor authentication</h2>
        <p className="muted">
          Add a second step at login using an authenticator app (Google Authenticator, Authy, 1Password, etc.).
        </p>
      </div>

      {step === "idle" ? (
        <button className="btn-primary" type="button" onClick={start} disabled={busy} style={{ alignSelf: "flex-start" }}>
          {busy ? "Starting…" : "Set up two-factor"}
        </button>
      ) : null}

      {step === "scan" ? (
        <form className="login-form" onSubmit={confirm}>
          <p className="muted">1. Scan this with your authenticator app:</p>
          {qr ? <img src={qr} alt="Two-factor QR code" width={220} height={220} /> : null}
          <p className="muted">
            Or enter this key manually: <code>{secret}</code>
          </p>
          <label className="field">
            <span>2. Enter the 6-digit code it shows</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? "Verifying…" : "Turn on two-factor"}
          </button>
        </form>
      ) : null}

      {step === "recovery" ? (
        <div>
          <p className="muted">
            ✅ Two-factor is on. <strong>Save these recovery codes somewhere safe</strong> — each works once if you
            lose your authenticator. They won&apos;t be shown again.
          </p>
          <ul className="recovery-codes">
            {recoveryCodes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step === "idle" && error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  );
}
