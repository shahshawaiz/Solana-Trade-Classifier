/**
 * Backtest engine logic for Solana trading strategy.
 */

export interface MarketData {
  time: string;
  date?: string;
  close: number;
  rsi?: number;
  sentiment?: number;
  liquidity?: number;
  emaFast?: number;
  emaSlow?: number;
  newsHeadline?: string;
}

export interface Trade {
  type: 'Long' | 'Short';
  entryTime: string;
  entryPrice: number;
  exitTime?: string;
  exitPrice?: number;
  pnl: number;
  cumPnL: number;
  tpPct?: number;
  slPct?: number;
  closeReason?: string;
  sentimentScore?: number;
  technicalScore?: number;
  rsiScore?: number;
  compositeScore?: number;
  elliotWavePhase?: string;
}

export interface BacktestResult {
  data: (MarketData & {
    score: number;
    wSentiment: number;
    wTechnical: number;
    wLiquidity: number;
    signal: number;
    position: number;
    skippedSignal?: boolean;
    isSentimentCatalyst?: boolean;
    marketReturn: number;
    strategyReturn: number;
    marketCum: number;
    strategyCum: number;
  })[];
  metrics: {
    marketReturn: number;
    strategyReturn: number;
    alpha: number;
  };
  trades: Trade[];
}

