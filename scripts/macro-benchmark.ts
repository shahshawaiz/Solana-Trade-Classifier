/**
 * Macro-filter benchmark.
 *
 * Reproduces the STRATEGY_RESULTS.md methodology (MACD+RSI trend-follower core)
 * but adds a MACRO REGIME OVERLAY built from real Yahoo Finance history for the
 * three macro gauges the app tracks:
 *   • US Dollar Index (DX-Y.NYB)
 *   • US 10Y Treasury Yield (^TNX)
 *   • Volatility Index (^VIX)
 *
 * For every crypto bar we derive a RISK-ON / RISK-OFF / NEUTRAL regime from the
 * 5-day trend of those three series, then run the identical strategy twice:
 *   A) macro filter OFF  (baseline)
 *   B) macro filter ON   (block longs in RISK-OFF, block shorts in RISK-ON)
 *
 * Configurable via env:
 *   INTERVAL=1h         candle size (5m, 15m, 30m, 1h, 1d). 5m/15m are intraday → Yahoo caps ~60d.
 *   LEVERAGE=5
 *   POSITION_USD=0      0 = compounded %-equity mode; >0 = fixed-$ position size, reports $ P&L.
 *   FEE_BPS=0           taker fee per side, in bps of NOTIONAL (open + close both charged).
 *   WINDOWS=30,90       comma-separated lookback days.
 *
 * Examples:
 *   npx tsx scripts/macro-benchmark.ts                                        # 1h, 5x, no fees (the report)
 *   INTERVAL=5m LEVERAGE=5 POSITION_USD=10 FEE_BPS=6 WINDOWS=7,30 npx tsx scripts/macro-benchmark.ts
 */
import * as yahooFinanceModule from "yahoo-finance2";
import { runBacktest, calculateEMA, calculateRSI, MarketData } from "../src/lib/backtest";

// ---- Yahoo init (mirrors server.ts) ---------------------------------------
const imported: any = yahooFinanceModule;
const YfClass = imported.default?.default || imported.default || imported;
let yf: any;
try { yf = new YfClass(); } catch { yf = imported.default || imported; }
try { yf.setGlobalConfig?.({ validation: { logErrors: false, throwErrors: false } }); } catch {}

const INTERVAL = process.env.INTERVAL || "1h";
const LEVERAGE = Number(process.env.LEVERAGE || 5);
const POSITION_USD = Number(process.env.POSITION_USD || 0); // 0 => %-equity mode
const FEE_BPS = Number(process.env.FEE_BPS || 0);           // per side, on notional
const WINDOWS = (process.env.WINDOWS || "30,90").split(",").map((s) => Number(s.trim())).filter(Boolean);
const THRESHOLD = 0.25;
const WEIGHTS = { sentiment: 0, technical: 0.9, liquidity: 0.85, elliottWave: 0 };
const TOKENS = ["SOL", "BTC", "ETH"];
const MACRO_SYMBOLS = ["DX-Y.NYB", "^TNX", "^VIX"]; // all: rising => risk-off for crypto

interface Series { t: number; close: number; }

async function fetchCrypto(token: string, days: number): Promise<{ dates: number[]; closes: number[] }> {
  const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const chart: any = await yf.chart(`${token}-USD`, { period1, interval: INTERVAL }, { validateResult: false });
    const quotes = (chart?.quotes || []).filter((q: any) => q && q.close != null && q.close > 0);
    return { dates: quotes.map((q: any) => new Date(q.date).getTime()), closes: quotes.map((q: any) => Number(q.close)) };
  } catch (e: any) {
    console.warn(`  [crypto] ${token} fetch failed: ${e.message}`);
    return { dates: [], closes: [] };
  }
}

