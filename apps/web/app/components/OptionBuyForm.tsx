import { buyOptionAction } from "./option-buy-action";

/**
 * Manual long-option buy (paper). The owner enters an OCC contract symbol and a
 * dollar risk budget; submitting runs the options risk gate and, if it passes,
 * places a paper buy-to-open. The result arrives as a notification (the gate may
 * block it). Long-only, defined-risk: the budget is the max loss.
 */
export function OptionBuyForm() {
  return (
    <form action={buyOptionAction} className="option-buy-form">
      <h2>Buy an option (paper)</h2>
      <p className="muted">
        Long calls/puts only — your risk budget is the most you can lose (the
        premium). The trade must clear the options risk gate.
      </p>
      <label className="field">
        Contract (OCC symbol)
        <input
          type="text"
          name="occSymbol"
          placeholder="e.g. AAPL260117C00250000"
          required
          autoComplete="off"
        />
      </label>
      <label className="field">
        Risk budget (USD — max loss)
        <input type="number" name="riskBudget" min="1" step="1" placeholder="500" required />
      </label>
      <button type="submit" className="btn-primary">
        Run risk gate &amp; place paper order
      </button>
    </form>
  );
}
