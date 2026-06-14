# Benchmark Policy (Versioned)

Performance is always reported against a declared benchmark. The policy is
versioned; a benchmark is **never** changed retroactively to improve reported
results.

**Policy version:** v1 (MVP).

## Benchmarks

- **Primary:** **SPY** adjusted total return (broad U.S. equity MVP).
- **Strategy-specific (examples):** Growth → QQQ · Small cap → IWM · Technology →
  XLK · Financials → XLF · Healthcare → XLV.
- **Every strategy must declare its benchmark.**

## Required metrics

Portfolio return · benchmark total return · raw excess return · exposure-adjusted
benchmark return · exposure-adjusted excess return · volatility · Sharpe · Sortino
· information ratio (when valid) · maximum drawdown · beta (when valid) · alpha
(when valid) · up-market capture · down-market capture.

## Exposure adjustment

For a partially invested portfolio:

```
Exposure-adjusted benchmark return =
    (average invested exposure × benchmark return)
  + (average cash exposure × risk-free cash return)
Exposure-adjusted excess return =
    portfolio return − exposure-adjusted benchmark return
```

## Presentation

The beginner interface leads with portfolio return, benchmark return, and excess
return. Advanced ratios (Sharpe, Sortino, information ratio, alpha/beta, capture)
are shown but never lead in the beginner view. Validity conditions (sufficient
sample, defined regime) must be met before a ratio is displayed; otherwise mark it
unavailable.
