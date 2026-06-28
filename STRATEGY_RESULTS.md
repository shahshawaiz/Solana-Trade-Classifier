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

## ✅ Current configuration & results (2026-06-28)

The live strategy now runs the **moderate entry gates** (ADX>15 · 15m Supertrend · MACD-sign OR
RSI-timing) plus a **volatility-adaptive exit** — partial scale-out (50% at +1.5×ATR) + breakeven +
ATR trailing stop + 4×ATR hard cap. Entries and this exit are shared verbatim between the live
daemon and this `/api/backtest` engine (see [docs/STRATEGY.md](docs/STRATEGY.md)). Regenerated from
`/api/backtest` (1h, 5× leverage, 0.1%/close fee, CryptoCompare/Yahoo OHLC):

| Market/Window | Sharpe | PnL% | Win% | Profit Factor | Trades | Scale-outs |
|---|---:|---:|---:|---:|---:|---:|
| SOL / 30d | −2.15 | −3.7 | 28.6 | 0.71 | 21 | 5 |
| SOL / 90d | +1.51 | +5.9 | 33.3 | 1.27 | 57 | 17 |
| BTC / 30d | +0.75 | +0.8 | 40.0 | 1.14 | 20 | 6 |
| BTC / 90d | +0.15 | +0.3 | 38.2 | 1.02 | 55 | 16 |
| ETH / 30d | +2.47 | +3.9 | 41.2 | 1.76 | 17 | 5 |
| ETH / 90d | +1.85 | +7.1 | 41.2 | 1.57 | 51 | 17 |
| **Median** | **+1.13** | **+2.3** | — | — | — | — |

**Positive in 5/6 windows.** Versus the prior best config (§3 below: median Sharpe +0.58, PnL +0.9%,
3–16 trades), the moderate gates restore a tradeable frequency (17–57 trades) and the partial/trail
exit lifts the median while keeping the worst case shallow (SOL/30d −3.7%). Note the **low win rates
(29–41%) with profit factors > 1** — by design: the scale-out + trail produces many small losers and
fewer larger winners (avg win ≈ 2.5× avg loss).

**Still be skeptical:** in-sample, no funding/slippage, only a 0.1%/close fee. The honest expectation
remains break-even-to-slightly-positive after real costs. Validate out-of-sample and paper-trade first.

---

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

---

## 7. Live trade-history post-mortem (8 closed trades, 5x, SOL)
Analysis of the actual Jupiter auto-trader log (6/21–6/22):

| # | Side | Entry | Exit | Realized % | Hold | Exit cause (inferred) |
|---|---|---:|---:|---:|---|---|
| 1 | SHORT | 72.66 | 73.21 | −3.84 | 3h19m | stop / reversal |
| 2 | LONG | 74.33 | 73.98 | −2.32 | 34m | reversal |
| 3 | SHORT | 74.14 | 74.04 | +0.64 | 4m | reversal (instant) |
| 4 | SHORT | 74.14 | 73.66 | +3.23 | 1h34m | take-profit-ish |
| 5 | SHORT | 74.13 | 74.15 | −0.14 | 5m | reversal (instant) |
| 6 | LONG | 74.33 | 74.08 | −1.66 | 4m | reversal (instant) |
| 7 | LONG | 74.25 | 74.16 | −0.60 | 14m | reversal |
| 8 | LONG | 74.49 | 74.23 | −1.76 | 27m | reversal |

**Net ≈ −6.45% · win rate 25% (2/8).**

**What went wrong:**
1. **Every LONG lost (0/4).** All four longs were opened at ~74.2–74.5 while price was sliding — counter-trend longs into a falling market. Shorts were ~break-even (+0.11% over 4). The losses were *directional*, not sizing.
2. **The macro backdrop was RISK-OFF the whole time** — DXY, US10Y and VIX were all rising. Longing crypto into a rising-dollar/rising-yield/rising-vol tape is the textbook losing setup, and the log confirms it.
3. **Whipsaw / overtrading.** Trades 3, 5, 6 closed in **4–5 minutes** on "trend reversal" — the signal flipped almost immediately after entry. The TP (~6%) / SL (~3%) limits almost never decided the outcome; the time-limit and reversal rules did. The engine was thrashing inside a chop zone.
4. **Re-entering the same level.** Four entries clustered at 74.1–74.5 — the bot kept re-arming the same losing level instead of standing aside.

