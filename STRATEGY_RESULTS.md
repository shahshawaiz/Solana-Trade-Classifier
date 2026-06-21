# Cortex Alpha — Strategy Backtest Results & Analysis

_Generated from the built-in `/api/backtest` engine (now with Sharpe / Sortino / profit-factor /
expectancy metrics). All runs: 1h candles, 5x leverage, CryptoCompare OHLC._

## ⚠️ Read this first — the honest framing
- **No strategy works in "all markets/conditions/dates."** That does not exist. The realistic goal is
  *robustness*: a positive **median** result across many markets/windows with a shallow worst case.
- Backtest numbers are **in-sample** and optimistic. They do **not** include funding, slippage, or the
  real fee drag of frequent leveraged trades. A backtest edge often disappears live.
- We tested 5 configs and report the best — that is **selection bias**. Treat the "winner" as a
  hypothesis to validate with walk-forward / out-of-sample testing, not a guarantee.

## 1. Baseline (the shipped default) — it loses money
Default config: all 4 components (Sentiment + MACD + RSI + Elliott Wave), threshold ±0.08, no regime filter.

| Market/Window | Sharpe | PnL% | Win% | Profit Factor | Trades |
|---|---:|---:|---:|---:|---:|
| SOL / 30d | −3.53 | −8.1 | 29.8 | 0.62 | 47 |
| SOL / 90d | +0.28 | +0.9 | 38.5 | 1.02 | 130 |
| BTC / 30d | −12.82 | −14.5 | 22.9 | 0.13 | 48 |
| BTC / 90d | −4.53 | −13.3 | 33.8 | 0.57 | 133 |
| ETH / 30d | −3.57 | −5.7 | 36.4 | 0.57 | 44 |
| ETH / 90d | +1.59 | +7.0 | 42.4 | 1.23 | 125 |
| **Median** | **−3.55** | **−6.9** | — | — | — |

**Verdict:** net-losing, positive in only 2/6 windows, with a catastrophic −12.8 Sharpe on BTC/30d.
Directional accuracy was 45.5% (worse than a coin flip) and it **overtrades** (44–133 trades).

## 2. Config sweep — robustness across 3 assets × 2 windows
Median / worst-case Sharpe and # of positive windows (out of 6):

| Config | Median Sharpe | Median PnL% | Worst Sharpe | Positive windows |
|---|---:|---:|---:|---:|
| Baseline (thr .08, no regime) | −3.55 | −6.9 | −12.82 | 2/6 |
| Regime filter ON (thr .08) | −1.45 | −3.3 | −8.60 | 2/6 |
| Threshold .25 (no regime) | −1.68 | −3.9 | −8.46 | 1/6 |
| Regime + threshold .25 | −1.37 | −2.1 | −7.78 | 2/6 |
| **Regime + thr .25 + MACD/RSI only** | **+0.58** | **+0.9** | **−0.14** | **5/6** |

Each individual fix (trend-regime filter, higher conviction threshold) *reduces the bleeding* but
most configs still lose. The one config that flips consistently positive **drops the Sentiment and
Elliott-Wave terms** and keeps only the two classic technical signals (MACD trend + RSI), gated by a
trend-regime filter and a higher conviction threshold.

## 3. The most robust config found
**Trend-following core: MACD + RSI only, trend-regime filter ON, conviction threshold 0.25.**
- Weights: `technical` (MACD) and `liquidity` (RSI) only; `sentiment = 0`, `elliottWave = 0`.
- `signalThreshold = 0.25`, `useRegimeFilter = true`.

| Market/Window | Sharpe | PnL% | Win% | Profit Factor | Trades |
|---|---:|---:|---:|---:|---:|
| SOL / 30d | +0.50 | +0.4 | 22.2 | 1.12 | 9 |
| SOL / 90d | +0.60 | +1.2 | 31.2 | 1.23 | 16 |
| BTC / 30d | −0.14 | −0.0 | 33.3 | 0.64 | 3 |
| BTC / 90d | +0.97 | +0.8 | 42.9 | 1.89 | 7 |
| ETH / 30d | +1.25 | +0.9 | 28.6 | 1.37 | 7 |
| ETH / 90d | +0.56 | +0.9 | 33.3 | 1.23 | 15 |

**But be skeptical:**
- The **edge is weak** (median +0.9% over the window) and likely **break-even-to-negative after fees/funding**.
- **Trade counts are tiny** (3–16). BTC/30d had only 3 trades — statistically meaningless. Low N = low confidence.
- The backtest uses **synthetic, momentum-derived "sentiment,"** not real news — so "sentiment hurts" here
  is partly an artifact. Real-news sentiment is **untested** by this backtest.

## 4. What this means for "the best strategy ever"
- There is **no** setting that prints money in all conditions. The current default actively loses.
- The most *robust* thing the data supports is a **disciplined trend-follower**: fewer, higher-conviction,
  with-trend trades — not the busy 4-factor default.
- Honest expectation: a well-built version of this is **break-even-to-slightly-positive** pre-fees on
  recent data. Anyone promising more is guessing or overfitting.

## 5. Recommended next steps (proper methodology)
1. **Walk-forward / out-of-sample:** tune on one period, validate on a *later* untouched period.
2. **Include costs:** model taker fees (~6 bps), funding, and slippage in the backtest before trusting any edge.
3. **More data:** test 6–12 month windows and bear/bull/chop regimes separately.
4. **Significance:** require ≥30–50 trades per test before believing a win rate / Sharpe.
5. **Paper-trade the candidate** for weeks before risking real capital.

_Reproduce: `POST /api/backtest` with `{ token, interval, lookbackDays, weights, signalThreshold, useRegimeFilter }`._

---

## 6. Adding new signals (Supertrend, Fair Value Gap, DCA mean-reversion)
We added three indicators and let the backtest decide, sweeping each on top of the MACD+RSI core
(regime filter ON, threshold 0.25), across SOL/BTC/ETH × 30/90d:

| Config | Median Sharpe | Median PnL% | Worst Sharpe | Positive windows | Med Trades |
|---|---:|---:|---:|---:|---:|
| MACD + RSI (prior best) | 0.58 | +0.9 | −0.14 | 5/6 | 8 |
| **MACD + RSI + Supertrend** | **3.87** | **+6.6** | **+0.08** | **6/6** | 49 |
| MACD + RSI + FVG | −0.28 | −0.4 | −1.34 | 2/6 | 7 |
| MACD + RSI + DCA | −0.36 | −0.6 | −1.65 | 1/6 | 7 |
| MACD + RSI + ST + FVG + DCA | 0.97 | +1.2 | −3.11 | 5/6 | 11 |
| Supertrend + FVG only | 0.11 | −0.0 | −7.98 | 3/6 | 43 |

**Finding:** **Supertrend (ATR trend follower) is the high-value add** — adding it to MACD+RSI made the
strategy positive in **6/6** market/window combinations with a worst-case Sharpe of +0.08 (never negative)
and a healthy trade count (~49). **FVG and DCA each *reduced* performance** on this data and are kept
**off by default** (they remain available as opt-in weights). This is a concrete example of "more signals
≠ better": the data, not intuition, picks the components.

## ✅ Recommended default config (data-selected)
```
weights = { technical: 0.9 (MACD), liquidity: 0.85 (RSI), supertrend: 0.9,
            sentiment: 0, elliottWave: 0, fvg: 0, dca: 0 }
signalThreshold = 0.25
useRegimeFilter = true
```
Still **in-sample** — validate walk-forward and model fees/funding before trusting it live. Sharpe 3.87 on
30–90d windows will **not** persist unchanged; treat it as "robustly non-losing," not a guarantee.
