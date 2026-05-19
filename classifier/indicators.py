import pandas as pd
import numpy as np


def _ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period - 1, adjust=False).mean()
    avg_loss = loss.ewm(com=period - 1, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    macd_line = _ema(series, fast) - _ema(series, slow)
    signal_line = _ema(macd_line, signal)
    return macd_line, signal_line, macd_line - signal_line


def bollinger(series: pd.Series, period: int = 20, width: float = 2.0):
    mid = series.rolling(period).mean()
    std = series.rolling(period).std()
    return mid + width * std, mid, mid - width * std


def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["ema20"] = _ema(df["close"], 20)
    df["ema50"] = _ema(df["close"], 50)
    df["rsi"] = rsi(df["close"])
    df["macd"], df["macd_signal"], df["macd_hist"] = macd(df["close"])
    df["bb_upper"], df["bb_mid"], df["bb_lower"] = bollinger(df["close"])
    return df
