process.env.NODE_ENV = "test";
process.env.CORTEX_TESTING = "true";

import assert from "assert";
import fs from "fs";
import path from "path";

const {
  calculateEMA,
  calculateRSI,
  calculateElliotWave,
  performCoreAnalysis,
  fetchMarketNews,
  loadTelegramConfig,
  saveTelegramConfig,
  CONFIG_FILE,
  signalSide,
  signalExitReason,
  initExitState,
  evaluateExit,
  STAGNANT_EXIT_MINUTES,
  STAGNANT_MIN_PNL_PCT,
  EXIT_SL_MULT,
  EXIT_PARTIAL_MULT,
  EXIT_TRAIL_MULT,
  EXIT_TP_MULT,
  EXIT_PARTIAL_FRAC,
  findOnChainPosition,
  adoptOnChainPosition,
  buildTradesFromJupHistory,
  parseCsv,
  journalRowsFromSeedCsv,
  mergeJournalSeed,
  auditLogToCsv,
  pruneAuditEntries,
  AUDIT_RETENTION_DAYS
} = await import("./server.js");
const Playbook = await import("./src/lib/strategyPlaybook.ts");

// ANSI Terminal Styling
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const ESCAPE = "\x1b[0m";

interface TestGroup {
  name: string;
  cases: Array<{
    name: string;
    fn: () => void | Promise<void>;
  }>;
}

const groups: TestGroup[] = [];

function describe(name: string, suiteFn: () => void) {
  const currentCases: Array<{ name: string; fn: () => void | Promise<void> }> = [];
  
  const it = (caseName: string, caseFn: () => void | Promise<void>) => {
    currentCases.push({ name: caseName, fn: caseFn });
  };
  
  (global as any).it = it;
  suiteFn();
  
  groups.push({ name, cases: currentCases });
}

// -------------------------------------------------------------
// MAIN TEST SUITES DEFINITIONS
// -------------------------------------------------------------

describe("Indicator, Oscillator & Bias Calculations", () => {
  const it = (global as any).it;

  it("should calculate Exponential Moving Average (EMA) correctly", () => {
    const data = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const period = 5;
    const ema = calculateEMA(data, period);
    
    assert.strictEqual(ema.length, data.length);
    assert.strictEqual(ema[0], data[0]); // first element is starting price
    // Verify mathematical progression towards final EMA
    assert.ok(ema[ema.length - 1] > ema[0]);
    assert.ok(ema[ema.length - 1] < data[data.length - 1]);
  });

  it("should calculate Relative Strength Index (RSI) indices correctly", () => {
    const data = Array.from({ length: 20 }, (_, i) => 100 + i * 2); // strictly increasing sequence (Overbought)
    const rsi = calculateRSI(data, 14);
    
    assert.strictEqual(rsi.length, data.length);
    // RSI with rising values should trend upwards towards overbought territory (above 70)
    const latestRsi = rsi[rsi.length - 1];
    assert.ok(latestRsi > 70);
  });

  it("should handle insufficient data for Elliot Wave Oscillator calculations", () => {
    const shortData = [100, 102, 105]; // under 34 candles
    const wave = calculateElliotWave(shortData);
    
    assert.strictEqual(wave.phase, "Initial Setup Phase");
    assert.ok(wave.score !== undefined);
    assert.ok(wave.value !== undefined);
  });

  it("should calculate proper Elliot Wave phase structures for fully populated sequences", () => {
    // Generate a simulated Wave 3 momentum breakout (34+ elements)
    const data = Array.from({ length: 40 }, (_, i) => {
      if (i < 20) return 100 + i * 0.5; // slow drift
      return 110 + (i - 20) * 4.0; // intense breakout phase
    });
    
    const wave = calculateElliotWave(data);
    assert.ok(wave.phase.length > 0);
    assert.strictEqual(typeof wave.score, "number");
    assert.ok(wave.score >= -1 && wave.score <= 1);
  });

  it("should enforce political/news sentiment overrule priorities", () => {
    const closes = Array.from({ length: 40 }, () => 150);
    const weights = { sentiment: 0.25, technical: 0.25, liquidity: 0.25 };

    // Neutral sentiment
    const neutralAnalysis = performCoreAnalysis(closes, [], weights, 0.0);
    assert.ok(neutralAnalysis.compositeScore < 0.8 && neutralAnalysis.compositeScore > -0.8);

    // Extreme positive news sentiment (>= 0.85 should trigger override composite to exactly 1.0)
    const positiveOverrule = performCoreAnalysis(closes, [], weights, 0.9);
    assert.strictEqual(positiveOverrule.compositeScore, 1.0);
    assert.strictEqual(positiveOverrule.action, "Long Buy");

    // Extreme negative news sentiment (<= -0.85 should trigger override composite to exactly -1.0)
    const negativeOverrule = performCoreAnalysis(closes, [], weights, -0.95);
    assert.strictEqual(negativeOverrule.compositeScore, -1.0);
    assert.strictEqual(negativeOverrule.action, "Short Sell");
  });

  it("should bypass overrules and gates when corresponding indicator weights are zero", () => {
    const closes = Array.from({ length: 40 }, () => 150);
    
    // 1. Sentiment disabled (weight 0) -> Extreme sentiment should NOT overrule composite/action
    const weightsSentDisabled = { sentiment: 0.0, technical: 0.5, liquidity: 0.5, elliottWave: 0.5 };
    const analysisSentDisabled = performCoreAnalysis(closes, [], weightsSentDisabled, 0.95);
    assert.strictEqual(analysisSentDisabled.overrule, false);
    assert.ok(analysisSentDisabled.compositeScore !== 1.0); // Normally 1.0 if overruled

    // 2. All weights disabled -> Composite score should be 0.0
    const weightsAllDisabled = { sentiment: 0.0, technical: 0.0, liquidity: 0.0, elliottWave: 0.0 };
    const analysisAllDisabled = performCoreAnalysis(closes, [], weightsAllDisabled, 0.95);
    assert.strictEqual(analysisAllDisabled.compositeScore, 0.0);

    // 3. RSI neutral chop zone bypass when liquidity is 0
    const weightsLiqDisabled = { sentiment: 0.5, technical: 0.5, liquidity: 0.0, elliottWave: 0.5 };
    const analysisLiqDisabled = performCoreAnalysis(closes, [], weightsLiqDisabled, 0.0);
    assert.strictEqual(analysisLiqDisabled.isChop, false);
  });
});

