# Cortex Alpha Strategy — HTTP API

The Solana Trade Classifier exposes its **Cortex Alpha multi-factor strategy** over
a small JSON HTTP API (Express, `server.ts`). The same engine powers the live
signal and the historical backtest.

- **Base URL (prod):** `https://solana-trade-bot.vercel.app`
- **Base URL (local):** `http://localhost:3000` (`npm run dev`)
- **Content type:** `application/json` on every `POST`
- **Up & running curl tests:** see [TESTING.md](./TESTING.md)

> On Vercel the Express app runs as a serverless function (`api/index.ts`) and
> the in-process daemons are disabled; background ticks are driven by Vercel Cron
> hitting `GET /api/cron/tick`. The strategy endpoints below work identically in
> both environments.

## The strategy in one paragraph

Every decision is a **composite bias Σ** — a weighted, normalized sum of four
subsystems:

```
Σ = ( MACD·wTechnical + RSI·wLiquidity + Sentiment·wSentiment + ElliottWave·wElliottWave )
    ─────────────────────────────────────────────────────────────────────────────────────
                       wTechnical + wLiquidity + wSentiment + wElliottWave
```

- `Σ > +0.08` → **LONG**, `Σ < -0.08` → **SHORT**, otherwise **HOLD**.
- **Catalyst overrule:** sentiment ≥ +0.85 / ≤ −0.85 forces Σ to ±1.0 and fires
  immediately (bypasses the chop filter and the 2-bar confirmation).
- **Chop Zone:** RSI in 40–60 **and** a fast/slow EMA squeeze (<0.30% of price)
  forces HOLD to avoid sideways fakeouts.
- **Confirmation:** a directional signal only fires once the current and prior
  candle agree (2-bar confirmation), unless a catalyst overrule is active.

Default weights when `weights` is omitted: `sentiment 0.90, technical 0.85,
liquidity 0.85, elliottWave 0.85`.

---

## `GET|POST /get-strategy-output` — the trade recommendation

**This is the primary endpoint.** It runs the live Cortex Alpha strategy and
returns one concise, decision-first **trade recommendation** for a token. Accepts
either `GET` (query string) or `POST` (JSON body).

> Aliases that return the exact same payload: `POST /api/get-strategy-output`,
> `GET /api/get-strategy-output`, `POST /api/strategy/signal`. On Vercel, only
> `/api/*` is rewritten to the function — the bare `/get-strategy-output` is wired
> up via an explicit rewrite in `vercel.json`, and the `/api/*` aliases always work.

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
curl -s "https://solana-trade-bot.vercel.app/get-strategy-output?token=SOL&interval=15m"

# POST (JSON body)
curl -s https://solana-trade-bot.vercel.app/get-strategy-output \
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
| `leverage`       | number | `5`     | Position leverage.                                   |
| `takeProfitPct`  | number | `4.0`   | TP distance in %.                                    |
| `stopLossPct`    | number | `2.0`   | SL distance in %.                                    |

```bash
curl -s https://solana-trade-bot.vercel.app/api/backtest \
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
| `GET  /api/cron/tick`     | Daemon tick (used by Vercel Cron; safe to call manually).          |

## Consuming from Claude Code

The **`classifier`** plugin (`claude plugin install classifier@hunzai-agents`)
wraps `/get-strategy-output` and `/api/backtest` as the `/signal` and
`/backtest` commands. Point it at this API with:

```bash
export CLASSIFIER_API_URL="https://solana-trade-bot.vercel.app"
```
</content>
</invoke>
