# Cortex Alpha — Complete Trading Strategy

This is the authoritative, end-to-end description of the automated strategy: how a bias is formed,
when the bot enters, how it exits, the risk controls around it, and where each piece lives in code.
It also documents the three engines (live, server backtest, benchmark) and their parity status.
The app's **Strategy** tab animates these rules scenario by scenario
([StrategyPlaybook.tsx](../src/components/StrategyPlaybook.tsx), engine in
[strategyPlaybook.ts](../src/lib/strategyPlaybook.ts)). `npm test` checks that every scenario closes
exactly as `server.ts` would, so update the scenario engine whenever the exit rules change.

> ⚠️ **Reality check.** Backtest numbers are in-sample and optimistic; they exclude funding,
> slippage, and most fees. The honest expectation for a well-built version of this is
> *break-even-to-slightly-positive pre-fees*. See [STRATEGY_RESULTS.md](../STRATEGY_RESULTS.md) for
> the methodology and the skeptical framing. The shipped config runs **REAL** execution — switch
> `tradingMode` to `PAPER` to simulate.

---

## 1. Pipeline at a glance

```
quotes (OHLC) + news ──▶ performCoreAnalysis ──▶ Σ (composite bias)
                                                   │
                       ┌───────────────────────────┘
                       ▼
   direction = Σ vs ±THRESHOLD  +  200-EMA regime  +  Chop-Zone guard
                       │
                       ▼
   resolveEntry — ADX(14) regime switch:
     ├─ ADX > ADX_GATE_MIN (TRENDING) ─▶ momentum path:
     │      entryGateBlock: 15m Supertrend dir · (MACD-sign OR RSI-timing)
     └─ ADX ≤ ADX_GATE_MIN (RANGING) ──▶ stand aside (default), or — opt-in via
            meanReversionEnabled — mean-reversion range fade off the ~60-min range edge
                       │
                       ▼
   2-bar confirmation  +  macro filter  +  cooldown / daily-cap / circuit-breaker
                       +  pre-open ON-CHAIN position check (no pyramiding, REAL mode)
                       +  orphan adoption (an untracked on-chain position is managed, not ignored)
                       │
                       ▼  open
   evaluateExit (per tick):  partial scale-out + breakeven + ATR trail + TP cap
                       +  600-min stagnation time-stop
                       +  signal exit above +1.5%: reversal OR thesis lapse (signal → HOLD)
```

The live daemon trades **1h candles** (clamped to `1h`/`1d` by `normalizeTradeInterval` at config
load *and* save — the Mar–Jul 2026 sweep found every sub-hourly variant fee-negative). The
canonical backtest in STRATEGY_RESULTS.md also runs **1h**; backtest endpoints still accept
sub-hourly intervals for research. See the README's "Timeframes" table for what every other
window (20-min loop, 60-min range, 5-day macro, …) is used for.

**Market scope: Solana only (since 2026-08-16).** `tradeTokens()` still whitelists Jupiter Perps'
full universe (SOL/ETH/BTC) and `config.tokens` can opt other markets back in, but the default scan
is `["SOL"]`: the multi-asset scan fragmented a small wallet's balance so that no market cleared
the $10 collateral minimum and REAL trades silently fell back to PAPER (no real trades Jul 20 –
Aug 17). There is only ever **one open position** — before any REAL open the wallet's actual
on-chain positions are checked and *any* existing position aborts the open.

---

## 2. Composite bias Σ — `performCoreAnalysis` ([server.ts](../server.ts))

Σ is a weighted, normalized blend of component scores in `[-1, +1]`. Default weights (the
data-selected robust config — sentiment and Elliott Wave are **off** because they hurt on
SOL/BTC/ETH × 30/90d):

| Component | Weight key | Default | Notes |
|---|---|---:|---|
| MACD trend | `technical` | 0.90 | Primary trend signal |
| RSI | `liquidity` | 0.85 | Momentum / mean-reversion |
| Supertrend (ATR) | `supertrend` | 0.90 | ATR-based trend overlay |
| News sentiment | `sentiment` | 0.00 | Off by default; Gemini/heuristic NLP when on |
| Elliott Wave | `elliottWave` | 0.00 | Off by default |
| Fair Value Gap | `fvg` | 0.00 | Off by default |
| DCA mean-reversion | `dca` | 0.00 | Off by default |