export function runBacktest(
  data: MarketData[],
  weights: { sentiment: number; technical: number; liquidity: number; elliottWave?: number },
  threshold: number,
  cooldownMinutes: number = 30,
  tradeSize: number = 1.0,
  maxPositionSize: number = 1.0,
  takeProfitPct: number = 4.0,
  stopLossPct: number = 2.0
): BacktestResult {
  let marketCum = 1;
  let strategyCum = 1;
  let currentPosition = 0;
  let lastTradeTime = 0;
  let trades: Trade[] = [];
  let currentTrade: Partial<Trade> | null = null;
  let runningPnL = 0;
  let lastExecutedTrend = "HOLD";
  const ema200Arr = calculateEMA(data.map(x => x.close), Math.min(200, data.length));

  const processedData = data.map((d, i) => {
    // 1. Technical Signal (EMA Cross + RSI) scoped per evaluation index
    const evaluateStrategyAtIndex = (index: number) => {
      const dNow = data[index];
      const emaFast = dNow.emaFast || dNow.close;
      const emaSlow = dNow.emaSlow || dNow.close;
      const techSig = emaFast > emaSlow ? 1 : -1;
      
      let rsiSig = 0;
      if (dNow.rsi) {
        if (dNow.rsi < 30) rsiSig = 1;      
        else if (dNow.rsi > 70) rsiSig = -1;
      }

      const weightedSentNow = (dNow.sentiment || 0) * weights.sentiment;
      const weightedTechNow = techSig * weights.technical;
      const weightedRsiNow = rsiSig * weights.liquidity;
      
      return weightedSentNow + weightedTechNow + weightedRsiNow;
    };

    // Calculate current tick variables to use for logging and condition checking
    const emaFast = d.emaFast || d.close;
    const emaSlow = d.emaSlow || d.close;
    const techSig = emaFast > emaSlow ? 1 : -1;
    let rsiSig = 0;
    if (d.rsi) {
      if (d.rsi < 30) rsiSig = 1;      
      else if (d.rsi > 70) rsiSig = -1;
    }
    const weightedSent = (d.sentiment || 0) * weights.sentiment;
    const weightedTech = techSig * weights.technical;
    const weightedRsi = rsiSig * weights.liquidity;
    const score = weightedSent + weightedTech + weightedRsi;

    // 5-Point Elliot Wave FIRST GATE
    const evaluateEwSig = (index: number) => {
      const isEwEnabled = weights.elliottWave !== 0 && weights.elliottWave !== undefined;
      const isTechEnabled = weights.technical !== 0 && weights.technical !== undefined;
      const isLiqEnabled = weights.liquidity !== 0 && weights.liquidity !== undefined;

      // Return HOLD if not enough data AND Elliott Wave is enabled
      if (isEwEnabled && index < 33) return "HOLD";
      const currentCloses = data.slice(0, index + 1).map(x => x.close);
      let ewDir = "HOLD";
      if (isEwEnabled) {
        const ewData = calculateElliotWave(currentCloses);
        if (ewData.phase.includes("Wave 1") || ewData.phase.includes("Wave 3") || ewData.phase.includes("Wave 4")) {
           ewDir = "LONG";
        } else if (ewData.phase.includes("Wave A") || ewData.phase.includes("Wave C") || ewData.phase.includes("Wave 5")) {
           ewDir = "SHORT";
        }
      } else {
        // If EW is disabled, bypass it and do not restrict the signal direction
        ewDir = "BOTH";
      }
      
      let pSide = "HOLD";
      // ONLY evaluate rest of strategy if Elliot Wave gate passes
      if (ewDir !== "HOLD") {
        const sc = evaluateStrategyAtIndex(index);
        const currentClose = data[index].close;
        const currentEma200 = ema200Arr[index];
        
        const passesLongTrend = !isTechEnabled || currentClose > currentEma200;
        const passesShortTrend = !isTechEnabled || currentClose < currentEma200;
        const passesLongEw = ewDir === "BOTH" || ewDir === "LONG";
        const passesShortEw = ewDir === "BOTH" || ewDir === "SHORT";

        if (sc > threshold && passesLongEw && passesLongTrend) pSide = "LONG";
        else if (sc < -threshold && passesShortEw && passesShortTrend) pSide = "SHORT";
        
        if (isLiqEnabled) {
          const rVal = data[index].rsi || 50;
          if (rVal > 70 && passesShortEw && passesShortTrend) pSide = "SHORT";
          if (rVal < 30 && passesLongEw && passesLongTrend) pSide = "LONG";
        }
      }
      return pSide;
    };

    let pSide = evaluateEwSig(i);

    // 3. Signal Generation
    let signal = 0;
    const currentTimestamp = d.date ? new Date(d.date).getTime() : 0;
    const isCooldown = currentTimestamp > 0 && lastTradeTime > 0 && (currentTimestamp - lastTradeTime < cooldownMinutes * 60 * 1000);

    // 2x 15m tick validation check for trend reversals
    let isTrendConfirmed3x = false;
    let prevSig1 = "HOLD";
    let prevSig2 = "HOLD";
    if (i >= 1) {
      prevSig1 = evaluateEwSig(i - 1);
      if (i >= 2) {
        prevSig2 = evaluateEwSig(i - 2);
      }
      isTrendConfirmed3x = (pSide !== "HOLD" && pSide === prevSig1);
    }
    
    if (currentTrade === null && !isCooldown) {
      if (pSide === "HOLD") {
        lastExecutedTrend = "HOLD"; // Reset on HOLD
      } else if (pSide !== lastExecutedTrend && i >= 1) {
        const is1stConfirmation = pSide !== prevSig1;
        const is2ndConfirmation = pSide === prevSig1 && pSide !== prevSig2;
        
        const currentEw = calculateElliotWave(data.slice(0, i + 1).map(x => x.close));
        
        if (is1stConfirmation) {
          trades.push({
            type: pSide === "LONG" ? "CONFIRM_LONG" : "CONFIRM_SHORT" as any,
            entryTime: d.time || d.date || "",
            entryPrice: d.close,
            pnl: 0,
            cumPnL: runningPnL,
            closeReason: `1st Signal Confirmation (${pSide})`,
            sentimentScore: d.sentiment || 0,
            technicalScore: techSig,
            rsiScore: rsiSig,
            compositeScore: score,
            elliotWavePhase: currentEw.phase
          });
        } else if (is2ndConfirmation) {
          trades.push({
            type: pSide === "LONG" ? "CONFIRM_LONG" : "CONFIRM_SHORT" as any,
            entryTime: d.time || d.date || "",
            entryPrice: d.close,
            pnl: 0,
            cumPnL: runningPnL,
            closeReason: `2nd Signal Confirmation (${pSide})`,
            sentimentScore: d.sentiment || 0,
            technicalScore: techSig,
            rsiScore: rsiSig,
            compositeScore: score,
            elliotWavePhase: currentEw.phase
          });
        }
      }
    }
    
    // Check TP / SL before processing entry signals
    let tpSlHit = false;
    let timeLimitExit = false;
    let timeLimitReason = "";
    if (currentTrade && currentTrade.entryPrice) {
      const entryPrice = currentTrade.entryPrice;
      const currentPnL = currentTrade.type === 'Long'
        ? (d.close - entryPrice) / entryPrice
        : (entryPrice - d.close) / entryPrice;

      if (currentPnL * 100 >= takeProfitPct) {
        signal = currentTrade.type === 'Long' ? -2 : 2; // Exit signal
        tpSlHit = true;
      } else if (currentPnL * 100 <= -stopLossPct) {
        signal = currentTrade.type === 'Long' ? -2 : 2;
        tpSlHit = true;
      }

      // Check Rule 1: Exit after 90–120 minutes if unrealized PnL < +0.5%
      const rawCurrentTime = d.date || d.time;
      const rawEntryTime = currentTrade.entryTime;
      if (rawCurrentTime && rawEntryTime) {
        const curTimestamp = new Date(rawCurrentTime).getTime();
        const entTimestamp = new Date(rawEntryTime).getTime();
        const elapsedMinutes = (curTimestamp - entTimestamp) / (60 * 1000);
        const unrealizedPnL = currentPnL * 100;
        if (elapsedMinutes >= 90 && unrealizedPnL < 0.5) {
          signal = currentTrade.type === 'Long' ? -2 : 2;
          timeLimitExit = true;
          timeLimitReason = `PnL Threshold Time Limit Exceeded (Duration: ${Math.round(elapsedMinutes)} mins, PnL: ${unrealizedPnL.toFixed(2)}% < +0.5%)`;
        }
      }
    }

    if (!isCooldown && !tpSlHit) {
      // Reversal trend changes close positions early without 3x validation
      if (currentPosition > 0 && pSide === "SHORT") {
        signal = -2; // Force close long
      } else if (currentPosition < 0 && pSide === "LONG") {
        signal = 2; // Force close short
      }

      if (pSide === "LONG" && isTrendConfirmed3x && signal === 0 && lastExecutedTrend !== "LONG") {
        signal = 1; // LONG BUY
      } else if (pSide === "SHORT" && isTrendConfirmed3x && signal === 0 && lastExecutedTrend !== "SHORT") {
        signal = -1; // SHORT SELL
      }
      
      // 4. Overrides/Exits
      // For overrides, E.g. RSI exhaustion
      const isEwEnabled = weights.elliottWave !== 0 && weights.elliottWave !== undefined;
      const isLiqEnabled = weights.liquidity !== 0 && weights.liquidity !== undefined;

      if (isLiqEnabled && isEwEnabled && d.rsi && d.rsi > 75 && signal === 0) {
        if (currentPosition > 0 && calculateElliotWave(data.slice(0, i+1).map(x=>x.close)).phase.includes("Wave 5")) signal = -2;
      }
      if (isLiqEnabled && isEwEnabled && d.rsi && d.rsi < 25 && signal === 0) {
        if (currentPosition < 0 && calculateElliotWave(data.slice(0, i+1).map(x=>x.close)).phase.includes("Wave C")) signal = 2;
      }
    }
    
    // 5. Returns Calculation
    const prevClose = i > 0 ? data[i - 1].close : d.close;
    const marketReturn = (d.close - prevClose) / prevClose;
    const strategyReturn = currentPosition * marketReturn;
    
    marketCum *= (1 + marketReturn);
    strategyCum *= (1 + strategyReturn);
    if (currentPosition !== 0) {
      runningPnL += strategyReturn;
    }

    // 6. Update Position & Record Trades
    const closeTrade = (reason: string, isForcedExit: boolean = false) => {
      if (currentTrade) {
        const exitPrice = d.close;
        const entryPrice = currentTrade.entryPrice!;
        const pnl = currentTrade.type === 'Long' 
          ? (exitPrice - entryPrice) / entryPrice 
          : (entryPrice - exitPrice) / entryPrice;
        
        runningPnL += pnl; // Add full trade PnL once finalized

        const finishedTrade: Trade = {
          ...currentTrade as Trade,
          exitTime: d.time,
          exitPrice: exitPrice,
          pnl: pnl,
          cumPnL: runningPnL,
          closeReason: reason
        };
        trades.push(finishedTrade);
        currentTrade = null;
        currentPosition = 0;
        return true;
      }
      return false;
    };

    let effectiveSignal = 0; // Only record signal that caused a change
    let skippedSignal = false;
    let isSentimentCatalyst = false;

    if (signal === 1) { // LONG BUY
      if (currentPosition <= 0) {
        if (currentPosition < 0) closeTrade("Trend Reversal");
        currentPosition = tradeSize;
        const currentEw = calculateElliotWave(data.slice(0, i + 1).map(x => x.close));
        currentTrade = {
          type: 'Long',
          entryTime: d.time,
          entryPrice: d.close,
          pnl: 0,
          cumPnL: 0,
          tpPct: takeProfitPct,
          slPct: stopLossPct,
          sentimentScore: d.sentiment || 0,
          technicalScore: techSig,
          rsiScore: rsiSig,
          compositeScore: score,
          elliotWavePhase: currentEw.phase
        };
        lastExecutedTrend = "LONG";
        lastTradeTime = currentTimestamp;
        effectiveSignal = 1;

        // Sentiment check
        if (weightedSent > 0) isSentimentCatalyst = true;
      } else if (currentPosition >= maxPositionSize) {
        skippedSignal = true;
      }
    } else if (signal === -1) { // SHORT SELL
      if (currentPosition >= 0) {
        if (currentPosition > 0) closeTrade("Trend Reversal");
        currentPosition = -tradeSize;
        const currentEw = calculateElliotWave(data.slice(0, i + 1).map(x => x.close));
        currentTrade = {
          type: 'Short',
          entryTime: d.time,
          entryPrice: d.close,
          pnl: 0,
          cumPnL: 0,
          tpPct: takeProfitPct,
          slPct: stopLossPct,
          sentimentScore: d.sentiment || 0,
          technicalScore: techSig,
          rsiScore: rsiSig,
          compositeScore: score,
          elliotWavePhase: currentEw.phase
        };
        lastExecutedTrend = "SHORT";
        lastTradeTime = currentTimestamp;
        effectiveSignal = -1;
        
        // Sentiment check
        if (weightedSent < 0) isSentimentCatalyst = true;
      } else if (currentPosition <= -maxPositionSize) {
        skippedSignal = true;
      }
    } else if (signal === -2 || (currentPosition > 0 && d.rsi && d.rsi > 75)) { // Exit Long
      if (currentPosition > 0) {
        let reason = tpSlHit ? (d.close >= currentTrade!.entryPrice! * (1 + takeProfitPct / 100) ? "Take Profit Hit" : "Stop Loss Hit") : "Signal Expiration/RSI Exhaustion";
        if (timeLimitExit) reason = timeLimitReason;
        else if (signal === -2 && pSide === "SHORT") reason = "Trend Reversal";
        if (closeTrade(reason)) {
          effectiveSignal = -2;
          if (weightedSent < 0) isSentimentCatalyst = true;
        }
      }
    } else if (signal === 2 || (currentPosition < 0 && d.rsi && d.rsi < 25)) { // Exit Short
      if (currentPosition < 0) {
        let reason = tpSlHit ? (d.close <= currentTrade!.entryPrice! * (1 - takeProfitPct / 100) ? "Take Profit Hit" : "Stop Loss Hit") : "Signal Expiration/RSI Exhaustion";
        if (timeLimitExit) reason = timeLimitReason;
        else if (signal === 2 && pSide === "LONG") reason = "Trend Reversal";
        if (closeTrade(reason)) {
          effectiveSignal = 2;
          if (weightedSent > 0) isSentimentCatalyst = true;
        }
      }
    }

    // Forced exit at very end of loop if it's the last element
    if (i === data.length - 1 && currentPosition !== 0) {
      closeTrade("End of Backtest", true);
    }

    return {
      ...d,
      score,
      wSentiment: weightedSent,
      wTechnical: weightedTech,
      wLiquidity: weightedRsi,
      signal: effectiveSignal, // Now only show signals on changes
      skippedSignal,
      isSentimentCatalyst,
      position: currentPosition,
      marketReturn,
      strategyReturn,
      marketCum,
      strategyCum,
    };
  });

  const metrics = {
    marketReturn: (marketCum - 1) * 100,
    strategyReturn: (strategyCum - 1) * 100,
    alpha: (strategyCum - marketCum) * 100,
  };

  return { data: processedData, metrics, trades };
}

