# Cortex Alpha Strategy — HTTP API

The Solana Trade Classifier exposes its **Cortex Alpha multi-factor strategy** over
a small JSON HTTP API (Express, `server.ts`). The same engine powers the live
signal and the historical backtest.

- **Base URL (prod):** `https://<your-app>.up.railway.app`
- **Base URL (local):** `http://localhost:3000` (`npm run dev`)
- **Content type:** `application/json` on every `POST`
- **Up & running curl tests:** see [TESTING.md](./TESTING.md)

> On Railway the Express app runs as a permanent always-on container: the HTTP API,
> the built Vite UI, and the in-process 5-minute trading daemons all run in one
> long-lived process (`npm run start:railway` → `node dist/server.cjs`).

## The strategy in one paragraph

Every decision is a **composite bias Σ** — a weighted, normalized sum of the
strategy's subsystems. The **data-selected default** is a trend-following core of
**MACD + RSI + Supertrend**; News (Sentiment) and Elliott Wave ship **off** (weight
0) because the multi-asset sweep showed both *reduced* performance — they remain
opt-in:

```
Σ = ( MACD·wTechnical + RSI·wLiquidity + Supertrend·wSupertrend [+ Sentiment·wSent + ElliottWave·wEW] )
    ──────────────────────────────────────────────────────────────────────────────────────────────────
                                          Σ weights
```

- `Σ > +0.25` → **LONG**, `Σ < -0.25` → **SHORT**, otherwise **HOLD**. The 0.25
  conviction threshold replaced the legacy 0.08 cutoff, which over-fired and caused
  whipsaw (see `STRATEGY_RESULTS.md` §3/§7).
- **200-EMA trend-regime filter:** never fade the higher-timeframe trend — LONGs
  blocked below the 200-EMA, SHORTs blocked above. (`useRegimeFilter`, default on.)
- **Macro regime filter:** no new LONGs while DXY/US10Y/VIX are RISK-OFF, no new
  SHORTs while RISK-ON. (`useMacroFilter`, default on; outage → NEUTRAL.)
- **Entry gates:** ADX(14) > 20, 15m-Supertrend alignment, MACD-histogram direction,
  RSI(21) timing, and a 2-bar confirmation must all agree before a trade fires.
- **Catalyst overrule:** if Sentiment is enabled, ≥ +0.85 / ≤ −0.85 forces Σ to ±1.0
  and fires immediately (bypasses chop + confirmation).
- **Chop Zone:** RSI in 40–60 **and** a fast/slow EMA squeeze (<0.30% of price)
  forces HOLD to avoid sideways fakeouts.
- **Timeframe:** the live auto-trader runs **1h** candles. 5m/fast scalping is a
  structurally losing config (tiny edge × high trade count × fees — §9).

Default weights when `weights` is omitted: `sentiment 0, technical 0.90 (MACD),
liquidity 0.85 (RSI), supertrend 0.90, elliottWave 0`.

---

## `GET|POST /get-strategy-output` — the trade recommendation

**This is the primary endpoint.** It runs the live Cortex Alpha strategy and
returns one concise, decision-first **trade recommendation** for a token. Accepts
either `GET` (query string) or `POST` (JSON body).

> Aliases that return the exact same payload: `POST /api/get-strategy-output`,
> `GET /api/get-strategy-output`, `POST /api/strategy/signal`.

### Request

| Field               | Type   | Default              | Notes                                                        |
| ------------------- | ------ | -------------------- | ------------------------------------------------------------ |
| `token`             | string | `"SOL"`              | Base asset symbol (e.g. `SOL`, `BTC`, `ETH`).                |
| `interval`          | string | `"15m"`              | Candle interval: `15m`, `30m`, `1h`, `1d`.                   |
| `weights`           | object | see defaults above   | `{ sentiment, technical, liquidity, elliottWave }`, 0–1.     |
| `topic`             | string | auto from token      | News query topic for the sentiment subsystem.                |
| `newsQueryKeywords` | string | `""`                 | Alternative free-text news keywords (overrides `topic`).     |

```bash
# GET (query params)
curl -s "https://<your-app>.up.railway.app/get-strategy-output?token=SOL&interval=15m"

# POST (JSON body)
curl -s https://<your-app>.up.railway.app/get-strategy-output \
  -H 'content-type: application/json' \
  -d '{"token":"SOL","interval":"15m"}'
```

### Response — trade recommendation