```
Σ = Σ(componentScore × weight) / Σ(weights)
```

**Catalyst overrule:** when sentiment is enabled and a headline scores ≥ +0.85 / ≤ −0.85, Σ is
forced to ±1.0 and the Chop-Zone + 2-bar confirmation are bypassed (an authoritative news catalyst).

---

## 3. Entry logic

A long/short candidate must clear **all** of the following.

### 3.1 Conviction threshold
`Σ > +SIGNAL_THRESHOLD` ⇒ LONG candidate; `Σ < −SIGNAL_THRESHOLD` ⇒ SHORT candidate.
`SIGNAL_THRESHOLD = 0.25` (the robust value from the config sweep). Within ±0.25 ⇒ HOLD.

### 3.2 Trend-regime filter (200-EMA side + slope)
Only longs **above** the 200-EMA, only shorts **below** it — AND the EMA's **slope** must not
clearly oppose the side (`regimeAllowsEntry`, shared live/backtest). A long into a 200-EMA that
fell more than `REGIME_SLOPE_MIN_PCT` (0.05% of price) over the last `REGIME_SLOPE_BARS` (8) bars
is blocked even if price is momentarily above it: price crossing a falling EMA on a 2–3h bounce is
not an uptrend (that exact false-positive produced the 2026-07-09 −1.98% long). A flat/ambiguous
slope blocks nothing. Toggle with `useRegimeFilter` (default ON).

### 3.3 Chop Zone guard
If RSI is in the neutral 40–60 band **and** the fast/slow MAs squeeze (spread < 0.30%), force HOLD —
avoids sideways fakeouts. Skipped on a catalyst overrule.

### 3.4 Regime switch — `resolveEntry` ([server.ts](../server.ts))
Single source of truth for all engines. ADX(14) decides **which strategy** evaluates the entry:

- **ADX > `ADX_GATE_MIN` (default 15) → TRENDING:** the momentum path below (composite candidate
  side gated by `entryGateBlock`).
- **ADX ≤ `ADX_GATE_MIN` → RANGING:** momentum's composite score is unreliable by definition here —
  the candidate side is **ignored** and the mean-reversion range fade (3.6) looks for an entry
  instead **only if** `meanReversionEnabled` is set. **Default OFF (since 2026-09):** before the
  `signalSide()` fix the live daemon could never parse a "Range Fade — …" label, so live has in
  practice always been momentum-only. In the parity replay (§10), adding mean-reversion helped only
  in the Mar–May chop and cut the overall profit factor from 1.38 to 1.12. With it off, the bot
  stands aside in ranging markets.

### 3.5 Entry gates (trending regime) — `entryGateBlock` ([server.ts](../server.ts))
The **single shared gate stack** used by both the live trader and the server backtest. "Moderate"
profile (chosen to stop the bot standing aside every cycle):

1. **ADX(14) > `ADX_GATE_MIN`** (default **15**, was 20) — trend-strength filter; ranging markets stand aside.
   Additionally **ADX(14) > `ADX_ENTRY_MIN`** (default **25**) for the momentum entry itself: a Mar–Jul 2026
   1h sweep (fees + borrow modeled) found ADX 15–25 momentum entries fee-negative in *every* variant tested,
   while ADX>25 entries ran ~62% win rate / PF 1.5 in the trending window. 15–25 = trend exists, stand aside.
2. **15m Supertrend direction** — block counter-trend entries on the higher timeframe. Only applied
   when trading 5m/15m candles, so it is **inactive at the 1h live interval** (kept for research runs).
3. **Momentum trigger = MACD-sign OR RSI(21)-timing** — *either* confirms (previously required **both**,
   plus a MACD histogram "rising 2 bars" condition, which almost never coincided → the bot never traded).
   - MACD-sign: histogram > 0 for LONG, < 0 for SHORT.
   - RSI-timing: RSI(21) crossed up through 35 (LONG) / down through 65 (SHORT) within the last 2 bars.