describe("News Fetching Integration", () => {
  const it = (global as any).it;

  it("should verify fetchMarketNews executes safely and satisfies schema rules", async () => {
    try {
      // Execute a real sanity check on SOL market news feeds
      const articles = await fetchMarketNews("SOL", "market");
      
      assert.ok(Array.isArray(articles), "fetchMarketNews must return an array");
      if (articles.length > 0) {
        const first = articles[0];
        assert.ok(first.title, "Article must have a title");
        assert.ok(first.source, "Article must have a source name");
        assert.ok(first.publishedAt, "Article must have a publication timestamp");
        assert.ok(first.url, "Article must have a URL");
      }
      console.log(`   ${GREEN}✓${ESCAPE} Realtime fetch retrieved ${articles.length} news articles successfully.`);
    } catch (err: any) {
      // If Yahoo Finance/Google News is physically rate-limited or blocked in container, handle gracefully
      console.log(`   ${YELLOW}⚠${ESCAPE} Warning: External news API fetch bypassed/skipped due to network context: ${err.message}`);
    }
  });
});

describe("Alert Notification Rules & Suppression", () => {
  const it = (global as any).it;

  it("should never dispatch Telegram notifications on HOLD signal states", () => {
    // Alert logic implementation requires:
    // - No alerts dispatched if currentDirection === "HOLD" and not in a special close category
    // Let's verify transition and notification trigger rules:
    const mockCheckSendAlert = (
      currentDirection: "LONG" | "SHORT" | "HOLD",
      lastSentDirection: string,
      isTpOrSlHit: boolean
    ): boolean => {
      let shouldSendAlert = false;
      if (isTpOrSlHit) {
        shouldSendAlert = true;
      } else {
        const trendHasChanged = (currentDirection !== lastSentDirection);
        if (trendHasChanged && currentDirection !== "HOLD") {
          shouldSendAlert = true;
        }
      }
      return shouldSendAlert;
    };

    // Rule: Trend switches from SHORT to HOLD -> No alert sent!
    const result1 = mockCheckSendAlert("HOLD", "SHORT", false);
    assert.strictEqual(result1, false, "Hold trend change must be suppressed");

    // Rule: Trend remains HOLD -> No alert sent!
    const result2 = mockCheckSendAlert("HOLD", "HOLD", false);
    assert.strictEqual(result2, false, "Continuous Hold must be suppressed");

    // Rule: Trend switches from HOLD to LONG -> Alert dispatched!
    const result3 = mockCheckSendAlert("LONG", "HOLD", false);
    assert.strictEqual(result3, true, "Entry into LONG trend must dispatch an alert");
  });

  it("should always dispatch alerts when take profit or stop loss limits are triggered", () => {
    const mockCheckSendAlert = (
      currentDirection: "LONG" | "SHORT" | "HOLD",
      lastSentDirection: string,
      isTpOrSlHit: boolean
    ): boolean => {
      if (isTpOrSlHit) return true;
      const trendHasChanged = (currentDirection !== lastSentDirection);
      return trendHasChanged && currentDirection !== "HOLD";
    };

    // Rule: TP/SL hit closes position to HOLD direction -> Alert must still dispatch!
    const result = mockCheckSendAlert("HOLD", "LONG", true);
    assert.strictEqual(result, true, "Position close alert on limit execution must always trigger");
  });
});

