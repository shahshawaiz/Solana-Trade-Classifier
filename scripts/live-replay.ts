// Live-daemon parity replay (SOL, 1h signals, 15m exit path).
//
// Unlike /api/backtest (which derives its side from the canonical LONG/SHORT/HOLD value), this
// replays the LIVE Jupiter daemon's decision loop (checkJupiterTradingAndState) bar-by-bar using
// the SAME exported building blocks — performCoreAnalysis, resolveEntry, regimeAllowsEntry,
// evaluateExit/initExitState, flooredAtr, the STAGNANT_* time-stop, the reversal-exit rule — on
// Binance SOLUSDT candles, with Jupiter-like costs. It exists to measure live-only behaviour the
// canonical backtest can't see (e.g. the 2026-09 "signal flipped to null" exit).
//
// Usage:
//   npx tsx scripts/live-replay.ts [--from 2026-03-01] [--to 2026-09-26] [--cache <dir>]
// With --cache, klines are read from/written to <dir>/sol1h.json and <dir>/sol15m.json
// (raw Binance kline arrays) so repeat runs don't re-download.
//
// Known simplifications (state them when quoting results): the macro (DXY/yields/VIX) filter is
// not replayed (it was NEUTRAL for nearly all of Aug–Sep 2026); signals are evaluated at 1h bar
// closes rather than every 20 min; exits are checked on 15m closes.
process.env.NODE_ENV = "test";
process.env.CORTEX_TESTING = "true";

import fs from "fs";
import path from "path";

const S: any = await import("../server.js");

const args = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const FROM = arg("--from", "2026-03-01")!;
const TO = arg("--to", new Date().toISOString().slice(0, 10))!;
const CACHE = arg("--cache");

const LEV = 3;
const FEE_SIDE = Number(process.env.REPLAY_FEE_SIDE ?? 0.0007);      // ~0.06–0.07% of notional per open/close leg (matches on-chain fills)
const BORROW_HR = Number(process.env.REPLAY_BORROW_HR ?? 0.00005);    // hourly borrow as a fraction of notional
const COLLATERAL = 10;        // $ — what every live trade actually ran at (the $10 minimum)
const WINDOW = 168;           // live getPredictionData pulls 7 days of 1h bars
const WEIGHTS = { sentiment: 0, technical: 0.9, liquidity: 0.85, elliottWave: 0, supertrend: 0.9, fvg: 0, dca: 0 };
const SIGNAL_THRESHOLD = 0.25;

