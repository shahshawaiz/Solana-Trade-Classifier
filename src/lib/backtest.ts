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
  weights: { sentiment: number; technical: number; liquidity: number },
  threshold: number,
  cooldownMinutes: number = 30,
  tradeSize: number = 1.0,
  maxPositionSize: number = 1.0
): BacktestResult {
  let marketCum = 1;
  let strategyCum = 1;
  let currentPosition = 0;
  let lastTradeTime = 0;
  let trades: Trade[] = [];
  let currentTrade: Partial<Trade> | null = null;
  let runningPnL = 0;

  const processedData = data.map((d, i) => {
    // 1. Technical Signal (EMA Cross + RSI)
    const emaFast = d.emaFast || d.close;
    const emaSlow = d.emaSlow || d.close;
    const techSig = emaFast > emaSlow ? 1 : -1;
    
    let rsiSig = 0;
    if (d.rsi) {
      if (d.rsi < 30) rsiSig = 1;      
      else if (d.rsi > 70) rsiSig = -1;
    }

    // 2. Multimodal Score
    const weightedSent = (d.sentiment || 0) * weights.sentiment;
    const weightedTech = techSig * weights.technical;
    const weightedRsi = rsiSig * weights.liquidity;
    
    const score = weightedSent + weightedTech + weightedRsi;

    // 3. Signal Generation
    let signal = 0;
    const currentTimestamp = d.date ? new Date(d.date).getTime() : 0;
    const isCooldown = currentTimestamp > 0 && lastTradeTime > 0 && (currentTimestamp - lastTradeTime < cooldownMinutes * 60 * 1000);

    if (!isCooldown) {
      if (score > threshold) signal = 1; // LONG BUY
      else if (score < -threshold) signal = -1; // SHORT SELL
      
      // 4. Overrides/Exits
      if (d.rsi && d.rsi > 75) signal = -2; // LONG SELL (Exit long)
      if (d.rsi && d.rsi < 25) signal = 2;  // SHORT BUY (Exit short)
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
    const closeTrade = (isForcedExit: boolean = false) => {
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
          cumPnL: runningPnL
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
        closeTrade();
        currentPosition = tradeSize;
        currentTrade = {
          type: 'Long',
          entryTime: d.time,
          entryPrice: d.close,
          pnl: 0,
          cumPnL: 0
        };
        lastTradeTime = currentTimestamp;
        effectiveSignal = 1;

        // Sentiment check
        if (weightedSent > 0) isSentimentCatalyst = true;
      } else if (currentPosition >= maxPositionSize) {
        skippedSignal = true;
      }
    } else if (signal === -1) { // SHORT SELL
      if (currentPosition >= 0) {
        closeTrade();
        currentPosition = -tradeSize;
        currentTrade = {
          type: 'Short',
          entryTime: d.time,
          entryPrice: d.close,
          pnl: 0,
          cumPnL: 0
        };
        lastTradeTime = currentTimestamp;
        effectiveSignal = -1;
        
        // Sentiment check
        if (weightedSent < 0) isSentimentCatalyst = true;
      } else if (currentPosition <= -maxPositionSize) {
        skippedSignal = true;
      }
    } else if (signal === -2 || (currentPosition > 0 && d.rsi && d.rsi > 75)) { // Exit Long
      if (currentPosition > 0) {
        if (closeTrade()) {
          effectiveSignal = -2;
          if (weightedSent < 0) isSentimentCatalyst = true;
        }
      }
    } else if (signal === 2 || (currentPosition < 0 && d.rsi && d.rsi < 25)) { // Exit Short
      if (currentPosition < 0) {
        if (closeTrade()) {
          effectiveSignal = 2;
          if (weightedSent > 0) isSentimentCatalyst = true;
        }
      }
    }

    // Forced exit at very end of loop if it's the last element
    if (i === data.length - 1 && currentPosition !== 0) {
      closeTrade(true);
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