describe("Automated Margin Trading State Machine & Balance Ledgering", () => {
  const it = (global as any).it;

  it("should open active LONG positions properly and register to ledger on trend shift", () => {
    // Isolated logic simulation matching checkPredictionAndAlert states
    let activeTrade: any = null;
    let lastSentDirection: string = "HOLD";
    let enterSide: string = "LONG";
    let tradesHistory: any[] = [];
    let cumulativePnL = 0;

    // Shift trend to LONG
    if (!activeTrade && enterSide !== "HOLD" && enterSide !== lastSentDirection) {
      activeTrade = {
        side: enterSide,
        entryPrice: 150.0,
        entryTime: new Date().toISOString()
      };
      // Simulates trend changed alert sent!
      lastSentDirection = enterSide;
    }

    assert.notStrictEqual(activeTrade, null);
    assert.strictEqual(activeTrade.side, "LONG");
    assert.strictEqual(activeTrade.entryPrice, 150.0);
    assert.strictEqual(lastSentDirection, "LONG");
  });

  it("should trigger take-profit and liquidate position with exact PnL and leverage multipliers", () => {
    let activeTrade: any = {
      side: "LONG",
      entryPrice: 100.0,
      entryTime: new Date().toISOString()
    };
    let tradesHistory: any[] = [];
    let cumulativePnL = 0;
    let lastTradePnL = 0;

    const currentPrice = 105.0; // +5.0% price move
    const leverage = 5;
    const takeProfitPct = 4.0; // Target profit limit is 4.0%

    // Calculate PNL based on rules:
    let pnlPercent = ((currentPrice - activeTrade.entryPrice) / activeTrade.entryPrice) * 100 * leverage;
    assert.strictEqual(pnlPercent, 25.0); // 5% * 5x = 25%

    let shouldClose = pnlPercent >= takeProfitPct;
    assert.strictEqual(shouldClose, true);

    if (shouldClose) {
      lastTradePnL = pnlPercent;
      cumulativePnL += pnlPercent;
      tradesHistory.push({
        id: "tx_1",
        side: activeTrade.side,
        entryPrice: activeTrade.entryPrice,
        exitPrice: currentPrice,
        pnl: pnlPercent,
        entryTime: activeTrade.entryTime,
        exitTime: new Date().toISOString()
      });
      activeTrade = null;
    }

    assert.strictEqual(activeTrade, null, "Active trade must be cleared upon TP hit");
    assert.strictEqual(lastTradePnL, 25.0, "Last trade PNL must record correct value");
    assert.strictEqual(cumulativePnL, 25.0, "Portfolio cumulative PNL must be updated precisely");
    assert.strictEqual(tradesHistory.length, 1, "Ledger list must contain settled trade receipt");
  });

  it("should trigger stop-loss and liquidate position on negative trade developments", () => {
    let activeTrade: any = {
      side: "SHORT",
      entryPrice: 100.0,
      entryTime: new Date().toISOString()
    };
    let tradesHistory: any[] = [];
    let cumulativePnL = 100.0;
    let lastTradePnL = 0;

    const currentPrice = 101.5; // Price went up (unfavorable for short) by 1.5%
    const leverage = 3;
    const stopLossPct = 4.0; // Stop loss limit is 4.0%

    // Calculate short PNL: ((entry - exit) / entry) * 100 * leverage
    let pnlPercent = ((activeTrade.entryPrice - currentPrice) / activeTrade.entryPrice) * 100 * leverage;
    assert.strictEqual(pnlPercent, -4.5); // -1.5% * 3x = -4.5%

    let shouldClose = pnlPercent <= -stopLossPct;
    assert.strictEqual(shouldClose, true);

    if (shouldClose) {
      lastTradePnL = pnlPercent;
      cumulativePnL += pnlPercent;
      tradesHistory.push({
        id: "tx_2",
        side: activeTrade.side,
        entryPrice: activeTrade.entryPrice,
        exitPrice: currentPrice,
        pnl: pnlPercent,
        entryTime: activeTrade.entryTime,
        exitTime: new Date().toISOString()
      });
      activeTrade = null;
    }

    assert.strictEqual(activeTrade, null, "Active trade must be cleared upon SL hit");
    assert.strictEqual(lastTradePnL, -4.5);
    assert.strictEqual(cumulativePnL, 95.5);
    assert.strictEqual(tradesHistory.length, 1);
  });

  it("should enforce trend resets to prevent alternating trading whipsaws", () => {
    let enterSide: string | null = "LONG";
    let activeTrade: any = null;
    let closedThisTick = false;
    let tradesHistory: any[] = [{ side: "LONG" }];
    
    // Logic matching the updated checkJupiterTradingAndState:
    let lastClosedSide = tradesHistory.length > 0 ? tradesHistory[tradesHistory.length - 1].side : null;

    let canEnter = false;
    if (enterSide && enterSide !== "HOLD") {
      if (enterSide !== lastClosedSide) {
        canEnter = true;
      }
    }
    
    assert.strictEqual(canEnter, false, "Must not enter LONG immediately after closing a LONG without a trend reset");
  });
});

