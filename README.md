# Cortex Alpha — Solana Trade Classifier

A quantitative trading dashboard + autonomous trading daemon for **SOL / ETH / BTC perpetuals**.
A composite technical bias (MACD + RSI + Supertrend) drives a **regime-switched** strategy —
momentum when the market trends, mean-reversion range-fades when it chops — executed on
**Jupiter Perps** via the `jup` CLI, with a fully **on-chain-verified trade journal**. Trade
frequency comes from **breadth** (scanning three markets with the same validated 1h strategy),
never from lower per-trade quality; the bot holds at most **one position at a time** across all
markets.

- **Full strategy write-up:** [docs/STRATEGY.md](docs/STRATEGY.md)
- **Backtest methodology & results:** [STRATEGY_RESULTS.md](STRATEGY_RESULTS.md)
- **API reference:** [docs/API.md](docs/API.md) · **Testing:** [docs/TESTING.md](docs/TESTING.md)

> ⚠️ Backtest numbers are in-sample and optimistic. The honest expectation is
> break-even-to-slightly-positive pre-fees. Expect **~3–4 trades/week in trending markets and
> near-zero in chop** — long quiet stretches are the strategy working, not the bot being broken
> (check the audit log: it records a reasoned "STAND ASIDE" every cycle).

## The strategy in 30 seconds

Every **20 minutes** the daemon pulls fresh **1-hour candles** and asks four questions:

1. **Is there a directional bias?** A weighted composite Σ of MACD, RSI and Supertrend must exceed
   ±0.25 conviction.
2. **What kind of market is this?** ADX(14) routes the decision: strong trend (>25) → momentum
   entry; ranging (≤15) → fade a rejection off the range edge; in between (15–25) → **stand aside**
   (weak-trend entries lost to fees in every backtest variant). If the primary market has no
   actionable signal, the daemon **scans the other configured markets (SOL → ETH → BTC)** with the
   identical gates and lets the first qualifying candidate take the single position slot.
3. **Is the entry safe?** Trend-alignment, no-chasing, macro, cooldown and pyramiding gates all
   have to agree.
4. **If a position is open — manage it.** An ATR-scaled ladder banks half at +1.5×ATR, moves the
   stop to breakeven, and trails the rest. Hard TP/SL live **on-chain** from the moment of entry.

## Timeframes — what interval is used for what

| Timeframe | Used for | Where |
|---|---|---|
| **1h candles** | All signal indicators: composite Σ, ADX(14), RSI, MACD, EMA200, ATR, Supertrend | daemon `interval` (clamped to `1h`/`1d` by `normalizeTradeInterval`) |
| **every 20 min** | Daemon wake-up: evaluate entry signal / manage the open position | `MIN_SYNC_MINUTES` |
| **instant** | Hard TP + SL **trigger orders on-chain** — Jupiter keepers fill them without the bot being awake | attached on every REAL open |
| **2 × 1h bars** | Entry confirmation (current + previous bar must agree on direction) | 2-bar confirmation |
| **last ~60 min** | Range window for the mean-reversion fade (ranging regime only) | `MEAN_REVERSION_LOOKBACK_MINUTES` |
| **8 × 1h bars** | 200-EMA slope measurement (blocks longs into a falling EMA and vice versa) | `REGIME_SLOPE_BARS` |
| **200 × 1h bars (~8 days)** | 200-EMA primary-trend regime (long above / short below) | `useRegimeFilter` |
| **5 days** | Macro regime: DXY / 10-Y yield / VIX trend → RISK-ON / OFF / NEUTRAL | `useMacroFilter` |
| **30 min / 45 min / 6 h** | Entry cooldown / two-loss pause / circuit-breaker auto-reset | risk rails |
| **360 min** | Stagnation time-stop: still under +0.5% and no scale-out → cut it (perps borrow fees bleed ~0.087%/h even when price goes nowhere) | `STAGNANT_EXIT_MINUTES` |
| **rolling 24 h** | Max 6 position opens across all markets | `MAX_OPENS_PER_24H` |
| **per cycle** | Multi-market scan order when flat: primary token first, then the other configured markets | `tokens` (default SOL, ETH, BTC) |

**Why 1h and not 5m/15m?** Round-trip fees + hourly borrow cost ~0.35% per trade, while sub-hourly
ATR targets are only ~0.5–0.9% — the Mar–Jul 2026 sweep found **every** sub-hourly entry variant
fee-negative. The server now refuses sub-hourly trading intervals at config load *and* save
(backtest endpoints still accept them for research). A sudden 5-minute reversal is therefore
*entered* late by design (noise-spikes mean-revert; real regime changes last days) — but an **open
position** is still protected instantly by the on-chain triggers (see below).

## Entry pipeline

One shared code path (`resolveEntry` → `entryGateBlock`) drives the live trader, the server
backtest and the macro benchmark, so live behaviour cannot drift from what was validated.

