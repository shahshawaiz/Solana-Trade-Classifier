# Up & Running — Strategy API Test Guide

Quick checks to confirm the Cortex Alpha strategy API is alive and returning a
trade recommendation. Works against either a local dev server or the deployed
Railway app. See [API.md](./API.md) for full field docs.

## 0. Pick a base URL

```bash
# Local dev
export BASE=http://localhost:3000

# OR deployed (prod)
export BASE=https://<your-app>.up.railway.app
```

## 1. Start the server (local only)

```bash
npm install
npm run dev          # NODE_ENV=development tsx server.ts  → http://localhost:3000
```

Leave it running in one terminal; run the curls below in another. (Skip this step
when testing the deployed URL.)

## 2. Smoke test — is it up?

```bash
# Latest price snapshot (cheap, no LLM) — should return JSON, HTTP 200
curl -fsS "$BASE/api/price?token=SOL" | head -c 400; echo
```

If this fails: the server isn't running / not reachable, or `$BASE` is wrong.

## 3. The main endpoint — `/get-strategy-output`

### GET (query params)

```bash
curl -fsS "$BASE/get-strategy-output?token=SOL&interval=15m" | tee /tmp/strat.json
```

> Both the bare `/get-strategy-output` and the `/api/get-strategy-output` alias are
> served directly by the Express app, so either path works on prod and local.

### POST (JSON body)

```bash
curl -fsS "$BASE/get-strategy-output" \
  -H 'content-type: application/json' \
  -d '{"token":"SOL","interval":"1h"}' | tee /tmp/strat.json
```

### With custom weights + news topic

```bash
curl -fsS "$BASE/get-strategy-output" \
  -H 'content-type: application/json' \
  -d '{
        "token":"SOL",
        "interval":"1h",
        "weights":{"sentiment":0.9,"technical":0.85,"liquidity":0.85,"elliottWave":0.85},
        "topic":"SOL ETF approval"
      }' | tee /tmp/strat.json
```

### Expected shape

```jsonc
{
  "token": "SOL",
  "interval": "15m",
  "recommendation": "LONG",     // LONG | SHORT | HOLD  ← the call
  "action": "Long Buy",
  "order": "BUY_MARKET",
  "confirmed": true,
  "confidence": 0.71,
  "price": 168.42,
  "entryPrice": 168.42,
  "takeProfit": 171.10,
  "stopLoss": 166.05,
  "trend": "UP",
  "compositeScore": 0.21,
  "scores": { "technical": 0.5, "momentum": 0.5, "sentiment": 0.12, "elliottWave": 0.34 },
  "rationale": "…"
  // ...plus "raw" with the full forecast payload
}
```

### Assert it returned a valid recommendation

```bash
# Prints LONG / SHORT / HOLD, or "MISSING" if the field is absent
curl -fsS "$BASE/get-strategy-output?token=SOL&interval=15m" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.recommendation ?? "MISSING");})'
```

### Aliases (same payload)

```bash
curl -fsS "$BASE/api/get-strategy-output" -H 'content-type: application/json' -d '{"token":"SOL"}' | head -c 200; echo
curl -fsS "$BASE/api/strategy/signal"     -H 'content-type: application/json' -d '{"token":"SOL"}' | head -c 200; echo
```

## 4. Backtest — `/api/backtest`

```bash
curl -fsS "$BASE/api/backtest" \
  -H 'content-type: application/json' \
  -d '{"token":"SOL","interval":"1h","lookbackDays":14}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.metrics ?? j.error);})'
```

Expected: `{ marketReturn, strategyReturn, alpha }` (percent). Needs ≥15 candles in
range — widen `lookbackDays` or use a smaller interval if you get an error.

## 5. Supporting endpoints

```bash
curl -fsS "$BASE/api/historical?token=SOL&interval=1h" | head -c 300; echo
curl -fsS "$BASE/api/news?token=SOL"                   | head -c 300; echo
curl -fsS "$BASE/api/sentiment" -H 'content-type: application/json' -d '{"token":"SOL","topic":"solana"}' | head -c 300; echo
curl -fsS "$BASE/api/cron/tick"                        | head -c 200; echo   # daemon tick (safe)
```

## 6. Test via the Claude Code plugin

```bash
cd /path/to/plugins/classifier/vendor/classifier
npm install && npm run build

# Defaults to https://<your-app>.up.railway.app; override for local:
CLASSIFIER_API_URL="$BASE" node dist/cli.js signal SOL 1h
CLASSIFIER_API_URL="$BASE" node dist/cli.js backtest SOL 1h 14
node dist/cli.js config        # shows which base URL it will hit
```

A successful call prints `{ "success": true, "status": 200, ..., "data": { ... } }`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `curl: (7) Failed to connect` | Server not running (`npm run dev`) or wrong `$BASE`. |
| `HTTP 405` / `404` on prod `/get-strategy-output` | Deployment predates the route, or the rewrite isn't live — redeploy, or use `/api/get-strategy-output`. |
| `recommendation: "HOLD"` with `trend:"CHOP/HOLD"` | Working as intended — chop-zone filter suppressed a low-conviction signal. |
| `500` with an error string | Upstream data/LLM hiccup — re-run; check server logs and required env keys. |
| Backtest error about data points | Fewer than 15 candles in range — increase `lookbackDays` or use `15m`/`30m`. |