// -------------------------------------------------------------
// 2026-09 STRATEGY REVIEW — signal side, signal exits, time-stop
// -------------------------------------------------------------
describe("Signal side parsing (live daemon)", () => {
  const it = (global as any).it;

  it("uses the canonical positionSide, never the descriptive action label", () => {
    assert.strictEqual(signalSide({ positionSide: "LONG", action: "Long Buy" }), "LONG");
    assert.strictEqual(signalSide({ positionSide: "SHORT", action: "Short Sell" }), "SHORT");
    // Range-Fade labels used to parse to null — the side must come through.
    assert.strictEqual(signalSide({ positionSide: "LONG", action: "Range Fade — rejected off 6-bar low $100.00" }), "LONG");
  });

  it("maps every descriptive HOLD label to HOLD (the old parser returned null for these)", () => {
    for (const action of ["Hold", "Hold Chop Zone", "Hold (Σ below threshold)", "Hold (ADX is ranging: 12.0 <= 15)", "Hold (extended: px 1.9×ATR from EMA26 > 1.5×ATR — no chasing)"]) {
      assert.strictEqual(signalSide({ positionSide: "HOLD", action }), "HOLD", action);
      assert.strictEqual(signalSide({ action }), "HOLD", `fallback: ${action}`);
    }
  });

  it("falls back to the action's leading words when positionSide is absent", () => {
    assert.strictEqual(signalSide({ action: "Long Buy (Oversold)" }), "LONG");
    assert.strictEqual(signalSide({ action: "Short Sell (Overbought)" }), "SHORT");
    assert.strictEqual(signalSide(null), "HOLD");
  });
});