```mermaid
flowchart TD
    T["⏱ every 20 min<br/>fetch 1h candles"] --> A["Composite bias Σ<br/>MACD ×0.90 · RSI ×0.85 · Supertrend ×0.90"]
    A -->|"abs(Σ) ≤ 0.25"| H1["HOLD — no conviction"]
    A -->|"abs(Σ) > 0.25"| B{"ADX(14)<br/>regime switch"}

    B -->|"ADX ≤ 15<br/>RANGING"| D["Mean-reversion range fade<br/>fade a REJECTION off the ~60-min range edge:<br/>bar wicks past the extreme but closes ≥35%<br/>back inside — no knife-catching"]
    B -->|"15 < ADX ≤ 25<br/>WEAK TREND"| H2["STAND ASIDE<br/>(fee-negative zone —<br/>every backtest variant lost here)"]
    B -->|"ADX > 25<br/>STRONG TREND"| C["Momentum entry checks<br/>• 200-EMA side AND slope agree (never fade the primary trend)<br/>• MACD-sign OR RSI(21) timing cross<br/>• extension guard: price ≤ 1.5×ATR from EMA26 (no chasing)<br/>• chop-zone guard · 2-bar confirmation"]

    C --> E{"Risk rails"}
    D --> E
    E -->|"any rail trips"| H3["HOLD — audit-logged reason"]
    E -->|"all clear"| F["OPEN on Jupiter Perps (jup CLI)<br/>with hard on-chain TP + SL triggers attached"]

    E -.-> R["• macro filter: no longs in RISK-OFF, no shorts in RISK-ON<br/>• ONE position across ALL markets — wallet re-checked ON-CHAIN before every open<br/>• 30-min cooldown between entries · 45-min pause after 2 losses<br/>• max 6 opens/24h (MAX_OPENS_PER_24H) · circuit breaker at 8 straight losses"]
```

## Exit ladder — volatility-adaptive, in price space

All levels scale with the ATR captured at entry (floored at 0.4% of price so a quiet tape can't
place the stop inside noise). Long shown; short mirrors.

```
entry + 4.0×ATR ── HARD TP CAP ──────── close the runner
peak  − 2.0×ATR ── TRAILING STOP ────── ratchets behind the best price (favorable-only)
entry + 1.5×ATR ── SCALE-OUT 50% ────── bank half, move stop to breakeven → risk-free runner
entry           ── BREAKEVEN STOP ───── (after the scale-out)
entry − 1.5×ATR ── INITIAL HARD STOP ── loss cap, live ON-CHAIN from the first second
```

Two additional exits live outside the ladder:

- **Stagnation time-stop** — no scale-out and still under +0.5% (leveraged) after **6 hours** →
  cut it before borrow fees eat it (a 19h "flat" short once realized −1.89% purely from fees).
- **In-profit reversal** — the signal flips *and* the trade has cleared a ≥1.5% fee/noise buffer →
  bank it and re-enter the opposite side. A flip while under water is ignored; the stop governs
  the downside (prevents fee-eaten micro-loss churn).

## What if the market flips violently between checks?

Two independent protection layers with different reaction speeds:

```mermaid
flowchart LR
    P["Open position"] --> L1["⚡ Layer 1 — ON-CHAIN (instant)<br/>hard TP + SL trigger orders held by Jupiter keepers<br/>fill at trigger price even if the bot is asleep or down"]
    P --> L2["🔄 Layer 2 — daemon loop (every 20 min)<br/>partial scale-out · breakeven move · ATR trail<br/>stagnation time-stop · in-profit reversal exit"]
```

A 5-minute crash against your position hits the Layer-1 stop within seconds. What the 1h interval
changes is only how quickly a **new** trend is *entered* — deliberately slow, because 5-minute
"trend changes" are usually noise and the fees on trading them are what historically lost money.

## Execution & journal

- `tradingMode` **PAPER** simulates everything; **REAL** executes on Jupiter Perps via the `jup`
  CLI (`executeOnChainTradeServerSide`), sized by `positionSizeUsd` (default **$20** notional;
  collateral = size ÷ leverage, Jupiter requires ≥ $10 collateral) at ≤ `MAX_LEVERAGE` (5) — or by
  `allocationPercent` if `positionSizeUsd` is 0.
- **Trade journal is on-chain-verified only:** REAL trades appear only once matched to actual
  on-chain fills from `jup perps history` — prices, fees and PnL come from the chain, never from
  the bot's own estimates. Paper/signal rows are clearly labeled simulated.

## ⚠️ Ops: deploys reset the daemon

Railway has no persistent volume — **every deploy resets the daemon state from the repo's seed
[jupiter_config_state.json](jupiter_config_state.json), which ships `enabled: false`**. After each
push, re-enable the bot (dashboard toggle or `POST /api/jupiter-config {"enabled":true}`) and
sanity-check `interval`/`positionSizeUsd` via `GET /api/jupiter-config`. The pre-open on-chain
position check makes a mid-trade restart safe (it can't double exposure), but the local tracker of
an open position is lost across deploys.

## Run locally

**Prerequisites:** Node.js ≥ 20

1. Install dependencies: `npm install`
2. Set `GEMINI_API_KEY` in [.env.local](.env.local) (used for optional news-sentiment scoring)
3. Run the app: `npm run dev` (Vite UI + Express server via `tsx server.ts`)

Other scripts: `npm run build` (production bundle), `npm run lint` (typecheck), `npm test`,
`npx tsx scripts/macro-benchmark.ts` (macro A/B benchmark).
