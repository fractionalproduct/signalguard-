"use client";

import { useFormState, useFormStatus } from "react-dom";
import { mfaAction, type MfaState } from "./actions";

const initialState: MfaState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Verifying…" : "Verify"}
    </button>
  );
}

export function MfaForm() {
  const [state, formAction] = useFormState(mfaAction, initialState);

  return (
    <form action={formAction} className="login-form" noValidate>
      <label className="field">
        <span>Authentication code</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          required
          autoFocus
        />
      </label>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
      <p className="login-note muted">
        Enter the 6-digit code from your authenticator app, or one of your recovery codes.
      </p>
    </form>
  );
}