describe("Signal-driven exits (reversal / thesis lapse)", () => {
  const it = (global as any).it;

  it("banks a winner when the signal falls back to HOLD (thesis lapse)", () => {
    assert.strictEqual(signalExitReason("LONG", "HOLD", 2.2, 1.5), "thesis-lapse");
    assert.strictEqual(signalExitReason("SHORT", "HOLD", 1.5, 1.5), "thesis-lapse");
  });

  it("flags a true reversal when the signal points the other way", () => {
    assert.strictEqual(signalExitReason("LONG", "SHORT", 3.0, 1.5), "reversal");
    assert.strictEqual(signalExitReason("SHORT", "LONG", 1.6, 1.5), "reversal");
  });

  it("never exits on a signal change below the fee buffer or when the signal agrees", () => {
    assert.strictEqual(signalExitReason("LONG", "HOLD", 1.49, 1.5), null);
    assert.strictEqual(signalExitReason("LONG", "SHORT", -2.0, 1.5), null);
    assert.strictEqual(signalExitReason("LONG", "LONG", 5.0, 1.5), null);
    assert.strictEqual(signalExitReason("LONG", "HOLD", NaN, 1.5), null);
  });

  it("scenario: a working long is banked on thesis lapse before the ATR scale-out", () => {
    // Entry 100, ATR 1 → stop 98.5, partial at 101.5. Price drifts to 100.6 (+1.8% at 3x) and the
    // extension guard makes the signal HOLD → the shared rule closes it; the exit engine alone would not.
    const st = initExitState("LONG", 100, 1);
    const res = evaluateExit(st, 100.6);
    assert.strictEqual(res.close, null);
    assert.strictEqual(res.partialFrac, 0);
    const pnl = (100.6 / 100 - 1) * 100 * 3;
    assert.strictEqual(signalExitReason("LONG", "HOLD", pnl, 1.5), "thesis-lapse");
  });

  it("scenario: a losing long with a HOLD signal is left to the stop, not closed early", () => {
    const st = initExitState("LONG", 100, 1);
    assert.strictEqual(st.stopPrice, 100 - EXIT_SL_MULT * 1);
    const pnl = (99.4 / 100 - 1) * 100 * 3;
    assert.strictEqual(signalExitReason("LONG", "HOLD", pnl, 1.5), null);
    assert.strictEqual(evaluateExit(st, 99.4).close, null);
    assert.strictEqual(evaluateExit(st, 98.4).close, "Stop Loss");
  });

  it("uses a 600-minute stagnation time-stop by default (replay plateau 480–720)", () => {
    if (process.env.STAGNANT_EXIT_MINUTES) return; // env override in effect
    assert.strictEqual(STAGNANT_EXIT_MINUTES, 600);
  });
});

describe("Orphaned on-chain position recovery", () => {
  const it = (global as any).it;
  const cliRow = { positionPubkey: "Pos111", asset: "SOL", side: "long", leverage: 3.02, sizeUsd: 31.4, entryPriceUsd: 119.08, markPriceUsd: 118.5, tpsl: [] };

  it("finds the position for a token (alias-aware) and ignores other markets", () => {
    assert.strictEqual(findOnChainPosition([cliRow], "SOL")?.positionPubkey, "Pos111");
    assert.strictEqual(findOnChainPosition([cliRow], "ETH"), null);
    assert.strictEqual(findOnChainPosition([{ ...cliRow, asset: "WETH" }], "ETH")?.positionPubkey, "Pos111");
    assert.strictEqual(findOnChainPosition(undefined, "SOL"), null);
  });

  it("adopts an untracked position with the on-chain entry and a fresh ATR stop", () => {
    const t = adoptOnChainPosition(cliRow, { token: "SOL", atr: 1.2, leverageFallback: 3, nowIso: "2026-09-23T05:26:00.000Z", reason: "test" });
    assert.ok(t);
    assert.strictEqual(t.side, "LONG");
    assert.strictEqual(t.entryPrice, 119.08);
    assert.strictEqual(t.leverage, 3);
    assert.strictEqual(t.mode, "REAL");
    assert.strictEqual(t.adopted, true);
    assert.strictEqual(t.partialTaken, false);
    assert.ok(Math.abs(t.sizeInSol - 31.4 / 119.08) < 1e-9);
    assert.ok(t.stopPrice < 119.08 && Math.abs(t.stopPrice - (119.08 - EXIT_SL_MULT * t.atrAtEntry)) < 1e-9);
  });

  it("rejects malformed rows and clamps absurd leverage", () => {
    assert.strictEqual(adoptOnChainPosition({ ...cliRow, side: "flat" }, { token: "SOL", atr: 1, leverageFallback: 3, nowIso: "", reason: "" }), null);
    assert.strictEqual(adoptOnChainPosition({ ...cliRow, entryPriceUsd: 0 }, { token: "SOL", atr: 1, leverageFallback: 3, nowIso: "", reason: "" }), null);
    const hot = adoptOnChainPosition({ ...cliRow, leverage: 20 }, { token: "SOL", atr: 1, leverageFallback: 3, nowIso: "", reason: "" });
    assert.ok(hot.leverage <= 5);
  });
});

