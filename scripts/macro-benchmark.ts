/**
 * Macro-filter benchmark.
 *
 * Reproduces the STRATEGY_RESULTS.md methodology (SOL/BTC/ETH x 30/90d, 1h candles,
 * MACD+RSI trend-follower core, 5x leverage) but adds a MACRO REGIME OVERLAY built
 * from real Yahoo Finance history for the three macro gauges the app now tracks:
 *   • US Dollar Index (DX-Y.NYB)
 *   • US 10Y Treasury Yield (^TNX)
 *   • Volatility Index (^VIX)
 *
 * For every crypto bar we derive a RISK-ON / RISK-OFF / NEUTRAL regime from the
 * 5-day trend of those three series, then run the identical strategy twice:
 *   A) macro filter OFF  (baseline)
 *   B) macro filter ON   (block longs in RISK-OFF, block shorts in RISK-ON)
 *
 * Run:  npx tsx scripts/macro-benchmark.ts
 */
import * as yahooFinanceModule from "yahoo-finance2";
import { runBacktest, calculateEMA, calculateRSI, MarketData } from "../src/lib/backtest";

// ---- Yahoo init (mirrors server.ts) ---------------------------------------
const imported: any = yahooFinanceModule;
const YfClass = imported.default?.default || imported.default || imported;
let yf: any;
try { yf = new YfClass(); } catch { yf = imported.default || imported; }
try { yf.setGlobalConfig?.({ validation: { logErrors: false, throwErrors: false } }); } catch {}

const LEVERAGE = 5;
const THRESHOLD = 0.25;
const WEIGHTS = { sentiment: 0, technical: 0.9, liquidity: 0.85, elliottWave: 0 };
const TOKENS = ["SOL", "BTC", "ETH"];
const WINDOWS = [30, 90];
const MACRO_SYMBOLS = ["DX-Y.NYB", "^TNX", "^VIX"]; // all: rising => risk-off for crypto

interface Series { t: number; close: number; }

