import time
from datetime import datetime, timezone

import streamlit as st

from classifier.indicators import add_indicators
from classifier.signals import (
    generate_signals,
    LONG_BUY, LONG_SELL, SHORT_SELL, SHORT_BUY, HOLD,
)
from data.fetcher import fetch_ohlcv, fetch_ticker
from data.news import fetch_news
from visualization.charts import build_chart

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Solana Trade Classifier",
    page_icon="◎",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Custom CSS ────────────────────────────────────────────────────────────────
st.markdown("""
<style>
/* metric cards */
[data-testid="metric-container"] {
    background: #1a1f2e;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    padding: 14px 18px !important;
}
/* signal badge */
.sig-badge {
    display: inline-block;
    padding: 4px 14px;
    border-radius: 20px;
    font-family: monospace;
    font-size: 1.1rem;
    font-weight: bold;
    letter-spacing: 0.04em;
}
/* news card */
.news-card {
    background: #1a1f2e;
    border-left: 3px solid #00ff88;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 10px;
}
.news-card.alert {
    border-left-color: #ff9500;
}
.news-title {
    font-weight: bold;
    font-size: 0.88rem;
    margin-bottom: 4px;
}
.news-meta {
    font-size: 0.75rem;
    color: #888;
}
.news-summary {
    font-size: 0.80rem;
    color: #bbb;
    margin-top: 4px;
}
/* hide streamlit branding */
#MainMenu, footer { visibility: hidden; }
</style>
""", unsafe_allow_html=True)

# ── Signal style map ──────────────────────────────────────────────────────────
SIG_STYLE = {
    LONG_BUY:   {"color": "#00ff88", "bg": "rgba(0,255,136,0.15)",  "icon": "▲"},
    LONG_SELL:  {"color": "#ff9500", "bg": "rgba(255,149,0,0.15)",  "icon": "▽"},
    SHORT_SELL: {"color": "#ff3366", "bg": "rgba(255,51,102,0.15)", "icon": "▼"},
    SHORT_BUY:  {"color": "#00ccff", "bg": "rgba(0,204,255,0.15)",  "icon": "△"},
    HOLD:       {"color": "#888888", "bg": "rgba(128,128,128,0.1)", "icon": "—"},
}

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("## ◎ SOL Classifier")
    st.divider()

    interval = st.selectbox(
        "Candle Interval",
        ["1m", "3m", "5m", "15m", "30m", "1h", "4h"],
        index=2,
    )
    limit = st.slider("History (candles)", 50, 500, 200, 25)
    refresh_sec = st.slider("Auto-refresh (s)", 5, 120, 30, 5)

    st.divider()
    show_bb = st.checkbox("Bollinger Bands", value=True)
    show_ema = st.checkbox("EMA 20 / 50", value=True)

    st.divider()
    manual_refresh = st.button("🔄  Refresh now", use_container_width=True)

    st.divider()
    st.caption(
        "Data: Binance REST API (no key required).\n\n"
        "**DEMO** mode activates automatically when the API is unreachable "
        "(e.g. sandboxed environments). Run locally for live data."
    )

# ── Data fetch ────────────────────────────────────────────────────────────────
@st.cache_data(ttl=refresh_sec)
def load_data(interval: str, limit: int):
    df = fetch_ohlcv(interval=interval, limit=limit)
    ticker = fetch_ticker()
    df = add_indicators(df)
    df = generate_signals(df)
    return df, ticker


@st.cache_data(ttl=120)
def load_news():
    return fetch_news(max_items=6)


with st.spinner("Fetching real-time data from Binance…"):
    try:
        df, ticker = load_data(interval, limit)
        news = load_news()
        ok = True
    except Exception as exc:
        st.error(f"❌  Data error: {exc}")
        ok = False

if not ok:
    st.stop()

# ── Derived values ────────────────────────────────────────────────────────────
non_hold = df[df["signal"] != HOLD]
last_signal = non_hold["signal"].iloc[-1] if not non_hold.empty else HOLD
last_signal_time = non_hold.index[-1] if not non_hold.empty else None
last_signal_price = non_hold["close"].iloc[-1] if not non_hold.empty else None
signal_count = len(non_hold)
is_active_signal = last_signal != HOLD