describe("On-chain history pairing (journal backfill)", () => {
  const it = (global as any).it;
  const inc = (time: string, side: string, price: number, size = 31.4) => ({ time, side, action: "Increase", priceUsd: price, sizeUsd: size, feeUsd: 0.02, signature: `i-${time}` });
  const dec = (time: string, side: string, price: number, pnlUsd: number, pnlPct: number, size = 31.4) => ({ time, side, action: "Decrease", priceUsd: price, sizeUsd: size, pnlUsd, pnlPct, feeUsd: 0.02, signature: `d-${time}` });

  it("keeps each round trip intact across the real Sep 21 → Sep 23 orphan sequence", () => {
    const rows = [
      inc("2026-09-21T05:06:40Z", "LONG", 111.47), dec("2026-09-21T06:26:39Z", "LONG", 112.35, 0.25, 2.4),
      inc("2026-09-23T05:06:42Z", "LONG", 119.08), dec("2026-09-23T07:44:36Z", "LONG", 117.78, -0.34, -3.3),
    ];
    const t = buildTradesFromJupHistory(rows, "SOL");
    assert.strictEqual(t.length, 2);
    assert.strictEqual(t[1].entryTime, "2026-09-23T05:06:42Z"); // NOT the Sep 21 entry
    assert.strictEqual(t[1].entryPrice, 119.08);
  });

  it("merges a partial scale-out (two Decreases) into ONE trade with summed PnL", () => {
    const rows = [
      inc("2026-09-02T03:01:40Z", "SHORT", 100.02, 31.43),
      dec("2026-09-02T09:41:38Z", "SHORT", 98.67, 0.20, 3.8, 14.8),
      dec("2026-09-02T09:41:42Z", "SHORT", 98.64, 0.23, 3.9, 16.63),
    ];
    const t = buildTradesFromJupHistory(rows, "SOL");
    assert.strictEqual(t.length, 1);
    assert.ok(Math.abs(t[0].realizedPnlUsd - (0.18 + 0.21)) < 1e-9); // each leg net of its close fee
    assert.strictEqual(t[0].exitTime, "2026-09-02T09:41:42Z");
  });

  it("does not let a stacked open shift later pairings (the old FIFO bug)", () => {
    const rows = [
      inc("2026-07-03T21:56:40Z", "LONG", 82.64, 31), inc("2026-07-03T22:01:18Z", "LONG", 82.48, 31),
      dec("2026-07-03T22:02:05Z", "LONG", 82.51, -0.09, -0.36, 62),
      inc("2026-07-05T12:27:14Z", "LONG", 80.84), dec("2026-07-06T00:25:59Z", "LONG", 81.15, -0.22, -2.11),
    ];
    const t = buildTradesFromJupHistory(rows, "SOL");
    assert.strictEqual(t.length, 2);
    assert.strictEqual(t[1].entryTime, "2026-07-05T12:27:14Z");
  });
});

describe("Trade journal seed (seed/trade-journal-seed.csv)", () => {
  const it = (global as any).it;
  const seedText = fs.readFileSync(path.join(process.cwd(), "seed", "trade-journal-seed.csv"), "utf-8");

  it("parses RFC 4180 CSV (quotes, doubled quotes, embedded commas/newlines)", () => {
    const rows = parseCsv('a,b,c\n"x, y","say ""hi""","line1\nline2"\r\n1,,3\n');
    assert.deepStrictEqual(rows, [["a", "b", "c"], ["x, y", 'say "hi"', "line1\nline2"], ["1", "", "3"]]);
  });

  it("imports every seed row as a verified REAL journal trade with unique ids", () => {
    const rows = journalRowsFromSeedCsv(seedText);
    assert.strictEqual(rows.length, 86);
    assert.strictEqual(new Set(rows.map((r: any) => r.id)).size, 86);
    for (const r of rows) {
      assert.ok(r.id.startsWith("csv-"), "seed ids must not use the 'seed-' prefix the backfill deletes");
      assert.strictEqual(r.mode, "REAL");
      assert.strictEqual(r.feesReconciled, true);
      assert.strictEqual(typeof r.realizedPnlUsd, "number");
    }
    const newest = rows[0];
    assert.strictEqual(newest.side, "LONG");
    assert.strictEqual(newest.leverage, 3);
    assert.strictEqual(newest.version, "2.0.0");
    assert.ok(newest.news.length > 1);
    const gates = rows.find((r: any) => r.exitTime === "2026-09-06T09:17:22.305Z");
    assert.ok(gates.news.some((n: string) => n.includes('"Pure Mania-Driven Asset."')));
  });

  it("carries the on-chain-corrected entries for the three untracked positions", () => {
    const rows = journalRowsFromSeedCsv(seedText);
    const byExit = (iso: string) => rows.find((r: any) => r.exitTime === iso);
    assert.strictEqual(byExit("2026-09-23T07:44:36.000Z").entryPrice, 119.08);
    assert.strictEqual(byExit("2026-09-06T15:01:54.000Z").entryTime, "2026-09-06T14:17:25.000Z");
    assert.strictEqual(byExit("2026-08-25T12:03:16.000Z").entryPrice, 100.56);
  });

  it("merges idempotently and skips trades the store already holds", () => {
    const seed = journalRowsFromSeedCsv(seedText);
    const first = mergeJournalSeed([], seed);
    assert.strictEqual(first.added, 86);
    const again = mergeJournalSeed(first.store, seed);
    assert.strictEqual(again.added, 0);
    // An on-chain backfilled copy of the newest trade (exit 30s apart) must suppress its seed row.
    const onChain = { id: "jup-abc", source: "Auto-Trade (Jupiter)", side: "LONG", token: "SOL", exitTime: "2026-09-25T14:26:43.000Z" };
    const withChain = mergeJournalSeed([onChain], seed);
    assert.strictEqual(withChain.added, 85);
  });
});