async function fetchMacro(symbol: string, days: number): Promise<Series[]> {
  const period1 = new Date(Date.now() - (days + 12) * 24 * 60 * 60 * 1000);
  try {
    const chart: any = await yf.chart(symbol, { period1, interval: "1d" }, { validateResult: false });
    const quotes = (chart?.quotes || []).filter((q: any) => q && q.close != null);
    return quotes.map((q: any) => ({ t: new Date(q.date).getTime(), close: Number(q.close) }));
  } catch (e: any) {
    console.warn(`  [macro] ${symbol} fetch failed: ${e.message}`);
    return [];
  }
}

function valueAtOrBefore(arr: Series[], t: number): number | null {
  let v: number | null = null;
  for (const s of arr) { if (s.t <= t) v = s.close; else break; }
  return v;
}

// Build one regime label per crypto bar from the three macro series' 5-day trend.
function buildRegime(barDates: number[], macro: Record<string, Series[]>): Array<"RISK-ON" | "RISK-OFF" | "NEUTRAL"> {
  const FIVE_D = 5 * 24 * 60 * 60 * 1000;
  const DEADBAND = 0.001; // 0.1% — ignore noise
  return barDates.map((t) => {
    let riskOff = 0, riskOn = 0, have = 0;
    for (const sym of MACRO_SYMBOLS) {
      const arr = macro[sym];
      if (!arr || !arr.length) continue;
      const now = valueAtOrBefore(arr, t);
      const past = valueAtOrBefore(arr, t - FIVE_D);
      if (now == null || past == null || past === 0) continue;
      have++;
      const chg = (now - past) / past;
      if (chg > DEADBAND) riskOff++;      // rising dollar/yields/vol => risk-off
      else if (chg < -DEADBAND) riskOn++; // falling => risk-on
    }
    if (have < 2) return "NEUTRAL";
    if (riskOff - riskOn >= 2) return "RISK-OFF";
    if (riskOn - riskOff >= 2) return "RISK-ON";
    return "NEUTRAL";
  });
}

function buildMarketData(dates: number[], closes: number[]): MarketData[] {
  const emaFast = calculateEMA(closes, 12);
  const emaSlow = calculateEMA(closes, 26);
  const rsis = calculateRSI(closes, 14);
  return closes.map((c, i) => ({
    time: new Date(dates[i]).toISOString(),
    date: new Date(dates[i]).toISOString(),
    close: c,
    rsi: rsis[i],
    emaFast: emaFast[i],
    emaSlow: emaSlow[i],
    sentiment: 0,
  }));
}

interface Metrics {
  sharpe: number; pnlPct: number; winRate: number; profitFactor: number; trades: number;
  grossUsd: number; feeUsd: number; netUsd: number;
}

// Mirrors server.ts metric methodology, with leverage + (optional) per-trade fee
// drag on notional and a fixed-$ position-size dollar P&L.
function computeMetrics(result: ReturnType<typeof runBacktest>, days: number): Metrics {
  const closed = result.trades.filter((t) => t.exitPrice !== undefined && (t.type === "Long" || t.type === "Short"));
  const feeDragFrac = (FEE_BPS / 10000) * LEVERAGE * 2; // round-trip fee as fraction of collateral
  const feeUsdPerTrade = POSITION_USD * LEVERAGE * (FEE_BPS / 10000) * 2;

  let equity = 1;
  const eq: number[] = [1];
  const netRets: number[] = [];
  let wins = 0, grossWin = 0, grossLoss = 0;
  let grossUsd = 0, feeUsd = 0, netUsd = 0;

  for (const t of closed) {
    const rGross = t.pnl * LEVERAGE;
    const rNet = rGross - feeDragFrac;
    netRets.push(rNet);
    equity *= (1 + rNet);
    if (t.pnl > 0) { wins++; grossWin += t.pnl; } else { grossLoss += Math.abs(t.pnl); }
    if (POSITION_USD > 0) {
      const g = POSITION_USD * rGross;
      grossUsd += g; feeUsd += feeUsdPerTrade; netUsd += (g - feeUsdPerTrade);
    }
  }

  const n = netRets.length;
  const mean = n ? netRets.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n > 1 ? netRets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const periodYears = Math.max(days / 365, 1 / 365);
  const annFactor = Math.sqrt(Math.max(n / periodYears, 1));
  const sharpe = sd > 0 ? (mean / sd) * annFactor : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 99 : 0);
  return {
    sharpe, pnlPct: (equity - 1) * 100,
    winRate: closed.length ? (wins / closed.length) * 100 : 0,
    profitFactor, trades: closed.length, grossUsd, feeUsd, netUsd,
  };
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const sgn = (x: number, d = 2) => (x >= 0 ? "+" : "") + x.toFixed(d);
const dollarMode = POSITION_USD > 0;