4. **Extension guard (`EXT_MAX_ATR`, default 1.5)** — no chasing: block entries further than 1.5×ATR from
   the EMA26 mean. The journal's characteristic losers entered late into extended swings (bounce-top long,
   capitulation-low short); wait for price to return toward the mean before joining the trend.

### 3.6 Mean-reversion range fade (ranging regime) — `evaluateMeanReversionSignal`
Fires only when ADX says the market is ranging. Fades price back toward the middle of its recent
range, with a strict **"no knife catching"** rule — never enter on the mere *touch* of a range
edge, only on a **rejection**:

- Range = high/low of the last `MEAN_REVERSION_LOOKBACK_MINUTES` (default 60 min, ≥6 bars),
  excluding the current bar.
- **SHORT:** the bar wicks **above** the range high but closes back below it, retracing ≥
  `MEAN_REVERSION_REJECTION_FRAC` (default 0.35) of its own range from the extreme.
- **LONG:** mirror off the range low.
- A touch with no rejection, or a close *through* the level (a real breakout), never fires.

### 3.5 2-bar confirmation
Enter only when the current bar **and** the previous bar agree on direction. A catalyst overrule
fires immediately and bypasses the wait.

### 3.6 Macro regime filter
Block counter-macro entries: no new LONGs while the dollar/yields/volatility backdrop is **RISK-OFF**,
no new SHORTs while **RISK-ON**. Regime = 5-day trend of DX-Y.NYB, ^TNX, ^VIX. `useMacroFilter` (default ON);
a macro data outage resolves to NEUTRAL (no effect).

---

## 4. Exit strategy — `evaluateExit` ([server.ts](../server.ts))

Volatility-adaptive, **shared** by the live daemon and the benchmark. All levels are in price space
(leverage-independent) and scaled by the ATR captured at entry. Defaults are env-tunable.

| Stage | Rule | Env (default) |
|---|---|---|
| ATR floor | ATR is floored at `EXIT_MIN_ATR_PCT`% of price before any level is computed — a quiet tape can't place the stop inside minute-to-minute noise (the 2026-07-03 stop-out churn) | `EXIT_MIN_ATR_PCT` (0.4) |
| Initial stop | entry ∓ `EXIT_SL_MULT`×ATR | `EXIT_SL_MULT` (1.5) |
| **Partial scale-out** | at entry ± `EXIT_PARTIAL_MULT`×ATR, close `EXIT_PARTIAL_FRAC` of size **and move stop to breakeven** | `EXIT_PARTIAL_MULT` (1.5), `EXIT_PARTIAL_FRAC` (0.5) |
| Trailing stop | after the scale-out, ratchet the stop to peak ∓ `EXIT_TRAIL_MULT`×ATR (favorable-only) | `EXIT_TRAIL_MULT` (2.0) |
| Hard TP cap | close the runner at entry ± `EXIT_TP_MULT`×ATR | `EXIT_TP_MULT` (4.0) |

**Intuition:** take half off the table at +1.5×ATR (locks profit, removes downside risk by moving the
stop to breakeven), then let the remaining half run behind a 2×ATR trailing stop up to a 4×ATR cap.

Two additional exits live in the callers:

