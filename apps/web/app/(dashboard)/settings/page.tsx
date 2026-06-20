import Link from "next/link";
import { AutopilotSettings } from "../../components/AutopilotSettings";

export default async function SettingsPage() {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view</p>
      <h1>Settings</h1>
      <p className="lead">
        Future preferences for account setup, notifications, paper-trading connections, and display choices.
      </p>

      <div className="settings-panel">
        <div>
          <h2>Security</h2>
          <p className="muted">Password and two-factor authentication.</p>
        </div>
        <Link className="signout-button" href="/settings/security">
          Manage security
        </Link>
      </div>

      <div className="settings-panel" aria-labelledby="advanced-view-heading">
        <div>
          <h2 id="advanced-view-heading">Advanced System View</h2>
          <p className="muted">
            Presentation-only placeholder. This toggle will never grant trading permissions or weaken guardrails.
          </p>
        </div>
        <label className="toggle-placeholder">
          <input type="checkbox" disabled aria-describedby="advanced-view-note" />
          <span>Off</span>
        </label>
      </div>
      <p id="advanced-view-note" className="empty-state" role="status">
        Coming in a later milestone
      </p>

      <AutopilotSettings />
    </section>
  );
}
