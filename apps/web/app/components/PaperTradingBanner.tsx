/**
 * Global safety banner. Per AGENTS.md this message must always be visible:
 * the system never uses real money. Rendered in the root layout on every page.
 */
export function PaperTradingBanner() {
  return (
    <div role="status" className="paper-banner">
      PAPER TRADING — NO REAL MONEY IS BEING USED
    </div>
  );
}