- **Stagnation time-stop:** if a trade hasn't scaled out and is still below `STAGNANT_MIN_PNL_PCT`
  (+0.5% leveraged) after `STAGNANT_EXIT_MINUTES` (**600 min**, was 360), cut it. Shared constants across the
  live daemon and the backtest (previously the backtest hardcoded 90 min while live had **no** time
  exit — on perps, borrow fees accrue hourly on notional, so a going-nowhere position bleeds even
  when price doesn't move: the 2026-07-08 short lost −1.89% on a +0.08% adverse move over 19h).
  360 beat 90/180 in the July replay (tighter cut winners needing 4–7h to reach the partial). The
  September parity replay (§10) found 480, 600 and 720 **all** beat 360 in every window, and ≥840
  degrades again; 600 is the middle of that plateau. Eight of the 19 daemon-managed Aug–Sep live
  trades were time-stops, and seven of them lost.
- **Signal exit (`signalExitReason`, shared live + `/api/backtest` + replay):** once the trade has
  cleared the fee/noise buffer (`minReversalProfitPct`, default +1.5% leveraged):
  - **Reversal** — signal now points the other way → bank it; live may re-enter the other side on
    the same tick.
  - **Thesis lapse** — signal fell back to HOLD (Σ faded, chop, ADX or the extension guard now
    blocking) → bank it.
  Below the buffer a signal change is **ignored** and the stop/breakeven/trail/time-stop govern.
  *History:* from Aug 18 – Sep 25 2026 the live daemon did the thesis-lapse exit by accident —
  descriptive labels like "Hold (extended: …)" parsed to a `null` side, and `null` counted as a
  flip (journal: "signal flipped to null"). The backtest never modelled it (reversal-only, any
  profit). The replay showed the accidental rule was actually the better one, so it is now explicit,
  tested and identical in every engine.

Worked example (LONG, entry 100, ATR 2): stop starts at 97. At 103 → sell 50%, stop → 100 (breakeven).
At peak 106 → trail stop ratchets to 102. Pull back to 101.9 → close the runner as "Trailing Stop".
Net: half banked at +3, half at ~+2 — versus the old hard 3×ATR TP that capped the whole position.

---

## 5. Risk controls (live daemon)

| Control | Behaviour | Default |
|---|---|---|
| Single-position limit | At most one open position at a time **across all markets** | — |
| **Pyramiding guard (REAL)** | Right before every REAL open, the daemon queries the wallet's actual on-chain positions (`jup perps positions`) and aborts if **any** position exists (any asset) — a local-state desync can never double exposure | — |
| Sync-cadence floor | Both daemons' check loops are clamped to ≥ `MIN_SYNC_MINUTES` — sub-20m polling re-marked positions against every wiggle and churned out stops | 20 min |
| Cooldown | No new entry within `cooldownMinutes` of the last entry (global across markets) | 30 min |
| Consecutive-loss cooldown | Pause entries after 2 straight losses | 45 min |
| Daily trade cap | Max opens per rolling 24h across all markets (`MAX_OPENS_PER_24H`) | 6 |
| Circuit breaker | Pause **new** entries after N consecutive losses; auto-resets 6h after the last loss | `maxConsecutiveLosses` 8 |
| Failed-entry guard | Refuse to re-arm the **same side at the same price level** after a loss | — |
| SIDEWAYS suppression | No entry when trend is classified SIDEWAYS (unless force-triggered) | — |
| **Orphan adoption (REAL)** | If the tracker is flat but the wallet holds a position (an OPEN the CLI reported as failed but that landed, a restart, a redeploy), the daemon adopts it — on-chain entry, fresh ATR stop — and manages it with the normal exits. A failed OPEN is also re-verified on-chain before rollback, and TP/SL are attached if missing. Disable with `adoptOrphanPositions:false` if you trade the wallet by hand | on |

Exits are **never** blocked by these gates — only new entries.

---

## 6. Execution

- **PAPER**: fully simulated; positions, partials, and PnL are bookkept, no on-chain orders.
- **REAL**: opens/closes (including the partial scale-out's half-size reduce) execute on Jupiter Perps
  via the CLI (`executeOnChainTradeServerSide`). A position is only tracked if it actually opened
  on-chain (no phantom positions).

**Trade journal is on-chain-verified only.** The Journal tab / `/api/journal` reconciles every REAL
trade against `jup perps history` (the same feed Phantom reads) and **only surfaces a REAL trade
once it has matched actual on-chain fills** — fill prices, open/close fees, and realized PnL all
come from the chain, never from the bot's own signal-time estimate. Unmatched rows are held back
entirely (nothing is ever shown as "estimated — pending"). PAPER and signal-only rows pass through,
clearly labeled as simulated.

**On-chain pairing.** `buildTradesFromJupHistory` follows each side's position *size*: Increases
open or add to an episode, Decreases reduce it, and the trade closes when size is back to ~0. PnL
and fees are summed over every leg. The old per-side FIFO paired each Increase with the *next*
Decrease, so one partial scale-out or stacked open shifted every later pairing. That produced rows
like "LONG Sep 21 05:06 → Sep 23 07:44" that glued one trade's entry to another trade's exit.

**Journal seed.** `seed/trade-journal-seed.csv` (the Journal tab's own CSV export format) is merged
into the journal store on every load. The merge is idempotent: ids are deterministic (`csv-…`), and
a seed row is skipped when the store already holds the same trade (same side, exit within 2 min).
Railway wipes `os.tmpdir()` on each deploy, so this is what keeps the history. While a seed is
present, the one-time backfill no longer moves the stats window to "now". `JOURNAL_SEED_FILE`
overrides the path and `JOURNAL_SEED=off` disables it. Three rows in the 2026-09-26 export were
mispaired by the old FIFO backfill and are stored with their entry time and price corrected from
`jup perps history`:

| Exit | Exported entry | On-chain entry |
|---|---|---|
| Aug 25 12:03 | Aug 22 05:39 @ 93.89 | Aug 25 08:21 @ 100.56 |
| Sep 6 15:01 | Sep 6 07:17 @ 105.15 | Sep 6 14:17 @ 106.15 |
| Sep 23 07:44 | Sep 21 05:06 @ 111.47 | Sep 23 05:06 @ 119.08 |

**Audit log.** Every audit line from both daemons is also appended to a JSONL store (`AUDIT_LOG_FILE`,
default `os.tmpdir()/audit_log.jsonl`) and pruned to `AUDIT_RETENTION_DAYS` (30). Get it from
`GET /api/audit-log` (JSON) or `?format=csv`, or use the **Export 30d CSV** button in the audit
panel. The config keeps only the last 500 lines, for the live panel. For the 30 days to survive a
Railway redeploy, point `AUDIT_LOG_FILE` at a mounted volume.

---

## 7. The three engines & parity

| Engine | Location | Σ source | Entry gates | Exit | Use |
|---|---|---|---|---|---|
| **Live auto-trader** | `evaluateSignal` + Jupiter daemon, [server.ts](../server.ts) | `performCoreAnalysis` | `entryGateBlock` | `evaluateExit` (partial+trail) | Real/paper trading |
| **Server backtest** | `getTickSignal` + `/api/backtest`, [server.ts](../server.ts) | `performCoreAnalysis` | `entryGateBlock` | `evaluateExit` (partial+trail) | STRATEGY_RESULTS.md |
| **Macro benchmark** | [scripts/macro-benchmark.ts](../scripts/macro-benchmark.ts) | `performCoreAnalysis` (imported) | `entryGateBlock` (imported) | `evaluateExit` (imported) | Macro A/B view |

- **Entries are identical across all three** — they share `performCoreAnalysis` + `entryGateBlock`.
- **Exits are now identical across live, `/api/backtest`, and the benchmark** — all three drive the
  shared `evaluateExit` (partial scale-out + breakeven + ATR trail + hard cap). In the `/api/backtest`
  engine each partial leg is recorded as a `SCALE_OUT_*` event *without* a numeric `pnl`, so
  profit-factor/expectancy count one realized result per position (the `CLOSE_*` record carries the
  whole-trade total). If ATR is unavailable at entry, it falls back to the legacy swing-based TP/SL.
- **`src/lib/backtest.ts`** (UI panel) is a separate close-only engine with a *different composite* and
  no gates — it is explicitly **non-authoritative** (flagged in its header). Use it for weight intuition only.

---

## 8. Configuration reference (env)

| Var | Default | Effect |
|---|---:|---|
| `ADX_GATE_MIN` | 15 | Min ADX(14) for an entry to count as trending (also the momentum ↔ mean-reversion regime switch) |
| `ADX_ENTRY_MIN` | 25 | Min ADX(14) for a momentum ENTRY — 15–25 stands aside (weak trends were fee-negative in every Mar–Jul sweep variant) |
| `EXT_MAX_ATR` | 1.5 | Max distance (×ATR) from EMA26 for a momentum entry — blocks chasing extended swings (0 disables) |
| `MEAN_REVERSION_LOOKBACK_MINUTES` | 60 | Range window for the range-fade entry |
| `MEAN_REVERSION_REJECTION_FRAC` | 0.35 | Fraction of the bar's own range the close must retrace from the touched extreme |
| `EXIT_MIN_ATR_PCT` | 0.4 | ATR floor as % of price for all exit levels (0 disables) |
| `MIN_SYNC_MINUTES` | 20 | Floor on both daemons' check-loop cadence |
| `EXIT_SL_MULT` | 1.5 | Initial stop distance, in ATR |
| `EXIT_PARTIAL_MULT` | 1.5 | Scale-out trigger distance, in ATR |
| `EXIT_PARTIAL_FRAC` | 0.5 | Fraction of position taken at scale-out |
| `EXIT_TRAIL_MULT` | 2.0 | Trailing-stop distance behind peak, in ATR |
| `EXIT_TP_MULT` | 4.0 | Hard take-profit cap, in ATR |
| `STAGNANT_EXIT_MINUTES` | 600 | Stagnation time-stop age threshold, pre-scale-out only (was 360; see §10) |
| `MAX_LEVERAGE` | 5 | Hard cap on leverage at config-load, config-save, and trade-sizing (the −$18.31 May trade ran ~11x) |
| `STAGNANT_MIN_PNL_PCT` | 0.5 | Leveraged % a trade must show by the age threshold to keep holding |
| `REGIME_SLOPE_BARS` | 8 | Bars over which the 200-EMA slope is measured for the regime filter |
| `REGIME_SLOPE_MIN_PCT` | 0.05 | Counter-slope (% of price over the window) beyond which the entry is blocked |
| `ATR_SL_MULT` / `ATR_TP_MULT` | 1.5 / 3.0 | Legacy ATR TP/SL used when forming `pred` (entry-time levels) |
| `AUDIT_RETENTION_DAYS` | 30 | Days of audit log kept in the persistent store and served by `/api/audit-log` |
| `AUDIT_LOG_FILE` | `os.tmpdir()/audit_log.jsonl` | Audit store path. Use a volume path to survive redeploys |
| `JOURNAL_SEED_FILE` | `seed/trade-journal-seed.csv` | Journal seed CSV merged on every load |
| `JOURNAL_SEED` | on | `off` disables the seed merge |

Per-config (non-env) knobs: `useRegimeFilter`, `useMacroFilter`, `signalThreshold`, `leverage`,
`maxConsecutiveLosses`, `minReversalProfitPct` (signal-exit buffer, 1.5), `meanReversionEnabled`
(default **false**), `adoptOrphanPositions` (default true), `positionSizeUsd` (NOTIONAL, default 20).

Benchmark env: `INTERVAL`, `LEVERAGE`, `POSITION_USD`, `FEE_BPS`, `WINDOWS`, `THRESHOLD`.

---

## 9. Reproducing the numbers

```bash
# Faithful macro-overlay benchmark (new gates + new exit), with fees:
INTERVAL=1h FEE_BPS=6 WINDOWS=30,90 npx tsx scripts/macro-benchmark.ts

# Live-daemon parity replay (SOL 1h signals, 15m exit path, Jupiter-like costs). Replays the LIVE
# decision loop from the server's own exported functions; env vars override any strategy constant:
npx tsx scripts/live-replay.ts --cache ./.replay-cache
STAGNANT_EXIT_MINUTES=720 npx tsx scripts/live-replay.ts --cache ./.replay-cache --from 2026-08-18 --to 2026-09-26 --only --trades

# Unit + scenario tests (signal parsing, signal exits, orphan adoption, pairing, seed, audit CSV):
npm test

# Server backtest (canonical, drives STRATEGY_RESULTS.md):
curl -XPOST localhost:8080/api/backtest -d '{"token":"SOL","interval":"1h","lookbackDays":90,"signalThreshold":0.25,"useRegimeFilter":true}'
```

Always validate with **out-of-sample / walk-forward** windows and realistic fees before trusting any
edge, and paper-trade the candidate for weeks before risking capital.

---

## 10. September 2026 review (live Aug 18 – Sep 25)

**Last strategy change before the review:** 2026-08-16 (`2b1934c`, `565ecd3`): Solana-only
scanning plus a cooldown fix. Every "2.0.0" journal row is from that build. The last change to the
entry/exit logic itself was 2026-07-09 (`d928759`: ADX ≥ 25 momentum bar, extension guard), plus
the 2026-07-18 execution fixes (partial-close `--size`, on-chain SL sync).

**What SOL did vs what the bot did.** SOL went from 76.0 to 120.5 (+59%) with a 75–123 range, and
hourly volatility of about 0.7%. The bot opened 22 real positions at about $31 notional each and
netted **−$0.11 after all fees** (on-chain). Per-leg costs came to about 0.06% of notional, in line
with the replay's cost model.

| Loss driver (Aug 18 – Sep 25) | Trades | Net |
|---|---:|---:|
| Untracked "orphan" positions (open reported failed but landed, then unmanaged until the on-chain SL) | 3 | −$1.50 |
| Stagnation time-stops (7 losers, 1 small winner) | 8 | −$0.85 |
| Accidental thesis-lapse exits ("signal flipped to null", +1.2…+4%) | 11 | +$2.24 |
| **Total** (fees paid: $0.89) | 22 | **−$0.11** |

Without the orphans the period would have netted about +$1.39. That makes orphan adoption the
largest real-money fix.

**Parity replay** (`scripts/live-replay.ts`, SOL, Mar 1 – Sep 26 2026). "Net" is dollars at $10
collateral and 3x, after modeled fees and borrow. The replay reproduced the live Aug–Sep trade list
almost one-for-one, including the Aug 25 orphan's entry.

| Variant | Stop | Mar–May PF | Jun–Jul PF | Aug–Sep PF | Full PF | Full net |
|---|---:|---:|---:|---:|---:|---:|
| Live before this release (text parsing) | 360 | 0.73 | 1.91 | 0.97 | 1.06 | +$0.48 |
| Signal exit, momentum only | 360 | 0.79 | 2.92 | 0.81 | 1.16 | +$1.22 |
| **Signal exit, momentum only (shipped)** | **600** | 0.85 | 3.17 | 1.16 | **1.38** | **+$2.54** |
| Reversal-only exit (what the backtest assumed) | 600 | 0.54 | 2.29 | 1.26 | 1.10 | +$0.70 |
| Signal exit + mean-reversion | 600 | 1.23 | 1.36 | 1.03 | 1.12 | +$1.53 |

The shipped variant is best overall and in Jun–Jul. It is not best in every single window:
mean-reversion wins the Mar–May chop, and reversal-only edges Aug–Sep by about $0.15. That is why
the Aug–Sep gains are best read as noise-level.

Tested and **not** adopted, because none improved all three windows: `EXT_MAX_ATR` 1.0/2.0/2.5,
`ADX_ENTRY_MIN` 20/30, a 1.0 or 2.5–3.5 signal-exit buffer, `EXIT_SL_MULT` 1.0/2.0,
`EXIT_PARTIAL_MULT` 1.0/2.0, and `REGIME_SLOPE_MIN_PCT` 0.1/0.2.

**Honest framing.** Even the best variant is a thin edge: about 57 trades in 7 months, with a
profit factor near 1.4 that falls to about 0.9 at **double** the modeled costs. It also captured
almost none of SOL's +59% trend, because the tight ATR exits and the thesis-lapse exit bank about
0.5% moves. This is a small-edge, fee-sensitive scalper, not a trend capture system. Replay
limitations: no macro filter, 1h signal ticks instead of 20-minute ticks, and exits on 15m closes.
Paper-trade or run small before scaling.