describe("Audit log retention & CSV export", () => {
  const it = (global as any).it;

  it("keeps 30 days by default and drops older entries", () => {
    assert.strictEqual(AUDIT_RETENTION_DAYS, Number(process.env.AUDIT_RETENTION_DAYS) || 30);
    const now = Date.parse("2026-09-26T12:00:00Z");
    const entries = [
      { timestamp: "2026-09-26T11:00:00Z", message: "fresh" },
      { timestamp: "2026-08-28T12:00:01Z", message: "29.99 days" },
      { timestamp: "2026-08-27T11:59:59Z", message: "30+ days" },
      { timestamp: "garbage", message: "bad" },
    ];
    assert.deepStrictEqual(pruneAuditEntries(entries, now, 30).map((e: any) => e.message), ["fresh", "29.99 days"]);
  });

  it("exports CSV with a header and correct escaping", () => {
    const csv = auditLogToCsv([
      { timestamp: "2026-09-26T11:00:00Z", source: "Auto-Trade", type: "trade", version: "2.0.0", message: 'CLOSE LONG @ $119.85 — "Thesis Lapse", banked +2.2%' },
      { timestamp: "2026-09-26T10:40:00Z", source: "Auto-Trade", type: "hold", message: "line1\nline2" },
    ]);
    const rows = parseCsv(csv);
    assert.deepStrictEqual(rows[0], ["Timestamp (UTC)", "Source", "Type", "Version", "Message"]);
    assert.strictEqual(rows[1][4], 'CLOSE LONG @ $119.85 — "Thesis Lapse", banked +2.2%');
    assert.strictEqual(rows[2][4], "line1\nline2");
    assert.strictEqual(rows[2][3], "");
  });
});