function fmtRow(label: string, m: Metrics): string {
  if (dollarMode) {
    return `| ${label} | ${sgn(m.sharpe)} | ${m.winRate.toFixed(1)} | ${m.trades} | $${m.grossUsd.toFixed(2)} | $${m.feeUsd.toFixed(2)} | ${m.netUsd >= 0 ? "+$" : "-$"}${Math.abs(m.netUsd).toFixed(2)} |`;
  }
  return `| ${label} | ${sgn(m.sharpe)} | ${sgn(m.pnlPct, 1)} | ${m.winRate.toFixed(1)} | ${m.profitFactor.toFixed(2)} | ${m.trades} |`;
}

function printTable(title: string, rows: Array<{ label: string; m: Metrics }>, arr: Metrics[]) {
  console.log(`\n### ${title}\n`);
  if (dollarMode) {
    console.log(`| Market/Window | Sharpe | Win% | Trades | Gross P&L | Fees | Net P&L ($${POSITION_USD}@${LEVERAGE}x) |`);
    console.log(`|---|---:|---:|---:|---:|---:|---:|`);
    rows.forEach((r) => console.log(fmtRow(r.label, r.m)));
    const totGross = arr.reduce((a, m) => a + m.grossUsd, 0);
    const totFee = arr.reduce((a, m) => a + m.feeUsd, 0);
    const totNet = arr.reduce((a, m) => a + m.netUsd, 0);
    console.log(`| **Total** | med ${median(arr.map(m=>m.sharpe)).toFixed(2)} | — | ${arr.reduce((a,m)=>a+m.trades,0)} | $${totGross.toFixed(2)} | $${totFee.toFixed(2)} | ${totNet>=0?"+$":"-$"}${Math.abs(totNet).toFixed(2)} |`);
  } else {
    console.log(`| Market/Window | Sharpe | PnL% | Win% | Profit Factor | Trades |`);
    console.log(`|---|---:|---:|---:|---:|---:|`);
    rows.forEach((r) => console.log(fmtRow(r.label, r.m)));
    console.log(`| **Median** | **${median(arr.map(m=>m.sharpe)).toFixed(2)}** | **${median(arr.map(m=>m.pnlPct)).toFixed(1)}** | — | — | — |`);
  }
}

