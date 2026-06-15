import type { AddChannelResult } from "../../lib/sources-admin";

/**
 * Presentational "Add a Telegram channel" form. Pure UI: it receives the
 * admin-enabled flag, the bound server action, and the last result, and renders
 * one of two states (disabled vs. enabled-with-form). No data access here.
 */
export interface AddSourceFormProps {
  /** Whether SOURCES_ADMIN_ENABLED === "true" on the server. */
  enabled: boolean;
  /** Server action that creates the source from the submitted form data. */
  action: (formData: FormData) => void | Promise<void>;
  /** Result of the previous submission, if any (rendered as a banner). */
  result?: AddChannelResult;
}

export function AddSourceForm({ enabled, action, result }: AddSourceFormProps) {
  if (!enabled) {
    return <DisabledCard />;
  }

  return (
    <section className="page-card">
      <p className="eyebrow">Owner tools</p>
      <h1>Sources</h1>
      <p className="lead">
        Add a Telegram channel to monitor. SignalGuard registers it as a paused,
        unreviewed source — nothing is ingested until you enable it and approve
        its licensing for production.
      </p>

      <ResultBanner result={result} />

      <form action={action} className="add-source-form">
        <label className="add-source-label" htmlFor="handle">
          Telegram channel name
        </label>
        <div className="add-source-row">
          <input
            id="handle"
            name="handle"
            type="text"
            className="add-source-input"
            placeholder="@channelname"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="handle-help"
            required
          />
          <button type="submit" className="add-source-submit">
            Add channel
          </button>
        </div>
        <p id="handle-help" className="muted add-source-help">
          Enter the public channel name, for example <code>@signalguard</code> or
          just <code>signalguard</code>. 5–32 letters, digits or underscores,
          starting with a letter.
        </p>
      </form>

      <div className="empty-state add-source-note" role="note">
        <p>
          <strong>After adding a channel, add your SignalGuard bot to that
          channel as an admin so it can read posts.</strong>
        </p>
        <p className="muted">
          Newly added channels are paused (<code>enabled: false</code>) and their
          licensing is <code>NOT_REVIEWED</code>. The M5 licensing gate blocks any
          ingestion until you enable the source and approve its config for
          production.
        </p>
      </div>
    </section>
  );
}

function ResultBanner({ result }: { result?: AddChannelResult }) {
  if (!result) return null;
  if (result.status === "ok") {
    return (
      <div className="empty-state add-source-ok" role="status">
        Added <code>{result.handle}</code> as a paused, unreviewed Telegram
        source. Enable it and approve its licensing when you&apos;re ready.
      </div>
    );
  }
  if (result.status === "error") {
    return (
      <div className="empty-state add-source-error" role="alert">
        Couldn&apos;t add that channel. <span className="muted">{result.message}</span>
      </div>
    );
  }
  // "disabled" is handled by DisabledCard; nothing to render here.
  return null;
}

function DisabledCard() {
  return (
    <section className="page-card">
      <p className="eyebrow">Owner tools · disabled</p>
      <h1>Sources</h1>
      <p className="lead">Adding sources is turned off.</p>
      <div className="empty-state" role="status">
        <p>
          This write tool is gated behind <code>SOURCES_ADMIN_ENABLED</code>,
          which is not <code>&quot;true&quot;</code>.
        </p>
        <p className="muted">
          It must stay OFF in production until owner authentication (the M2 login
          guard) is enforced in front of this page. Set{" "}
          <code>SOURCES_ADMIN_ENABLED=true</code> only on a trusted local or
          gated environment.
        </p>
      </div>
    </section>
  );
}