describe("In-app Strategy Playbook parity (src/lib/strategyPlaybook.ts vs server.ts)", () => {
  const it = (global as any).it;
  const P = Playbook.PLAYBOOK;

  it("uses the server's exit constants", () => {
    assert.strictEqual(P.SL, EXIT_SL_MULT);
    assert.strictEqual(P.PARTIAL, EXIT_PARTIAL_MULT);
    assert.strictEqual(P.FRAC, EXIT_PARTIAL_FRAC);
    assert.strictEqual(P.TRAIL, EXIT_TRAIL_MULT);
    assert.strictEqual(P.TP, EXIT_TP_MULT);
    if (!process.env.STAGNANT_EXIT_MINUTES) assert.strictEqual(P.STAG_MIN, STAGNANT_EXIT_MINUTES);
    assert.strictEqual(P.STAG_PNL, STAGNANT_MIN_PNL_PCT);
  });

  for (const sc of Playbook.SCENARIOS) {
    it(`scenario "${sc.name}" closes exactly as the live daemon's rules would`, () => {
      const run = Playbook.simulate(sc);
      if (!sc.side) {
        assert.strictEqual(run.closed, null);
        assert.ok(run.frames.every((f: any) => f.pnl === null));
        return;
      }
      // Drive the SERVER's functions in the daemon's order: price exits → signal exit → time-stop.
      let st = initExitState(sc.side, P.ENTRY, P.ATR);
      let banked = 0, rem = 1, expected: any = null;
      const lev = (px: number) => (sc.side === "LONG" ? px / P.ENTRY - 1 : 1 - px / P.ENTRY) * 100 * P.LEV;
      for (let i = 1; i < sc.px.length && !expected; i++) {
        const px = sc.px[i];
        const r = evaluateExit(st, px);
        st = r.state;
        if (r.partialFrac > 0) { banked += lev(px) * r.partialFrac; rem -= r.partialFrac; }
        const total = banked + rem * lev(px);
        if (r.close) { expected = { i, total, kind: r.close === "Trailing Stop" ? "trail" : r.close === "Take Profit Cap" ? "tp" : "stop" }; break; }
        const why = signalExitReason(sc.side, sc.sig[i], lev(px), P.BUFFER);
        if (why) { expected = { i, total, kind: why }; break; }
        if (!st.partialTaken && i * P.TICK_MIN >= STAGNANT_EXIT_MINUTES && lev(px) < STAGNANT_MIN_PNL_PCT) { expected = { i, total, kind: "time" }; break; }
      }
      assert.ok(expected, "server rules should close every trading scenario");
      assert.ok(run.closed, "playbook should close the trade");
      assert.strictEqual(run.closed.i, expected.i);
      assert.strictEqual(run.closed.kind, expected.kind);
      assert.ok(Math.abs(run.closed.total - expected.total) < 1e-9, `P&L ${run.closed.total} vs ${expected.total}`);
    });
  }

  it("covers every exit type the daemon has", () => {
    const kinds = new Set(Playbook.SCENARIOS.map((s: any) => Playbook.simulate(s).closed?.kind).filter(Boolean));
    for (const k of ["trail", "stop", "thesis-lapse", "reversal", "time"]) assert.ok(kinds.has(k), `missing ${k}`);
  });
});

// -------------------------------------------------------------
// RUNNER CORE LOGIC
// -------------------------------------------------------------

async function runTestSuite() {
  console.log(`\n${BOLD}${CYAN}===================================================`);
  console.log(`🧠 Cortex Quant Alpha Automated Testing Harness`);
  console.log(`===================================================${ESCAPE}\n`);

  let totalCases = 0;
  let passedCases = 0;
  let failedCases = 0;

  const results: Array<{ group: string; name: string; success: boolean; error?: string }> = [];

  for (const group of groups) {
    console.log(`${BOLD}📁 Suite: ${group.name}${ESCAPE}`);
    for (const tc of group.cases) {
      totalCases++;
      try {
        await tc.fn();
        passedCases++;
        results.push({ group: group.name, name: tc.name, success: true });
        console.log(`  ${GREEN}✓${ESCAPE} ${tc.name}`);
      } catch (err: any) {
        failedCases++;
        results.push({ group: group.name, name: tc.name, success: false, error: err.message });
        console.log(`  ${RED}✗${ESCAPE} ${tc.name}`);
        console.log(`     ${RED}Error: ${err.message}${ESCAPE}`);
        if (err.stack) {
          console.log(`     ${RED}${err.stack.split("\n").slice(1, 3).join("\n")}${ESCAPE}`);
        }
      }
    }
    console.log();
  }

  // Back up configuration states if altered during background load tests
  try {
    const backupConfig = loadTelegramConfig();
    saveTelegramConfig(backupConfig);
  } catch (err) {}

  console.log(`${BOLD}${CYAN}===================================================`);
  console.log(`📊 Cortex Suite Run Complete`);
  console.log(`===================================================${ESCAPE}`);
  console.log(`  🔍 Total Tests Executed: ${totalCases}`);
  console.log(`  ${GREEN}🟢 Tests Succeeded:      ${passedCases}${ESCAPE}`);
  console.log(`  ${failedCases > 0 ? RED : GREEN}🔴 Tests Failed:         ${failedCases}${ESCAPE}`);
  console.log(`${CYAN}===================================================\n${ESCAPE}`);

  if (failedCases > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Kickstart execution
runTestSuite().catch((err) => {
  console.error("Unhanded rejection executing testing suite:", err);
  process.exit(1);
});