```jsonc
{
  "token": "SOL",
  "interval": "15m",
  "timestamp": "2026-06-21T12:00:00.000Z",
  "recommendation": "LONG",        // LONG | SHORT | HOLD  ← the call
  "action": "Long Buy",            // human-readable
  "order": "BUY_MARKET",           // BUY_MARKET | SELL_MARKET | HOLD
  "confirmed": true,               // 2-bar (or catalyst overrule) confirmation
  "confidence": 0.71,              // 0.10–0.95
  "price": 168.42,                 // current price
  "entryPrice": 168.42,
  "takeProfit": 171.10,            // from liquidation-pool levels
  "stopLoss": 166.05,
  "predictedPrice": 169.05,
  "trend": "UP",                   // UP | DOWN | SIDEWAYS | CHOP/HOLD
  "compositeScore": 0.21,          // Σ — the weighted composite bias
  "scores": {
    "technical": 0.5,              // MACD subsystem
    "momentum": 0.5,               // RSI subsystem
    "sentiment": 0.12,             // news/LLM subsystem
    "elliottWave": 0.34
  },
  "indicators": { "rsi": 41.2, "ema12": 168.0, "ema26": 167.4 },
  "rationale": "…2-sentence justification…",
  "raw": { /* the full forecast payload: history, latestNews, etc. */ }
}
```

`/api/forecast` and `/api/predict` accept the same inputs and return the *full*
forecast payload (the object found under `raw` above). They are kept for
backward compatibility — new consumers should use `/get-strategy-output`.

---

## `POST /api/backtest`

Run the strategy over historical candles and return per-bar series, trades, and
performance metrics (market vs strategy return, alpha).

### Request

| Field            | Type   | Default | Notes                                                |
| ---------------- | ------ | ------- | ---------------------------------------------------- |
| `token`          | string | `"SOL"` | Base asset symbol.                                   |
| `interval`       | string | `"1h"`  | `15m`, `30m`, `1h`, `1d`.                            |
| `lookbackDays`   | number | `7`     | Used when `startDate` is omitted.                    |
| `startDate`      | string | —       | ISO date; overrides `lookbackDays`.                  |
| `endDate`        | string | —       | ISO date.                                            |
| `weights`        | object | defaults| `{ sentiment, technical, liquidity }`.              |
| `initialCapital` | number | `10000` | Starting equity.                                     |
| `meanReversionEnabled` | boolean | `false` | Range-fade entries when ADX ≤ 15. Off by default, matching live. |
| `minReversalProfitPct` | number | `1.5` | Leveraged % buffer for the shared signal exit (reversal or thesis lapse). |
| `leverage`       | number | `5`     | Position leverage.                                   |
| `takeProfitPct`  | number | `4.0`   | TP distance in %.                                    |
| `stopLossPct`    | number | `2.0`   | SL distance in %.                                    |

```bash
curl -s https://<your-app>.up.railway.app/api/backtest \
  -H 'content-type: application/json' \
  -d '{"token":"SOL","interval":"1h","lookbackDays":14}'
```

Returns `{ data: [...], trades: [...], metrics: { marketReturn, strategyReturn, alpha } }`
plus prediction-accuracy stats (error %, sMAPE). Requires ≥15 candles in range.

---

## Supporting endpoints

| Method & path             | Purpose                                                             |
| ------------------------- | ------------------------------------------------------------------ |
| `POST /api/sentiment`     | Sentiment score for a token/topic.                                 |
| `POST /api/batch-sentiment` | Score an array of `headlines` (local heuristic).                 |
| `GET  /api/price`         | Latest price snapshot.                                             |
| `GET  /api/historical`    | Historical OHLC candles (`token`, `interval`, date range).         |
| `GET  /api/news`          | Recent market headlines.                                           |
| `GET  /api/journal`       | On-chain-verified trade journal and stats (merged with `seed/trade-journal-seed.csv`). |
| `GET  /api/audit-log`     | Audit trail for the last `days` (default and max `AUDIT_RETENTION_DAYS`, 30), newest first. Add `format=csv` for a CSV download. |

```bash
# 30-day audit log as CSV
curl -fsS "$BASE/api/audit-log?days=30&format=csv" -o audit-log.csv
# last 7 days as JSON
curl -fsS "$BASE/api/audit-log?days=7" | jq '.count'
```

## Consuming from Claude Code

The **`classifier`** plugin (`claude plugin install classifier@hunzai-agents`)
wraps `/get-strategy-output` and `/api/backtest` as the `/signal` and
`/backtest` commands. Point it at this API with:

```bash
export CLASSIFIER_API_URL="https://<your-app>.up.railway.app"
```
</content>
</invoke>