async function klines(interval: string, stepMs: number): Promise<any[]> {
  const file = CACHE ? path.join(CACHE, interval === "1h" ? "sol1h.json" : "sol15m.json") : "";
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const out: any[] = [];
  let s = new Date("2026-02-20T00:00:00Z").getTime();
  const end = Date.now();
  while (s < end) {
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=SOLUSDT&interval=${interval}&startTime=${s}&limit=1000`);
    const d: any[] = await r.json();
    if (!d.length) break;
    out.push(...d);
    s = d[d.length - 1][0] + stepMs;
  }
  if (file) fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

const toQuote = (k: any[]) => ({ date: new Date(k[0]), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] });

// Mirrors getPredictionData.evaluateSignal (live).
function liveSignal(q: any[], meanReversion: boolean) {
  const closes = q.map(x => x.close);
  const sData = S.performCoreAnalysis(closes, [], WEIGHTS, undefined, q);
  let pSide = "HOLD";
  let aRec = sData.isChop ? "Hold Chop Zone" : "Hold";
  let trnd = "SIDEWAYS";
  if (sData.compositeScore > SIGNAL_THRESHOLD) { pSide = "LONG"; aRec = "Long Buy"; trnd = "UP"; }
  else if (sData.compositeScore < -SIGNAL_THRESHOLD) { pSide = "SHORT"; aRec = "Short Sell"; trnd = "DOWN"; }
  if (sData.isHoldZone) { pSide = "HOLD"; trnd = "CHOP/HOLD"; aRec = sData.isChop ? "Hold Chop Zone" : "Hold (Σ below threshold)"; }
  const r = S.resolveEntry(pSide, closes, q, "1h", meanReversion);
  pSide = r.side;
  aRec = r.aRec;
  trnd = r.regime === "RANGING" && r.side !== "HOLD" ? "RANGE-FADE" : (r.side === "HOLD" ? "CHOP/HOLD" : trnd);
  const ema = S.calculateEMA(closes, Math.min(200, closes.length));
  const ema200 = ema[ema.length - 1];
  const si = ema.length - 1 - S.REGIME_SLOPE_BARS;
  const slope = si >= 0 ? ((ema200 - ema[si]) / closes[closes.length - 1]) * 100 : undefined;
  return { pSide, aRec, trnd, sigma: sData.compositeScore, ema200, slope, atr: S.calculateATR(q, 14) };
}

// The pre-fix live mapping (action string → side). "Hold (…)"/"Hold Chop Zone"/"Range Fade — …"
// all fell through to null.
function legacySide(action: string): "LONG" | "SHORT" | "HOLD" | null {
  if (action === "Long Buy" || action === "Short Buy (Oversold)") return "LONG";
  if (action === "Short Sell" || action === "Long Sell (Overbought)") return "SHORT";
  if (action === "Hold") return "HOLD";
  return null;
}

type Variant = { name: string; legacyParsing: boolean; meanReversion: boolean; exitRule?: "signal" | "reversal-only" };
const MIN_REV = Number(process.env.REPLAY_MIN_REVERSAL_PCT ?? 1.5); // live minReversalProfitPct

function run(v: Variant, h1: any[], m15: any[], fromMs: number, toMs: number) {
  const m15ByHour = new Map<number, any[]>();
  for (const k of m15) {
    const hr = Math.floor(k.date.getTime() / 3600000) * 3600000;
    if (!m15ByHour.has(hr)) m15ByHour.set(hr, []);
    m15ByHour.get(hr)!.push(k);
  }
  const trades: any[] = [];
  let pos: any = null;
  let lastFailed: any = null;
  let consecLosses = 0;
  let lastLossAt = 0;

  const closePos = (px: number, t: number, reason: string) => {
    const hours = (t - pos.entryMs) / 3600000;
    const move = pos.side === "LONG" ? px / pos.entry - 1 : 1 - px / pos.entry;
    const remLev = move * LEV * 100 * pos.rem;
    const gross = pos.banked + remLev;
    const cost = (2 * FEE_SIDE + hours * BORROW_HR) * LEV * 100;
    const net = gross - cost;
    trades.push({ side: pos.side, entryTime: new Date(pos.entryMs).toISOString(), exitTime: new Date(t).toISOString(), entry: pos.entry, exit: px, netPct: net, usd: net / 100 * COLLATERAL, reason, hours });
    if (net < 0) { consecLosses++; lastLossAt = t; lastFailed = { price: pos.entry, side: pos.side, at: t }; }
    else { consecLosses = 0; lastFailed = null; }
    pos = null;
  };

  for (let i = WINDOW + 2; i < h1.length; i++) {
    const bar = h1[i];
    const barOpenMs = bar.date.getTime();
    const barCloseMs = barOpenMs + 3600000;
    if (barCloseMs < fromMs || barCloseMs > toMs) continue;

    // 1. Price-driven exits (shared evaluateExit) along the 15m closes inside this hour.
    if (pos) {
      for (const k of m15ByHour.get(barOpenMs) || []) {
        const res = S.evaluateExit(pos.exit, k.close);
        pos.exit = res.state;
        if (res.partialFrac > 0) {
          const move = pos.side === "LONG" ? k.close / pos.entry - 1 : 1 - k.close / pos.entry;
          pos.banked += move * LEV * 100 * res.partialFrac;
          pos.rem -= res.partialFrac;
        }
        if (res.close) { closePos(k.close, k.date.getTime() + 900000, res.close); break; }
      }
    }

    // 2. Signal at the hour close.
    const q = h1.slice(i - WINDOW + 1, i + 1);
    const cur = liveSignal(q, v.meanReversion);
    const prev = liveSignal(h1.slice(i - WINDOW, i), v.meanReversion);
    const confirmed = (cur.pSide !== "HOLD" && cur.pSide === prev.pSide) || cur.trnd === "RANGE-FADE";
    const px = bar.close;
    const side = v.legacyParsing ? legacySide(cur.aRec) : S.signalSide({ positionSide: cur.pSide, action: cur.aRec });

    let closedThisTick = false;
    let reversalReentry = false;
    if (pos) {
      const move = pos.side === "LONG" ? px / pos.entry - 1 : 1 - px / pos.entry;
      const pnl = move * LEV * 100;
      if (v.legacyParsing) {
        if (side !== "HOLD" && side !== pos.side && pnl >= MIN_REV) { closePos(px, barCloseMs, `Trend Reversal (flipped to ${side})`); closedThisTick = true; reversalReentry = true; }
      } else {
        const why = S.signalExitReason(pos.side, side, pnl, MIN_REV);
        if (why === "reversal" || (why === "thesis-lapse" && v.exitRule !== "reversal-only")) {
          closePos(px, barCloseMs, why === "reversal" ? `Trend Reversal (flipped to ${side})` : "Thesis lapse (signal → HOLD)");
          closedThisTick = true; reversalReentry = why === "reversal";
        }
      }
      if (pos && !pos.exit.partialTaken && (barCloseMs - pos.entryMs) / 60000 >= S.STAGNANT_EXIT_MINUTES && pnl < S.STAGNANT_MIN_PNL_PCT) {
        closePos(px, barCloseMs, "Time Stop"); closedThisTick = true;
      }
    }

    // 3. Entry (same gate order as the daemon; macro filter not replayed).
    if (!pos && (!closedThisTick || reversalReentry) && (side === "LONG" || side === "SHORT") && confirmed) {
      let ok = true;
      if (consecLosses >= 8 && barCloseMs - lastLossAt < 6 * 3600000) ok = false;
      const opens24 = trades.filter(t => barCloseMs - new Date(t.entryTime).getTime() < 24 * 3600000).length;
      if (opens24 >= 6) ok = false;
      if (ok && !S.regimeAllowsEntry(side, px, cur.ema200, cur.slope).ok) ok = false;
      if (ok && lastFailed && lastFailed.side === side && barCloseMs - lastFailed.at <= 3600000 && Math.abs(px - lastFailed.price) / lastFailed.price * 100 <= 0.6) ok = false;
      if (ok) {
        const atr = S.flooredAtr(cur.atr, px);
        pos = { side, entry: px, entryMs: barCloseMs, banked: 0, rem: 1, exit: S.initExitState(side, px, atr) };
      }
    }
  }
  if (pos) closePos(h1[h1.length - 1].close, h1[h1.length - 1].date.getTime() + 3600000, "End of window");
  return trades;
}

function summarize(name: string, t: any[]) {
  const wins = t.filter(x => x.netPct > 0);
  const gw = wins.reduce((a, x) => a + x.netPct, 0);
  const gl = -t.filter(x => x.netPct <= 0).reduce((a, x) => a + x.netPct, 0);
  const net = t.reduce((a, x) => a + x.usd, 0);
  let peak = 0, eq = 0, dd = 0;
  for (const x of t) { eq += x.usd; peak = Math.max(peak, eq); dd = Math.min(dd, eq - peak); }
  return { variant: name, trades: t.length, winRate: t.length ? +(wins.length / t.length * 100).toFixed(0) : 0, profitFactor: gl > 0 ? +(gw / gl).toFixed(2) : null, avgPct: t.length ? +(t.reduce((a, x) => a + x.netPct, 0) / t.length).toFixed(2) : 0, netUsdAt10Collateral: +net.toFixed(2), maxDrawdownUsd: +dd.toFixed(2) };
}

const h1 = (await klines("1h", 3600000)).map(toQuote);
const m15 = (await klines("15m", 900000)).map(toQuote);
const variants: Variant[] = [
  { name: "live as deployed (text parsing)", legacyParsing: true, meanReversion: true },
  { name: "signal exit, momentum only", legacyParsing: false, meanReversion: false, exitRule: "signal" },
  { name: "reversal-only exit, momentum only", legacyParsing: false, meanReversion: false, exitRule: "reversal-only" },
  { name: "signal exit + mean-reversion", legacyParsing: false, meanReversion: true, exitRule: "signal" },
];
const windows = args.includes("--only") ? [[FROM, TO]] : [["2026-03-01", "2026-05-31"], ["2026-06-01", "2026-07-31"], ["2026-08-18", "2026-09-26"], [FROM, TO]];
const detail = args.includes("--trades");
for (const [a, b] of windows) {
  console.log(`\n=== ${a} → ${b} ===`);
  const rows = variants.map(v => {
    const t = run(v, h1, m15, new Date(a + "T00:00:00Z").getTime(), new Date(b + "T23:59:59Z").getTime());
    if (detail && a === FROM) for (const x of t) console.log(v.name.slice(0, 12), x.side, x.entryTime.slice(0, 16), x.exitTime.slice(0, 16), x.entry.toFixed(2), x.exit.toFixed(2), x.netPct.toFixed(2), x.reason);
    return summarize(v.name, t);
  });
  console.table(rows);
}
process.exit(0);
