import React, { useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  ReferenceLine,
} from "recharts";
import { format } from "date-fns";

interface TradeChartTrade {
  id: string;
  side: "LONG" | "SHORT" | "HOLD";
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  entryPriceActual?: number;
  exitPriceActual?: number;
  reconciled?: boolean;
  pnl: number;
  closeReason?: string;
  entryReason?: string;
  entryMarket?: string;
  exitMarket?: string;
  sentiment?: number;
  technicalScore?: number;
  news?: any[];
  version?: string;
  closeVersion?: string;
  backfilled?: boolean;
  takeProfitPct?: number;
  stopLossPct?: number;
  leverage?: number;
}

interface TradeChartProps {
  trade: TradeChartTrade;
  token: string;
}

interface Quote {
  time: number; // epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
}

// Keep candle count roughly bounded regardless of how long the trade was held.
function pickInterval(durationMins: number): string {
  if (durationMins <= 30) return "1m";
  if (durationMins <= 180) return "5m";
  if (durationMins <= 720) return "15m";
  if (durationMins <= 24 * 60 * 3) return "1h";
  return "1d";
}

function nearestQuote(quotes: Quote[], targetMs: number): Quote | null {
  if (!quotes.length) return null;
  let best = quotes[0];
  let bestDiff = Math.abs(quotes[0].time - targetMs);
  for (const q of quotes) {
    const diff = Math.abs(q.time - targetMs);
    if (diff < bestDiff) { bestDiff = diff; best = q; }
  }
  return best;
}

