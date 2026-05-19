import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from classifier.signals import LONG_BUY, LONG_SELL, SHORT_SELL, SHORT_BUY, HOLD

# Signal visual config: color, plotly symbol, label, placement
SIGNAL_STYLE = {
    LONG_BUY:   {"color": "#00ff88", "symbol": "triangle-up",   "label": "L-BUY",  "side": "below"},
    LONG_SELL:  {"color": "#ff9500", "symbol": "triangle-down",  "label": "L-SELL", "side": "above"},
    SHORT_SELL: {"color": "#ff3366", "symbol": "triangle-down",  "label": "S-SELL", "side": "above"},
    SHORT_BUY:  {"color": "#00ccff", "symbol": "triangle-up",    "label": "S-BUY",  "side": "below"},
}

BG = "#0e1117"
GRID = "rgba(255,255,255,0.06)"
GREEN = "#00ff88"
RED = "#ff3366"


def _candle_colors(df: pd.DataFrame):
    return [GREEN if c >= o else RED for c, o in zip(df["close"], df["open"])]


def build_chart(
    df: pd.DataFrame,
    ticker: dict | None = None,
    show_bb: bool = True,
    show_ema: bool = True,
) -> go.Figure:
    fig = make_subplots(
        rows=4, cols=1,
        shared_xaxes=True,
        vertical_spacing=0.025,
        row_heights=[0.55, 0.15, 0.15, 0.15],
        subplot_titles=("SOL / USDT  —  Real-time", "Volume", "RSI (14)", "MACD (12 · 26 · 9)"),
    )

    # ── Bollinger Bands (fill first so it stays behind candles) ─────────────
    if show_bb:
        fig.add_trace(go.Scatter(
            x=df.index, y=df["bb_upper"],
            line=dict(color="rgba(100,149,237,0.4)", width=1),
            showlegend=False, hoverinfo="skip",
        ), row=1, col=1)
        fig.add_trace(go.Scatter(
            x=df.index, y=df["bb_lower"],
            line=dict(color="rgba(100,149,237,0.4)", width=1),
            fill="tonexty", fillcolor="rgba(100,149,237,0.06)",
            showlegend=False, hoverinfo="skip",
        ), row=1, col=1)
        fig.add_trace(go.Scatter(
            x=df.index, y=df["bb_mid"],
            line=dict(color="rgba(100,149,237,0.25)", width=1, dash="dot"),
            name="BB", showlegend=True, hoverinfo="skip",
        ), row=1, col=1)

    # ── EMA lines ────────────────────────────────────────────────────────────
    if show_ema:
        fig.add_trace(go.Scatter(
            x=df.index, y=df["ema20"],
            line=dict(color="#00ccff", width=1.5, dash="dash"),
            name="EMA 20",
        ), row=1, col=1)
        fig.add_trace(go.Scatter(
            x=df.index, y=df["ema50"],
            line=dict(color="#ff9500", width=1.5, dash="dash"),
            name="EMA 50",
        ), row=1, col=1)

    # ── Candlestick ───────────────────────────────────────────────────────────
    fig.add_trace(go.Candlestick(
        x=df.index,
        open=df["open"], high=df["high"],
        low=df["low"],   close=df["close"],
        increasing=dict(line=dict(color=GREEN, width=1), fillcolor="rgba(0,255,136,0.35)"),
        decreasing=dict(line=dict(color=RED,   width=1), fillcolor="rgba(255,51,102,0.35)"),
        name="SOL/USDT",
        whiskerwidth=0.4,
    ), row=1, col=1)

    # ── Signal markers ────────────────────────────────────────────────────────
    for sig, style in SIGNAL_STYLE.items():
        mask = df["signal"] == sig
        if not mask.any():
            continue
        y_base = df.loc[mask, "low"] if style["side"] == "below" else df.loc[mask, "high"]
        offset = 0.997 if style["side"] == "below" else 1.003
        fig.add_trace(go.Scatter(
            x=df.index[mask],
            y=y_base * offset,
            mode="markers+text",
            name=style["label"],
            marker=dict(
                symbol=style["symbol"],
                size=16,
                color=style["color"],
                line=dict(color="white", width=0.8),
            ),
            text=[style["label"]] * mask.sum(),
            textposition="bottom center" if style["side"] == "below" else "top center",
            textfont=dict(size=9, color=style["color"]),
            hovertemplate=(
                f"<b>{sig}</b><br>"
                "Time: %{x}<br>"
                "Price: $%{customdata:,.4f}<extra></extra>"
            ),
            customdata=df.loc[mask, "close"].values,
        ), row=1, col=1)

    # ── Current price dashed line ─────────────────────────────────────────────
    if ticker:
        price = ticker["price"]
        fig.add_hline(
            y=price,
            line=dict(color="rgba(255,255,255,0.35)", width=1, dash="dot"),
            annotation_text=f" ${price:,.4f}",
            annotation_position="right",
            annotation_font=dict(color="white", size=11),
            row=1, col=1,
        )

    # ── Volume ────────────────────────────────────────────────────────────────
    fig.add_trace(go.Bar(
        x=df.index, y=df["volume"],
        marker_color=_candle_colors(df),
        opacity=0.65, showlegend=False,
        hovertemplate="Vol: %{y:,.0f}<extra></extra>",
    ), row=2, col=1)

    # ── RSI ───────────────────────────────────────────────────────────────────
    fig.add_hrect(y0=70, y1=100, fillcolor="rgba(255,51,102,0.06)",  line_width=0, row=3, col=1)
    fig.add_hrect(y0=0,  y1=30,  fillcolor="rgba(0,255,136,0.06)",   line_width=0, row=3, col=1)
    fig.add_hline(y=70, line=dict(color="rgba(255,51,102,0.5)",  width=1, dash="dash"), row=3, col=1)
    fig.add_hline(y=30, line=dict(color="rgba(0,255,136,0.5)",   width=1, dash="dash"), row=3, col=1)
    fig.add_trace(go.Scatter(
        x=df.index, y=df["rsi"],
        line=dict(color="#9b59b6", width=1.8),
        showlegend=False, name="RSI",
        hovertemplate="RSI: %{y:.1f}<extra></extra>",
    ), row=3, col=1)

    # ── MACD ──────────────────────────────────────────────────────────────────
    hist_colors = [GREEN if v >= 0 else RED for v in df["macd_hist"]]
    fig.add_trace(go.Bar(
        x=df.index, y=df["macd_hist"],
        marker_color=hist_colors, opacity=0.7,
        showlegend=False, name="Histogram",
        hovertemplate="Hist: %{y:.4f}<extra></extra>",
    ), row=4, col=1)
    fig.add_trace(go.Scatter(
        x=df.index, y=df["macd"],
        line=dict(color="#00ccff", width=1.5),
        showlegend=False, name="MACD",
        hovertemplate="MACD: %{y:.4f}<extra></extra>",
    ), row=4, col=1)
    fig.add_trace(go.Scatter(
        x=df.index, y=df["macd_signal"],
        line=dict(color="#ff9500", width=1.5),
        showlegend=False, name="Signal",
        hovertemplate="Signal: %{y:.4f}<extra></extra>",
    ), row=4, col=1)

    # ── Layout ────────────────────────────────────────────────────────────────
    axis_style = dict(gridcolor=GRID, showgrid=True, zeroline=False)
    fig.update_layout(
        height=820,
        template="plotly_dark",
        paper_bgcolor=BG,
        plot_bgcolor=BG,
        margin=dict(l=10, r=80, t=40, b=10),
        xaxis_rangeslider_visible=False,
        hovermode="x unified",
        hoverlabel=dict(bgcolor="#1a1f2e", font_size=12, font_family="monospace"),
        legend=dict(
            orientation="h",
            yanchor="bottom", y=1.02,
            xanchor="left",   x=0,
            bgcolor="rgba(14,17,23,0.8)",
            bordercolor="rgba(255,255,255,0.15)",
            borderwidth=1,
            font=dict(size=11),
        ),
        font=dict(family="monospace", size=11, color="#e0e0e0"),
    )
    for row in range(1, 5):
        fig.update_xaxes(**axis_style, row=row, col=1)
        fig.update_yaxes(**axis_style, row=row, col=1)
    fig.update_yaxes(range=[0, 100], row=3, col=1)
    fig.update_xaxes(showticklabels=True, row=4, col=1)

    return fig
