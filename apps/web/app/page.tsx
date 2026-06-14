export default function HomePage() {
  return (
    <section>
      <h1>SignalGuard AI</h1>
      <p className="muted">
        Private, single-user, AI-assisted trading intelligence &amp; paper-trading
        platform.
      </p>

      <h2>Milestone 1 — Foundation</h2>
      <p>
        This is the application shell. Authentication, dashboards, and trading
        features are added in later milestones. No orders can be placed yet, and
        the system never uses real money.
      </p>

      <ul>
        <li>Web portal (this app) — serverless/autoscaling</li>
        <li>General background worker — always-on analysis</li>
        <li>Restricted trading worker — paper-only, isolated</li>
      </ul>

      <p className="muted">
        Health check: <code>/api/health</code>
      </p>
    </section>
  );
}
