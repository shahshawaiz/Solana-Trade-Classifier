"""
Signal generation using EMA crossover as primary trigger + RSI / BB as filter.

Signals:
  Long Buy   – EMA20 crosses above EMA50, RSI not overbought
  Long Sell  – EMA20 crosses below EMA50 OR price hits BB upper while in long
  Short Sell – EMA20 crosses below EMA50, RSI not oversold
  Short Buy  – EMA20 crosses above EMA50 OR price hits BB lower while in short
  Hold       – no state change
"""
import pandas as pd

LONG_BUY  = "Long Buy"
LONG_SELL = "Long Sell"
SHORT_SELL = "Short Sell"
SHORT_BUY  = "Short Buy"
HOLD       = "Hold"

ALL_SIGNALS = [LONG_BUY, LONG_SELL, SHORT_SELL, SHORT_BUY, HOLD]

RSI_OVERSOLD    = 35
RSI_OVERBOUGHT  = 65


def generate_signals(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    n = len(df)
    signals = [HOLD] * n
    position = None  # None | "long" | "short"

    for i in range(2, n):
        rsi        = df["rsi"].iloc[i]
        ema20      = df["ema20"].iloc[i]
        ema50      = df["ema50"].iloc[i]
        prev_ema20 = df["ema20"].iloc[i - 1]
        prev_ema50 = df["ema50"].iloc[i - 1]
        close      = df["close"].iloc[i]
        bb_upper   = df["bb_upper"].iloc[i]
        bb_lower   = df["bb_lower"].iloc[i]
        macd_hist  = df["macd_hist"].iloc[i]
        prev_hist  = df["macd_hist"].iloc[i - 1]

        ema_golden_cross = prev_ema20 <= prev_ema50 and ema20 > ema50
        ema_death_cross  = prev_ema20 >= prev_ema50 and ema20 < ema50
        macd_bullish     = prev_hist < 0 and macd_hist >= 0
        macd_bearish     = prev_hist > 0 and macd_hist <= 0

        if position is None:
            if ema_golden_cross and rsi < RSI_OVERBOUGHT:
                signals[i] = LONG_BUY
                position = "long"
            elif ema_death_cross and rsi > RSI_OVERSOLD:
                signals[i] = SHORT_SELL
                position = "short"
            # MACD-only entry when no EMA cross but strong divergence
            elif macd_bullish and rsi < 45 and ema20 > ema50:
                signals[i] = LONG_BUY
                position = "long"
            elif macd_bearish and rsi > 55 and ema20 < ema50:
                signals[i] = SHORT_SELL
                position = "short"

        elif position == "long":
            exit_cond = (
                ema_death_cross
                or macd_bearish
                or rsi > RSI_OVERBOUGHT
                or close > bb_upper
            )
            if exit_cond:
                signals[i] = LONG_SELL
                position = None

        elif position == "short":
            exit_cond = (
                ema_golden_cross
                or macd_bullish
                or rsi < RSI_OVERSOLD
                or close < bb_lower
            )
            if exit_cond:
                signals[i] = SHORT_BUY
                position = None

    df["signal"] = signals
    return df