async function fetchCrypto(token: string, days: number): Promise<{ dates: number[]; closes: number[] }> {
  const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const chart: any = await yf.chart(`${token}-USD`, { period1, interval: "1h" }, { validateResult: false });
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

interface Metrics { sharpe: number; pnl: number; winRate: number; profitFactor: number; trades: number; }

// Mirrors server.ts metric methodology: leveraged per-trade equity curve, Sharpe
// annualized by trades/year, profit factor from realized trades.
function computeMetrics(result: ReturnType<typeof runBacktest>, days: number): Metrics {
  const closed = result.trades.filter((t) => t.exitPrice !== undefined && (t.type === "Long" || t.type === "Short"));
  let equity = 1;
  const eq: number[] = [1];
  let wins = 0, grossWin = 0, grossLoss = 0;
  for (const t of closed) {
    const r = t.pnl * LEVERAGE;
    equity *= (1 + r);
    eq.push(equity);
    if (t.pnl > 0) { wins++; grossWin += t.pnl; } else { grossLoss += Math.abs(t.pnl); }
  }
  const rets: number[] = [];
  for (let k = 1; k < eq.length; k++) if (eq[k - 1] > 0) rets.push((eq[k] - eq[k - 1]) / eq[k - 1]);
  const n = rets.length;
  const mean = n ? rets.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n > 1 ? rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const periodYears = Math.max(days / 365, 1 / 365);
  const annFactor = Math.sqrt(Math.max(n / periodYears, 1));
  const sharpe = sd > 0 ? (mean / sd) * annFactor : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 99 : 0);
  return {
    sharpe,
    pnl: (equity - 1) * 100,
    winRate: closed.length ? (wins / closed.length) * 100 : 0,
    profitFactor,
    trades: closed.length,
  };
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function fmtRow(label: string, m: Metrics): string {
  const p = (x: number, d = 2) => (x >= 0 ? "+" : "") + x.toFixed(d);
  return `| ${label} | ${m.sharpe >= 0 ? "+" : ""}${m.sharpe.toFixed(2)} | ${p(m.pnl, 1)} | ${m.winRate.toFixed(1)} | ${m.profitFactor.toFixed(2)} | ${m.trades} |`;
}

async function main() {
  console.log(`\nMacro-filter benchmark — MACD+RSI core, thr ${THRESHOLD}, ${LEVERAGE}x, 1h candles`);
  console.log(`Macro overlay: 5-day trend of ${MACRO_SYMBOLS.join(", ")}\n`);

  const off: Metrics[] = [];
  const on: Metrics[] = [];
  const rows: Array<{ label: string; off: Metrics; on: Metrics; regimeMix: string }> = [];

  for (const token of TOKENS) {
    for (const days of WINDOWS) {
      const { dates, closes } = await fetchCrypto(token, days);
      if (closes.length < 50) { console.log(`  ${token}/${days}d: insufficient data (${closes.length})`); continue; }

      const macro: Record<string, Series[]> = {};
      for (const sym of MACRO_SYMBOLS) macro[sym] = await fetchMacro(sym, days);

      const regime = buildRegime(dates, macro);
      const data = buildMarketData(dates, closes);

      const resOff = runBacktest(data, WEIGHTS, THRESHOLD, 30, 1, 1, 4, 2);
      const resOn = runBacktest(data, WEIGHTS, THRESHOLD, 30, 1, 1, 4, 2, regime);

      const mOff = computeMetrics(resOff, days);
      const mOn = computeMetrics(resOn, days);
      off.push(mOff); on.push(mOn);

      const offCt = regime.filter((r) => r === "RISK-OFF").length;
      const onCt = regime.filter((r) => r === "RISK-ON").length;
      const nuCt = regime.filter((r) => r === "NEUTRAL").length;
      const tot = regime.length || 1;
      const regimeMix = `off ${Math.round(offCt / tot * 100)}% / on ${Math.round(onCt / tot * 100)}% / neu ${Math.round(nuCt / tot * 100)}%`;

      rows.push({ label: `${token} / ${days}d`, off: mOff, on: mOn, regimeMix });
      console.log(`  done ${token}/${days}d  (${closes.length} bars, regime ${regimeMix})`);
    }
  }

  const posOff = off.filter((m) => m.pnl > 0).length;
  const posOn = on.filter((m) => m.pnl > 0).length;

  console.log(`\n### Macro filter OFF (baseline)\n`);
  console.log(`| Market/Window | Sharpe | PnL% | Win% | Profit Factor | Trades |`);
  console.log(`|---|---:|---:|---:|---:|---:|`);
  rows.forEach((r) => console.log(fmtRow(r.label, r.off)));
  console.log(`| **Median** | **${median(off.map(m=>m.sharpe)).toFixed(2)}** | **${median(off.map(m=>m.pnl)).toFixed(1)}** | — | — | — |`);
  console.log(`\nPositive windows: ${posOff}/${off.length}`);

  console.log(`\n### Macro filter ON\n`);
  console.log(`| Market/Window | Sharpe | PnL% | Win% | Profit Factor | Trades |`);
  console.log(`|---|---:|---:|---:|---:|---:|`);
  rows.forEach((r) => console.log(fmtRow(r.label, r.on)));
  console.log(`| **Median** | **${median(on.map(m=>m.sharpe)).toFixed(2)}** | **${median(on.map(m=>m.pnl)).toFixed(1)}** | — | — | — |`);
  console.log(`\nPositive windows: ${posOn}/${on.length}`);

  console.log(`\n### Delta (ON − OFF) per window\n`);
  console.log(`| Market/Window | ΔSharpe | ΔPnL% | ΔWin% | ΔTrades | Regime mix |`);
  console.log(`|---|---:|---:|---:|---:|---|`);
  rows.forEach((r) => {
    const dS = r.on.sharpe - r.off.sharpe, dP = r.on.pnl - r.off.pnl, dW = r.on.winRate - r.off.winRate, dT = r.on.trades - r.off.trades;
    console.log(`| ${r.label} | ${dS>=0?"+":""}${dS.toFixed(2)} | ${dP>=0?"+":""}${dP.toFixed(1)} | ${dW>=0?"+":""}${dW.toFixed(1)} | ${dT>=0?"+":""}${dT} | ${r.regimeMix} |`);
  });

  console.log(`\nSummary: median Sharpe ${median(off.map(m=>m.sharpe)).toFixed(2)} -> ${median(on.map(m=>m.sharpe)).toFixed(2)}, ` +
    `median PnL ${median(off.map(m=>m.pnl)).toFixed(1)}% -> ${median(on.map(m=>m.pnl)).toFixed(1)}%, ` +
    `positive windows ${posOff}/${off.length} -> ${posOn}/${on.length}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
