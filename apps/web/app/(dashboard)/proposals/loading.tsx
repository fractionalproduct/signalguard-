/**
 * Route-level loading UI for /proposals. Next renders this while the (dynamic)
 * page server-renders — so navigating to Proposals shows a spinner instead of a
 * blank/stale frame.
 */
export default function Loading() {
  return (
    <section className="page-card" aria-busy="true">
      <p className="eyebrow">Beginner view · PAPER TRADING</p>
      <h1>Proposals</h1>
      <div className="loading-state" role="status">
        <span className="spinner" aria-hidden="true" />
        Loading proposals…
      </div>
    </section>
  );
}
