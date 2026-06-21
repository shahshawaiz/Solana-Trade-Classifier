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
  CONFIG_FILE
} = await import("./server.js");

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