async function main() {
  console.log(`\nMacro-filter benchmark — MACD+RSI core, thr ${THRESHOLD}`);
  console.log(`interval=${INTERVAL} leverage=${LEVERAGE}x positionUsd=${POSITION_USD || "(%-mode)"} feeBps=${FEE_BPS}/side windows=${WINDOWS.join(",")}d`);
  console.log(`Macro overlay: 5-day trend of ${MACRO_SYMBOLS.join(", ")}\n`);

  const off: Metrics[] = [], on: Metrics[] = [];
  const rowsOff: Array<{ label: string; m: Metrics }> = [], rowsOn: Array<{ label: string; m: Metrics }> = [];
  const deltas: Array<{ label: string; off: Metrics; on: Metrics; regimeMix: string }> = [];

  for (const token of TOKENS) {
    for (const days of WINDOWS) {
      const { dates, closes } = await fetchCrypto(token, days);
      if (closes.length < 50) { console.log(`  ${token}/${days}d: insufficient data (${closes.length} bars) — skipped`); continue; }

      const macro: Record<string, Series[]> = {};
      for (const sym of MACRO_SYMBOLS) macro[sym] = await fetchMacro(sym, days);

      const regime = buildRegime(dates, macro);
      const data = buildMarketData(dates, closes);

      const resOff = runBacktest(data, WEIGHTS, THRESHOLD, 30, 1, 1, 4, 2);
      const resOn = runBacktest(data, WEIGHTS, THRESHOLD, 30, 1, 1, 4, 2, regime);
      const mOff = computeMetrics(resOff, days), mOn = computeMetrics(resOn, days);
      off.push(mOff); on.push(mOn);
      rowsOff.push({ label: `${token} / ${days}d`, m: mOff });
      rowsOn.push({ label: `${token} / ${days}d`, m: mOn });

      const tot = regime.length || 1;
      const mix = `off ${Math.round(regime.filter(r=>r==="RISK-OFF").length/tot*100)}% / on ${Math.round(regime.filter(r=>r==="RISK-ON").length/tot*100)}% / neu ${Math.round(regime.filter(r=>r==="NEUTRAL").length/tot*100)}%`;
      deltas.push({ label: `${token} / ${days}d`, off: mOff, on: mOn, regimeMix: mix });
      console.log(`  done ${token}/${days}d  (${closes.length} bars, ${mOff.trades} trades, regime ${mix})`);
    }
  }

  printTable("Macro filter OFF (baseline)", rowsOff, off);
  printTable("Macro filter ON", rowsOn, on);

  console.log(`\n### Delta (ON − OFF) per window\n`);
  console.log(`| Market/Window | ΔSharpe | ${dollarMode ? "ΔNet$" : "ΔPnL%"} | ΔWin% | ΔTrades | Regime mix |`);
  console.log(`|---|---:|---:|---:|---:|---|`);
  deltas.forEach((r) => {
    const dS = r.on.sharpe - r.off.sharpe;
    const dMain = dollarMode ? (r.on.netUsd - r.off.netUsd) : (r.on.pnlPct - r.off.pnlPct);
    const dW = r.on.winRate - r.off.winRate, dT = r.on.trades - r.off.trades;
    console.log(`| ${r.label} | ${sgn(dS)} | ${dollarMode ? (dMain>=0?"+$":"-$")+Math.abs(dMain).toFixed(2) : sgn(dMain,1)} | ${sgn(dW,1)} | ${dT>=0?"+":""}${dT} | ${r.regimeMix} |`);
  });

  if (dollarMode) {
    const offNet = off.reduce((a,m)=>a+m.netUsd,0), onNet = on.reduce((a,m)=>a+m.netUsd,0);
    const offGross = off.reduce((a,m)=>a+m.grossUsd,0), onGross = on.reduce((a,m)=>a+m.grossUsd,0);
    const offFee = off.reduce((a,m)=>a+m.feeUsd,0), onFee = on.reduce((a,m)=>a+m.feeUsd,0);
    console.log(`\nSummary (all windows, $${POSITION_USD} @ ${LEVERAGE}x, ${FEE_BPS}bps/side):`);
    console.log(`  OFF: gross +$${offGross.toFixed(2)}, fees -$${offFee.toFixed(2)}, NET ${offNet>=0?"+$":"-$"}${Math.abs(offNet).toFixed(2)}`);
    console.log(`  ON : gross +$${onGross.toFixed(2)}, fees -$${onFee.toFixed(2)}, NET ${onNet>=0?"+$":"-$"}${Math.abs(onNet).toFixed(2)}`);
    console.log(`  NOTE: fee model = ${FEE_BPS}bps taker per side on notional only — EXCLUDES price impact, borrow/funding, and slippage, so live costs are higher.\n`);
  } else {
    console.log(`\nSummary: median Sharpe ${median(off.map(m=>m.sharpe)).toFixed(2)} -> ${median(on.map(m=>m.sharpe)).toFixed(2)}, ` +
      `median PnL ${median(off.map(m=>m.pnlPct)).toFixed(1)}% -> ${median(on.map(m=>m.pnlPct)).toFixed(1)}%\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