# ── Header ────────────────────────────────────────────────────────────────────
data_badge = (
    "<span style='background:#1a3a1a;color:#00ff88;border:1px solid #00ff88;"
    "border-radius:4px;padding:2px 8px;font-size:0.75rem;'>● LIVE</span>"
    if ticker.get("live")
    else
    "<span style='background:#3a2a1a;color:#ff9500;border:1px solid #ff9500;"
    "border-radius:4px;padding:2px 8px;font-size:0.75rem;'>◉ DEMO</span>"
)
st.markdown(
    f"## ◎ Solana Trade Classifier &nbsp;&nbsp; "
    f"<span style='font-size:0.8rem;color:#888'>Binance · {interval}</span> &nbsp;"
    f"{data_badge}",
    unsafe_allow_html=True,
)

# ── Metric row ────────────────────────────────────────────────────────────────
c1, c2, c3, c4, c5 = st.columns(5)
chg_color = "normal" if ticker["change_pct"] >= 0 else "inverse"

with c1:
    st.metric("SOL / USDT", f"${ticker['price']:,.4f}",
              f"{ticker['change_pct']:+.2f}%  24h")
with c2:
    st.metric("24h High", f"${ticker['high_24h']:,.4f}")
with c3:
    st.metric("24h Low", f"${ticker['low_24h']:,.4f}")
with c4:
    st.metric("Signals detected", signal_count)
with c5:
    ts_label = last_signal_time.strftime("%H:%M") if last_signal_time else "—"
    st.metric("Last signal", last_signal, ts_label)

# ── Active signal banner ──────────────────────────────────────────────────────
if is_active_signal:
    style = SIG_STYLE[last_signal]
    price_str = f"@ ${last_signal_price:,.4f}" if last_signal_price else ""
    time_str = last_signal_time.strftime("%Y-%m-%d %H:%M UTC") if last_signal_time else ""
    st.markdown(
        f"""<div style="background:{style['bg']};border:1px solid {style['color']};
        border-radius:10px;padding:12px 20px;margin:8px 0;display:flex;
        align-items:center;gap:16px;">
        <span class="sig-badge" style="color:{style['color']};
        border:1px solid {style['color']};">
        {style['icon']}  {last_signal}</span>
        <span style="color:#ddd;font-family:monospace;">{price_str}</span>
        <span style="color:#888;font-size:0.85rem;">{time_str}</span>
        </div>""",
        unsafe_allow_html=True,
    )

# ── Main chart ────────────────────────────────────────────────────────────────
fig = build_chart(df, ticker, show_bb=show_bb, show_ema=show_ema)
st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": True})

# ── Bottom panel: signal history | news ───────────────────────────────────────
col_hist, col_news = st.columns([1, 1], gap="large")

with col_hist:
    st.markdown("### Signal History")
    if non_hold.empty:
        st.info("No signals generated for this period — try a longer history or different interval.")
    else:
        display = non_hold[["close", "rsi", "macd", "signal"]].copy()
        display.index = display.index.strftime("%Y-%m-%d %H:%M")
        display.columns = ["Price", "RSI", "MACD", "Signal"]
        display["Price"] = display["Price"].map("${:,.4f}".format)
        display["RSI"] = display["RSI"].map("{:.1f}".format)
        display["MACD"] = display["MACD"].map("{:.4f}".format)

        def _color_sig(val):
            s = SIG_STYLE.get(val, SIG_STYLE[HOLD])
            return f"color: {s['color']}; font-weight: bold"

        st.dataframe(
            display.tail(20).style.applymap(_color_sig, subset=["Signal"]),
            use_container_width=True,
            height=380,
        )

with col_news:
    news_header = "### 📰 News"
    if is_active_signal:
        news_header += f" &nbsp;<span style='color:{SIG_STYLE[last_signal]['color']};font-size:0.85rem;'>▶ signal alert</span>"
    st.markdown(news_header, unsafe_allow_html=True)

    if not news:
        st.info("No Solana news fetched — check network or RSS availability.")
    else:
        alert_class = "alert" if is_active_signal else ""
        for item in news:
            st.markdown(
                f"""<div class="news-card {alert_class}">
                <div class="news-title">
                  <a href="{item['url']}" target="_blank"
                     style="color:#e0e0e0;text-decoration:none;">
                    {item['title']}
                  </a>
                </div>
                <div class="news-summary">{item['summary']}</div>
                <div class="news-meta">{item['source']}  ·  {item['published']}</div>
                </div>""",
                unsafe_allow_html=True,
            )

# ── Footer / refresh timer ────────────────────────────────────────────────────
st.divider()
now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
st.caption(f"Last updated: {now_utc}  ·  Auto-refreshes every {refresh_sec}s")

if manual_refresh:
    st.cache_data.clear()
    st.rerun()

time.sleep(refresh_sec)
st.rerun()
