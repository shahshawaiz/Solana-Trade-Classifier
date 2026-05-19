/**
 * Backtest engine logic for Solana trading strategy.
 */

export interface MarketData {
  time: string;
  close: number;
  rsi?: number;
  sentiment?: number;
  liquidity?: number;
  emaFast?: number;
  emaSlow?: number;
}

export interface BacktestResult {
  data: (MarketData & {
    score: number;
    signal: number;
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
}

export function runBacktest(
  data: MarketData[],
  weights: { sentiment: number; technical: number; liquidity: number },
  threshold: number
): BacktestResult {
  let marketCum = 1;
  let strategyCum = 1;
  let lastSignal = 0;

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

    // 2. Multimodal Score (Latest Python logic: 50/30/20 split)
    const score = 
      (d.sentiment || 0) * weights.sentiment +
      techSig * weights.technical +
      rsiSig * weights.liquidity; // Re-purposing liquidity slot for RSI sig if needed

    // 3. Signal Generation (threshold based)
    let signal = 0;
    if (score > threshold) signal = 1; // LONG BUY
    else if (score < -threshold) signal = -1; // SHORT SELL
    
    // 4. Overrides/Exits (Python logic)
    if (d.rsi && d.rsi > 75) signal = -2; // LONG SELL (Exit long)
    if (d.rsi && d.rsi < 25) signal = 2;  // SHORT BUY (Exit short)

    // 5. Returns Calculation
    const prevClose = i > 0 ? data[i - 1].close : d.close;
    const marketReturn = (d.close - prevClose) / prevClose;
    
    // Strategy logic: Act on previous signal
    // For returns: 1 = Long, -1 = Short, 0/2/-2 = Flat
    const effectivePos = (lastSignal === 1) ? 1 : (lastSignal === -1) ? -1 : 0;
    const strategyReturn = effectivePos * marketReturn;

    marketCum *= (1 + marketReturn);
    strategyCum *= (1 + strategyReturn);

    // Update last signal for next period
    lastSignal = signal;

    return {
      ...d,
      score,
      signal,
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

  return { data: processedData, metrics };
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