**The fix → macro regime filter** (now implemented in `runBacktest`, optional `macroRegime` arg):
suppress new **longs** while macro is RISK-OFF and new **shorts** while RISK-ON. On this exact history the filter would have **blocked all four losing longs**, turning −6.45% into ≈ **−0.11%** (the shorts alone). It also cuts the whipsaw count by removing entries that fight the macro tape.

## 8. Macro-filter benchmark (with macro indicators)
Same MACD+RSI core (thr 0.25, 5x, 1h candles) run **with the macro filter OFF vs ON**, where the
regime is derived from the **real 5-day trend of DX-Y.NYB (DXY) + ^TNX (US10Y) + ^VIX**.
Reproduce: `npx tsx scripts/macro-benchmark.ts`.

### Macro filter OFF (baseline)
| Market/Window | Sharpe | PnL% | Win% | Profit Factor | Trades |
|---|---:|---:|---:|---:|---:|
| SOL / 30d | +5.55 | +89.3 | 61.9 | 3.32 | 21 |
| SOL / 90d | +2.15 | +65.1 | 44.8 | 1.51 | 87 |
| BTC / 30d | +1.66 | +11.1 | 29.6 | 1.41 | 27 |
| BTC / 90d | +0.88 | +9.9 | 44.0 | 1.18 | 91 |
| ETH / 30d | +4.08 | +45.4 | 60.0 | 2.92 | 25 |
| ETH / 90d | +1.89 | +50.7 | 40.6 | 1.48 | 96 |
| **Median** | **+2.02** | **+48.0** | — | — | — |

### Macro filter ON
| Market/Window | Sharpe | PnL% | Win% | Profit Factor | Trades |
|---|---:|---:|---:|---:|---:|
| SOL / 30d | +7.21 | +144.3 | 58.8 | 5.27 | 17 |
| SOL / 90d | +3.16 | +123.4 | 47.9 | 2.01 | 73 |
| BTC / 30d | +2.41 | +18.6 | 28.6 | 1.74 | 21 |
| BTC / 90d | +2.31 | +39.3 | 51.4 | 1.62 | 72 |
| ETH / 30d | +5.00 | +67.6 | 52.4 | 4.04 | 21 |
| ETH / 90d | +3.34 | +139.3 | 45.8 | 2.15 | 83 |
| **Median** | **+3.25** | **+95.5** | — | — | — |

**Result:** the macro filter improved **Sharpe and PnL in 6/6 windows**, lifted median Sharpe
**+2.02 → +3.25** and median PnL **+48% → +95.5%**, while **reducing trade count in every window**
(it removes counter-macro entries — fewer, better trades). Profit factor rose in all six.

**Honest framing (same caveats as §0):** these are **in-sample, recent (30–90d), 5x-leveraged, fee/
funding-free** numbers on a period that was largely favourable — the absolute magnitudes will **not**
persist and are inflated by leverage. What is robust is the **direction and consistency**: the macro
gate helped in *every* market/window with no exceptions, which is exactly the failure mode the live
trade log exhibited (counter-macro longs). Validate walk-forward and with costs before trusting the size.

## 9. Short-term scalping benchmark — 5-minute candles, 5x, $10 size, WITH fees
Same core, but **5m candles**, **$10 fixed position size**, **5x leverage**, and a **6 bps taker fee
per side** (open + close, on notional — the optimistic floor; excludes price impact, borrow/funding,
slippage). Windows 7d / 30d (Yahoo caps 5m history at ~60d). Reproduce:
`INTERVAL=5m LEVERAGE=5 POSITION_USD=10 FEE_BPS=6 WINDOWS=7,30 npx tsx scripts/macro-benchmark.ts`.

### Macro filter OFF
| Market/Window | Sharpe | Win% | Trades | Gross P&L | Fees | Net P&L ($10@5x) |
|---|---:|---:|---:|---:|---:|---:|
| SOL / 7d | −16.43 | 39.7 | 68 | −$3.75 | $4.08 | −$7.83 |
| SOL / 30d | −6.90 | 44.6 | 276 | +$0.55 | $16.56 | −$16.01 |
| BTC / 7d | −7.58 | 45.6 | 68 | +$1.85 | $4.08 | −$2.23 |
| BTC / 30d | −13.64 | 47.0 | 283 | −$2.96 | $16.98 | −$19.94 |
| ETH / 7d | −28.77 | 32.9 | 76 | −$4.94 | $4.56 | −$9.50 |
| ETH / 30d | −9.64 | 43.5 | 285 | −$1.42 | $17.10 | −$18.52 |
| **Total** | med −11.6 | — | 1056 | **−$10.66** | **$63.36** | **−$74.02** |