/**
 * Simplified RSI implementation for node/browser
 */
export function calculateEMA(values: number[], period: number): number[] {
  const ema: number[] = [];
  const k = 2 / (period + 1);
  let currentEma = values[0];
  
  for (let i = 0; i < values.length; i++) {
    currentEma = values[i] * k + currentEma * (1 - k);
    ema.push(currentEma);
  }
  return ema;
}

export function calculateRSI(closes: number[], period: number = 14): number[] {
  const rsis: number[] = [];
  let gains: number[] = [];
  let losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(Math.max(0, diff));
    losses.push(Math.max(0, -diff));
  }

  if (closes.length <= period) {
    return new Array(closes.length).fill(50);
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = 0; i < period; i++) rsis.push(50); // Initial filler

  for (let i = period; i < closes.length; i++) {
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsis.push(100 - 100 / (1 + rs));

    avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
  }

  return rsis;
}

export function calculateElliotWave(closes: number[]): { score: number; phase: string; details: string; value: number } {
  if (closes.length < 34) {
    const current = closes[closes.length - 1] || 0;
    const first = closes[0] || 0;
    const score = current > first ? 0.3 : (current < first ? -0.3 : 0);
    return {
      score,
      phase: "Initial Setup Phase",
      details: "Not enough historical price candles are available yet to compute structural EWO.",
      value: current - first
    };
  }

  const ewos: number[] = [];
  for (let i = 33; i < closes.length; i++) {
    let sum5 = 0;
    for (let j = 0; j < 5; j++) {
      sum5 += closes[i - j];
    }
    const sma5 = sum5 / 5;

    let sum34 = 0;
    for (let j = 0; j < 34; j++) {
      sum34 += closes[i - j];
    }
    const sma34 = sum34 / 34;
    ewos.push(sma5 - sma34);
  }

  const currentEwo = ewos[ewos.length - 1];
  const prevEwo = ewos.length > 1 ? ewos[ewos.length - 2] : currentEwo;
  
  const recentEwos = ewos.slice(-34);
  const maxEwo = Math.max(...recentEwos);
  const minEwo = Math.min(...recentEwos);

  let score = 0;
  if (maxEwo > minEwo) {
    score = ((currentEwo - minEwo) / (maxEwo - minEwo)) * 2 - 1;
  }

  let phase = "Wave 1 - Initial Impulse";
  let details = "Early-stage breakout starting to form on SMA crossover.";

  const currentPrice = closes[closes.length - 1];
  const recentPrices = closes.slice(-34);
  const maxPrice = Math.max(...recentPrices);

  if (currentEwo > 0) {
    if (currentEwo >= maxEwo * 0.8 && currentPrice >= maxPrice * 0.95) {
      phase = "Wave 3 - Strong Bullish Impulse";
      details = "Strong bullish trend where momentum peaks. Highest volatility expected.";
    } else if (currentEwo < maxEwo * 0.6 && currentPrice >= maxPrice * 0.98) {
      phase = "Wave 5 - Exhaustion Trend Peak";
      details = "Price has exceeded previous high, but momentum Oscillator is making a lower high (bearish divergence).";
    } else if (currentEwo < prevEwo && currentEwo < maxEwo * 0.5) {
      phase = "Wave 4 - Profit-taking Pullback";
      details = "Consolidation pullback towards the zero line of the oscillator.";
    } else {
      phase = "Wave 1/3 Build Phases";
      details = "Early impulse structures showing steady buying momentum.";
    }
  } else {
    if (currentEwo <= minEwo * 0.8) {
      phase = "Wave C - Capitulation Correction";
      details = "Active corrective selloff. Heavy momentum on the downside.";
    } else if (currentEwo > minEwo * 0.5 && currentEwo > prevEwo) {
      phase = "Wave B - Bear Market Rally";
      details = "Temporary corrective relief rally. Bearish environment remains active.";
    } else {
      phase = "Wave A - Correction Trigger";
      details = "Onset of corrective phase following peak exhaustion.";
    }
  }

  return {
    score: Math.max(-1, Math.min(1, score)),
    phase,
    details,
    value: currentEwo
  };
}
