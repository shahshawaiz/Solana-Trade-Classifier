"""
Real-time data fetching from Binance.
Falls back to synthetic demo data if the API is unreachable (sandboxed envs).
"""
import numpy as np
import pandas as pd
import requests
from datetime import datetime, timedelta, timezone

BINANCE_BASE = "https://api.binance.com/api/v3"
SYMBOL = "SOLUSDT"

_INTERVAL_MINUTES = {
    "1m": 1, "3m": 3, "5m": 5, "15m": 15,
    "30m": 30, "1h": 60, "4h": 240,
}


# ── Binance helpers ────────────────────────────────────────────────────────────

def fetch_ohlcv(symbol: str = SYMBOL, interval: str = "5m", limit: int = 200) -> pd.DataFrame:
    try:
        resp = requests.get(
            f"{BINANCE_BASE}/klines",
            params={"symbol": symbol, "interval": interval, "limit": limit},
            timeout=10,
        )
        resp.raise_for_status()
        return _parse_klines(resp.json())
    except Exception:
        return _synthetic_ohlcv(interval, limit)


def fetch_ticker(symbol: str = SYMBOL) -> dict:
    try:
        resp = requests.get(
            f"{BINANCE_BASE}/ticker/24hr",
            params={"symbol": symbol},
            timeout=5,
        )
        resp.raise_for_status()
        d = resp.json()
        return {
            "price":      float(d["lastPrice"]),
            "change_pct": float(d["priceChangePercent"]),
            "high_24h":   float(d["highPrice"]),
            "low_24h":    float(d["lowPrice"]),
            "volume_24h": float(d["volume"]),
            "live": True,
        }
    except Exception:
        return _synthetic_ticker()


# ── Parsers ────────────────────────────────────────────────────────────────────

def _parse_klines(data: list) -> pd.DataFrame:
    cols = [
        "open_time", "open", "high", "low", "close", "volume",
        "close_time", "quote_volume", "trades",
        "taker_buy_base", "taker_buy_quote", "ignore",
    ]
    df = pd.DataFrame(data, columns=cols)
    df["open_time"] = pd.to_datetime(df["open_time"], unit="ms")
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = df[col].astype(float)
    return df.set_index("open_time")[["open", "high", "low", "close", "volume"]]


# ── Synthetic fallback ─────────────────────────────────────────────────────────

_BASE_PRICE = 175.0   # approximate SOL price for demo


def _synthetic_ohlcv(interval: str, limit: int) -> pd.DataFrame:
    """Generate realistic synthetic OHLCV data via geometric Brownian motion."""
    rng = np.random.default_rng(seed=int(datetime.now().timestamp()) // 60)
    minutes = _INTERVAL_MINUTES.get(interval, 5)

    end = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    end = end - timedelta(minutes=end.minute % minutes)
    times = [end - timedelta(minutes=minutes * i) for i in range(limit - 1, -1, -1)]

    prices = [_BASE_PRICE]
    volatility = 0.0012
    for _ in range(limit - 1):
        drift = rng.normal(0, volatility)
        prices.append(prices[-1] * (1 + drift))

    rows = []
    for i, (t, close) in enumerate(zip(times, prices)):
        open_ = prices[i - 1] if i > 0 else close * (1 + rng.normal(0, 0.0005))
        spread = close * abs(rng.normal(0, 0.004))
        high = max(open_, close) + spread
        low = min(open_, close) - spread
        volume = rng.uniform(20_000, 120_000)
        rows.append((t, open_, high, low, close, volume))

    df = pd.DataFrame(rows, columns=["open_time", "open", "high", "low", "close", "volume"])
    return df.set_index("open_time")


def _synthetic_ticker() -> dict:
    rng = np.random.default_rng(seed=int(datetime.now().timestamp()) // 300)
    price = _BASE_PRICE * (1 + rng.uniform(-0.03, 0.03))
    change = rng.uniform(-5.0, 5.0)
    return {
        "price":      round(price, 4),
        "change_pct": round(change, 2),
        "high_24h":   round(price * 1.04, 4),
        "low_24h":    round(price * 0.96, 4),
        "volume_24h": round(rng.uniform(5_000_000, 15_000_000), 0),
        "live": False,
    }