export const TradeChart: React.FC<TradeChartProps> = ({ trade, token }) => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMarker, setActiveMarker] = useState<"entry" | "exit" | null>(null);

  const entryMs = useMemo(() => new Date(trade.entryTime).getTime(), [trade.entryTime]);
  const exitMs = useMemo(() => new Date(trade.exitTime).getTime(), [trade.exitTime]);
  const durationMins = Math.max(1, (exitMs - entryMs) / 60000);
  const interval = pickInterval(durationMins);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const padMs = Math.max(durationMins * 60000 * 0.5, 15 * 60 * 1000);
        const startDate = new Date(entryMs - padMs).toISOString();
        const endDate = new Date(exitMs + padMs).toISOString();
        const res = await fetch(`/api/historical?token=${encodeURIComponent(token)}&interval=${interval}&startDate=${startDate}&endDate=${endDate}`);
        const json = await res.json();
        if (cancelled) return;
        const parsed: Quote[] = (json.quotes || [])
          .filter((q: any) => q && typeof q.close === "number")
          .map((q: any) => ({
            time: new Date(q.date).getTime(),
            open: q.open,
            high: q.high,
            low: q.low,
            close: q.close,
          }))
          .sort((a: Quote, b: Quote) => a.time - b.time);
        setQuotes(parsed);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load price history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (Number.isFinite(entryMs) && Number.isFinite(exitMs)) load();
    else { setLoading(false); setError("Trade is missing entry/exit timestamps."); }
    return () => { cancelled = true; };
  }, [entryMs, exitMs, interval, token]);

  // Only used to place the markers on the time axis (nearest candle to the real fill time) —
  // NOT for their price (y) position. Using the candle's `close` for y previously meant the dots
  // could sit in the wrong relative order (e.g. a losing LONG's exit dot drawn above its entry
  // dot) whenever the nearest candle's close differed from the trade's actual recorded fill price.
  const entrySnap = useMemo(() => nearestQuote(quotes, entryMs), [quotes, entryMs]);
  const exitSnap = useMemo(() => nearestQuote(quotes, exitMs), [quotes, exitMs]);

  const entryPriceDisplay = trade.entryPriceActual ?? trade.entryPrice;
  const exitPriceDisplay = trade.exitPriceActual ?? trade.exitPrice;
  const isWin = trade.pnl >= 0;
  const entryColor = "#3b82f6"; // neutral blue — marks "open", regardless of side/outcome
  const exitColor = isWin ? "#22c55e" : "#ef4444";
  const tpColor = "#22c55e";
  const slColor = "#ef4444";

  // TP/SL price levels, derived the same way the daemon computes them at fill time (see
  // tpPriceLimit/slPriceLimit in server.ts): a pct-of-collateral target divided by leverage,
  // applied above entry for a LONG's take-profit (below for its stop-loss), and inverted for a
  // SHORT. Ordering them against entry/exit on the same price axis is the point of this chart —
  // it's the only place that shows whether an exit actually landed on its TP/SL line or bailed
  // early/late (e.g. a manual close or circuit breaker) short of it.
  const leverage = trade.leverage && trade.leverage > 0 ? trade.leverage : 1;
  const tpPrice = useMemo(() => {
    if (typeof trade.takeProfitPct !== "number" || typeof entryPriceDisplay !== "number") return null;
    const frac = (trade.takeProfitPct / 100) / leverage;
    return trade.side === "LONG" ? entryPriceDisplay * (1 + frac) : entryPriceDisplay * (1 - frac);
  }, [trade.takeProfitPct, trade.side, entryPriceDisplay, leverage]);
  const slPrice = useMemo(() => {
    if (typeof trade.stopLossPct !== "number" || typeof entryPriceDisplay !== "number") return null;
    const frac = (trade.stopLossPct / 100) / leverage;
    return trade.side === "LONG" ? entryPriceDisplay * (1 - frac) : entryPriceDisplay * (1 + frac);
  }, [trade.stopLossPct, trade.side, entryPriceDisplay, leverage]);

  // Recharts only auto-fits the Y axis to the line's own data (candle closes) — the actual fill
  // prices can sit just outside that range (slippage vs. the nearest candle), which would clip
  // the reference dots. Expand the domain to guarantee both markers are always visible.
  const yDomain = useMemo((): [number, number] | ["auto", "auto"] => {
    const values: number[] = [];
    quotes.forEach((q) => { values.push(q.high, q.low); });
    if (typeof entryPriceDisplay === "number") values.push(entryPriceDisplay);
    if (typeof exitPriceDisplay === "number") values.push(exitPriceDisplay);
    if (typeof tpPrice === "number") values.push(tpPrice);
    if (typeof slPrice === "number") values.push(slPrice);
    if (!values.length) return ["auto", "auto"];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.08 || max * 0.01 || 1;
    return [min - pad, max + pad];
  }, [quotes, entryPriceDisplay, exitPriceDisplay, tpPrice, slPrice]);

  let entryTimeStr = "";
  let exitTimeStr = "";
  try { entryTimeStr = format(new Date(trade.entryTime), "MMM d, HH:mm"); } catch {}
  try { exitTimeStr = format(new Date(trade.exitTime), "MMM d, HH:mm"); } catch {}

  if (loading) {
    return (
      <div className="mt-2 h-[220px] flex items-center justify-center text-[10px] text-text-dim bg-bg-input/30 rounded-lg border border-border-dim/40">
        Loading chart…
      </div>
    );
  }
  if (error || quotes.length === 0) {
    return (
      <div className="mt-2 h-[100px] flex items-center justify-center text-[10px] text-text-dim bg-bg-input/30 rounded-lg border border-border-dim/40">
        {error || "No historical price data available for this window."}
      </div>
    );
  }

  return (
    <div className="mt-2 relative bg-bg-input/30 rounded-lg border border-border-dim/40 p-2">
      <div className="h-[220px] w-full text-[9px] font-mono">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={quotes} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a1f42" opacity={0.2} />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              scale="time"
              stroke="#94a3b8"
              fontSize={8}
              tickFormatter={(v) => { try { return format(new Date(v), "HH:mm"); } catch { return ""; } }}
              tickLine={false}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={8}
              domain={yDomain}
              tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
              width={55}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "#1e133e", borderColor: "#4c1d95", color: "#f8fafc", fontSize: 10 }}
              labelFormatter={(v) => { try { return format(new Date(v), "MMM d, HH:mm"); } catch { return ""; } }}
              formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Price"]}
            />
            <Line type="monotone" dataKey="close" stroke="#8b5cf6" strokeWidth={1.5} dot={false} name={`${token} Price`} isAnimationActive={false} />
            {typeof tpPrice === "number" && (
              <ReferenceLine
                y={tpPrice}
                stroke={tpColor}
                strokeDasharray="4 3"
                strokeWidth={1}
                ifOverflow="extendDomain"
                label={{ value: `TP $${tpPrice.toFixed(2)}`, position: "insideTopLeft", fill: tpColor, fontSize: 8 }}
              />
            )}
            {typeof slPrice === "number" && (
              <ReferenceLine
                y={slPrice}
                stroke={slColor}
                strokeDasharray="4 3"
                strokeWidth={1}
                ifOverflow="extendDomain"
                label={{ value: `SL $${slPrice.toFixed(2)}`, position: "insideBottomLeft", fill: slColor, fontSize: 8 }}
              />
            )}
            {entrySnap && typeof entryPriceDisplay === "number" && (
              <ReferenceDot
                x={entrySnap.time}
                y={entryPriceDisplay}
                r={6}
                shape={(props: any) => (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={6}
                    fill={entryColor}
                    stroke="#0b0714"
                    strokeWidth={2}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setActiveMarker("entry")}
                    onMouseLeave={() => setActiveMarker(null)}
                    onClick={() => setActiveMarker(activeMarker === "entry" ? null : "entry")}
                  />
                )}
              />
            )}
            {exitSnap && typeof exitPriceDisplay === "number" && (
              <ReferenceDot
                x={exitSnap.time}
                y={exitPriceDisplay}
                r={6}
                shape={(props: any) => (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={6}
                    fill={exitColor}
                    stroke="#0b0714"
                    strokeWidth={2}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setActiveMarker("exit")}
                    onMouseLeave={() => setActiveMarker(null)}
                    onClick={() => setActiveMarker(activeMarker === "exit" ? null : "exit")}
                  />
                )}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-4 text-[8px] uppercase font-bold tracking-wider text-text-dim px-1 mt-1 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entryColor }} /> Entry
          <span className="normal-case font-normal text-text-dim/70 font-mono">{entryTimeStr}</span>
        </span>
        {typeof tpPrice === "number" && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5" style={{ backgroundColor: tpColor }} /> TP
            <span className="normal-case font-normal text-text-dim/70 font-mono">${tpPrice.toFixed(2)}</span>
          </span>
        )}
        {typeof slPrice === "number" && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5" style={{ backgroundColor: slColor }} /> SL
            <span className="normal-case font-normal text-text-dim/70 font-mono">${slPrice.toFixed(2)}</span>
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: exitColor }} /> Exit ({isWin ? "Win" : "Loss"})
          <span className="normal-case font-normal text-text-dim/70 font-mono">{exitTimeStr}</span>
        </span>
        <span className="normal-case font-normal text-text-dim/70">hover or tap a marker for details</span>
      </div>

      {activeMarker === "entry" && (
        <div className="absolute top-3 right-3 z-50 w-[220px] bg-bg-card border border-border-dim rounded-lg p-3 shadow-xl text-[9.5px] space-y-1.5 font-sans">
          <div className="font-bold text-text-heading flex items-center justify-between">
            <span>Entry — {trade.side}</span>
            <span className="font-mono text-blue-400">${entryPriceDisplay?.toFixed(2)}</span>
          </div>
          <div className="text-text-dim font-mono">{entryTimeStr}</div>
          {trade.entryMarket && (
            <div className="text-text-dim">Market: <strong className="text-text-heading">{trade.entryMarket}</strong></div>
          )}
          {trade.version ? (
            <div className="text-text-dim">Build: <strong className="text-text-heading font-mono">{trade.version.startsWith("v") ? trade.version : `v${trade.version}`}</strong></div>
          ) : trade.backfilled ? (
            <div className="text-text-dim" title="Reconstructed from on-chain history — the chain doesn't carry a build tag.">Build: <strong className="text-text-heading font-mono">n/a (on-chain)</strong></div>
          ) : null}
          {(trade.sentiment !== undefined && trade.sentiment !== null) || (trade.technicalScore !== undefined && trade.technicalScore !== null) ? (
            <div className="grid grid-cols-2 gap-1.5 font-mono pt-1 border-t border-border-dim/30">
              {trade.sentiment !== undefined && trade.sentiment !== null && (
                <span>Sent: <strong className={trade.sentiment > 0 ? "text-sol-green" : trade.sentiment < 0 ? "text-red-400" : ""}>{(trade.sentiment >= 0 ? "+" : "") + Number(trade.sentiment).toFixed(2)}</strong></span>
              )}
              {trade.technicalScore !== undefined && trade.technicalScore !== null && (
                <span>Tech: <strong className={trade.technicalScore > 0 ? "text-sol-green" : trade.technicalScore < 0 ? "text-red-400" : ""}>{(trade.technicalScore >= 0 ? "+" : "") + Number(trade.technicalScore).toFixed(2)}</strong></span>
              )}
            </div>
          ) : null}
          {trade.news && trade.news.length > 0 && (
            <div className="pt-1 border-t border-border-dim/30 space-y-1 max-h-[80px] overflow-y-auto custom-scrollbar">
              {trade.news.slice(0, 3).map((item: any, idx: number) => {
                const title = item && typeof item === "object" ? item.title : item;
                return <div key={idx} className="truncate text-text-dim/90" title={title}>📰 {title}</div>;
              })}
            </div>
          )}
        </div>
      )}

      {activeMarker === "exit" && (
        <div className="absolute top-3 right-3 z-50 w-[220px] bg-bg-card border border-border-dim rounded-lg p-3 shadow-xl text-[9.5px] space-y-1.5 font-sans">
          <div className="font-bold text-text-heading flex items-center justify-between">
            <span>Exit</span>
            <span className={`font-mono ${isWin ? "text-sol-green" : "text-red-400"}`}>${exitPriceDisplay?.toFixed(2)}</span>
          </div>
          <div className="text-text-dim font-mono">{exitTimeStr}</div>
          {trade.exitMarket && (
            <div className="text-text-dim">Market: <strong className="text-text-heading">{trade.exitMarket}</strong></div>
          )}
          {trade.closeVersion ? (
            <div className="text-text-dim">Build: <strong className="text-text-heading font-mono">{trade.closeVersion.startsWith("v") ? trade.closeVersion : `v${trade.closeVersion}`}</strong></div>
          ) : trade.backfilled ? (
            <div className="text-text-dim" title="Reconstructed from on-chain history — the chain doesn't carry a build tag.">Build: <strong className="text-text-heading font-mono">n/a (on-chain)</strong></div>
          ) : null}
          <div className={`font-mono font-bold ${isWin ? "text-sol-green" : "text-red-400"}`}>
            {trade.pnl >= 0 ? "+" : ""}{trade.pnl.toFixed(2)}%
          </div>
          <div className="pt-1 border-t border-border-dim/30 text-text-dim">
            {trade.closeReason || "Closed on take-profit / stop-loss limits."}
          </div>
        </div>
      )}
    </div>
  );
};