### Macro filter ON
| Market/Window | Sharpe | Win% | Trades | Gross P&L | Fees | Net P&L ($10@5x) |
|---|---:|---:|---:|---:|---:|---:|
| SOL / 7d | −19.55 | 40.0 | 55 | −$4.71 | $3.30 | −$8.01 |
| SOL / 30d | −4.47 | 46.1 | 193 | +$2.04 | $11.58 | −$9.54 |
| BTC / 7d | −1.58 | 52.9 | 51 | +$2.62 | $3.06 | −$0.44 |
| BTC / 30d | −7.78 | 49.7 | 189 | +$1.68 | $11.34 | −$9.66 |
| ETH / 7d | −24.59 | 36.5 | 63 | −$3.36 | $3.78 | −$7.14 |
| ETH / 30d | −8.01 | 44.8 | 194 | −$1.51 | $11.64 | −$13.15 |
| **Total** | med −7.9 | — | 745 | **−$3.24** | **$44.70** | **−$47.94** |

**Verdict — 5-minute scalping does NOT work here:**
1. **No gross edge at 5m.** Even *before fees*, total gross P&L is **negative** (OFF −$10.66, ON −$3.24).
   The MACD+RSI trend core that was strongly positive at 1h is **just noise at 5m** — the timeframe is
   too fast for this signal. Win rates sit at 33–53% (coin-flip), unlike the cleaner 1h behaviour.
2. **Fees bury it.** On $10 positions the per-trade edge is ~$0.00–0.01 while each round trip costs
   ~$0.06 (6 bps × $50 notional × 2). Over ~1,000 trades that's **$63 of fees** — the fees are an order
   of magnitude larger than any gross edge. Real costs (price impact + Jupiter borrow/funding +
   slippage) are **higher still**, so the true result is worse than shown.
3. **The macro filter helps but cannot rescue it.** It improved Sharpe in 5/6 windows and roughly
   **halved the net loss** (−$74 → −$48 total) by cutting ~30% of the counter-macro trades — but a
   smaller loss is still a loss.

**Takeaway:** keep the engine on **1h** (or 15m at most). 5-minute, $10, 5x is a structurally
losing configuration: tiny per-trade edge × high trade count × fixed fees = guaranteed bleed. If you
must trade faster, you need a real microstructure edge and maker-rebate-level fees, neither of which
this strategy has.

## 10. Macro filter shipped to LIVE trading + backtest (was backtest-only)
The macro regime filter is now wired into the running system, not just the offline benchmark:

- **Automated trading (live):** both daemons (Jupiter on-chain auto-trader + the shared Telegram
  alert engine) call `getMacroRegimeCached()` before opening a position and **skip counter-macro
  entries** — no new LONGs while RISK-OFF, no new SHORTs while RISK-ON. Controlled by
  `useMacroFilter` (default **on**); a macro/Yahoo outage resolves to NEUTRAL so it can never block
  trading entirely. The regime read is cached (5 min) and shared with the `/api/macro` UI panel.
- **Backtest (`/api/backtest`):** accepts `useMacroFilter` (default **on**); it fetches real daily
  macro history for the window via `buildHistoricalMacroRegime()` and suppresses counter-macro
  entries in the simulation, mirroring live. Quick live check (SOL/30d/1h/5x): OFF → 29 trades,
  −0.58%, Sharpe −0.37; **ON → 23 trades, −0.04%, Sharpe +0.04** (fewer, better trades).
- **Config:** auto-trader timeframe moved from 15m → **1h** per §9. Disable the filter per engine
  with `"useMacroFilter": false` in the respective state JSON, or per backtest via the request body.

### Trade journal — permanent, never reset
The 8 real trades from the live log are seeded into `trade_journal.json` (append-only store).
Every close now writes straight to it (`appendJournalEntry`), and **no reset path** — build script,
fresh-deploy reset, manual reset, or circuit breaker — touches it. Real history is never overwritten.
