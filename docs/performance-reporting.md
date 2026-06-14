# Performance Reporting

Performance reporting explains how paper trades are doing. It must include realized and unrealized P&L and compare results to a clear benchmark without overstating certainty.

## Key requirements

- **Report realized and unrealized P&L.** Summaries must include open-position and closed-position performance.
- **Use versioned benchmarks.** The primary benchmark is SPY adjusted total return unless a strategy declares another benchmark.
- **Do not retroactively change benchmarks.** Benchmark policy must be versioned.
- **Exposure-adjusted benchmark formula:** average invested amount times benchmark return plus average cash amount times risk-free return.
- **Do not lead with advanced ratios in the beginner UI.** Keep reports understandable for a beginner.
- **Historical/probability results must state limitations.** Include sample size, confidence, limitations, and out-of-distribution status where relevant.
- **Never claim guaranteed profit or 99% accuracy.**

## Reporting schedule

```
Market / Broker / Portfolio Data
              |
              v
Performance Aggregation
              |
              v
Daily / Weekly / Monthly Reports
              |
              v
Beginner-Friendly Summary + Audit Trail
```

## What reports should explain

1. What changed in the portfolio.
2. Which paper trades were opened, filled, partially filled, closed, or still open.
3. Realized gains/losses from closed trades.
4. Unrealized gains/losses from open positions.
5. Comparison to the declared benchmark.
6. Known limitations, missing data, or reconciliation issues.
7. Next actions, if any, for the owner.

## Plain-language rule

A performance report should answer: "What happened, how much did the paper account gain or lose, how does that compare to the benchmark, and is any data missing or uncertain?"
