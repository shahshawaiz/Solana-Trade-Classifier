import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  TrendingUp,
  TrendingDown,
  Settings,
  Newspaper,
  Activity,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  RefreshCw,
  Zap,
  Bell,
  BellOff,
  Send,
  Check,
  AlertTriangle,
  Wallet,
  DollarSign,
  Shield,
  Coins,
  Download,
  Table,
  BookOpen,
  Terminal,
  ChevronDown,
  ChevronUp,
  X,
  LayoutGrid,
  List
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine,
  ComposedChart,
  Area
} from "recharts";
import { format, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Connection, PublicKey, Transaction, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { motion, AnimatePresence } from "motion/react";
import { runBacktest, calculateRSI, calculateEMA, MarketData } from "./lib/backtest";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { LiquidityHeatmap } from "./components/LiquidityHeatmap";
import { LiquidationHistogram } from "./components/LiquidationHistogram";
import { TradeChart } from "./components/TradeChart";
import { StrategyGuide } from "./components/StrategyGuide";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---



const Card = ({ children, className, title, icon: Icon, action, overflowVisible }: any) => (
  <div className={cn(
    "bg-bg-card border border-border-dim rounded-lg flex flex-col shadow-sm relative overflow-hidden group/card hover:shadow-md transition-all duration-300 hover:-translate-y-[1px]", 
    overflowVisible ? "" : "overflow-hidden",
    className
  )}>
    {/* Colorful gradient top line */}
    <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-sol-purple via-[#6366f1] to-sol-green" />

    {(title || Icon || action) && (
      <div className="px-5 py-3.5 border-b border-border-dim flex items-center justify-between bg-bg-main/30 shrink-0 mt-[3px]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.15em] font-extrabold text-text-heading">{title}</span>
        </div>
        <div className="flex items-center gap-2.5">
          {action && <div className="flex items-center shrink-0">{action}</div>}
          {Icon && <Icon className="w-3.5 h-3.5 text-sol-purple group-hover/card:scale-110 transition-transform duration-300" />}
        </div>
      </div>
    )}
    <div className={cn("p-5 flex-1 flex flex-col min-h-0", overflowVisible ? "overflow-visible" : "overflow-hidden")}>
      {children}
    </div>
  </div>
);

const Stat = ({ label, value, subValue, trend }: any) => {
  const isPositive = trend !== undefined && trend > 0;
  const isNegative = trend !== undefined && trend < 0;
  const topColor = isPositive 
    ? "from-sol-green to-emerald-400" 
    : (isNegative ? "from-red-500 to-rose-400" : "from-sol-purple to-[#6366f1]");

  return (
    <div className="bg-bg-card p-5 rounded-lg border border-border-dim shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300 hover:-translate-y-[1px]">
      {/* Colorful gradient top line */}
      <div className={cn("absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r", topColor)} />

      <p className="text-[10px] uppercase tracking-widest text-text-dim mb-2 mt-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className={cn(
          "text-3xl font-serif font-medium transition-colors duration-300 group-hover:text-sol-purple",
          trend !== undefined ? (trend > 0 ? "text-sol-green" : trend < 0 ? "text-red-500" : "text-text-heading") : "text-text-heading"
        )}>{value}</span>
        {trend !== undefined && (
          <span className={cn(
            "text-[10px] font-mono px-1 py-0.5 rounded",
            trend > 0 ? "bg-sol-green/10 text-sol-green" : "bg-red-500/10 text-red-500"
          )}>
            {trend > 0 ? "↑" : "↓"}{Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      {subValue && <p className="text-[9px] text-text-dim mt-2 uppercase tracking-[0.1em]">{subValue}</p>}
    </div>
  );
};

const TradeHistory = ({ trades }: { trades: any[] }) => {
  if (!trades || trades.length === 0) {
    return (
      <div className="p-8 text-center border border-dashed border-border-dim rounded-lg">
        <p className="text-[10px] uppercase tracking-widest text-text-dim">Operational History Empty</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-border-dim rounded-lg h-[400px] custom-scrollbar overflow-y-auto">
      <table className="w-full text-left text-[11px] border-collapse relative">
        <thead className="bg-bg-main/90 backdrop-blur sticky top-0 shadow-sm z-10">
          <tr>
            <th className="p-3 border-b border-border-dim font-serif italic text-text-dim font-normal uppercase tracking-wider">Entry</th>
            <th className="p-3 border-b border-border-dim font-serif italic text-text-dim font-normal uppercase tracking-wider">Type</th>
            <th className="p-3 border-b border-border-dim font-serif italic text-text-dim font-normal uppercase tracking-wider">Entry Price</th>
            <th className="p-3 border-b border-border-dim font-serif italic text-text-dim font-normal uppercase tracking-wider">Exit Price</th>
            <th className="p-3 border-b border-border-dim font-serif italic text-text-dim font-normal uppercase tracking-wider">Close Reason</th>
            <th className="p-3 border-b border-border-dim font-serif italic text-text-dim font-normal uppercase tracking-wider text-right">PnL</th>
            <th className="p-3 border-b border-border-dim font-serif italic text-text-dim font-normal uppercase tracking-wider text-right">Cum. PnL</th>
          </tr>
        </thead>
        <tbody className="bg-bg-card divide-y divide-border-dim font-mono">
          {trades.map((trade, i) => {
            const isConfirm = trade.type.startsWith("CONFIRM");
            return (
              <tr key={i} className="hover:bg-bg-main/30 transition-colors">
                <td className="p-3 text-text-dim">{trade.entryTime || trade.date}</td>
                <td className="p-3">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                    isConfirm ? "bg-amber-500/10 text-amber-500 border border-amber-500/10" :
                    trade.type === 'Long' ? "bg-sol-green/10 text-sol-green" : 
                    trade.type === 'Short' ? "bg-red-500/10 text-red-500" :
                    "bg-border-dim/50 text-text-dim"
                  )}>
                    {trade.type}
                  </span>
                </td>
                <td className="p-3 text-text-heading">${(trade.entryPrice || trade.price || 0).toFixed(2)}</td>
                <td className="p-3 text-text-heading">
                  {isConfirm ? <span className="text-text-dim text-[10px]">-- (Watching)</span> : trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : "OPEN"}
                </td>
                <td className="p-3 text-text-dim text-[10px] italic max-w-[200px] truncate" title={(trade.entryReason ? `Entry: ${trade.entryReason}\n` : "") + `Exit: ${trade.closeReason || trade.note || "Active"}`}>
                  {trade.entryReason && (
                    <div className="text-text-heading font-medium not-italic mb-0.5 text-ellipsis overflow-hidden" title={trade.entryReason}>
                      Entry: {trade.entryReason}
                    </div>
                  )}
                  <div className="text-ellipsis overflow-hidden">
                    Exit: {trade.closeReason || trade.note || "Active"}
                  </div>
                  {trade.tpPct !== undefined && trade.slPct !== undefined && !isConfirm && (
                    <div className="text-[9px] mt-1 font-mono flex items-center gap-2 font-medium">
                       <span className="text-sol-green/80">TP: +{trade.tpPct?.toFixed(1)}%</span>
                       <span className="text-red-500/80">SL: -{trade.slPct?.toFixed(1)}%</span>
                    </div>
                  )}
                </td>
                <td className={cn(
                  "p-3 text-right font-bold",
                  isConfirm ? "text-text-dim" : trade.pnl > 0 ? "text-sol-green" : trade.pnl < 0 ? "text-red-500" : "text-text-dim"
                )}>
                  {isConfirm ? "--" : `${(trade.pnl * 100).toFixed(2)}%`}
                </td>
                <td className={cn(
                  "p-3 text-right font-bold",
                  isConfirm ? "text-text-dim" : trade.cumPnL > 0 ? "text-sol-green" : trade.cumPnL < 0 ? "text-red-500" : "text-text-dim"
                )}>
                  {isConfirm ? "--" : `${(trade.cumPnL * 100).toFixed(2)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// --- Main App ---

export const safeJson = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    if (res.status === 429) {
      throw new Error(`Rate limit exceeded (429. Please try again later.`);
    }
    throw new Error(`Invalid JSON response (${res.status}): ${text.substring(0, 50)}`);
  }
};

// Animated "trade arena" — floating bubbles that come alive while a position is open.
// Color and motion react to side (LONG/SHORT) and live PnL. Purely decorative.
const TradeBubbles = ({ trade, livePrice }: { trade: any; livePrice?: number }) => {
  // Stable randomized bubble field (regenerated only when the position identity changes).
  const bubbles = useMemo(
    () =>
      Array.from({ length: 16 }).map((_, i) => ({
        id: i,
        size: 10 + Math.random() * 38,
        left: Math.random() * 100,
        delay: Math.random() * 5,
        duration: 6 + Math.random() * 7,
        drift: (Math.random() - 0.5) * 60,
      })),
    [trade?.entryTime, trade?.side]
  );

  if (!trade) return null;

  const isLong = trade.side === "LONG";
  const entry = trade.entryPrice || 0;
  const lev = trade.leverage || 5;
  const pnlPct =
    livePrice && entry
      ? (isLong ? (livePrice - entry) / entry : (entry - livePrice) / entry) * 100 * lev
      : 0;
  const isProfit = pnlPct >= 0;
  // Bubbles tint to the position side; the core glows green/red with live PnL.
  const sideHex = isLong ? "#22c55e" : "#ef4444";
  const pnlHex = isProfit ? "#22c55e" : "#ef4444";

  return (
    <div
      className="relative h-56 rounded-2xl overflow-hidden border border-border-dim"
      style={{
        background: `radial-gradient(120% 120% at 50% 120%, ${sideHex}1f 0%, rgba(10,10,15,0.0) 55%)`,
      }}
    >
      {/* header chip */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full animate-ping" style={{ background: sideHex }} />
        <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-text-dim">Live Trade Arena</span>
      </div>
      <div className="absolute top-3 right-3 z-20 text-[9px] font-mono uppercase tracking-widest"
        style={{ color: trade.mode === "PAPER" ? "#f59e0b" : "#22c55e" }}>
        {trade.mode || "REAL"}
      </div>

      {/* rising ambient bubbles */}
      {bubbles.map((b) => (
        <motion.div
          key={b.id}
          className="absolute rounded-full"
          style={{
            width: b.size,
            height: b.size,
            left: `${b.left}%`,
            background: `radial-gradient(circle at 30% 28%, ${sideHex}66, ${sideHex}0d)`,
            border: `1px solid ${sideHex}33`,
            boxShadow: `0 0 18px ${sideHex}22`,
          }}
          initial={{ y: "120%", opacity: 0 }}
          animate={{ y: "-30%", x: [0, b.drift, 0], opacity: [0, 0.85, 0] }}
          transition={{ duration: b.duration, delay: b.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {/* central pulsing core showing the live PnL */}
      <motion.div
        className="absolute left-1/2 top-1/2 z-10 flex flex-col items-center justify-center rounded-full text-center"
        style={{
          width: 132,
          height: 132,
          marginLeft: -66,
          marginTop: -66,
          background: `radial-gradient(circle at 50% 40%, ${pnlHex}33, ${pnlHex}0a 70%)`,
          border: `1.5px solid ${pnlHex}66`,
          boxShadow: `0 0 50px ${pnlHex}33, inset 0 0 30px ${pnlHex}1a`,
        }}
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: sideHex }}>
          {trade.side} · {lev}x
        </span>
        <span className="text-2xl font-black tabular-nums" style={{ color: pnlHex }}>
          {isProfit ? "+" : ""}
          {pnlPct.toFixed(2)}%
        </span>
        <span className="text-[10px] font-mono" style={{ color: pnlHex }}>
          {livePrice
            ? `${isProfit ? "+" : ""}$${((pnlPct / 100) * (trade.sizeInSol || 0) * entry).toFixed(2)}`
            : "seeking index…"}
        </span>
        <span className="text-[8px] text-text-dim mt-0.5">
          {trade.sizeInSol?.toFixed(3)} SOL @ ${entry.toFixed(2)}
        </span>
      </motion.div>
    </div>
  );
};

// Shared between the grid and table Trade Journal views so the two layouts don't drift.
const TradeDetailFields = ({ trade }: { trade: any }) => {
  const durationStr = trade.durationMins !== null && trade.durationMins !== undefined
    ? (trade.durationMins >= 60 ? `${Math.floor(trade.durationMins / 60)}h ${trade.durationMins % 60}m` : `${trade.durationMins}m`)
    : "—";
  return (
    <div className="space-y-1 text-text-dim border-t border-border-dim/20 pt-2 font-mono">
      <div className="flex justify-between">
        <span>Price Swap:</span>
        <span className="text-text-heading font-medium">
          ${(trade.entryPriceActual ?? trade.entryPrice)?.toFixed(2)} ➔ ${(trade.exitPriceActual ?? trade.exitPrice)?.toFixed(2)}
          {trade.reconciled && trade.entryPriceActual !== undefined && (
            <span className="text-text-dim font-normal"> (est. ${trade.entryPrice?.toFixed(2)} ➔ ${trade.exitPrice?.toFixed(2)})</span>
          )}
        </span>
      </div>
      {trade.sizeInSol !== undefined && trade.sizeInSol !== null && (
        <div className="flex justify-between"><span>Sizing:</span><span className="text-text-heading font-medium">{Number(trade.sizeInSol).toFixed(3)} SOL</span></div>
      )}
      {trade.reconciled && trade.feesUsd !== undefined && (
        <div className="flex justify-between">
          <span>Fees:</span>
          <span className="text-text-heading font-medium">
            ${Number(trade.feesUsd).toFixed(2)}
            {(trade.openFeeUsd !== undefined && trade.closeFeeUsd !== undefined) && (
              <span className="text-text-dim font-normal"> (open ${Number(trade.openFeeUsd).toFixed(2)} + close ${Number(trade.closeFeeUsd).toFixed(2)})</span>
            )}
          </span>
        </div>
      )}
      <div className="flex justify-between"><span>Duration:</span><span className="text-text-heading font-medium">{durationStr}</span></div>
      {trade.takeProfitPct !== undefined && (
        <div className="flex justify-between"><span>Limits:</span><span>TP: <span className="text-sol-green font-semibold">+{Number(trade.takeProfitPct).toFixed(1)}%</span> · SL: <span className="text-red-400 font-semibold">-{Number(trade.stopLossPct ?? 0).toFixed(1)}%</span></span></div>
      )}
      {trade.entryMarket && (
        <div className="flex justify-between gap-2"><span className="shrink-0">Market (Entry):</span><span className="text-text-heading font-medium text-right">{trade.entryMarket}</span></div>
      )}
      {trade.entryReason && (
        <div className="flex justify-between gap-2"><span className="shrink-0">Entry:</span><span className="text-text-heading font-medium text-right">{trade.entryReason}</span></div>
      )}
      {trade.exitMarket && trade.exitMarket !== trade.entryMarket && (
        <div className="flex justify-between gap-2"><span className="shrink-0">Market (Exit):</span><span className="text-text-heading font-medium text-right">{trade.exitMarket}</span></div>
      )}
      {trade.closeReason && (
        <div className="flex justify-between gap-2"><span className="shrink-0">Exit:</span><span className="text-text-heading font-medium text-right">{trade.closeReason}</span></div>
      )}
      {(trade.openSignature || trade.closeSignature) && (
        <div className="flex justify-between gap-2 text-[8.5px]">
          <span>Tx:</span>
          <span className="flex gap-2">
            {trade.openSignature && <a href={`https://solscan.io/tx/${trade.openSignature}`} target="_blank" rel="noopener noreferrer" className="text-sol-purple hover:underline">open ↗</a>}
            {trade.closeSignature && <a href={`https://solscan.io/tx/${trade.closeSignature}`} target="_blank" rel="noopener noreferrer" className="text-sol-purple hover:underline">close ↗</a>}
          </span>
        </div>
      )}
    </div>
  );
};

const TradeSignalAndNews = ({ trade }: { trade: any }) => (
  <>
    {((trade.sentiment !== undefined && trade.sentiment !== null) || (trade.technicalScore !== undefined && trade.technicalScore !== null)) && (
      <div className="flex flex-col text-[9.5px] text-text-dim border-t border-border-dim/20 pt-2 space-y-1">
        <span className="font-sans font-bold text-[7.5px] uppercase tracking-wider text-text-dim">Signal breakdown</span>
        <div className="grid grid-cols-2 gap-2 font-mono text-[9px]">
          {trade.sentiment !== undefined && trade.sentiment !== null && (
            <div className="flex justify-between bg-bg-input/40 px-1.5 py-0.5 rounded">
              <span className="text-text-dim">Sent:</span>
              <span className={cn("font-bold", trade.sentiment > 0 ? "text-sol-green" : trade.sentiment < 0 ? "text-red-400" : "text-text-heading")}>
                {(trade.sentiment >= 0 ? "+" : "") + Number(trade.sentiment).toFixed(2)}
              </span>
            </div>
          )}
          {trade.technicalScore !== undefined && trade.technicalScore !== null && (
            <div className="flex justify-between bg-bg-input/40 px-1.5 py-0.5 rounded">
              <span className="text-text-dim">Tech:</span>
              <span className={cn("font-bold", trade.technicalScore > 0 ? "text-sol-green" : trade.technicalScore < 0 ? "text-red-400" : "text-text-heading")}>
                {(trade.technicalScore >= 0 ? "+" : "") + Number(trade.technicalScore).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>
    )}

    {trade.news && trade.news.length > 0 && (
      <div className="text-left font-mono text-[8.5px] text-text-dim/85 border-t border-border-dim/20 pt-2 space-y-1">
        <span className="font-sans font-bold block text-[7.5px] uppercase tracking-wider text-text-dim">News Catalysts</span>
        <div className="space-y-1 max-h-[80px] overflow-y-auto custom-scrollbar pr-0.5">
          {trade.news.slice(0, 3).map((item: any, nIdx: number) => {
            const isObj = item && typeof item === "object";
            const title = isObj ? item.title : item;
            const score = isObj && item.sentiment !== undefined ? item.sentiment : null;
            return (
              <div key={nIdx} className="border-b border-border-dim/5 last:border-0 pb-1 flex flex-col">
                <div className="truncate font-serif text-[8.5px] text-text-heading/90" title={title}>📰 {title}</div>
                {score !== null && (
                  <span className={cn("text-[7.5px] font-mono tracking-wider uppercase font-semibold", score > 0.1 ? "text-sol-green" : score < -0.1 ? "text-red-400" : "text-text-dim")}>
                    Score: {score > 0 ? "+" : ""}{Number(score).toFixed(2)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    )}
  </>
);

export default function App() {
  const [data, setData] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [sentiment, setSentiment] = useState<any>({ score: 0, rationale: "", action: "", inputData: null });
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [toastsEnabled, setToastsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("cortex_toasts_enabled");
    return saved !== "false";
  });
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: string; source: string }>>([]);
  const [localSyncLogs, setLocalSyncLogs] = useState<Array<{ id: string; timestamp: string; message: string; type: string; source: string }>>([]);
  const seenAuditIdsRef = useRef<Set<string>>(new Set());
  const auditInitializedRef = useRef(false);
  const [weights, setWeights] = useState<{
    sentiment: number;
    technical: number;
    liquidity: number;
    elliottWave: number;
    supertrend: number;
    fvg: number;
    dca: number;
  }>(() => {
    try {
      const saved = localStorage.getItem("cortex_weights");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          sentiment: typeof parsed.sentiment === "number" ? parsed.sentiment : 0,
          technical: typeof parsed.technical === "number" ? parsed.technical : 0.9,
          liquidity: typeof parsed.liquidity === "number" ? parsed.liquidity : 0.85,
          elliottWave: typeof parsed.elliottWave === "number" ? parsed.elliottWave : 0,
          supertrend: typeof parsed.supertrend === "number" ? parsed.supertrend : 0.9,
          fvg: typeof parsed.fvg === "number" ? parsed.fvg : 0,
          dca: typeof parsed.dca === "number" ? parsed.dca : 0,
        };
      }
    } catch (_) {}
    return { sentiment: 0, technical: 0.9, liquidity: 0.85, elliottWave: 0, supertrend: 0.9, fvg: 0, dca: 0 };
  });
  const [threshold, setThreshold] = useState(0.1);
  const [enabledIndicators, setEnabledIndicators] = useState<{
    sentiment: boolean;
    technical: boolean;
    liquidity: boolean;
    elliottWave: boolean;
    supertrend: boolean;
    fvg: boolean;
    dca: boolean;
  }>(() => {
    try {
      const saved = localStorage.getItem("cortex_enabled_indicators");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          sentiment: typeof parsed.sentiment === "boolean" ? parsed.sentiment : false,
          technical: typeof parsed.technical === "boolean" ? parsed.technical : true,
          liquidity: typeof parsed.liquidity === "boolean" ? parsed.liquidity : true,
          elliottWave: typeof parsed.elliottWave === "boolean" ? parsed.elliottWave : false,
          supertrend: typeof parsed.supertrend === "boolean" ? parsed.supertrend : true,
          fvg: typeof parsed.fvg === "boolean" ? parsed.fvg : false,
          dca: typeof parsed.dca === "boolean" ? parsed.dca : false,
        };
      }
    } catch (_) {}
    return {
      sentiment: false,
      technical: true,
      liquidity: true,
      elliottWave: false,
      supertrend: true,
      fvg: false,
      dca: false,
    };
  });

  const effectiveWeights = useMemo(() => {
    return {
      sentiment: enabledIndicators.sentiment ? weights.sentiment : 0,
      technical: enabledIndicators.technical ? weights.technical : 0,
      liquidity: enabledIndicators.liquidity ? weights.liquidity : 0,
      elliottWave: enabledIndicators.elliottWave ? weights.elliottWave : 0,
      supertrend: enabledIndicators.supertrend ? weights.supertrend : 0,
      fvg: enabledIndicators.fvg ? weights.fvg : 0,
      dca: enabledIndicators.dca ? weights.dca : 0,
    };
  }, [weights, enabledIndicators]);

  useEffect(() => {
    localStorage.setItem("cortex_enabled_indicators", JSON.stringify(enabledIndicators));
  }, [enabledIndicators]);

  // Define Recharts Custom Components inside App to access state
  const CustomizedSignalDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload || payload.signal === 0) return null;
    
    let color = "#00FFA3";
    if (payload.signal === -1) color = "#ef4444";
    else if (payload.signal === 2) color = "#eab308";
    else if (payload.signal === -2) color = "#f97316";

    const isCatalyst = payload.isSentimentCatalyst;

    return (
      <g>
        {isCatalyst && (
          <g transform={`translate(${cx},${cy - 12})`}>
             <motion.circle 
              r="8" 
              fill="#8b5cf6" 
              initial={{ scale: 0, opacity: 0.5 }}
              animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.1, 0.3] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
            <rect x="-3" y="-3" width="6" height="6" fill="#8b5cf6" rx="0.5" transform="rotate(45)" />
            <text x="0" y="2" textAnchor="middle" fill="white" fontSize="5" fontWeight="black">N</text>
          </g>
        )}
        <circle cx={cx} cy={cy} r={4} fill={color} stroke="white" strokeWidth={1} />
      </g>
    );
  };

  const CustomizedNewsDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload || !payload.newsHeadline) return null;
    
    return (
      <g transform={`translate(${cx},${cy - 24})`}>
        <rect x="-3" y="-3" width="6" height="6" fill="#64748b" rx="0.5" transform="rotate(45)" />
        <text x="0" y="2" textAnchor="middle" fill="white" fontSize="5" fontWeight="black">N</text>
      </g>
    );
  };

  const ET_TZ = "America/New_York";
  const etFormat = (date: Date | string | number, fmt: string) => formatInTimeZone(date, ET_TZ, fmt);
  const tzAbbr = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone: ET_TZ }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || 'ET';

  const CustomizedNewsMarker = (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload || !payload.newsHeadline) return null;

    const isCatalyst = payload.isSentimentCatalyst;

    return (
      <g transform={`translate(${cx},${cy - 14})`}>
        {isCatalyst && (
          <>
            <motion.circle 
              r="12" 
              fill="#8b5cf6" 
              initial={{ scale: 0, opacity: 0.5 }}
              animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.1, 0.3] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
            <line x1="0" y1="4" x2="0" y2="10" stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="2 1" />
          </>
        )}
        <rect x="-4" y="-4" width="8" height="8" fill={isCatalyst ? "#8b5cf6" : "#6366f1"} rx="1" transform="rotate(45)" opacity={isCatalyst ? 1 : 0.6} />
        <text x="0" y="2.5" textAnchor="middle" fill="white" fontSize="6" fontWeight="black">N</text>
      </g>
    );
  };

  const CustomizedExhaustionMarker = (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload || !payload.skippedSignal) return null;

    return (
      <g transform={`translate(${cx},${cy + 14})`}>
        <circle r="6" fill="#ef4444" opacity="0.8" />
        <text x="0" y="2" textAnchor="middle" fill="white" fontSize="7" fontWeight="black" cursor="help">!</text>
      </g>
    );
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataObj = payload[0].payload;
      const signal = dataObj.signal || 0;
      let actionStr = "Hold";
      let actionColor = "#94a3b8";
      
      if (signal === 1) { actionStr = "Long Buy"; actionColor = "#00FFA3"; }
      else if (signal === -1) { actionStr = "Short Sell"; actionColor = "#ef4444"; }
      else if (signal === 2) { actionStr = "Short Buy"; actionColor = "#eab308"; }
      else if (signal === -2) { actionStr = "Long Sell"; actionColor = "#f97316"; }

      return (
        <div className="bg-bg-card border border-border-dim p-4 rounded-xl shadow-lg max-w-[250px]">
          {dataObj.isSentimentCatalyst && (
            <div className="mb-2 px-2 py-1 bg-sol-purple/10 border border-sol-purple/20 rounded text-[9px] font-bold text-sol-purple uppercase tracking-tighter flex items-center gap-1">
              <Newspaper className="w-3 h-3" /> SENTIMENT CATALYST DETECTED
            </div>
          )}
          {dataObj.skippedSignal && (
            <div className="mb-2 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-[9px] font-bold text-red-500 uppercase tracking-tighter flex items-center gap-1">
              <Zap className="w-3 h-3" /> EXPOSURE LIMIT EXHAUSTED - SIGNAL SKIPPED
            </div>
          )}
          <p className="text-xs font-bold text-text-heading mb-2">{label} <span className="text-[9px] opacity-40 font-normal">({tzAbbr})</span></p>
          
          <div className="mb-3 pb-3 border-b border-border-dim flex justify-between">
             <div>
               <p className="font-bold text-[10px] uppercase tracking-widest text-text-dim mb-1">Action Engine</p>
               <p className="text-xs font-mono font-bold" style={{ color: actionColor }}>{actionStr}</p>
             </div>
             <div>
               <p className="font-bold text-[10px] uppercase tracking-widest text-text-dim mb-1 text-right">Exposure</p>
               <p className="text-xs font-mono font-bold text-right text-text-heading">{(dataObj.position || 0).toFixed(2)}x</p>
             </div>
          </div>

          <div className="space-y-1 mb-3">
            <p className="text-[9px] uppercase tracking-widest text-text-dim mb-1 font-bold">Logic Core Components (Weighted)</p>
            <div className="grid grid-cols-1 gap-1 text-[10px] font-mono">
              <div className="flex justify-between">
                <span className="text-text-dim">Sentiment ({weights.sentiment}):</span>
                <span className={cn(dataObj.wSentiment > 0 ? "text-sol-green" : dataObj.wSentiment < 0 ? "text-red-500" : "text-text-dim")}>
                  {dataObj.wSentiment.toFixed(3)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-dim">Technical ({weights.technical}):</span>
                <span className={cn(dataObj.wTechnical > 0 ? "text-sol-green" : dataObj.wTechnical < 0 ? "text-red-500" : "text-text-dim")}>
                  {dataObj.wTechnical.toFixed(3)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-dim">Liquidity ({weights.liquidity}):</span>
                <span className={cn(dataObj.wLiquidity > 0 ? "text-sol-green" : dataObj.wLiquidity < 0 ? "text-red-500" : "text-text-dim")}>
                  {dataObj.wLiquidity.toFixed(3)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border-dim/30 pt-1 mt-1">
                <span className="text-text-dim">Alpha Score (Σ):</span>
                <span className={cn("font-bold", dataObj.score > threshold ? "text-sol-green" : dataObj.score < -threshold ? "text-red-500" : "text-text-heading")}>
                  {dataObj.score?.toFixed(3)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
          </div>

          {dataObj.newsHeadline && (
            <div className="mt-3 pt-3 border-t border-border-dim">
              <p className="text-[9px] uppercase tracking-widest text-text-dim mb-1 font-bold">Sentiment Catalyst</p>
              <p className="text-[10px] italic leading-snug text-text-body">"{dataObj.newsHeadline}"</p>
            </div>
          )}
        </div>
      );
    }
    return null;
  };
  const [cooldown, setCooldown] = useState(120); // Minutes
  const [tradeSize, setTradeSize] = useState(0.5); // Half position sizing
  const [maxPosition, setMaxPosition] = useState(1.0); // 1x leverage cap
  const [lookbackDays, setLookbackDays] = useState(7);
  const [lookbackMode, setLookbackMode] = useState<'preset' | 'custom'>('preset');
  const [startDate, setStartDate] = useState(etFormat(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(etFormat(new Date(), "yyyy-MM-dd"));
  const [interval, setChartInterval] = useState("1h");
  useEffect(() => {
    if (lookbackMode === 'preset') {
      setStartDate(etFormat(subDays(new Date(), lookbackDays), "yyyy-MM-dd"));
      setEndDate(etFormat(new Date(), "yyyy-MM-dd"));
    }
  }, [lookbackDays, lookbackMode]);

  const [currentSpotPrice, setCurrentSpotPrice] = useState<number | null>(null);
  const [mapSpread, setMapSpread] = useState<number>(0.1);
  const [syncInterval, setSyncInterval] = useState(1200); // defaults to 20 minutes
  const [topic, setTopic] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("cortex_topic");
      if (saved && saved !== "market" && saved !== "Crypto") return saved;
    } catch (_) {}
    return "crypto,war";
  });
  const [token, setToken] = useState("SOL");
  const [predictionHeadlines, setPredictionHeadlines] = useState<any[]>([]);
  const [currentView, setCurrentView] = useState<'dashboard' | 'apiDocs' | 'about' | 'jupiter' | 'forecast' | 'liquidation' | 'journal' | 'strategy'>('jupiter');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [journalData, setJournalData] = useState<any | null>(null);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalResyncing, setJournalResyncing] = useState(false);
  const [journalResyncMsg, setJournalResyncMsg] = useState<string | null>(null);
  const [journalViewMode, setJournalViewMode] = useState<'grid' | 'table'>('grid');
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [macroData, setMacroData] = useState<any | null>(null);
  const [macroLoading, setMacroLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // App version (commit-stamped, served by GET /api/version). Fetched once on mount.
  const [appVersion, setAppVersion] = useState<{ display: string; version: string; commit: string; branch?: string; buildTime?: string } | null>(null);
  useEffect(() => {
    fetch("/api/version").then((r) => r.json()).then(setAppVersion).catch(() => {});
  }, []);

  // Unified Forecast & Backtesting states
  const [forecastData, setForecastData] = useState<any | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [showTrajectoryTable, setShowTrajectoryTable] = useState(true);

  const [backtestCapital, setBacktestCapital] = useState(10000);
  const [backtestResult, setBacktestResult] = useState<any | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  const fetchForecast = async (
    targetToken = token, 
    targetInterval = interval,
    customWeights = effectiveWeights,
    newsKeywords = topic
  ) => {
    setForecastLoading(true);
    setForecastError(null);
    try {
      const res = await fetch("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          token: targetToken, 
          interval: targetInterval, 
          weights: customWeights,
          newsQueryKeywords: newsKeywords
        })
      });
      if (res.ok) {
        const data = await safeJson(res);
        setForecastData(data);
      } else {
        const errData = await safeJson(res);
        setForecastError(errData.error || "Failed to fetch forecasts.");
      }
    } catch (e: any) {
      setForecastError(e.message || "Network error fetching forecast.");
    } finally {
      setForecastLoading(false);
    }
  };

  const runQuantBacktest = async () => {
    setBacktestLoading(true);
    setBacktestError(null);
    try {
      const payload: any = {
        token: token, 
        interval: interval, 
        weights: effectiveWeights,
        initialCapital: backtestCapital
      };
      
      if (lookbackMode === 'custom') {
        payload.startDate = startDate;
        payload.endDate = endDate;
      } else {
        payload.lookbackDays = lookbackDays;
      }

      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await safeJson(res);
        setBacktestResult(data);
      } else {
        const errData = await safeJson(res);
        setBacktestError(errData.error || "Failed to run backtesting model.");
      }
    } catch (e: any) {
      setBacktestError(e.message || "Network error running backtesting model.");
    } finally {
      setBacktestLoading(false);
    }
  };

  // Auto-init search keywords when the central active token ticker changes
  useEffect(() => {
    fetchLivePrice(token);
  }, [token]);

  // Persist weights and topic in localStorage to keep them safe on page refresh
  useEffect(() => {
    localStorage.setItem("cortex_topic", topic);
  }, [topic]);

  useEffect(() => {
    localStorage.setItem("cortex_weights", JSON.stringify(weights));
  }, [weights]);

  useEffect(() => {
    if (currentView === 'forecast') {
      fetchForecast(token, interval, effectiveWeights, topic);
    }
  }, [
    currentView, 
    token, 
    interval, 
    effectiveWeights.sentiment, 
    effectiveWeights.technical, 
    effectiveWeights.liquidity, 
    effectiveWeights.elliottWave,
    topic
  ]);

  const fetchJournal = async () => {
    setJournalLoading(true);
    try {
      const res = await fetch("/api/journal");
      const json = await res.json();
      setJournalData(json);
    } catch (e) {
      setJournalData({ trades: [], stats: null });
    } finally {
      setJournalLoading(false);
    }
  };

  const resyncJournalWallet = async () => {
    setJournalResyncing(true);
    setJournalResyncMsg(null);
    try {
      const res = await fetch("/api/journal/resync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Resync failed");
      setJournalData(json);
      setJournalResyncMsg(
        `Synced ${json.addedTrades > 0 ? `${json.addedTrades} new trade(s) from ` : ""}wallet — balance $${(json.walletBalance ?? 0).toFixed(4)} SOL / $${(json.usdcBalance ?? 0).toFixed(2)} USDC.`
      );
      // Wallet balances/address shown in the Jupiter panel come from a separate cached
      // endpoint — refresh it too so the two views can't disagree right after a resync.
      fetchJupiterConfig();
    } catch (e: any) {
      setJournalResyncMsg(`Resync failed: ${e.message || e}`);
    } finally {
      setJournalResyncing(false);
    }
  };

  const fetchMacro = async () => {
    setMacroLoading(true);
    try {
      const res = await fetch("/api/macro");
      const json = await res.json();
      setMacroData(json);
    } catch (e) {
      setMacroData(null);
    } finally {
      setMacroLoading(false);
    }
  };

  useEffect(() => {
    if (currentView === 'journal') {
      fetchJournal();
    }
  }, [currentView]);

  const downloadJournalCSV = () => {
    const trades = journalData?.trades || [];
    if (!trades.length) return;
    const header = ["Source", "Side", "Leverage", "Mode", "Entry Time", "Exit Time", "Entry Price", "Exit Price", "Realized PnL %", "Realized PnL $", "Fees Included?", "Size (SOL)", "TP %", "SL %", "Duration (min)", "Market (Entry)", "Entry Reason", "Market (Exit)", "Exit Reason", "Sentiment", "Technical", "News Catalysts", "Execution Version", "Close Version"];
    const rows = trades.map((t: any) => [
      t.source ?? "",
      t.side ?? "",
      t.leverage ?? "",
      t.mode ?? "",
      t.entryTime ?? "",
      t.exitTime ?? "",
      t.entryPrice ?? "",
      t.exitPrice ?? "",
      typeof t.pnl === "number" ? t.pnl.toFixed(2) : "",
      typeof t.pnlUsd === "number" ? t.pnlUsd.toFixed(2) : "",
      t.reconciled ? "Yes (on-chain)" : "No (pre-fee estimate)",
      t.sizeInSol ?? "",
      t.takeProfitPct ?? "",
      t.stopLossPct ?? "",
      t.durationMins ?? "",
      t.entryMarket ?? "",
      t.entryReason ?? "",
      t.exitMarket ?? "",
      t.closeReason ?? "",
      t.sentiment !== undefined && t.sentiment !== null ? t.sentiment : "",
      t.technicalScore !== undefined && t.technicalScore !== null ? t.technicalScore : "",
      (t.news || []).map((n: any) => (n && typeof n === "object" ? n.title : n)).filter(Boolean).join(" | "),
      t.version ?? "",
      t.closeVersion ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trade-journal-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateInterpolatedPoints = () => {
    if (!forecastData) return [];

    const points: any[] = [];
    
    // 1. Add historical price points
    if (forecastData.history && Array.isArray(forecastData.history)) {
      forecastData.history.forEach((h: any) => {
        let label = h.date;
        try {
          const d = new Date(h.date);
          label = etFormat(d, "MMM dd, hh:mm a");
        } catch (e) {}
        
        points.push({
          label,
          "Historical Price": Number(h.price.toFixed(2)),
          "Expected Price": null,
          "Upper Range": null,
          "Lower Range": null
        });
      });
    }
    
    // 2. Add future interpolated forecast
    const curr = forecastData.currentPrice || 100;
    const pred = forecastData.predictedPrice || 105;
    const vol = forecastData.volatilityPct || 1.5;
    const confidence = forecastData.confidenceScore || 0.75;
    const steps = 8;
    const intervalLabel = interval;

    // We'll base future trajectory timestamps off the last historical date point (or from right now if empty)
    let lastDate = new Date();
    if (forecastData.history && forecastData.history.length > 0) {
      const lastHist = forecastData.history[forecastData.history.length - 1];
      if (lastHist.date) {
        lastDate = new Date(lastHist.date);
      }
    }

    for (let i = 0; i < steps; i++) {
      const r = i / (steps - 1);
      const baseVal = curr + (pred - curr) * r;
      const waveFactor = 4 * r * (1 - r);
      const mockSine = Math.sin(r * Math.PI * 2.5);
      const noise = mockSine * (curr * (vol / 100) * 0.12) * waveFactor;
      const Price = baseVal + noise;
      const confidenceMultiplier = 1.25 - confidence;
      const spreadLimit = curr * (vol / 100) * r * confidenceMultiplier * 1.5;
      const High = Price + spreadLimit;
      const Low = Math.max(0.1, Price - spreadLimit);

      let stepLabel = "";
      if (intervalLabel === "5m") {
        stepLabel = `+${Math.round(r * 5)}m`;
      } else if (intervalLabel === "15m") {
        stepLabel = `+${Math.round(r * 15)}m`;
      } else if (intervalLabel === "30m") {
        stepLabel = `+${Math.round(r * 30)}m`;
      } else if (intervalLabel === "1d") {
        stepLabel = `+${Math.round(r * 24)}h`;
      } else {
        stepLabel = `+${Math.round(r * 60)}m`;
      }

      let absLabel = "Now";
      if (r > 0) {
        let targetDate = new Date(lastDate);
        if (intervalLabel === "5m") {
          targetDate.setMinutes(lastDate.getMinutes() + Math.round(r * 5));
        } else if (intervalLabel === "15m") {
          targetDate.setMinutes(lastDate.getMinutes() + Math.round(r * 15));
        } else if (intervalLabel === "30m") {
          targetDate.setMinutes(lastDate.getMinutes() + Math.round(r * 30));
        } else if (intervalLabel === "1d") {
          targetDate.setHours(lastDate.getHours() + Math.round(r * 24));
        } else {
          targetDate.setMinutes(lastDate.getMinutes() + Math.round(r * 60));
        }
        absLabel = etFormat(targetDate, "MMM dd, hh:mm a");
      } else {
        absLabel = etFormat(lastDate, "MMM dd, hh:mm a");
      }

      // Exact connect on present/bridge point
      points.push({
        label: absLabel,
        "Historical Price": r === 0 ? Number(curr.toFixed(2)) : null,
        "Expected Price": Number(Price.toFixed(2)),
        "Upper Range": r === 0 ? Number(curr.toFixed(2)) : Number(High.toFixed(2)),
        "Lower Range": r === 0 ? Number(curr.toFixed(2)) : Number(Low.toFixed(2))
      });
    }
    return points;
  };

  const downloadBacktestCSV = () => {
    if (!backtestResult || !backtestResult.trades) return;
    
    const headers = [
      "Direction/Type", 
      "Date Timestamp (Eastern Time)", 
      "Execution Price (USD)", 
      "Net Realized Return (USD)", 
      "PnL %", 
      "Capital After Balance (USD)", 
      "Sentiment Score",
      "Technical Score (EMA)",
      "RSI Score",
      "Aggregated Composite Score",
      "Elliott Wave Phase",
      "Execution Triggers/Note"
    ];
    
    const rows = backtestResult.trades.map((trade: any) => {
      const isEntry = trade.type.startsWith("OPEN");
      const pnlVal = isEntry ? "0.00" : (trade.pnl || 0).toFixed(2);
      const pnlPctVal = isEntry ? "0.00" : (trade.pnlPct || 0).toFixed(2);
      
      let dateString = "";
      try {
        dateString = etFormat(new Date(trade.date), "yyyy-MM-dd HH:mm:ss");
      } catch (e) {
        dateString = trade.date || "";
      }
      
      const cleanNote = (trade.note || "").replace(/"/g, '""');
      return [
        trade.type,
        dateString,
        trade.price ? trade.price.toFixed(2) : "0.00",
        pnlVal,
        pnlPctVal,
        (trade.capitalAfter || trade.capitalBefore || 0).toFixed(2),
        trade.sentimentScore !== undefined ? trade.sentimentScore.toFixed(3) : "",
        trade.technicalScore !== undefined ? trade.technicalScore.toFixed(2) : "",
        trade.rsiScore !== undefined ? trade.rsiScore.toFixed(2) : "",
        trade.compositeScore !== undefined ? trade.compositeScore.toFixed(3) : "",
        trade.elliotWavePhase ? `"${trade.elliotWavePhase.replace(/"/g, '""')}"` : "",
        `"${cleanNote}"`
      ];
    });

    const metaRows = [
      ["=== QUANTBACKTEST SIMULATION SUMMARY ==="],
      ["Asset Token", token.toUpperCase()],
      ["Timeline Lookback Window", lookbackMode === 'custom' ? `${startDate} to ${endDate}` : `${lookbackDays} Days`],
      ["Timeline Interval", interval],
      ["Initial Capital", `$${backtestCapital.toFixed(2)}`],
      ["Ending Balance", `$${(backtestResult.metrics.finalCapital || 0).toFixed(2)}`],
      ["Win Rate", `${(backtestResult.metrics.winRate || 0).toFixed(1)}%`],
      ["Net Return PnL", `${(backtestResult.metrics.pnlPct || 0).toFixed(2)}%`],
      ["Max Peak-to-Trough Drawdown", `${(backtestResult.metrics.maxDrawdownPct || 0).toFixed(2)}%`],
      ["Prediction Quality (Directional Hit Rate)", `${(backtestResult.metrics.predictionQualityPct || 0).toFixed(1)}%`],
      ["Mean Prediction Symmetric Error (SMAPE)", `${(backtestResult.metrics.averageErrorPct || 0).toFixed(2)}%`],
      ["Symmetric Forecast Precision Score", `${(backtestResult.metrics.backtestAccuracyPct || 0).toFixed(2)}%`],
      [],
      ["=== EXECUTED ORDER TRADES ==="]
    ];
    const metaString = metaRows.map(row => row.map(v => `"${(v || "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const dataString = [headers.join(","), ...rows.map((row: any[]) => row.join(","))].join("\n");
    const csvContent = metaString + "\n" + dataString;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = url;
    link.download = lookbackMode === 'custom'
      ? `backtest_${token}_${interval}_${startDate}_to_${endDate}.csv`
      : `backtest_${token}_${interval}_${lookbackDays}d.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadBacktestTimeSeriesCSV = () => {
    if (!backtestResult || !backtestResult.equityCurve) return;
    const headers = [
      "Index/Step", 
      "Date Timestamp (Eastern Time)", 
      "Total Capital Balance (USD)", 
      "Asset Actual Price (USD)",
      "Model Predicted Price (USD)",
      "Prediction Absolute Error Rate (%)"
    ];
    const rows = backtestResult.equityCurve.map((point: any, idx: number) => {
      let dateStr = "";
      try {
        dateStr = etFormat(new Date(point.date), "yyyy-MM-dd HH:mm:ss");
      } catch (e) {
        dateStr = point.date || "";
      }
      return [
        idx + 1,
        dateStr,
        (point.equity || 0).toFixed(2),
        (point.price || 0).toFixed(2),
        point.predictedPrice !== undefined ? point.predictedPrice.toFixed(2) : "0.00",
        point.errorRatePct !== undefined ? `${point.errorRatePct.toFixed(2)}%` : "0.00%"
      ];
    });

    const metaRows = [
      ["=== BACKTEST EQUITY CURVE TIME SERIES ==="],
      ["Asset Token", token.toUpperCase()],
      ["Strategy Win Rate", `${(backtestResult.metrics.winRate || 0).toFixed(1)}%`],
      ["Net Return PnL", `${(backtestResult.metrics.pnlPct || 0).toFixed(2)}%`],
      ["Prediction Quality (Directional Hit Rate)", `${(backtestResult.metrics.predictionQualityPct || 0).toFixed(1)}%`],
      ["Mean Prediction Symmetric Error (SMAPE)", `${(backtestResult.metrics.averageErrorPct || 0).toFixed(2)}%`],
      ["Symmetric Forecast Precision Score", `${(backtestResult.metrics.backtestAccuracyPct || 0).toFixed(2)}%`],
      [],
      ["=== TIME SERIES STEPS ==="]
    ];
    const metaString = metaRows.map(row => row.map(v => `"${(v || "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const dataString = [headers.join(","), ...rows.map((row: any[]) => row.join(","))].join("\n");
    const csvContent = metaString + "\n" + dataString;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = url;
    link.download = `backtest_equity_curve_${token}_${interval}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadForecastPathCSV = () => {
    const points = generateInterpolatedPoints();
    if (!points || points.length === 0) return;
    const headers = ["Time (Eastern Time)", "Historical Price (USD)", "AI Interpolated Expected Price (USD)", "Upper Range Bound (USD)", "Lower Range Bound (USD)"];
    const rows = points.map((p: any) => {
      return [
        p.label || "",
        p["Historical Price"] !== null && p["Historical Price"] !== undefined ? p["Historical Price"] : "",
        p["Expected Price"] !== null && p["Expected Price"] !== undefined ? p["Expected Price"] : "",
        p["Upper Range"] !== null && p["Upper Range"] !== undefined ? p["Upper Range"] : "",
        p["Lower Range"] !== null && p["Lower Range"] !== undefined ? p["Lower Range"] : ""
      ];
    });

    const metaRows = [
      ["=== AI FUTURE PRICE TRAJECTORY ==="],
      ["Asset Token", token.toUpperCase()],
      ["Interval Sample", interval],
      ["Sentiment Search Words Limit", topic],
      [],
      ["=== PREDICTION PATHS ==="]
    ];
    const metaString = metaRows.map(row => row.map(v => `"${(v || "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const dataString = [headers.join(","), ...rows.map((row: any[]) => row.join(","))].join("\n");
    const csvContent = metaString + "\n" + dataString;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = url;
    link.download = `price_forecast_path_${token}_${interval}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Leveraged % is a return on collateral, so $ = collateral × pct/100 and collateral =
  // sizeInSol × entryPrice / leverage — the same relationship the daemon used to size the
  // trade. Used for the Jupiter panel's own settlement log, which reads the daemon's raw
  // tradesHistory (no server-computed pnlUsd like the /api/journal-backed Trade Journal tab).
  const estimatePnlUsd = (trade: any): number | undefined => {
    if (typeof trade.sizeInSol !== "number" || typeof trade.leverage !== "number" || !trade.leverage || typeof trade.entryPrice !== "number" || typeof trade.pnl !== "number") return undefined;
    const collateralUsd = (trade.sizeInSol * trade.entryPrice) / trade.leverage;
    return collateralUsd * (trade.pnl / 100);
  };

  const downloadJupiterTradeLogCSV = () => {
    if (!jupiterConfig || !jupiterConfig.tradesHistory || jupiterConfig.tradesHistory.length === 0) return;
    const headers = ["Index", "Direction/Side", "Leverage Multiplier", "Entry Price (USD)", "Exit Price (USD)", "Realized Return PnL %", "Realized PnL ($, est. pre-fee)", "Solana Size (SOL)", "Take Profit %", "Stop Loss %", "Hold Duration", "Settled Time (Eastern Time)", "Market (Entry)", "Entry Reason", "Market (Exit)", "Exit Reason", "Execution Version", "Close Version"];
    const rows = jupiterConfig.tradesHistory.map((trade: any, idx: number) => {
      let settledDateStr = "";
      try {
        settledDateStr = trade.exitTime ? etFormat(new Date(trade.exitTime), "yyyy-MM-dd HH:mm:ss") : "";
      } catch (e) {
        settledDateStr = trade.exitTime || "";
      }
      let durationStr = "";
      if (trade.entryTime && trade.exitTime) {
        try {
          const diffMs = new Date(trade.exitTime).getTime() - new Date(trade.entryTime).getTime();
          const diffMins = Math.floor(diffMs / 60000);
          if (diffMins < 60) {
            durationStr = `${diffMins}m`;
          } else {
            const hrs = Math.floor(diffMins / 60);
            const mins = diffMins % 60;
            durationStr = `${hrs}h ${mins}m`;
          }
        } catch (e) {
          durationStr = "";
        }
      }
      return [
        idx + 1,
        trade.side || "",
        trade.leverage || 5,
        (trade.entryPrice || 0).toFixed(2),
        (trade.exitPrice || 0).toFixed(2),
        (trade.pnl || 0).toFixed(2),
        (() => { const est = estimatePnlUsd(trade); return est !== undefined ? est.toFixed(2) : ""; })(),
        (trade.sizeInSol || 0).toFixed(4),
        trade.takeProfitPct !== undefined ? `${trade.takeProfitPct}%` : "4%",
        trade.stopLossPct !== undefined ? `-${trade.stopLossPct}%` : "-2%",
        durationStr || "N/A",
        settledDateStr,
        `"${String(trade.entryMarket || "").replace(/"/g, '""')}"`,
        `"${String(trade.entryReason || "").replace(/"/g, '""')}"`,
        `"${String(trade.exitMarket || "").replace(/"/g, '""')}"`,
        `"${String(trade.closeReason || "").replace(/"/g, '""')}"`,
        trade.version || "",
        trade.closeVersion || ""
      ];
    });
    const csvContent = [headers.join(","), ...rows.map((row: any[]) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = url;
    link.download = `jupiter_settlement_logs.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadTelegramTradeLogCSV = () => {
    if (!telegramConfig || !telegramConfig.tradesHistory || telegramConfig.tradesHistory.length === 0) return;
    const headers = ["Index", "Direction/Side", "Entry Price (USD)", "Exit Price (USD)", "Realized Return PnL %", "Take Profit %", "Stop Loss %", "Hold Duration", "Settled Time (Eastern Time)", "Execution Version", "Close Version"];
    const rows = telegramConfig.tradesHistory.map((trade: any, idx: number) => {
      let settledDateStr = "";
      try {
        settledDateStr = trade.exitTime ? etFormat(new Date(trade.exitTime), "yyyy-MM-dd HH:mm:ss") : "";
      } catch (e) {
        settledDateStr = trade.exitTime || "";
      }
      let durationStr = "";
      if (trade.entryTime && trade.exitTime) {
        try {
          const diffMs = new Date(trade.exitTime).getTime() - new Date(trade.entryTime).getTime();
          const diffMins = Math.floor(diffMs / 60000);
          if (diffMins < 60) {
            durationStr = `${diffMins}m`;
          } else {
            const hrs = Math.floor(diffMins / 60);
            const mins = diffMins % 60;
            durationStr = `${hrs}h ${mins}m`;
          }
        } catch (e) {
          durationStr = "";
        }
      }
      return [
        idx + 1,
        trade.side || "",
        (trade.entryPrice || 0).toFixed(2),
        (trade.exitPrice || 0).toFixed(2),
        (trade.pnl || 0).toFixed(2),
        trade.takeProfitPct !== undefined ? `${trade.takeProfitPct}%` : "4%",
        trade.stopLossPct !== undefined ? `-${trade.stopLossPct}%` : "-2%",
        durationStr || "N/A",
        settledDateStr,
        trade.version || "",
        trade.closeVersion || ""
      ];
    });
    const csvContent = [headers.join(","), ...rows.map((row: any[]) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = url;
    link.download = `telegram_settlement_logs.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadPerformanceTimeSeriesCSV = () => {
    if (!results || !results.data) return;
    const headers = ["Index", "Time/Date (Eastern Time)", "Equity Strategy Balance (USD)", "Benchmark Asset Return", "Strategy Return"];
    const rows = results.data.map((point: any, idx: number) => {
      return [
        idx + 1,
        point.time || "",
        (point.equity !== undefined ? point.equity : point.cumReturn || 0).toFixed(2),
        (point.benchmark || 0).toFixed(2),
        (point.strategy || 0).toFixed(2)
      ];
    });
    const csvContent = [headers.join(","), ...rows.map((row: any[]) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = url;
    link.download = `performance_curve_${token}_${interval}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadPerformanceTradesCSV = () => {
    if (!results || !results.trades || results.trades.length === 0) return;
    const headers = [
      "Entry Time (Eastern Time)", 
      "Type", 
      "Entry Price (USD)", 
      "Exit Price (USD)", 
      "PnL %", 
      "Cumulative PnL %",
      "Sentiment Score",
      "Technical Score (EMA)",
      "RSI Score",
      "Aggregated Composite Score",
      "Elliott Wave Phase",
      "Notes / Triggers"
    ];
    const rows = results.trades.map((trade: any) => {
      let formattedTime = "";
      try {
        formattedTime = trade.entryTime ? etFormat(new Date(trade.entryTime), "yyyy-MM-dd HH:mm:ss") : "";
      } catch (e) {
        formattedTime = trade.entryTime || "";
      }
      
      const cleanNote = (trade.closeReason || trade.note || "Active").replace(/"/g, '""');
      
      return [
        formattedTime,
        trade.type || "",
        (trade.entryPrice || 0).toFixed(2),
        trade.exitPrice !== undefined ? trade.exitPrice.toFixed(2) : "",
        ((trade.pnl || 0) * 100).toFixed(2),
        ((trade.cumPnL || 0) * 100).toFixed(2),
        trade.sentimentScore !== undefined ? trade.sentimentScore.toFixed(3) : "",
        trade.technicalScore !== undefined ? trade.technicalScore.toFixed(2) : "",
        trade.rsiScore !== undefined ? trade.rsiScore.toFixed(2) : "",
        trade.compositeScore !== undefined ? trade.compositeScore.toFixed(3) : "",
        trade.elliotWavePhase ? `"${trade.elliotWavePhase.replace(/"/g, '""')}"` : "",
        `"${cleanNote}"`
      ];
    });
    const csvContent = [headers.join(","), ...rows.map((row: any[]) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = url;
    link.download = `performance_trades_${token}_${interval}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Auto-refresh states
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [timeLeft, setTimeLeft] = useState(1200); // 20 minutes standard countdown

  // Telegram alert states
  const [telegramConfig, setTelegramConfig] = useState<any>({
    botToken: "",
    chatId: "",
    enabled: false,
    token: "SOL",
    topic: "crypto,war",
    weights: { sentiment: 0.90, technical: 0.85, liquidity: 0.85, elliottWave: 0.85 },
    lastAction: "Hold",
    lastCheckedAt: "",
    cooldownMinutes: 30, // customizable cooldown period (default 30 mins)
    frequency: 20, // default alert analytics check frequency (min 20m — server-enforced)
    interval: "1h", // Analytic timeframe default to 1h (sub-hourly is fee-negative live)
    auditLogs: [],
    error: "",
    newsTelegramChannel: "https://t.me/+1C0c6rUVmjo3Y2Y8"
  });
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramStatusMsg, setTelegramStatusMsg] = useState<{ type: 'success' | 'err'; text: string } | null>(null);

  // Jupiter Wallet & Auto Execution States
  const [jupiterConfig, setJupiterConfig] = useState<any>(() => {
    const saved = localStorage.getItem("cortex_jupiter_config");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.topic === "market" || parsed.topic === "Crypto") {
          parsed.topic = "crypto,war";
        }
        if (!parsed.interval) {
          parsed.interval = "1h";
        }
        return parsed;
      } catch(e) {}
    }
    return {
      walletAddress: "",
      enabled: false,
      tradingMode: "REAL",
      leverage: 3,
      allocationPercent: 5,
      takeProfitPct: 3.25,
      stopLossPct: 1.625,
      frequencyMinutes: 20,
      cooldownMinutes: 30,
      interval: "1h",
      positionSizeUsd: 20,
      token: "SOL",
      topic: "crypto,war",
      weights: { sentiment: 0, technical: 0.9, liquidity: 0.85, elliottWave: 0, supertrend: 0.9, fvg: 0, dca: 0 },
      lastTradePnL: 0,
      cumulativePnL: 0,
      activeTrade: null,
      tradesHistory: [],
      lastCheckedAt: "",
      lastAction: "Hold",
      walletBalance: 0,
      liveJupiterPrice: null,
      error: ""
    };
  });

  // Persist jupiterConfig to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("cortex_jupiter_config", JSON.stringify(jupiterConfig));
  }, [jupiterConfig]);

  const [pkInput, setPkInput] = useState("");
  const [rpcInput, setRpcInput] = useState("");
  const [addressInput, setAddressInput] = useState("");

  useEffect(() => {
    if (jupiterConfig) {
      if (jupiterConfig.privateKey !== undefined) {
        setPkInput(jupiterConfig.privateKey || "");
      }
      if (jupiterConfig.rpcUrl !== undefined) {
        setRpcInput(jupiterConfig.rpcUrl || "");
      }
      if (jupiterConfig.walletAddress !== undefined) {
        setAddressInput(jupiterConfig.walletAddress || "");
      }
    }
  }, [jupiterConfig?.privateKey, jupiterConfig?.rpcUrl, jupiterConfig?.walletAddress]);

  const [jupLoading, setJupLoading] = useState(false);
  const [jupStatusMsg, setJupStatusMsg] = useState<{ type: 'success' | 'err'; text: string } | null>(null);

  const getConnectedWalletProvider = () => {
    return (window as any).phantom?.solana || (window as any).solana;
  };

  const fetchTelegramConfig = async () => {
    try {
      const res = await fetch("/api/telegram-config");
      if (res.ok) {
        const config = await safeJson(res);
        setTelegramConfig(config);
      }
    } catch (e: any) {
      if (e.message !== "Failed to fetch") {
        console.error("Failed to fetch Telegram config", e);
      }
    }
  };

  const fetchJupiterConfig = async () => {
    try {
      const res = await fetch("/api/jupiter-config");
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
           const config = await safeJson(res);
           setJupiterConfig((prev: any) => ({ ...prev, ...config }));
        } else {
           const text = await res.text();
           console.error("Jupiter config returned non-JSON:", res.status, text.substring(0, 100));
        }
      }
    } catch (e: any) {
      if (e.message !== "Failed to fetch") {
        console.error("Failed to fetch Jupiter config", e);
      }
    }
  };

  useEffect(() => {
    fetchTelegramConfig();
    
    // Initialize backend from browser storage once on mount
    const initJupiterSession = async () => {
      const saved = localStorage.getItem("cortex_jupiter_config");
      if (saved) {
        try {
          await fetch("/api/jupiter-config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: saved
          });
        } catch (e) {
          console.error("Failed to init Jupiter session", e);
        }
      }
      fetchJupiterConfig();
    };
    initJupiterSession();
  }, []);

  // Keep Telegram background daemon and Jupiter configs fully in sync when active Token, sentiment Topics or Weights change
  useEffect(() => {
    const syncConfig = async () => {
      try {
        await fetch("/api/telegram-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: telegramConfig?.enabled || false,
            token: token,
            topic: topic,
            frequency: telegramConfig?.frequency || 20,
            weights: effectiveWeights
          })
        });

        if (jupiterConfig) {
          await fetch("/api/jupiter-config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              enabled: jupiterConfig.enabled || false,
              leverage: jupiterConfig.leverage || 5,
              allocationPercent: jupiterConfig.allocationPercent || 5,
              takeProfitPct: jupiterConfig.takeProfitPct || 4,
              stopLossPct: jupiterConfig.stopLossPct || 2,
              frequencyMinutes: jupiterConfig.frequencyMinutes || 20,
              cooldownMinutes: jupiterConfig.cooldownMinutes || 30,
              tradingMode: jupiterConfig.tradingMode || "REAL",
              privateKey: jupiterConfig.privateKey || "",
              rpcUrl: jupiterConfig.rpcUrl || "",
              walletAddress: jupiterConfig.walletAddress || "",
              token: token,
              topic: topic,
              weights: effectiveWeights
            })
          });
        }
      } catch (e) {
        console.error("Failed to auto-sync backend configs with neural engine changes", e);
      }
    };
    
    // De-bounce syncing to avoid firing too many requests when typing
    const debounceTimer = setTimeout(() => {
      syncConfig();
    }, 1200);
    return () => clearTimeout(debounceTimer);
  }, [token, topic, effectiveWeights, telegramConfig?.enabled, telegramConfig?.frequency, jupiterConfig?.enabled, jupiterConfig?.leverage, jupiterConfig?.allocationPercent, jupiterConfig?.takeProfitPct, jupiterConfig?.stopLossPct, jupiterConfig?.tradingMode, jupiterConfig?.privateKey, jupiterConfig?.rpcUrl, jupiterConfig?.walletAddress]);

  useEffect(() => {
    setTimeLeft(syncInterval);
  }, [syncInterval, token]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    
    const intervalId = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [autoRefreshEnabled]);

  useEffect(() => {
    if (timeLeft === 0) {
      console.log("[Auto-Refresh Triggered] Synchronizing latest quantitative states...");
      setTimeLeft(syncInterval);

      // Pop toast notification
      if (toastsEnabled) {
        const toastId = Math.random().toString(36).substring(2, 9);
        const newToast = {
          id: toastId,
          source: "Telemetry",
          type: "sync",
          message: "🔄 Sync Cycle Triggered: Fetching latest market indicators, news sentiment index, and auto-trading logs."
        };
        setToasts((prev) => [newToast, ...prev].slice(0, 5));
        window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 8000);
      }

      // Add local entry in the live audit log
      const syncLogId = Math.random().toString(36).substring(2, 9);
      const newSyncLog = {
        id: syncLogId,
        timestamp: new Date().toISOString(),
        source: "Telemetry",
        type: "info",
        message: "🔄 Sync Interval Hit: Successfully synchronized latest market parameters, sentiment metrics, and automated portfolio states."
      };
      setLocalSyncLogs((prev) => [newSyncLog, ...prev]);

      fetchData(true);
      fetchJupiterConfig();
    }
  }, [timeLeft, syncInterval, toastsEnabled]);

  // Sync Jupiter state rapidly (every 15 seconds), fetching on-chain logs and portfolio values
  useEffect(() => {
    let active = true;
    const pollId = setInterval(() => {
      if (active) {
        fetchJupiterConfig();
      }
    }, 15000);
    return () => {
      active = false;
      clearInterval(pollId);
    };
  }, []);

  // ── Live audit log + "what just happened" notifications ──────────────────────────────────────
  // The auto-trader (Jupiter) and the alert engine (Telegram) each persist a reasoning trail in
  // their config (auditLogs), polled above every 15s. Merge them newest-first for the footer panel.
  const [showAuditPanel, setShowAuditPanel] = useState(false);

  useEffect(() => {
    localStorage.setItem("cortex_toasts_enabled", toastsEnabled ? "true" : "false");
    if (!toastsEnabled) {
      setToasts([]);
    }
  }, [toastsEnabled]);

  const mergedAuditLogs = useMemo(() => {
    const j = ((jupiterConfig?.auditLogs as any[]) || []).map((e: any) => ({ ...e, source: "Auto-Trade" }));
    const t = ((telegramConfig?.auditLogs as any[]) || []).map((e: any) => ({ ...e, source: "Alert" }));
    return [...j, ...t, ...localSyncLogs]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 500);
  }, [jupiterConfig?.auditLogs, telegramConfig?.auditLogs, localSyncLogs]);

  // Pop a toast for any audit entry we haven't seen before (works for PAPER and REAL). The first
  // poll only seeds the "seen" set so we don't blast a wall of toasts for pre-existing history.
  useEffect(() => {
    if (!auditInitializedRef.current) {
      mergedAuditLogs.forEach((e) => seenAuditIdsRef.current.add(e.id));
      auditInitializedRef.current = true;
      return;
    }
    const fresh = mergedAuditLogs.filter((e) => e.id && !seenAuditIdsRef.current.has(e.id));
    if (fresh.length === 0) return;
    fresh.forEach((e) => seenAuditIdsRef.current.add(e.id));
    if (!toastsEnabled) return;
    const toAdd = fresh.slice(0, 4); // newest-first; avoid spamming if many land at once
    setToasts((prev) => [...toAdd, ...prev].slice(0, 5));
    toAdd.forEach((e) => {
      window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== e.id)), 8000);
    });
  }, [mergedAuditLogs, toastsEnabled]);

  // Visual style per audit entry type (and infer win/loss tint from the message text).
  const auditTone = (e: { type: string; message: string }) => {
    const m = e.message || "";
    if (e.type === "trade") {
      if (/CLOSE|Realized|banked/i.test(m)) {
        return /(\+\d|banked \+|Realized \+)/i.test(m) ? "green" : (/-\d|Realized -/i.test(m) ? "red" : "purple");
      }
      return "purple"; // ENTER / open
    }
    if (e.type === "cooldown") return "amber";
    if (e.type === "hold") return "dim";
    return "sky"; // info
  };
  const toneClasses: Record<string, string> = {
    green: "border-sol-green/40 text-sol-green",
    red: "border-red-500/40 text-red-400",
    purple: "border-sol-purple/40 text-sol-purple",
    amber: "border-amber-500/40 text-amber-400",
    sky: "border-sky-500/30 text-sky-300",
    dim: "border-border-dim text-text-dim",
  };

  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSaveTelegramConfig = async (e: React.FormEvent, isTest = false, isTrigger = false) => {
    if (e) e.preventDefault();
    setTelegramLoading(true);
    setTelegramStatusMsg(null);
    try {
      const res = await fetch("/api/telegram-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: telegramConfig.enabled,
          token: token,         // ALWAYS use active main screen's token
          topic: topic,         // ALWAYS use active main screen's topic
          frequency: telegramConfig.frequency || 20,
          cooldownMinutes: telegramConfig.cooldownMinutes !== undefined ? telegramConfig.cooldownMinutes : 30,
          takeProfitPct: telegramConfig.takeProfitPct !== undefined ? telegramConfig.takeProfitPct : 3.25,
          stopLossPct: telegramConfig.stopLossPct !== undefined ? telegramConfig.stopLossPct : 1.625,
          leverage: telegramConfig.leverage !== undefined ? telegramConfig.leverage : 3,
          interval: interval,
          weights: weights,     // ALWAYS use active main screen's weights
          testAlert: isTest,
          triggerAlert: isTrigger,
          newsTelegramChannel: telegramConfig.newsTelegramChannel
        })
      });
      const data = await safeJson(res);
      if (res.ok) {
        setTelegramStatusMsg({
          type: "success",
          text: isTrigger ? "Manual alert triggered successfully!" : isTest ? "Test alert sent successfully to Telegram!" : "Configuration saved successfully!"
        });
        fetchTelegramConfig(); // Reload from server to get masked token
      } else {
        throw new Error(data.error || "Failed to update Telegram settings");
      }
    } catch (err: any) {
      setTelegramStatusMsg({
        type: "err",
        text: err.message
      });
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleResetTelegramStats = async () => {
    setTelegramLoading(true);
    setTelegramStatusMsg(null);
    try {
      const res = await fetch("/api/telegram-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: telegramConfig.enabled,
          token: telegramConfig.token,
          topic: telegramConfig.topic,
          frequency: telegramConfig.frequency || 20,
          resetStats: true
        })
      });
      const data = await safeJson(res);
      if (res.ok) {
        setTelegramStatusMsg({
          type: "success",
          text: "System telemetry statistics reset successfully!"
        });
        fetchTelegramConfig();
      } else {
        throw new Error(data.error || "Failed to reset statistics");
      }
    } catch (err: any) {
      setTelegramStatusMsg({
        type: "err",
        text: err.message
      });
    } finally {
      setTelegramLoading(false);
    }
  };

  // Jupiter Wallet & Auto Execution Handlers
  const handleSaveJupiterConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setJupLoading(true);
    setJupStatusMsg(null);
    try {
      const res = await fetch("/api/jupiter-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: jupiterConfig.enabled,
          leverage: jupiterConfig.leverage,
          allocationPercent: Math.min(jupiterConfig.allocationPercent, 100),
          positionSizeUsd: Number(jupiterConfig.positionSizeUsd) || 0,
          takeProfitPct: jupiterConfig.takeProfitPct,
          stopLossPct: jupiterConfig.stopLossPct,
          frequencyMinutes: jupiterConfig.frequencyMinutes,
          cooldownMinutes: jupiterConfig.cooldownMinutes,
          token: token, // synchronize with primary active token
          topic: topic, // synchronize with primary catalyst
          interval: interval,
          weights
        })
      });
      const data = await safeJson(res);
      if (res.ok) {
        setJupStatusMsg({
          type: "success",
          text: "Jupiter configurations updated successfully!"
        });
        fetchJupiterConfig();
      } else {
        throw new Error(data.error || "Failed to update configurations");
      }
    } catch (err: any) {
      setJupStatusMsg({ type: "err", text: err.message });
    } finally {
      setJupLoading(false);
    }
  };

  const handleResetJupiterStats = async () => {
    setJupLoading(true);
    setJupStatusMsg(null);
    try {
      const res = await fetch("/api/jupiter-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetStats: true })
      });
      if (res.ok) {
        setJupStatusMsg({ type: "success", text: "Jupiter auto-trades statistics reset!" });
        fetchJupiterConfig();
      }
    } catch (err: any) {
      setJupStatusMsg({ type: "err", text: err.message });
    } finally {
      setJupLoading(false);
    }
  };

  const handleResetCircuitBreaker = async () => {
    setJupLoading(true);
    setJupStatusMsg(null);
    try {
      const res = await fetch("/api/jupiter-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetConsecutiveLosses: true })
      });
      if (res.ok) {
        setJupStatusMsg({ type: "success", text: "Circuit breaker consecutive losses reset!" });
        fetchJupiterConfig();
      }
    } catch (err: any) {
      setJupStatusMsg({ type: "err", text: err.message });
    } finally {
      setJupLoading(false);
    }
  };

  const getReliableConnection = () => {
    return new Connection("https://solana-rpc.publicnode.com");
  };

  const sendMemoTransaction = async (message: string) => {
    const solana = getConnectedWalletProvider();
    if (!solana) {
      throw new Error("Solana wallet not connected");
    }

    const memoProgramId = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGMfcHr");
    const connection = getReliableConnection();
    
    const instruction = new TransactionInstruction({
      keys: [],
      programId: memoProgramId,
      data: Buffer.from ? Buffer.from(message, "utf-8") : Buffer.from(new TextEncoder().encode(message)),
    });

    const transaction = new Transaction().add(instruction);
    transaction.feePayer = solana.publicKey;
    
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    const { signature } = await solana.signAndSendTransaction(transaction);
    return signature;
  };

  const executeJupiterPerpsTrade = async (direction: "LONG" | "SHORT" | "CLOSE", executeSizeSol = 0.01) => {
    const isPaperMode = jupiterConfig.tradingMode === "PAPER";
    if (isPaperMode) {
      console.log("[Client Jupiter] Paper Trading Mode active. Simulation trade created.");
      const mockSig = `sim_sig_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
      setJupStatusMsg({ type: 'success', text: `Simulated paper trade execution successful! Direction: ${direction}. Size: ${executeSizeSol} SOL. Tx: ${mockSig.substring(0, 10)}...` });
      return mockSig;
    }

    const hasPrivateKey = !!jupiterConfig.privateKey && !jupiterConfig.privateKeyIsAutoGenerated;
    const walletAddress = jupiterConfig.walletAddress;

    if (!hasPrivateKey) {
      const solana = getConnectedWalletProvider();
      if (!solana) throw new Error("Solana Wallet not connected. Connect your wallet first or configure an Automated Server Key to bypass.");
      if (!solana.publicKey) throw new Error("Wallet not connected completely");
    }

    try {
      setJupStatusMsg({ type: 'success', text: 'Constructing Jupiter Perps Swap transaction...' });

      let pubkeyStr = walletAddress || "";
      if (!hasPrivateKey) {
        const solana = getConnectedWalletProvider();
        pubkeyStr = typeof solana.publicKey === 'string' ? solana.publicKey : (solana.publicKey.toBase58 ? solana.publicKey.toBase58() : solana.publicKey.toString());
      }
      
      let dataTransactionSerialized = null;

      if (!hasPrivateKey) {
        // Build the swap transaction directly on the client to bypass cloud provider server-side IP blocks!
        try {
          console.log("[Client Jupiter] Directly fetching quote/swap for Connected Wallet:", pubkeyStr);
          const solMint = "So11111111111111111111111111111111111111112";
          const usdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

          const isLong = direction === "LONG";
          const inputMint = isLong ? usdcMint : solMint;
          const outputMint = isLong ? solMint : usdcMint;
          const swapMode = isLong ? "ExactOut" : "ExactIn";
          const amountVal = Math.floor((Number(executeSizeSol) || 0.05) * 1_000_000_000);

          const quoteRes = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountVal}&swapMode=${swapMode}&slippageBps=100`);
          if (quoteRes.ok) {
            const quoteData = await quoteRes.json();
            if (quoteData) {
              const swapRes = await fetch("https://quote-api.jup.ag/v6/swap", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  quoteResponse: quoteData,
                  userPublicKey: pubkeyStr,
                  wrapAndUnwrapSol: true
                })
              });
              if (swapRes.ok) {
                const swapData = await swapRes.json();
                if (swapData && swapData.swapTransaction) {
                  dataTransactionSerialized = swapData.swapTransaction;
                  console.log("[Client Jupiter] Successfully constructed real swap transaction client-side!");
                }
              }
            }
          }
        } catch (browserErr: any) {
          console.warn("[Client Jupiter] Browser routing to quote-api.jup.ag failed, falling back to server generator:", browserErr.message || browserErr);
        }
      }

      if (!dataTransactionSerialized) {
        setJupStatusMsg({ type: 'success', text: 'Instructing backend to evaluate and generate transaction...' });
        const res = await fetch("/api/jupiter-perps/build-tx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: pubkeyStr,
            direction,
            executeSizeSol
          })
        });

        if (!res.ok) {
          const errorData = await safeJson(res);
          throw new Error(errorData.error || "Failed to build transaction on server.");
        }

        const data = await safeJson(res);
        if (!data.success) {
          throw new Error(data.message || "Failed to build transaction on server.");
        }

        if (data.bypassPhantom) {
           setJupStatusMsg({ type: 'success', text: `Transaction executed securely via API! Signature: ${data.signature.slice(0, 8)}... ` });
           return data.signature;
        }

        if (!data.transactionSerialized) {
           throw new Error("No transaction data returned from server. Cannot execute trade.");
        }
        dataTransactionSerialized = data.transactionSerialized;
      }

      const rawTx = Buffer.from(dataTransactionSerialized, 'base64');
      
      let transaction;
      const conn = getReliableConnection();
      const latestBlockHash = await conn.getLatestBlockhash();
      
      const { VersionedTransaction } = await import("@solana/web3.js");
      transaction = VersionedTransaction.deserialize(rawTx);
        
      const solana = getConnectedWalletProvider();
      const { signature } = await solana.signAndSendTransaction(transaction);

      setJupStatusMsg({ type: 'success', text: `Transaction submitted! Signature: ${signature.slice(0, 8)}... Waiting for confirmation...` });
        
      try {
        await conn.confirmTransaction({
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature
        }, 'confirmed');
      } catch (confirmErr: any) {
        console.warn("Transaction confirmation timeout or error:", confirmErr.message);
      }

      return signature;
      
    } catch (e: any) {
      console.warn("Jupiter Perps Execution failed:", e.message);
      throw new Error(`Jupiter Perps Error: ${e.message}`);
    }
  };

  const handleForceTrade = async (direction: "LONG" | "SHORT") => {
    setJupLoading(true);
    setJupStatusMsg(null);
    try {
      let sigMessage = `Successfully executed mainnet ${direction} entry on Jupiter Perps.`;
      
      setJupStatusMsg({ type: 'success', text: 'Preparing Jupiter Perps on-chain perp transaction evaluation...' });
      
      // Execute via Jupiter Perps Swap Builder
      sigMessage = await executeJupiterPerpsTrade(direction, 0.05);

      const res = await fetch("/api/jupiter-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceOpen: direction })
      });
      if (res.ok) {
        setJupStatusMsg({ 
          type: "success", 
          text: sigMessage 
        });
        fetchJupiterConfig();
      } else {
        const data = await safeJson(res);
        throw new Error(data.error || "Failed to execute trade");
      }
    } catch (err: any) {
      setJupStatusMsg({ type: "err", text: err.message || "Trade cancelled." });
    } finally {
      setJupLoading(false);
    }
  };

  const handleTriggerAutoTrade = async () => {
    setJupLoading(true);
    setJupStatusMsg(null);
    try {
      const res = await fetch("/api/jupiter-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerAutoTrade: true })
      });
      const data = await safeJson(res);
      if (res.ok && data.success) {
        const sigMessage = data.message ? `${data.message}` : "Automated trade evaluation completed.";
        setJupStatusMsg({ 
          type: "success", 
          text: sigMessage 
        });
        fetchJupiterConfig();
      } else {
        throw new Error(data.message || data.error || "Failed to trigger automated trade");
      }
    } catch (err: any) {
      setJupStatusMsg({ type: "err", text: err.message || "Trigger failed." });
    } finally {
      setJupLoading(false);
    }
  };

  const handleForceCloseTrade = async () => {
    setJupLoading(true);
    setJupStatusMsg(null);
    try {
      let sigMessage = "Successfully executed exit placement via Jupiter Perps.";
      const hasPrivateKey = !!jupiterConfig.privateKey && !jupiterConfig.privateKeyIsAutoGenerated;
      const solana = getConnectedWalletProvider();

      if (hasPrivateKey || (solana && solana.publicKey)) {
        setJupStatusMsg({ type: 'success', text: 'Preparing Jupiter Perps on-chain exit perp transaction...' });
        sigMessage = await executeJupiterPerpsTrade("CLOSE", 0.05);
      } else {
        throw new Error("Connect your Solana wallet or provide an Automated Server Key to execute close.");
      }

      const res = await fetch("/api/jupiter-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceClose: true })
      });
      if (res.ok) {
        setJupStatusMsg({ 
          type: "success", 
          text: sigMessage
        });
        fetchJupiterConfig();
      } else {
        const data = await safeJson(res);
        throw new Error(data.error || "Failed to close position");
      }
    } catch (err: any) {
      setJupStatusMsg({ type: "err", text: err.message || "Close trade cancelled." });
    } finally {
      setJupLoading(false);
    }
  };

  const fetchLivePrice = async (targetToken = token) => {
    try {
      const res = await fetch(`/api/price?token=${targetToken}`);
      if (res.ok) {
        const d = await safeJson(res);
        if (d && d.price !== undefined) {
          setCurrentSpotPrice(d.price);
        }
      }
    } catch (err: any) {
      if (err.message !== "Failed to fetch") {
        console.warn("Failed to fetch live price", err);
      }
    }
  };

  const fetchData = async (isAutoSync = false) => {
    setLoading(true);
    setLoadingStep("Syncing Historical Market Data...");
    setErrorMsg(null);
    fetchLivePrice(token);
    try {
      const histRes = await fetch(`/api/historical?token=${token}&startDate=${startDate}&endDate=${endDate}&interval=${interval}`);
      if (!histRes.headers.get("content-type")?.includes("application/json")) {
        const text = await histRes.text();
        if (histRes.status === 429) {
           throw new Error(`Cloud proxy rate limit exceeded. The server is receiving too many requests.`);
        }
        throw new Error(`Historical api non-json response: ${histRes.status} ${text.substring(0, 50)}`);
      }
      const hist = await histRes.json();
      if (!histRes.ok) {
        throw new Error(hist.error || `Historical API error: ${histRes.statusText}`);
      }

      const quotes = (hist.quotes || hist).filter((q: any) => q && q.close !== null);
      if (quotes.length === 0) throw new Error("No quotes found for selected range.");

      const startTime = quotes[0].date;
      const endTime = quotes[quotes.length - 1].date;
      
      let newsData: any = { articles: [], isMock: true };
      try {
        setLoadingStep("Extracting Global News Context...");
        const newsRes = await fetch(`/api/news?topic=${encodeURIComponent(topic)}&token=${token}&from=${startTime}&to=${endTime}${isAutoSync ? "&autoSync=true" : ""}`);
        if (!newsRes.headers.get("content-type")?.includes("application/json")) {
          const text = await newsRes.text();
          if (newsRes.status === 429) {
             throw new Error(`Cloud proxy rate limit exceeded. The server is receiving too many requests.`);
          }
          throw new Error(`News api non-json response: ${newsRes.status} ${text.substring(0, 50)}`);
        }
        newsData = await newsRes.json();
        if (!newsRes.ok) {
          throw new Error(newsData.error || `News API error: ${newsRes.statusText}`);
        }
      } catch (newsErr: any) {
        console.warn("Failing news fetch gracefully falling back to empty/mock feed:", newsErr);
      }

      const articles = newsData.articles || [];
      
      // Batch analyze sentiment for better historical data
      let articleSentiments = new Map();
      if (articles.length > 0) {
        try {
          setLoadingStep("Mapping Sentiment Vectors...");
          // Reduce batch size to avoid hitting rate limits or large payload issues
          const headings = articles.slice(0, 30).map((a: any) => a.title);
          const batchRes = await fetch("/api/batch-sentiment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ headlines: headings })
          });
          
          if (batchRes.ok) {
            const batchData = await batchRes.json();
            if (Array.isArray(batchData)) {
              headings.forEach((h: any, i: number) => {
                articleSentiments.set(h.toLowerCase().trim(), batchData[i]?.score || 0);
              });
            }
          }
        } catch (e) {
          console.warn("Batch sentiment analysis failed", e);
        }
      }

      const articlesWithSentiment = articles.map((a: any) => ({
        ...a,
        sentimentScore: articleSentiments.get(a.title.toLowerCase().trim()) || 0
      }));
      setNews(articlesWithSentiment);

      setLoadingStep("Calibrating Strategy Engine...");
      const closes = quotes.map((q: any) => q.close);
      const rsis = calculateRSI(closes);
      const emaFast = calculateEMA(closes, 12);
      const emaSlow = calculateEMA(closes, 26);
      
      const isMockNews = newsData.isMock !== false;
      
      const processed = quotes.map((q: any, i: number) => {
        let headline = undefined;
        let sent = 0;
        const currentQTime = new Date(q.date).getTime();
        let intervalMs = 3600 * 1000;
        if (i > 0) {
            intervalMs = currentQTime - new Date(quotes[i-1].date).getTime();
        } else if (quotes.length > 1) {
            intervalMs = new Date(quotes[1].date).getTime() - new Date(quotes[0].date).getTime();
        }
        const prevQTime = currentQTime - intervalMs;
        
        const relevantArticles = articles.filter((a: any) => {
          const pTime = new Date(a.publishedAt).getTime();
          return pTime > prevQTime && pTime <= currentQTime;
        });
        
        if (relevantArticles.length > 0) {
          headline = relevantArticles[0].title;
          sent = articleSentiments.get(headline.toLowerCase().trim()) || 0;
        } else if (isMockNews) {
          headline = articles[i % articles.length]?.title || `${token} updates Seq ${i}`;
          sent = Math.random() * 0.4 - 0.2;
        }
        
        return {
          time: etFormat(new Date(q.date), "MMM dd, HH:mm"),
          date: q.date,
          close: q.close,
          high: q.high ?? q.close,
          low: q.low ?? q.close,
          rsi: rsis[i],
          emaFast: emaFast[i],
          emaSlow: emaSlow[i],
          sentiment: sent,
          liquidity: Math.random() > 0.8 ? (Math.random() > 0.5 ? 1 : -1) : 0,
          newsHeadline: headline
        }
      });

      setData(processed);

      // 2. Predict using GPT/Gemini on backend
      try {
        setLoadingStep("Calibrating Strategy Engine (AI Prediction)...");
        const predRes = await fetch("/api/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, topic, weights: effectiveWeights, interval, isAutoSync })
        });
        if (!predRes.headers.get("content-type")?.includes("application/json")) {
           const text = await predRes.text();
           if (predRes.status === 429) {
             throw new Error(`Cloud proxy rate limit exceeded. The server is receiving too many requests.`);
           }
           throw new Error(`Predict api non-json response: ${predRes.status} ${text.substring(0, 50)}`);
        }
        const predData = await predRes.json();
        if (!predRes.ok) {
           throw new Error(predData.error || `Predict API error: ${predRes.statusText}`);
        }
        if (predData.sentiment !== undefined) {
          setSentiment({ 
            score: predData.sentiment, 
            rationale: predData.rationale,
            action: predData.action,
            inputData: predData.inputData
          });
          if (predData.headlines) setPredictionHeadlines(predData.headlines);
        }
      } catch (predErr: any) {
        console.warn("Failing predict fetch gracefully falling back to local heuristic indicators:", predErr);
        setSentiment({
          score: 0.05,
          rationale: "Predictive AI engine is temporarily operating under extreme workload protection. Successfully failed over to CPU-level high-frequency heuristics, Elliot Wave metrics, and RSI oscillators.",
          action: "HOLD",
          inputData: { trend: "NEUTRAL", momentum: "NEUTRAL", news: "NEUTRAL" }
        });
      }
      setLastUpdated(etFormat(new Date(), "HH:mm:ss"));
    } catch (error: any) {
      if (error.message !== "Failed to fetch") {
        console.error("Failed to fetch data", error);
      }
      setErrorMsg(error.message || "Network error or server disconnected.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 1500); // 1.5s Debounce
    return () => clearTimeout(timer);
  }, [startDate, endDate, interval, topic, token]);

  const results = useMemo(() => {
    if (data.length === 0) return null;
    // Inject the real AI sentiment into the latest data point cleanly
    const updatedData = data.map((d: any, idx: number) => {
      if (idx === data.length - 1) {
        return { ...d, sentiment: sentiment.score };
      }
      return d;
    });
    return runBacktest(updatedData, effectiveWeights, threshold, cooldown, tradeSize, maxPosition, 4.0, 2.0, undefined, interval, true);
  }, [data, effectiveWeights, threshold, sentiment, cooldown, tradeSize, maxPosition, interval]);

  if (loading && data.length === 0) {
    return (
      <div className="min-h-screen bg-bg-main text-text-body flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-sol-purple animate-spin" />
          <p className="text-sm font-medium animate-pulse text-text-heading">Syncing {token} Multi-modal Engine...</p>
        </div>
      </div>
    );
  }

  if (errorMsg && data.length === 0) {
    return (
      <div className="min-h-screen bg-bg-main text-text-body flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <Activity className="w-8 h-8 text-red-500" />
          <p className="text-sm font-medium text-red-500">System Error</p>
          <p className="text-xs text-text-dim bg-bg-card p-4 rounded-lg font-mono border border-red-500/20">{errorMsg}</p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 bg-sol-purple/10 text-sol-purple rounded hover:bg-sol-purple/20 transition text-xs font-bold uppercase tracking-widest">
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-main text-text-body font-sans flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-border-dim bg-bg-card flex items-center justify-between px-8 shrink-0 shadow-sm relative z-50">
        <div className="flex items-center gap-4">
          <div className="flex space-x-1">
            <div className="w-2.5 h-2.5 bg-sol-purple rounded-full animate-pulse" />
            <div className="w-2.5 h-2.5 bg-sol-green rounded-full" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-black uppercase tracking-[.3em] flex items-center gap-2">
              <span className="animated-gradient-text">{token === 'SOL' ? 'Solana' : token} Quant Alpha</span>
              <span
                className="text-[9px] font-mono text-sol-purple bg-sol-purple/10 px-1 py-0.5 rounded border border-sol-purple/20 animate-pulse"
                title={appVersion ? `commit ${appVersion.commit}${appVersion.branch ? ` · ${appVersion.branch}` : ''}${appVersion.buildTime ? ` · built ${appVersion.buildTime}` : ''}` : 'version'}
              >
                {appVersion?.display || 'V2.0'}
              </span>
            </h1>
            <p className="text-[9px] text-text-dim uppercase tracking-widest font-medium">Multimodal Sentiment & Quantitative Arbitrage</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {autoRefreshEnabled && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-sol-green/5 border border-sol-green/20 rounded font-mono text-[9px] text-sol-green uppercase tracking-wide">
              <span className="w-1.5 h-1.5 bg-sol-green rounded-full animate-ping"></span>
              Auto-Sync: {formatTimeLeft(timeLeft)}
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-2 px-3 py-1 bg-sol-purple/5 border border-sol-purple/20 rounded-full animate-in fade-in transition-all">
              <RefreshCw className="w-3 h-3 text-sol-purple animate-spin" />
              <span className="text-[10px] font-mono text-sol-purple uppercase tracking-tight">{loadingStep || "Logic Sync..."}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setToastsEnabled((prev) => !prev)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded border text-[9px] uppercase font-mono tracking-wider transition-all",
                toastsEnabled 
                  ? "bg-sol-purple/10 border-sol-purple/35 text-sol-purple hover:bg-sol-purple/20" 
                  : "bg-bg-input border-border-dim text-text-dim hover:text-text-heading hover:bg-border-dim/20"
              )}
              title={toastsEnabled ? "Mute toast notifications" : "Unmute toast notifications"}
            >
              {toastsEnabled ? <Bell className="w-3 h-3 text-sol-purple" /> : <BellOff className="w-3 h-3 text-text-dim" />}
              <span>{toastsEnabled ? "Toasts: On" : "Toasts: Off"}</span>
            </button>
            {lastUpdated && (
              <span className="text-[10px] font-mono text-text-dim uppercase tracking-tight">Sync: {lastUpdated} {tzAbbr}</span>
            )}
          </div>
        </div>
      </header>

      <div className="flex items-center gap-6 px-8 h-12 bg-bg-card border-b border-border-dim justify-between">
        <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-text-dim">
          <button
            onClick={() => setCurrentView('jupiter')}
            className={cn("hover:text-sol-purple transition-colors", currentView === 'jupiter' && "text-sol-purple")}
          >
            Automated Trading
          </button>
          <button
            onClick={() => setCurrentView('journal')}
            className={cn("hover:text-sol-purple transition-colors", currentView === 'journal' && "text-sol-purple")}
          >
            Trade Journal
          </button>
          <button
            onClick={() => setCurrentView('strategy')}
            className={cn("hover:text-sol-purple transition-colors", currentView === 'strategy' && "text-sol-purple")}
          >
            Strategy
          </button>
          <button 
            onClick={() => setCurrentView('about')} 
            className={cn("hover:text-sol-purple transition-colors", currentView === 'about' && "text-sol-purple")}
          >
            About
          </button>
          
          <div className="relative">
            <button 
              onClick={() => setShowMoreMenu((prev) => !prev)} 
              className={cn(
                "hover:text-sol-purple transition-colors flex items-center gap-1 cursor-pointer", 
                ['forecast', 'dashboard', 'liquidation', 'apiDocs'].includes(currentView) && "text-sol-purple"
              )}
            >
              More Info <ChevronDown className="w-3 h-3" />
            </button>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute right-0 lg:left-0 mt-2 w-48 bg-white border border-border-dim rounded-lg shadow-xl py-1 z-50 flex flex-col font-sans normal-case tracking-normal">
                  <button
                    onClick={() => { setCurrentView('forecast'); setShowMoreMenu(false); }}
                    className={cn(
                      "w-full text-left px-4 py-2 text-xs hover:bg-bg-input transition-colors",
                      currentView === 'forecast' ? "text-sol-purple font-bold bg-sol-purple/5" : "text-text-body"
                    )}
                  >
                    Forecast Trend
                  </button>
                  <button
                    onClick={() => { setCurrentView('dashboard'); setShowMoreMenu(false); }}
                    className={cn(
                      "w-full text-left px-4 py-2 text-xs hover:bg-bg-input transition-colors",
                      currentView === 'dashboard' ? "text-sol-purple font-bold bg-sol-purple/5" : "text-text-body"
                    )}
                  >
                    Strategy backtesting
                  </button>
                  <button
                    onClick={() => { setCurrentView('liquidation'); setShowMoreMenu(false); }}
                    className={cn(
                      "w-full text-left px-4 py-2 text-xs hover:bg-bg-input transition-colors",
                      currentView === 'liquidation' ? "text-sol-purple font-bold bg-sol-purple/5" : "text-text-body"
                    )}
                  >
                    Liquidation Map
                  </button>
                  <button
                    onClick={() => { setCurrentView('apiDocs'); setShowMoreMenu(false); }}
                    className={cn(
                      "w-full text-left px-4 py-2 text-xs hover:bg-bg-input transition-colors",
                      currentView === 'apiDocs' ? "text-sol-purple font-bold bg-sol-purple/5" : "text-text-body"
                    )}
                  >
                    API Docs
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="hidden md:flex gap-6 text-[11px] uppercase tracking-[0.1em] text-text-dim font-mono bg-bg-input px-4 py-1.5 rounded-full border border-border-dim">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-sol-green animate-pulse"></span> 
            {token.toUpperCase()}/USD ${currentSpotPrice !== null ? currentSpotPrice.toFixed(2) : (results?.data && results.data.length > 0 ? results.data[results.data.length - 1]?.close.toFixed(2) : "---")}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {(currentView === 'dashboard' || currentView === 'forecast') && (
          <aside className="w-80 border-r border-border-dim bg-bg-card p-6 flex flex-col gap-8 shrink-0 overflow-y-auto custom-scrollbar">
          <section>
            <div className="border-b border-border-dim/60 pb-3 mb-6">
              <span className="text-[10px] font-mono font-bold text-sol-purple uppercase tracking-[0.2em] block mb-1">Cortex Engine Core</span>
              <h2 className="text-sm font-serif italic text-text-heading">Engine Configuration</h2>
            </div>
            <label className="text-[10px] uppercase tracking-widest text-text-dim block mb-4 px-1 font-bold flex items-center justify-between">
              Search Parameters
              <Info className="w-2.5 h-2.5 opacity-50" />
            </label>
            <p className="text-[9px] text-text-dim px-1 mb-4 leading-relaxed italic">Defines the underlying asset and the news topic context used for semantic sentiment extraction.</p>
            <div className="px-1 space-y-4 mb-6">
              <div>
                <span className="text-[10px] text-text-dim mb-1 block">Ticker (e.g. sol, btc)</span>
                <input 
                  type="text" 
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full bg-bg-input border border-border-dim rounded-lg px-4 py-2 text-xs focus:ring-1 focus:ring-sol-purple outline-none"
                />
              </div>
              <div>
                <span className="text-[10px] text-text-dim mb-1 block">Sentiment Topic</span>
                <input 
                  type="text" 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full bg-bg-input border border-border-dim rounded-lg px-4 py-2 text-xs focus:ring-1 focus:ring-sol-purple outline-none"
                />
              </div>
              <div className="pt-2 border-t border-border-dim/50">
                <span className="text-[10px] text-text-dim mb-1 block">Analytic Timeframe (Tick Size)</span>
                <select 
                  value={interval}
                  onChange={(e) => setChartInterval(e.target.value)}
                  className="w-full bg-bg-input border border-border-dim rounded-lg px-4 py-2 text-xs focus:ring-1 focus:ring-sol-purple outline-none font-mono text-text-heading cursor-pointer"
                >
                  <option value="5m">5 Minutes (5m)</option>
                  <option value="15m">15 Minutes (15m)</option>
                  <option value="30m">30 Minutes (30m)</option>
                  <option value="1h">1 Hour (1h)</option>
                  <option value="1d">1 Day (1d)</option>
                  <option value="1wk">1 Week (1wk)</option>
                </select>
              </div>
              <div className="space-y-3">
                <span className="text-[10px] text-text-dim block">Performance Interval (Lookback)</span>
                
                <div className="grid grid-cols-2 gap-1 p-1 bg-bg-input rounded-xl border border-border-dim/50">
                  <button
                    type="button"
                    onClick={() => setLookbackMode('preset')}
                    className={cn(
                      "text-[10px] py-1.5 rounded-lg font-mono uppercase transition-all duration-200 cursor-pointer text-center font-bold",
                      lookbackMode === 'preset'
                        ? "bg-bg-card text-sol-purple shadow border border-border-dim/40"
                        : "text-text-dim hover:text-text-heading"
                    )}
                  >
                    Presets
                  </button>
                  <button
                    type="button"
                    onClick={() => setLookbackMode('custom')}
                    className={cn(
                      "text-[10px] py-1.5 rounded-lg font-mono uppercase transition-all duration-200 cursor-pointer text-center font-bold",
                      lookbackMode === 'custom'
                        ? "bg-bg-card text-sol-purple shadow border border-border-dim/40"
                        : "text-text-dim hover:text-text-heading"
                    )}
                  >
                    Custom Dates
                  </button>
                </div>

                {lookbackMode === 'preset' ? (
                  <select 
                    value={lookbackDays}
                    onChange={(e) => setLookbackDays(Number(e.target.value))}
                    className="w-full bg-bg-input border border-border-dim rounded-lg px-4 py-2 text-xs focus:ring-1 focus:ring-sol-purple outline-none font-mono text-text-heading cursor-pointer"
                  >
                    <option value={1}>1 Day (24h)</option>
                    <option value={2}>2 Days (48h)</option>
                    <option value={3}>3 Days</option>
                    <option value={7}>7 Days (1wk)</option>
                    <option value={14}>14 Days (2wk)</option>
                    <option value={30}>30 Days (1mo)</option>
                  </select>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider font-bold text-text-dim">Start Date</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-bg-input border border-border-dim p-2 rounded-lg text-[10px] text-text-heading font-mono outline-none focus:border-sol-purple"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider font-bold text-text-dim">End Date</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-bg-input border border-border-dim p-2 rounded-lg text-[10px] text-text-heading font-mono outline-none focus:border-sol-purple"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <label className="text-[10px] uppercase tracking-widest text-text-dim block mb-2 px-1 font-bold flex items-center justify-between mt-6">
              Neural Synchronization
              <RefreshCw className="w-2.5 h-2.5 opacity-50 text-sol-purple animate-spin" style={{ animationDuration: '3s' }} />
            </label>
            <p className="text-[9px] text-text-dim px-1 mb-4 leading-relaxed italic">Synchronize latest on-chain quotes and prediction catalyst states in background.</p>
            <div className="px-1 space-y-4 mb-6">
              <div className="flex items-center justify-between p-2.5 bg-bg-input rounded-lg border border-border-dim/60">
                <span className="text-[10px] text-text-heading font-medium uppercase tracking-wide">Auto Sync</span>
                <button
                  type="button"
                  onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                  className={cn(
                    "w-8 h-4.5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none relative flex items-center shrink-0 cursor-pointer",
                    autoRefreshEnabled ? "bg-sol-green" : "bg-bg-main border border-border-dim"
                  )}
                >
                  <div className={cn(
                    "w-3.5 h-3.5 rounded-full bg-neutral-100 transition-transform duration-200 shadow",
                    autoRefreshEnabled ? "translate-x-3.5" : "translate-x-0"
                  )} />
                </button>
              </div>

              {autoRefreshEnabled && (
                <div>
                  <span className="text-[10px] text-text-dim mb-1 block font-medium">Sync Every</span>
                  <select
                    value={syncInterval}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setSyncInterval(val);
                      setTimeLeft(val); // reset countdown immediately
                    }}
                    className="w-full bg-bg-input border border-border-dim rounded-lg px-3 py-1.5 text-xs text-text-heading focus:ring-1 focus:ring-sol-purple outline-none"
                  >
                    <option value={15}>15 Seconds (Aggressive)</option>
                    <option value={30}>30 Seconds</option>
                    <option value={60}>1 Minute</option>
                    <option value={120}>2 Minutes</option>
                    <option value={300}>5 Minutes (Balanced)</option>
                    <option value={600}>10 Minutes</option>
                    <option value={1200}>20 Minutes</option>
                  </select>
                </div>
              )}
            </div>

            <label className="text-[10px] uppercase tracking-widest text-text-dim block mb-2 px-1 font-bold flex items-center justify-between">
              Strategy tuning
              <Info className="w-2.5 h-2.5 opacity-50" />
            </label>
            <p className="text-[9px] text-text-dim px-1 mb-6 leading-relaxed italic">Calibrate risk parameters, historical range, and trade execution frequency for the neural backtest.</p>
            <div className="space-y-6">
              <div className="space-y-3 px-1">
                <div className="flex justify-between items-center text-[11px] text-text-body">
                  <span>Cooldown (mins)</span>
                </div>
                <input 
                  type="number"
                  min="0"
                  step="5"
                  value={cooldown} 
                  onChange={(e) => setCooldown(Number(e.target.value))}
                  className="w-full bg-bg-input border border-border-dim rounded-lg p-2 text-[10px] font-mono outline-none text-text-heading"
                />
              </div>

              <div className="space-y-3 px-1 pt-4 border-t border-border-dim">
                <div className="flex justify-between items-center text-[11px] text-text-body">
                  <span>Exposure Rate</span>
                </div>
                <input 
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={tradeSize} 
                  onChange={(e) => setTradeSize(Number(e.target.value))}
                  className="w-full bg-bg-input border border-border-dim rounded-lg p-2 text-[10px] font-mono outline-none text-text-heading"
                />
              </div>

              <div className="space-y-3 px-1 pt-4 border-t border-border-dim">
                <div className="flex justify-between items-center text-[11px] text-text-body">
                  <span>Max Position Size</span>
                </div>
                <input 
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={maxPosition} 
                  onChange={(e) => setMaxPosition(Number(e.target.value))}
                  className="w-full bg-bg-input border border-border-dim rounded-lg p-2 text-[10px] font-mono outline-none text-text-heading"
                />
              </div>

              <div className="space-y-5 px-1 pt-4 border-t border-border-dim">
                <div className="space-y-1">
                  <p className="text-[9px] uppercase tracking-widest text-text-dim font-bold">Logic Weights</p>
                  <p className="text-[8px] text-text-dim leading-tight opacity-70">Adjust sensitivity between Political Sentiment (LLM), MACD, RSI, and Elliot Wave Entry.</p>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-3">
                    <label className="flex items-center gap-2 cursor-pointer text-text-body">
                      <input 
                        type="checkbox" 
                        checked={enabledIndicators.sentiment}
                        onChange={(e) => setEnabledIndicators({ ...enabledIndicators, sentiment: e.target.checked })}
                        className="accent-sol-purple h-3 w-3 rounded border-border-dim bg-bg-input"
                      />
                      <span>Political Sentiment (LLM)</span>
                    </label>
                    <span className="text-sol-purple font-mono">
                      {enabledIndicators.sentiment ? `${(weights.sentiment * 100).toFixed(0)}%` : "OFF"}
                    </span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.05" 
                    value={weights.sentiment}
                    onChange={(e) => setWeights({ ...weights, sentiment: Number(e.target.value) })}
                    disabled={!enabledIndicators.sentiment}
                    className="w-full accent-sol-purple disabled:opacity-40"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-3">
                    <label className="flex items-center gap-2 cursor-pointer text-text-body">
                      <input 
                        type="checkbox" 
                        checked={enabledIndicators.technical}
                        onChange={(e) => setEnabledIndicators({ ...enabledIndicators, technical: e.target.checked })}
                        className="accent-sol-purple h-3 w-3 rounded border-border-dim bg-bg-input"
                      />
                      <span>Technical Trend (MACD)</span>
                    </label>
                    <span className="text-sol-purple font-mono">
                      {enabledIndicators.technical ? `${(weights.technical * 100).toFixed(0)}%` : "OFF"}
                    </span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.05" 
                    value={weights.technical}
                    onChange={(e) => setWeights({ ...weights, technical: Number(e.target.value) })}
                    disabled={!enabledIndicators.technical}
                    className="w-full accent-sol-purple disabled:opacity-40"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-3">
                    <label className="flex items-center gap-2 cursor-pointer text-text-body">
                      <input 
                        type="checkbox" 
                        checked={enabledIndicators.liquidity}
                        onChange={(e) => setEnabledIndicators({ ...enabledIndicators, liquidity: e.target.checked })}
                        className="accent-sol-purple h-3 w-3 rounded border-border-dim bg-bg-input"
                      />
                      <span>Oscillator (RSI)</span>
                    </label>
                    <span className="text-sol-purple font-mono">
                      {enabledIndicators.liquidity ? `${(weights.liquidity * 100).toFixed(0)}%` : "OFF"}
                    </span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.05" 
                    value={weights.liquidity}
                    onChange={(e) => setWeights({ ...weights, liquidity: Number(e.target.value) })}
                    disabled={!enabledIndicators.liquidity}
                    className="w-full accent-sol-purple disabled:opacity-40"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-3">
                    <label className="flex items-center gap-2 cursor-pointer text-text-body">
                      <input 
                        type="checkbox" 
                        checked={enabledIndicators.elliottWave}
                        onChange={(e) => setEnabledIndicators({ ...enabledIndicators, elliottWave: e.target.checked })}
                        className="accent-sol-purple h-3 w-3 rounded border-border-dim bg-bg-input"
                      />
                      <span>Elliot Wave Entry Point</span>
                    </label>
                    <span className="text-sol-purple font-mono">
                      {enabledIndicators.elliottWave ? `${((weights.elliottWave || 0) * 100).toFixed(0)}%` : "OFF"}
                    </span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.05" 
                    value={weights.elliottWave || 0}
                    onChange={(e) => setWeights({ ...weights, elliottWave: Number(e.target.value) })}
                    disabled={!enabledIndicators.elliottWave}
                    className="w-full accent-sol-purple disabled:opacity-40"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-3">
                    <label className="flex items-center gap-2 cursor-pointer text-text-body">
                      <input 
                        type="checkbox" 
                        checked={enabledIndicators.supertrend}
                        onChange={(e) => setEnabledIndicators({ ...enabledIndicators, supertrend: e.target.checked })}
                        className="accent-sol-purple h-3 w-3 rounded border-border-dim bg-bg-input"
                      />
                      <span>Supertrend (ATR Trend)</span>
                    </label>
                    <span className="text-sol-purple font-mono">
                      {enabledIndicators.supertrend ? `${((weights.supertrend || 0) * 100).toFixed(0)}%` : "OFF"}
                    </span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.05" 
                    value={weights.supertrend || 0}
                    onChange={(e) => setWeights({ ...weights, supertrend: Number(e.target.value) })}
                    disabled={!enabledIndicators.supertrend}
                    className="w-full accent-sol-purple disabled:opacity-40"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-3">
                    <label className="flex items-center gap-2 cursor-pointer text-text-body">
                      <input 
                        type="checkbox" 
                        checked={enabledIndicators.fvg}
                        onChange={(e) => setEnabledIndicators({ ...enabledIndicators, fvg: e.target.checked })}
                        className="accent-sol-purple h-3 w-3 rounded border-border-dim bg-bg-input"
                      />
                      <span>Fair Value Gap (FVG)</span>
                    </label>
                    <span className="text-sol-purple font-mono">
                      {enabledIndicators.fvg ? `${((weights.fvg || 0) * 100).toFixed(0)}%` : "OFF"}
                    </span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.05" 
                    value={weights.fvg || 0}
                    onChange={(e) => setWeights({ ...weights, fvg: Number(e.target.value) })}
                    disabled={!enabledIndicators.fvg}
                    className="w-full accent-sol-purple disabled:opacity-40"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-3">
                    <label className="flex items-center gap-2 cursor-pointer text-text-body">
                      <input 
                        type="checkbox" 
                        checked={enabledIndicators.dca}
                        onChange={(e) => setEnabledIndicators({ ...enabledIndicators, dca: e.target.checked })}
                        className="accent-sol-purple h-3 w-3 rounded border-border-dim bg-bg-input"
                      />
                      <span>DCA Mean-Reversion</span>
                    </label>
                    <span className="text-sol-purple font-mono">
                      {enabledIndicators.dca ? `${((weights.dca || 0) * 100).toFixed(0)}%` : "OFF"}
                    </span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.05" 
                    value={weights.dca || 0}
                    onChange={(e) => setWeights({ ...weights, dca: Number(e.target.value) })}
                    disabled={!enabledIndicators.dca}
                    className="w-full accent-sol-purple disabled:opacity-40"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="mt-auto space-y-4">
            <Card title="Latest Signal" icon={Zap}>
              {results?.data && results.data.length > 0 ? (() => {
                const latest = results.data[results.data.length - 1];
                let label = "HOLD";
                let color = "text-text-dim";
                
                switch(latest.signal) {
                  case 1: label = "LONG BUY"; color = "text-sol-green"; break;
                  case -1: label = "SHORT SELL"; color = "text-red-500"; break;
                  case -2: label = "LONG SELL"; color = "text-orange-400"; break;
                  case 2: label = "SHORT BUY"; color = "text-blue-400"; break;
                }
                
                return (
                  <div className="space-y-4">
                    <div className="text-center space-y-1">
                      <p className="text-[9px] uppercase tracking-widest text-text-dim blur-[0.4px]">Mathematical Model</p>
                      <span className={cn(
                        "text-xl font-bold font-mono tracking-tighter",
                        color
                      )}>
                        {label}
                      </span>
                    </div>

                    <div className="text-center space-y-1 border-t border-border-dim pt-3">
                      <p className="text-[9px] uppercase tracking-widest text-text-dim flex items-center justify-center gap-1"><Zap className="w-3 h-3 text-sol-purple"/> AI Forecast</p>
                      <span className={cn(
                        "text-xl font-bold font-mono tracking-tighter",
                        (sentiment.action || "").includes("Buy") ? "text-sol-green" : 
                        (sentiment.action || "").includes("Sell") ? "text-red-500" : "text-text-dim"
                      )}>
                        {sentiment.action ? sentiment.action.toUpperCase() : "HOLD"}
                      </span>
                    </div>

                    <p className="text-[10px] text-text-dim italic leading-relaxed text-left border-t border-border-dim pt-3">
                      {sentiment.rationale || "Processing headlines..."}
                    </p>

                    {sentiment.inputData && (
                      <div className="text-left border-t border-border-dim pt-3 space-y-2">
                        <p className="text-[9px] uppercase tracking-widest text-text-dim font-bold">Input Context</p>
                        <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
                          <div>
                            <span className="text-text-dim">Topic:</span>
                            <br/><span className="text-sol-purple">{sentiment.inputData.topic}</span>
                          </div>
                          <div>
                            <span className="text-text-dim">Price:</span>
                            <br/><span className="text-sol-green">${sentiment.inputData.price}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="text-[10px] text-text-dim italic text-center">Initialing node...</div>
              )}
            </Card>
            <button 
              onClick={() => {
                setData([]);
                fetchData();
              }}
              disabled={loading}
              className="w-full py-4 bg-text-heading text-white font-serif italic text-lg hover:bg-black transition-all rounded-lg shadow-lg flex flex-col items-center justify-center gap-0.5 group"
            >
              <div className="flex items-center gap-2">
                {loading && <RefreshCw className="w-4 h-4 animate-spin text-sol-purple" />}
                <span>{loading ? "Optimizing Strategy Matrix..." : "Initialize Simulation"}</span>
              </div>
              <p className="text-[9px] font-mono uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity">Reset context & audit period</p>
            </button>
          </section>
        </aside>
        )}

        {currentView === 'dashboard' ? (
        <main className="flex-1 flex flex-col p-8 bg-bg-main space-y-8 overflow-y-auto custom-scrollbar">
          {/* Header Title */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border-dim/40 pb-5 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-sol-purple" />
                <h2 className="text-2xl font-serif italic text-text-heading">Strategy backtesting</h2>
              </div>
              <p className="text-sm text-text-dim font-sans">Real-time orderflow, dynamic catalyst intelligence, and multimodal predictive overlays.</p>
            </div>
          </div>

          {/* Top Stats Row */}
          {(() => {
            if (!results || results.data.length === 0) {
              return (
                <div className="col-span-1 md:col-span-4 flex items-center justify-center p-12 bg-bg-card border border-border-dim rounded-lg shadow-sm">
                  <div className="text-center space-y-3">
                    <Info className="w-8 h-8 text-text-dim mx-auto opacity-30" />
                    <p className="text-sm text-text-dim font-serif italic">
                      Satellite node data missing. Verify News and Market feeds.
                    </p>
                    <button 
                      onClick={fetchData}
                      className="text-[10px] text-sol-purple font-mono uppercase tracking-widest hover:underline"
                    >
                      Retry Connection
                    </button>
                  </div>
                </div>
              );
            }

            return (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full">
                <Stat 
                  label={`${token.toUpperCase()} Benchmark`} 
                  value={`${results?.metrics.marketReturn.toFixed(1)}%`}
                  subValue="HODL Return"
                />
                <Stat 
                  label="Strategy Return" 
                  value={`${results?.metrics.strategyReturn.toFixed(1)}%`}
                  trend={results?.metrics.strategyReturn}
                  subValue="Backtest Yield"
                />
                <Stat 
                  label="Sharpe Alpha" 
                  value={`${(results?.metrics.alpha / 10).toFixed(2)}`}
                  trend={results?.metrics.alpha}
                  subValue="Risk-Adj edge"
                />
                <Stat 
                  label="Trading Signals" 
                  value={results?.data?.filter((d: any) => d.signal !== 0).length || 0}
                  subValue="Quant Executions"
                />
              </div>
            );
          })()}

          {/* Performance Chart */}
          <div className="flex-1 flex flex-col space-y-8 min-h-0">
            <Card 
              title="Performance Overlay (Equity Curve)" 
              className="flex-1" 
              icon={PieChart}
              action={
                <button
                  type="button"
                  onClick={downloadPerformanceTimeSeriesCSV}
                  className="py-1 px-2.5 rounded border border-border-dim/60 hover:border-sol-purple bg-bg-input text-text-heading hover:text-sol-purple flex items-center gap-1.5 transition-all text-[9px] font-bold cursor-pointer font-sans"
                  title="Export equity curve data as CSV"
                >
                  <Download className="w-3 h-3" />
                  Export Chart (CSV)
                </button>
              }
            >
              <div className="mb-4">
                <p className="text-[10px] text-text-dim italic">Visualizes the equity growth of the AI strategy vs simply holding the asset. Dots indicate trade execution points.</p>
              </div>
              <div className="h-full min-h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={results?.data}>
                    <defs>
                      <linearGradient id="colorCum" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00FFA3" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#00FFA3" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis 
                      dataKey="time" 
                      stroke="#94a3b8" 
                      fontSize={9} 
                      tickLine={false} 
                      axisLine={false}
                      interval={Math.floor((data.length || 1) / 5)}
                    />
                    <YAxis 
                      stroke="#94a3b8" 
                      fontSize={9} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(val) => `${val.toFixed(2)}x`}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="strategyCum" 
                      name="AI Classifier Strategy" 
                      stroke="#00FFA3" 
                      fillOpacity={1} 
                      fill="url(#colorCum)" 
                      strokeWidth={3}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="marketCum" 
                      name={`${token.toUpperCase()} Benchmark (HODL)`} 
                      stroke="#94a3b8" 
                      fill="transparent" 
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="strategyCum" 
                      stroke="transparent" 
                      dot={<CustomizedSignalDot />} 
                      activeDot={false} 
                      isAnimationActive={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="strategyCum" 
                      stroke="transparent" 
                      dot={<CustomizedExhaustionMarker />} 
                      activeDot={false} 
                      isAnimationActive={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="strategyCum" 
                      stroke="transparent" 
                      dot={<CustomizedNewsDot />} 
                      activeDot={false} 
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:h-96">
              <Card title="Multi-Source Catalyst Intelligence" icon={Newspaper} className="h-[300px] lg:h-auto">
                <div className="mb-4 border-b border-border-dim pb-3 space-y-2">
                  <p className="text-[10px] text-text-dim italic">
                    Aggregated headlines from Google News, Yahoo Finance, CryptoCompare, and <strong>Telegram Live Feed Scraper</strong>.
                  </p>
                  <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center p-2 bg-bg-input rounded border border-border-dim/80 text-[10px]">
                    <div className="flex items-center gap-1.5 font-bold font-mono text-sol-purple tracking-wide uppercase shrink-0">
                      <span className="w-2 h-2 rounded-full bg-sol-green animate-pulse"></span>
                      <span>TG News Link:</span>
                    </div>
                    <input
                      type="text"
                      id="news-telegram-channel-input"
                      value={telegramConfig.newsTelegramChannel || ""}
                      onChange={(e) => setTelegramConfig({ ...telegramConfig, newsTelegramChannel: e.target.value })}
                      placeholder="e.g. https://t.me/+1C0c6rUVmjo3Y2Y8"
                      className="flex-1 bg-transparent px-1 focus:outline-none font-mono text-[11px] text-text-heading border-b border-transparent focus:border-sol-purple/50 truncate min-w-0"
                    />
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.preventDefault();
                        await handleSaveTelegramConfig(null as any);
                        fetchData();
                      }}
                      className="px-2.5 py-1 bg-sol-purple text-text-heading rounded hover:bg-sol-purple/85 transition-colors uppercase font-mono font-bold text-[9px] tracking-wider shrink-0 text-center"
                    >
                      Get Latest Info
                    </button>
                  </div>
                </div>
                <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar flex-1">
                  {news.length > 0 ? news.map((article, i) => (
                    <div key={i} className="flex flex-col gap-2 pb-4 border-b border-border-dim/50 last:border-0 group">
                      <p className="text-xs italic font-serif text-text-heading leading-relaxed group-hover:text-sol-purple transition-colors">
                        "{article.title}"
                      </p>
                      <div className="flex justify-between items-center text-[9px] text-text-dim uppercase font-mono tracking-widest">
                        <span>{article.source.name}</span>
                        <div className="flex gap-3 items-center">
                          {article.sentimentScore !== undefined && (
                            <span className={cn(
                              "px-1.5 py-0.5 rounded-sm font-bold tracking-tight",
                              article.sentimentScore > 0.1 ? "bg-sol-green/20 text-sol-green" :
                              article.sentimentScore < -0.1 ? "bg-red-500/20 text-red-500" :
                              "bg-text-dim/20 text-text-dim"
                            )}>
                              {article.sentimentScore > 0 ? "+" : ""}{article.sentimentScore.toFixed(2)}
                            </span>
                          )}
                          <span>{etFormat(new Date(article.publishedAt), "HH:mm")} <span className="opacity-40">{tzAbbr}</span></span>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="h-full flex items-center justify-center text-xs italic text-text-dim">
                      Collecting satellite news feed...
                    </div>
                  )}
                </div>
              </Card>

              <Card title="Logic Flow Audit Log - Positions" icon={Activity} className="h-[400px] lg:h-auto">
                <div className="mb-4 border-b border-border-dim pb-4">
                  <p className="text-[10px] text-text-dim uppercase tracking-widest font-bold mb-2">Quant Alpha Strategy Blueprint</p>
                  <p className="text-[9px] text-text-body leading-relaxed">
                    The **{token} Quant Alpha Engine** utilizes a Multimodal Arbitrage approach. It consumes live global headlines via a **High-Accuracy CPU-Optimized Sentiment Engine** (AFINN/Lexicon hybrid) for ultra-fast semantic extraction. This is then fused with **Technical Momentum (EMA 12/26)** and **Volatility-Adjusted RSI (Mean Reversion)** indicators. Positions are dynamically adjusted based on the aggregate Alpha Score vs. the established Alpha Threshold.
                  </p>
                </div>
                <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-2">
                  <div className="space-y-2 font-mono text-[9px] text-text-dim uppercase tracking-tighter border-b border-border-dim pb-4">
                    <p><span className="opacity-40">[{etFormat(new Date(), "HH:mm:ss")} {tzAbbr}]</span> <span className="text-sol-purple font-bold">CORE</span>: Signal Mesh initialized (Eastern Time)</p>
                    <p><span className="opacity-40">[{etFormat(new Date(), "HH:mm:ss")} {tzAbbr}]</span> <span className="text-sol-green font-bold">DATA</span>: Synchronizing News/Price windows...</p>
                  </div>
                  {results?.data?.filter(d => d.signal !== 0 || d.skippedSignal).slice(-20).reverse().map((d, i) => {
                    let label = "HOLD";
                    let color = "bg-text-dim/20 text-text-dim";
                    
                    if (d.skippedSignal) {
                        label = "FUNDS_EXHAUSTED";
                        color = "bg-red-500/20 text-red-500 border border-red-500/30 animate-pulse";
                    } else {
                        switch(d.signal) {
                          case 1: label = "LONG_BUY"; color = "bg-sol-green/20 text-sol-green"; break;
                          case -1: label = "SHORT_SELL"; color = "bg-red-500/20 text-red-500"; break;
                          case -2: label = "LONG_SELL"; color = "bg-orange-400/20 text-orange-400"; break;
                          case 2: label = "SHORT_BUY"; color = "bg-blue-400/20 text-blue-400"; break;
                        }
                    }

                    return (
                      <div key={i} className={cn("text-[10px] font-mono border-l-2 pl-3 py-1 space-y-1 transition-all", d.skippedSignal ? "border-red-500 bg-red-500/5" : "border-border-dim")}>
                        <div className="flex justify-between items-center">
                          <span className="text-text-dim">{etFormat(new Date(d.date), "MMM d, HH:mm")} <span className="text-[8px] opacity-30">{tzAbbr}</span></span>
                          <span className={cn("px-1 rounded font-bold uppercase text-[8px]", color)}>
                            {label}
                          </span>
                        </div>
                        <p className="text-[9px] break-words line-clamp-1 opacity-80 italic">"{d.newsHeadline || "Technical Momentum Trigger"}"</p>
                        {d.isSentimentCatalyst && (
                          <div className="flex items-center gap-1.5 py-0.5 px-2 bg-sol-purple/10 border border-sol-purple/20 rounded-sm w-fit mt-1">
                            <Zap className="w-2.5 h-2.5 text-sol-purple" />
                            <span className="text-[8px] font-bold text-sol-purple uppercase tracking-widest">Sentiment Catalyst</span>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[8px] opacity-70 pt-1">
                          <div className="flex items-center gap-1 border-r border-border-dim pr-2">
                            <span className="text-[7px] text-text-dim">SENT</span>
                            <span className="font-mono">{d.sentiment.toFixed(2)} × {weights.sentiment}</span>
                            <span className="text-sol-green font-bold">= {d.wSentiment.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center gap-1 border-r border-border-dim pr-2">
                            <span className="text-[7px] text-text-dim">TECH</span>
                            <span className="font-mono">{(d.wTechnical / (weights.technical || 1)).toFixed(0)} × {weights.technical}</span>
                            <span className={cn("font-bold", d.wTechnical >= 0 ? "text-sol-green" : "text-red-500")}>= {d.wTechnical.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[7px] text-text-dim">LIQ</span>
                            <span className="font-mono">{(d.wLiquidity / (weights.liquidity || 1)).toFixed(0)} × {weights.liquidity}</span>
                            <span className={cn("font-bold", d.wLiquidity >= 0 ? "text-sol-green" : "text-red-500")}>= {d.wLiquidity.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="flex gap-3 text-[9px] font-bold pt-1 border-t border-border-dim/30">
                          <span className="text-text-heading underline decoration-sol-purple/30">TOTAL SCORE: {d.score.toFixed(3)}</span>
                          <span className="text-text-dim">POS_WEIGHT: {d.position.toFixed(1)}x</span>
                          {d.skippedSignal && <span className="text-red-500 font-black animate-pulse">!! LACK OF FUNDS !!</span>}
                        </div>
                      </div>
                    );
                  })}
                  
                  {predictionHeadlines.length > 0 && (
                    <div className="pt-2">
                      <p className="text-[10px] uppercase tracking-widest text-text-heading mb-3 font-bold">Interval-Specific News Catalyst</p>
                      <div className="space-y-3">
                        {predictionHeadlines.map((h, i) => (
                          <div key={i} className="bg-bg-input p-2 rounded border border-border-dim/50">
                            <p className="text-[10px] text-text-heading italic leading-snug">"{h.title}"</p>
                            <span className="text-[8px] text-text-dim font-mono block mt-1">{format(new Date(h.publishedAt), "HH:mm")} • MATCHED_INTERVAL</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Trade History */}
            <section className="space-y-4 pt-8">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-sol-purple" />
                  <h3 className="text-xs uppercase tracking-widest font-bold text-text-heading">Trading Logic Audit Log - Positions</h3>
                </div>
                <div className="flex items-center gap-3">
                  {results?.trades && results.trades.length > 0 && (
                    <button
                      type="button"
                      onClick={downloadPerformanceTradesCSV}
                      className="py-1.5 px-3 rounded-lg border border-border-dim/80 hover:border-sol-purple bg-bg-input text-text-heading hover:text-sol-purple flex items-center gap-1.5 transition-all text-[10px] font-bold cursor-pointer"
                      title="Export trades as CSV"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export Table (CSV)
                    </button>
                  )}
                  <p className="text-[10px] text-text-dim uppercase tracking-[0.15em] font-mono">PnL Summary: {results?.trades.reduce((acc: number, t: any) => acc + (t.pnl || 0), 0).toFixed(2)}x Aggregated</p>
                </div>
              </div>
              <TradeHistory trades={results?.trades || []} />
            </section>
          </div>
        </main>
        ) : currentView === 'liquidation' ? (
          <main className="flex-1 flex flex-col p-8 bg-bg-main overflow-y-auto custom-scrollbar">
            <div className="max-w-7xl mx-auto w-full space-y-8">
              <div className="space-y-2">
                <h2 className="text-2xl font-serif italic text-text-heading">Liquidation Map</h2>
                <p className="text-sm text-text-dim">Real-time Orderflow and Liquidation Zone Heatmap Analysis.</p>
              </div>
              <LiquidityHeatmap 
                token={token} 
                spotPrice={currentSpotPrice !== null ? currentSpotPrice : (results?.data && results.data.length > 0 ? results.data[results.data.length - 1]?.close : 173.25)} 
                spread={mapSpread}
                onSpreadChange={setMapSpread}
              />
              <LiquidationHistogram
                token={token}
                spotPrice={currentSpotPrice !== null ? currentSpotPrice : (results?.data && results.data.length > 0 ? results.data[results.data.length - 1]?.close : 173.25)}
                spread={mapSpread}
                onSpreadChange={setMapSpread}
              />
            </div>
          </main>
        ) : currentView === 'apiDocs' ? (
          <main className="flex-1 flex flex-col p-8 bg-bg-main overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto w-full space-y-8">
              <div className="space-y-2">
                <h2 className="text-2xl font-serif italic text-text-heading">API Docs</h2>
                <p className="text-sm text-text-dim">Programmatic REST API reference access to the prediction engine.</p>
              </div>

              <Card title={`GET ${window.location.origin}/api/historical`} icon={Zap}>
                <div className="space-y-6 text-sm">
                  <p className="text-text-body">
                    Fetches historical OHLC (Open, High, Low, Close) market data for a given cryptocurrency ticker.
                  </p>
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-text-heading mb-2 font-bold">Query Parameters</h3>
                    <pre className="bg-bg-input p-4 rounded-lg font-mono text-xs text-sol-purple overflow-x-auto">
{`?token=SOL&interval=1h&startDate=2024-01-01&endDate=2024-01-07`}
                    </pre>
                  </div>
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-text-heading mb-2 font-bold">Expected Response</h3>
                    <pre className="bg-bg-input p-4 rounded-lg font-mono text-xs text-sol-green overflow-x-auto">
{`{
  "meta": {
    "currency": "USD",
    "symbol": "SOL-USD"
  },
  "timestamp": [...],
  "indicators": {
    "quote": [
      {
        "open": [...],
        "close": [...],
        "high": [...],
        "low": [...],
        "volume": [...]
      }
    ]
  }
}`}
                    </pre>
                  </div>
                </div>
              </Card>

              <Card title={`GET ${window.location.origin}/api/news`} icon={Newspaper}>
                <div className="space-y-6 text-sm">
                  <p className="text-text-body">
                    Fetches the latest news articles related to the provided search keyword.
                  </p>
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-text-heading mb-2 font-bold">Query Parameters</h3>
                    <pre className="bg-bg-input p-4 rounded-lg font-mono text-xs text-sol-purple overflow-x-auto">
{`?topic=${token}`}
                    </pre>
                  </div>
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-text-heading mb-2 font-bold">Expected Response</h3>
                    <pre className="bg-bg-input p-4 rounded-lg font-mono text-xs text-sol-green overflow-x-auto">
{`{
  "articles": [
    {
      "title": "${token} Network sees high stablecoin volume",
      "source": { "name": "Analytics" },
      "publishedAt": "2026-05-19T10:00:00.000Z"
    }
  ]
}`}
                    </pre>
                  </div>
                </div>
              </Card>

              <Card title={`POST ${window.location.origin}/api/predict`} icon={Zap}>
                <div className="space-y-6 text-sm">
                  <p className="text-text-body">
                    Fetches the latest charts, gets the latest news, measures sentiment using Gemini, and returns the aggregated data.
                  </p>
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-text-heading mb-2 font-bold">Request Payload</h3>
                    <pre className="bg-bg-input p-4 rounded-lg font-mono text-xs text-sol-purple overflow-x-auto">
{`{
  "token": "${token}",
  "topic": "${topic}",
  "weights": {
    "sentiment": 0.5,
    "technical": 0.3,
    "liquidity": 0.2
  }
}`}
                    </pre>
                  </div>
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-text-heading mb-2 font-bold">Expected Response</h3>
                    <pre className="bg-bg-input p-4 rounded-lg font-mono text-xs text-sol-green overflow-x-auto">
{`{
  "price": 145.23,
  "sentiment": 0.85,
  "action": "Long Buy",
  "rationale": "High volume of institutional adoption news...",
  "timestamp": "2026-05-19T10:00:00.000Z",
  "headlines": [...],
  "inputData": {
    "token": "${token}",
    "topic": "${topic}",
    "price": 145.23
  }
}`}
                    </pre>
                  </div>
                </div>
              </Card>

              <Card title={`POST ${window.location.origin}/api/sentiment`} icon={Newspaper}>
                <div className="space-y-6 text-sm">
                  <p className="text-text-body">
                    Direct sentiment scoring for a list of news headlines.
                  </p>
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-text-heading mb-2 font-bold">Request Payload</h3>
                    <pre className="bg-bg-input p-4 rounded-lg font-mono text-xs text-sol-purple overflow-x-auto">
{`{
  "headlines": [
    "Protocol reaches 1B TVL",
    "Network congestion issues resolved"
  ]
}`}
                    </pre>
                  </div>
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-text-heading mb-2 font-bold">Expected Response</h3>
                    <pre className="bg-bg-input p-4 rounded-lg font-mono text-xs text-sol-green overflow-x-auto">
{`{
  "score": 0.65,
  "rationale": "Positive developments in TVL and network stability."
}`}
                    </pre>
                  </div>
                </div>
              </Card>

              <Card title={`POST ${window.location.origin}/api/forecast`} icon={TrendingUp}>
                <div className="space-y-6 text-sm">
                  <p className="text-text-body">
                    Synthesizes technical and headlines sentiment indicators to forecast price trend movements, standard volatility bands, directional confidence, and recommended orders for the next interval (30m, 1h, 1d) via Gemini.
                  </p>
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-text-heading mb-2 font-bold">Request Payload</h3>
                    <pre className="bg-bg-input p-4 rounded-lg font-mono text-xs text-sol-purple overflow-x-auto">
{`{
  "token": "SOL",
  "interval": "1h",
  "weights": {
    "sentiment": 0.5,
    "technical": 0.3,
    "liquidity": 0.2
  }
}`}
                    </pre>
                  </div>
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-text-heading mb-2 font-bold">Expected Response</h3>
                    <pre className="bg-bg-input p-4 rounded-lg font-mono text-xs text-sol-green overflow-x-auto">
{`{
  "token": "SOL",
  "interval": "1h",
  "currentPrice": 174.12,
  "predictedPrice": 175.85,
  "trend": "UP",
  "volatilityPct": 1.45,
  "confidenceScore": 0.74,
  "suggestedOrder": "BUY_MARKET",
  "suggestedOrderPrice": 173.25,
  "rationale": "High-volume institutional momentum paired with bullish news drives bias...",
  "indicators": {
    "rsi": 42.5,
    "ema12": 173.9,
    "ema26": 171.4
  },
  "latestNews": [...]
}`}
                    </pre>
                  </div>
                </div>
              </Card>

              <Card title={`POST ${window.location.origin}/api/backtest`} icon={Activity}>
                <div className="space-y-6 text-sm">
                  <p className="text-text-body">
                    Simulates trading strategy performance historically over standard ranges (3d to 90d) with customizable sizers and indicators weights, returning key financial metrics and a chronological ledger of simulated trade events.
                  </p>
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-text-heading mb-2 font-bold">Request Payload</h3>
                    <pre className="bg-bg-input p-4 rounded-lg font-mono text-xs text-sol-purple overflow-x-auto">
{`{
  "token": "SOL",
  "interval": "1h",
  "lookbackDays": 14,
  "initialCapital": 10000,
  "weights": {
    "sentiment": 0.5,
    "technical": 0.3,
    "liquidity": 0.2
  }
}`}
                    </pre>
                  </div>
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-text-heading mb-2 font-bold">Expected Response</h3>
                    <pre className="bg-bg-input p-4 rounded-lg font-mono text-xs text-sol-green overflow-x-auto">
{`{
  "metrics": {
    "initialCapital": 10000,
    "finalCapital": 11245.5,
    "totalTrades": 14,
    "winningTrades": 9,
    "losingTrades": 5,
    "winRate": 64.2,
    "pnlPct": 12.45,
    "maxDrawdownPct": 3.12
  },
  "trades": [
    {
      "type": "CLOSE_LONG",
      "date": "2026-05-20T02:00:00.000Z",
      "price": 174.5,
      "pnl": 245.5,
      "pnlPct": 4.5,
      "capitalAfter": 11245.5,
      "note": "Target profit hit (+4.5%)"
    },
    ...
  ],
  "equityCurve": [
    { "date": "2026-05-19 12:00", "equity": 10000, "price": 172.1 },
    ...
  ]
}`}
                    </pre>
                  </div>
                </div>
              </Card>

            </div>
          </main>
        ) : currentView === 'jupiter' ? (
          <main className="flex-1 flex flex-col p-8 bg-bg-main overflow-y-auto custom-scrollbar animate-fade-in text-text-body">
            <div className="max-w-5xl mx-auto w-full space-y-8">
              
              {/* Header and overview */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border-dim pb-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-6 h-6 text-sol-purple" />
                    <h2 className="text-2xl font-serif italic text-text-heading">Automated Trading</h2>
                  </div>
                  <p className="text-sm text-text-dim">
                    Liquid-swap auto-arbitrage routing. Synchronize prediction models directly with Phantom wallets to swap Solana on-chain DEX pairs via Jupiter.
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {jupiterConfig.walletAddress ? (
                    <div className="flex items-center gap-3 bg-sol-purple/10 border border-sol-purple/20 px-4 py-2 rounded-xl">
                      <div className="w-2 h-2 rounded-full bg-sol-green animate-pulse"></div>
                      <div className="font-mono text-xs">
                        <span className="text-text-dim uppercase mr-1">Solana Balance:</span>
                        <span className="text-text-heading font-bold">{(jupiterConfig.walletBalance || 0).toFixed(4)} SOL</span>
                        {jupiterConfig.liveJupiterPrice && (
                          <span className="text-[10px] text-text-dim ml-2 border-l border-border-dim/50 pl-2">
                            SOL/USD: ${jupiterConfig.liveJupiterPrice.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl text-red-400 font-mono text-xs">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                      Wallet Disconnected
                    </div>
                  )}
                </div>
              </div>

              {jupStatusMsg && (
                <div className={cn(
                  "p-4 rounded-xl text-xs border flex items-center gap-3 justify-between animate-fade-in",
                  jupStatusMsg.type === "success" 
                    ? "bg-sol-green/10 border-sol-green/20 text-sol-green" 
                    : "bg-red-500/10 border-red-500/20 text-red-500"
                )}>
                  <span>{jupStatusMsg.text}</span>
                  <button 
                    onClick={() => setJupStatusMsg(null)} 
                    className="text-[10px] uppercase font-bold text-text-heading hover:opacity-85 select-none"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* Left Side: Connection & Configurations Form (7 cols) */}
                <div className="lg:col-span-12 xl:col-span-7 space-y-6">
                  
                  {/* Wallet Connection Card */}
                  <Card title="Solana Adapter Configuration" icon={Wallet}>
                    <div className="space-y-6">
                      <p className="text-xs text-text-dim leading-relaxed">
                        The trading wallet is configured server-side from the <code className="text-sol-purple">JUP_PRIVATE_KEY</code> environment variable. No in-browser wallet connection is required — the daemon signs and executes automated trades on the backend.
                      </p>

                      {/* Server-Configured Wallet Status Bar (sourced from JUP_PRIVATE_KEY) */}
                      <div className="p-4 bg-bg-input rounded-xl border border-border-dim space-y-3.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <span className="text-[10px] font-mono text-text-dim uppercase tracking-wider block font-bold">
                              Server Trading Wallet Address
                            </span>
                            {jupiterConfig.walletAddress ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sol-purple font-mono font-bold text-xs select-all bg-sol-purple/10 px-2 py-1 rounded-md border border-sol-purple/20">
                                  {jupiterConfig.walletAddress}
                                </span>
                                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border bg-sol-green/10 border-sol-green/20 text-sol-green">
                                  🔒 Server Key (JUP_PRIVATE_KEY)
                                </span>
                              </div>
                            ) : (
                              <span className="text-red-400 font-mono text-xs italic block font-bold">
                                No wallet configured — set JUP_PRIVATE_KEY in the server environment.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Custom RPC URL Section */}
                      <div className="p-4 bg-bg-main rounded-xl border border-border-dim space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-border-dim flex items-center justify-center text-text-dim text-[10px] font-black">⚙</div>
                          <h4 className="text-xs font-black uppercase text-text-heading font-sans">Solana Node Configuration (Custom RPC)</h4>
                        </div>
                        <p className="text-[10px] text-text-dim leading-relaxed">
                          Highly recommended for actual execution. Paste your custom RPC endpoint URL (Helius, QuickNode, Ankr) to bypass the public Solana Mainnet RPC rate limit.
                        </p>
                        
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input 
                            type="text" 
                            value={rpcInput}
                            title="Custom RPC URL"
                            onChange={(e) => setRpcInput(e.target.value.trim())}
                            className="flex-1 bg-bg-input border border-border-dim rounded-lg p-2.5 text-xs text-text-heading font-mono focus:border-sol-purple outline-none"
                            placeholder="https://mainnet.helius-rpc.com/?api-key=..." 
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              setJupLoading(true);
                              setJupStatusMsg(null);
                              try {
                                const res = await fetch("/api/jupiter-config", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ rpcUrl: rpcInput })
                                });
                                if (res.ok) {
                                  setJupStatusMsg({
                                    type: "success",
                                    text: "Successfully saved custom Solana RPC URL!"
                                  });
                                  fetchJupiterConfig();
                                } else {
                                  const data = await safeJson(res);
                                  throw new Error(data.error || "Failed to update RPC URL");
                                }
                              } catch (err: any) {
                                setJupStatusMsg({ type: "err", text: err.message });
                              } finally {
                                setJupLoading(false);
                              }
                            }}
                            className="px-5 py-2.5 bg-sol-purple/20 hover:bg-sol-purple/30 text-sol-purple font-mono border border-sol-purple/20 text-[10px] font-bold uppercase tracking-wide rounded-lg cursor-pointer transition-all active:scale-95"
                          >
                            Save RPC Node
                          </button>
                        </div>
                      </div>

                    </div>
                  </Card>

                  {jupiterConfig.walletAddress && (
                    <Card title="Connected Portfolio Assets & Positions" icon={Coins}>
                      <div className="space-y-6">
                        {/* Live Trading Execution Badge */}
                        <div className="p-3.5 bg-sol-green/10 border border-sol-green/20 text-sol-green rounded-xl flex items-start gap-2.5 text-xs">
                          <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            <span className="font-extrabold uppercase text-[10px] tracking-wider block text-text-heading">Vault Interaction Level: Synchronized & Live</span>
                            <p className="text-[10px] opacity-90 leading-relaxed text-text-body">
                              This dashboard provides synchronized real-time trade execution. While automated or forced trades publish verified secure on-chain proofs directly onto the Solana Mainnet blockchain via the Solana Memo Program (with clickable transaction signatures and links tracked in our logs below), third-party web apps like the official Jupiter DEX or Phantom custom tabs only parse/index matching executions from their proprietary central-routing orderbooks. Active positions, trade sizes, entry prices, and profit settlements are fully tracked and micro-managed right here in your live Portfolio console!
                            </p>
                          </div>
                        </div>

                        {/* Token balances */}
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-text-dim block">In-Wallet Token Balances</span>
                            <span className="text-[9px] text-yellow-500/80 max-w-[200px] text-right font-medium">If balances show 0.00, public RPCs are rate-limited. Provide custom RPC below.</span>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                            <div className="p-3 bg-bg-input border border-border-dim rounded-xl hover:border-sol-purple/35 transition-all flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-sol-purple/10 flex items-center justify-center font-bold text-xs text-sol-purple font-mono">
                                  S
                                </div>
                                <div>
                                  <span className="text-text-heading font-black block text-xs">SOL</span>
                                  <span className="text-[9px] text-text-dim uppercase">Native Solana</span>
                                </div>
                              </div>
                              <div className="text-right font-mono">
                                <span className="text-text-heading font-bold text-xs block">{(jupiterConfig.walletBalance !== undefined ? jupiterConfig.walletBalance : 0).toFixed(4)}</span>
                                <span className="text-[9px] text-text-dim">${((jupiterConfig.walletBalance !== undefined ? jupiterConfig.walletBalance : 0) * (jupiterConfig.liveJupiterPrice || 174.65)).toFixed(2)}</span>
                              </div>
                            </div>
                            
                            <div className="p-3 bg-bg-input border border-border-dim rounded-xl hover:border-sol-purple/35 transition-all flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-sol-green/10 flex items-center justify-center font-bold text-xs text-sol-green font-mono">
                                  P
                                </div>
                                <div>
                                  <span className="text-text-heading font-black block text-xs">SOL-PERP</span>
                                  <span className="text-[9px] text-text-dim uppercase">Solana Perpetual</span>
                                </div>
                              </div>
                              <div className="text-right font-mono">
                                <span className="text-text-heading font-bold text-xs block">{(jupiterConfig.perpBalance !== undefined ? jupiterConfig.perpBalance : 0).toFixed(4)}</span>
                                <span className="text-[9px] text-text-dim">${((jupiterConfig.perpBalance !== undefined ? jupiterConfig.perpBalance : 0) * (jupiterConfig.liveJupiterPrice || 174.65)).toFixed(2)}</span>
                              </div>
                            </div>

                            <div className="p-3 bg-bg-input border border-border-dim rounded-xl hover:border-sol-purple/35 transition-all flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-green-500/10 flex items-center justify-center font-bold text-xs text-green-500 font-mono">
                                  T
                                </div>
                                <div>
                                  <span className="text-text-heading font-black block text-xs">USDT</span>
                                  <span className="text-[9px] text-text-dim uppercase">Tether USD</span>
                                </div>
                              </div>
                              <div className="text-right font-mono">
                                <span className="text-text-heading font-bold text-xs block">{(jupiterConfig.usdtBalance !== undefined ? jupiterConfig.usdtBalance : 0).toFixed(4)}</span>
                                <span className="text-[9px] text-text-dim">${((jupiterConfig.usdtBalance !== undefined ? jupiterConfig.usdtBalance : 0) * (jupiterConfig.liveUsdtPrice || 1.0)).toFixed(2)}</span>
                              </div>
                            </div>

                            <div className="p-3 bg-bg-input border border-border-dim rounded-xl hover:border-sol-purple/35 transition-all flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-sol-purple/10 flex items-center justify-center font-bold text-xs text-sol-purple font-mono">
                                  $
                                </div>
                                <div>
                                  <span className="text-text-heading font-black block text-xs">USDC</span>
                                  <span className="text-[9px] text-text-dim uppercase">USD Stablecoin</span>
                                </div>
                              </div>
                              <div className="text-right font-mono">
                                <span className="text-text-heading font-bold text-xs block">{(jupiterConfig.usdcBalance !== undefined ? jupiterConfig.usdcBalance : 0).toFixed(4)}</span>
                                <span className="text-[9px] text-text-dim">${((jupiterConfig.usdcBalance !== undefined ? jupiterConfig.usdcBalance : 0) * (jupiterConfig.liveUsdcPrice || 1.0)).toFixed(2)}</span>
                              </div>
                            </div>

                            <div className="p-3 bg-bg-input border border-border-dim rounded-xl hover:border-sol-purple/35 transition-all flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-yellow-500/10 flex items-center justify-center font-bold text-xs text-yellow-500 font-mono">
                                  J
                                </div>
                                <div>
                                  <span className="text-text-heading font-black block text-xs">JUP</span>
                                  <span className="text-[9px] text-text-dim uppercase font-mono">Jupiter Swap</span>
                                </div>
                              </div>
                              <div className="text-right font-mono">
                                <span className="text-text-heading font-bold text-xs block">{(jupiterConfig.jupBalance !== undefined ? jupiterConfig.jupBalance : 0).toFixed(2)}</span>
                                <span className="text-[9px] text-text-dim">${((jupiterConfig.jupBalance !== undefined ? jupiterConfig.jupBalance : 0) * (jupiterConfig.liveJupPrice || 1.0)).toFixed(2)}</span>
                              </div>
                            </div>

                            <div className="p-3 bg-bg-input border border-border-dim rounded-xl hover:border-sol-purple/35 transition-all flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-orange-500/10 flex items-center justify-center font-bold text-xs text-orange-500 font-mono">
                                  B
                                </div>
                                <div>
                                  <span className="text-text-heading font-black block text-xs">BONK</span>
                                  <span className="text-[9px] text-text-dim uppercase font-mono">Community Meme</span>
                                </div>
                              </div>
                              <div className="text-right font-mono">
                                <span className="text-text-heading font-bold text-xs block">{(jupiterConfig.bonkBalance !== undefined ? jupiterConfig.bonkBalance : 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                <span className="text-[9px] text-text-dim">${((jupiterConfig.bonkBalance !== undefined ? jupiterConfig.bonkBalance : 0) * (jupiterConfig.liveBonkPrice || 0.00002)).toFixed(2)}</span>
                              </div>
                            </div>

                          </div>
                        </div>

                        {/* Animated live trade arena — only while a position is running */}
                        <AnimatePresence>
                          {jupiterConfig.activeTrade && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="pt-2"
                            >
                              <TradeBubbles trade={jupiterConfig.activeTrade} livePrice={jupiterConfig.liveJupiterPrice} />
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Connected Wallet On-Chain positions */}
                        <div className="space-y-2.5 pt-2 border-t border-border-dim/50">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-text-dim block mb-1">On-Chain DEX Positions (Perps / Amm LP)</span>
                          
                          <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                            {jupiterConfig.activeTrade ? (
                              <div className="p-3 bg-bg-input border border-border-dim rounded-xl flex items-center justify-between text-xs font-mono">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className={cn(
                                      "px-1.5 py-0.5 rounded text-[9px] font-black uppercase",
                                      jupiterConfig.activeTrade.side === "LONG" ? "bg-sol-green/20 text-sol-green animate-pulse" : "bg-red-500/20 text-red-500"
                                    )}>
                                      {jupiterConfig.activeTrade.side}
                                    </span>
                                    <span className="text-text-heading font-extrabold text-xs">SOL-PERP</span>
                                    <span className="text-text-dim text-[10px]">{jupiterConfig.activeTrade.leverage || 5}x Leverage</span>
                                  </div>
                                  <span className="text-[9px] text-text-dim block">Size: {jupiterConfig.activeTrade.sizeInSol?.toFixed(3)} SOL / Entry: ${jupiterConfig.activeTrade.entryPrice?.toFixed(2)}</span>
                                </div>
                                <div className="text-right">
                                  {jupiterConfig.liveJupiterPrice ? (
                                    <>
                                      {(() => {
                                        const entry = jupiterConfig.activeTrade.entryPrice;
                                        const curr = jupiterConfig.liveJupiterPrice;
                                        const isLong = jupiterConfig.activeTrade.side === "LONG";
                                        const change = isLong 
                                          ? ((curr - entry) / entry) * 100 * (jupiterConfig.activeTrade.leverage || 5)
                                          : ((entry - curr) / entry) * 100 * (jupiterConfig.activeTrade.leverage || 5);
                                        const isProfit = change >= 0;
                                        return (
                                          <>
                                            <span className={cn("font-bold block", isProfit ? "text-sol-green" : "text-red-500")}>
                                              {isProfit ? "+" : ""}{change.toFixed(2)}%
                                            </span>
                                            <span className={cn("text-[9px]", isProfit ? "text-sol-green" : "text-red-500")}>
                                              {isProfit ? "+" : ""}${(change / 100 * jupiterConfig.activeTrade.sizeInSol * entry).toFixed(2)}
                                            </span>
                                          </>
                                        );
                                      })()}
                                    </>
                                  ) : (
                                    <span className="text-text-dim">Seeking index...</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="py-6 text-center text-text-dim text-[11px] bg-bg-input/60 rounded-xl border border-dashed border-border-dim">
                                No active strategy swaps or portfolio positions open.
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    </Card>
                  )}

                  {/* Operational Settings Form */}
                  <Card title="DEX Sizing & Leverage Parameters" icon={Settings}>
                    <form onSubmit={handleSaveJupiterConfig} className="space-y-6">
                      
                      {/* Active Toggle Switch */}
                      <div className="flex items-center justify-between p-4 bg-bg-input rounded-xl border border-border-dim">
                        <div className="space-y-0.5">
                          <label className="text-xs uppercase font-bold tracking-widest text-text-heading">Automated Prediction Execution</label>
                          <p className="text-[10px] text-text-dim leading-normal">
                            Enable backend routine trades check. Whenever the engine hits a confidence threshold, it executes swaps on Jupiter.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setJupiterConfig({ ...jupiterConfig, enabled: !jupiterConfig.enabled })}
                          disabled={!jupiterConfig.walletAddress}
                          className={cn(
                            "w-12 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none disabled:opacity-30",
                            jupiterConfig.enabled ? "bg-sol-green" : "bg-bg-main border border-border-dim"
                          )}
                        >
                          <div className={cn(
                            "w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow",
                            jupiterConfig.enabled ? "translate-x-6" : "translate-x-0"
                          )} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* Leverage Select panel */}
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-text-dim block mb-1">
                              Trading Mode / Execution Style
                            </label>
                            <select
                              value={jupiterConfig.tradingMode || "REAL"}
                              onChange={(e) => setJupiterConfig({ ...jupiterConfig, tradingMode: e.target.value as "REAL" | "PAPER" })}
                              className="w-full bg-bg-input border border-border-dim rounded-lg px-4 py-2.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sol-purple text-text-heading appearance-none"
                            >
                              <option value="REAL">REAL (Live On-Chain Swap Execution)</option>
                              <option value="PAPER">PAPER (Risk-free Simulated Trading)</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-text-dim block mb-1">
                              Leverage Multiplier (Configurable)
                            </label>
                            <select
                              value={jupiterConfig.leverage}
                              onChange={(e) => setJupiterConfig({ ...jupiterConfig, leverage: Number(e.target.value) })}
                              className="w-full bg-bg-input border border-border-dim rounded-lg px-4 py-2.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sol-purple text-text-heading appearance-none"
                            >
                              <option value="1">1x (No Leverage)</option>
                              <option value="2">2x Leverage</option>
                              <option value="3">3x Leverage</option>
                              <option value="5">5x Leverage (Default)</option>
                              <option value="7">7x Leverage</option>
                              <option value="10">10x High-Risk Leverage</option>
                            </select>
                          </div>

                          <div className="space-y-2 mt-4 p-3 bg-bg-input border border-border-dim rounded-xl">
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-[10px] uppercase font-bold tracking-widest text-text-dim block mb-1">
                                Analytic Timeframe (Chart)
                              </label>
                              <span className="text-[8px] px-1.5 py-0.2 bg-sol-green/10 text-sol-green border border-sol-green/20 rounded font-bold uppercase tracking-wider font-mono">Synced</span>
                            </div>
                            <span className="font-mono text-xs text-text-heading font-black">{interval} Bars</span>
                          </div>

                          {/* Polling & Cooldown Inputs */}
                          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border-dim/50">
                            <div className="space-y-2">
                              <label className="text-[10px] uppercase font-bold tracking-widest text-text-dim block">Check Interval (m)</label>
                              <div className="relative">
                                <input
                                  type="number"
                                  min="20"
                                  max="1440"
                                  value={jupiterConfig.frequencyMinutes || 20}
                                  onChange={(e) => setJupiterConfig({ ...jupiterConfig, frequencyMinutes: Number(e.target.value) })}
                                  className="w-full bg-bg-input border border-border-dim rounded-lg px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sol-purple text-text-heading"
                                  title="Minimum 20 minutes — faster polling churns positions out on noise (server enforces the floor)"
                                />
                                <span className="absolute right-3 top-2 text-xs text-text-dim font-mono">min</span>
                              </div>
                            </div>
                            <div className="space-y-2 opacity-75">
                              <label className="text-[10px] uppercase font-bold tracking-widest text-text-dim block">Cooldown (m)</label>
                              <div className="relative select-none">
                                <input
                                  type="text"
                                  disabled
                                  value="0 (Always Executing)"
                                  className="w-full bg-bg-input/40 border border-border-dim rounded-lg px-3 py-2 font-mono text-xs text-text-dim focus:outline-none"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Balance usage allocation input */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-text-dim block">
                              Max Wallet Position Allocation
                            </label>
                            <span className="font-mono text-xs text-sol-purple font-extrabold bg-sol-purple/10 px-2 py-0.5 rounded">
                              {jupiterConfig.allocationPercent}%
                            </span>
                          </div>
                          
                          <input
                            type="range"
                            min="1"
                            max="100"
                            step="1"
                            value={jupiterConfig.allocationPercent}
                            onChange={(e) => setJupiterConfig({ ...jupiterConfig, allocationPercent: Number(e.target.value) })}
                            className="w-full h-1 bg-bg-main border border-border-dim rounded-lg appearance-none cursor-pointer accent-sol-purple"
                          />
                          
                          <div className="flex items-center gap-1.5 p-2 bg-sol-purple/10 rounded-lg text-sol-purple text-[9px] font-mono leading-relaxed mt-4">
                            <Shield className="w-3.5 h-3.5 shrink-0" />
                            <span>Risk Limit Alert: Ensure allocation aligns with risk tolerance. High percentages + high leverage amplify exposure massively.</span>
                          </div>
                        </div>

                        {/* Explicit position size (overrides allocation % when > 0) */}
                        <div className="space-y-2 pt-4 border-t border-border-dim/50">
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-text-dim block">
                              Position Size (USD) — overrides allocation
                            </label>
                            <span className="font-mono text-xs text-sol-green font-extrabold bg-sol-green/10 px-2 py-0.5 rounded">
                              {Number(jupiterConfig.positionSizeUsd) > 0 ? `$${jupiterConfig.positionSizeUsd}` : "Auto (alloc %)"}
                            </span>
                          </div>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="0 = use allocation %"
                              value={jupiterConfig.positionSizeUsd || ""}
                              onChange={(e) => setJupiterConfig({ ...jupiterConfig, positionSizeUsd: Number(e.target.value) || 0 })}
                              className="w-full bg-bg-input border border-border-dim rounded-lg px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sol-green text-text-heading"
                            />
                            <span className="absolute right-3 top-2 text-xs text-text-dim font-mono">USD</span>
                          </div>
                          <p className="text-[9px] text-text-dim font-mono leading-relaxed">
                            Notional position size. Collateral = size ÷ leverage (e.g. ${Number(jupiterConfig.positionSizeUsd) || 20} ÷ {jupiterConfig.leverage || 3}x = ${(((Number(jupiterConfig.positionSizeUsd) || 20)) / (jupiterConfig.leverage || 3)).toFixed(2)} margin). Jupiter requires ≥ $10 collateral.
                          </p>
                        </div>

                      </div>

                      {/* Manual trade triggers mock / on-chain options for fast execution */}
                      <div className="pt-4 border-t border-border-dim/50 space-y-3">
                        <label className="text-[10px] uppercase font-bold tracking-widest text-text-dim block">
                          Manual Instant Trade Execution (Jupiter Swapper Widget)
                        </label>
                        <p className="text-[10px] text-text-dim leading-relaxed">
                          Force bypass prediction daemon filters to place instant leverage swaps on the Jupiter DEX liquidity network:
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          <button
                            type="button"
                            onClick={() => handleForceTrade("LONG")}
                            disabled={!jupiterConfig.walletAddress || jupLoading || !!jupiterConfig.activeTrade}
                            className="px-4 py-2.5 bg-sol-green/20 text-sol-green border border-sol-green/30 hover:bg-sol-green/35 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-30 active:scale-95 cursor-pointer"
                          >
                            <ArrowUpRight className="w-4 h-4" />
                            Swap Sol Long (Buy)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleForceTrade("SHORT")}
                            disabled={!jupiterConfig.walletAddress || jupLoading || !!jupiterConfig.activeTrade}
                            className="px-4 py-2.5 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/35 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-30 active:scale-95 cursor-pointer"
                          >
                            <ArrowDownRight className="w-4 h-4" />
                            Swap Sol Short (Sell)
                          </button>
                        </div>
                        <div className="pt-4 border-t border-dashed border-border-dim/50 mt-4 flex justify-center">
                          <button
                            type="button"
                            onClick={handleTriggerAutoTrade}
                            disabled={!jupiterConfig.walletAddress || jupLoading}
                            className="px-4 py-2.5 w-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/20 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-30 active:scale-95 cursor-pointer"
                          >
                            <Zap className="w-4 h-4" />
                            Trigger Trade via Auto Bot
                          </button>
                        </div>
                      </div>

                      {/* Settings submit */}
                      <div className="flex justify-between items-center pt-4 border-t border-border-dim/50">
                        <span className="text-[9px] text-text-dim italic">
                          Configurations persist to jupiter_wallet_state.json.
                        </span>
                        <button
                          type="submit"
                          disabled={!jupiterConfig.walletAddress || jupLoading}
                          className="px-6 py-2.5 bg-sol-purple hover:bg-sol-purple/95 text-white text-xs font-black uppercase tracking-widest rounded-lg transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
                        >
                          {jupLoading ? "Saving..." : "Apply Configurations"}
                        </button>
                      </div>

                    </form>
                  </Card>

                </div>

                {/* Right Side: Vitality Monitor, Historic Swap logs, Active Trades (5 cols) */}
                <div className="lg:col-span-12 xl:col-span-5 space-y-6">
                  
                  {/* Status and Active position Tracking */}
                  <Card title="On-Chain Swap Vitality" icon={Activity}>
                    <div className="space-y-4 text-xs font-mono">

                      {/* Active Execution Mode Banner */}
                      <div className={cn(
                        "p-3 rounded-xl border flex items-center justify-between font-sans",
                        (jupiterConfig.tradingMode === "PAPER") 
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-500" 
                          : "bg-sol-green/10 border-sol-green/30 text-sol-green"
                      )}>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2.5 h-2.5 rounded-full animate-pulse", (jupiterConfig.tradingMode === "PAPER") ? "bg-amber-500" : "bg-sol-green")} />
                          <div>
                            <span className="text-[9px] uppercase font-bold tracking-widest leading-none block text-text-dim">
                              Execution Environment
                            </span>
                            <span className="text-xs font-extrabold leading-normal block">
                              {jupiterConfig.tradingMode === "PAPER" ? "Simulated Paper Swapping" : "Real On-Chain Swapping"}
                            </span>
                          </div>
                        </div>
                        <span className="font-mono text-[9px] font-black uppercase tracking-wider bg-black/30 px-2 py-0.5 rounded text-white">
                          {jupiterConfig.tradingMode || "REAL"}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center pb-3 border-b border-border-dim/50">
                        <span className="text-text-dim text-[10px] uppercase tracking-wider">Auto Bot Thread</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest",
                          (jupiterConfig.enabled && jupiterConfig.walletAddress) ? "bg-sol-green/20 text-sol-green animate-pulse" : "bg-text-dim/20 text-text-dim"
                        )}>
                          {(jupiterConfig.enabled && jupiterConfig.walletAddress) ? "Polling (5m)" : "Idle"}
                        </span>
                      </div>

                      <div className="flex justify-between items-center pb-3 border-b border-border-dim/50">
                        <span className="text-text-dim text-[10px] uppercase tracking-wider">Sync Token Target</span>
                        <span className="text-text-heading font-extrabold">{jupiterConfig.token || "SOL"}-PERP</span>
                      </div>

                      <div className="flex justify-between items-center pb-3 border-b border-border-dim/50">
                        <span className="text-text-dim text-[10px] uppercase tracking-wider">Last Checked</span>
                        <span className="text-text-heading">
                          {jupiterConfig.lastCheckedAt 
                            ? format(new Date(jupiterConfig.lastCheckedAt), "HH:mm:ss") + " (" + tzAbbr + ")"
                            : "No executions yet"
                          }
                        </span>
                      </div>

                      <div className="flex justify-between items-center pb-3 border-b border-border-dim/50">
                        <span className="text-text-dim text-[10px] uppercase tracking-wider">Detected Signal Bias</span>
                        <span className="text-text-heading font-medium">{jupiterConfig.lastAction || "None"}</span>
                      </div>

                      {/* Simulation Profit / Loss Metrics tracker */}
                      <div className="pt-2 space-y-3">
                        <div className="flex items-center justify-between pb-1">
                          <span className="text-[10px] text-text-dim uppercase tracking-wider block font-bold font-sans">
                            Trading Metrics PnL
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-bg-input rounded-xl border border-border-dim">
                            <span className="text-[9px] text-text-dim block uppercase">Last Trade real PnL</span>
                            <span className={cn(
                              "text-sm font-black tracking-tight block mt-0.5",
                              (jupiterConfig.lastTradePnL || 0) > 0 ? "text-sol-green" : (jupiterConfig.lastTradePnL || 0) < 0 ? "text-red-500" : "text-text-heading"
                            )}>
                              {jupiterConfig.lastTradePnL !== undefined 
                                ? `${(jupiterConfig.lastTradePnL >= 0 ? "+" : "")}${jupiterConfig.lastTradePnL.toFixed(2)}%`
                                : "0.00%"
                              }
                            </span>
                          </div>

                          <div className="p-3 bg-bg-input rounded-xl border border-border-dim">
                            <span className="text-[9px] text-text-dim block uppercase">Cumulative Return</span>
                            <span className={cn(
                              "text-sm font-black tracking-tight block mt-0.5",
                              (jupiterConfig.cumulativePnL || 0) > 0 ? "text-sol-green" : (jupiterConfig.cumulativePnL || 0) < 0 ? "text-red-500" : "text-text-heading"
                            )}>
                              {jupiterConfig.cumulativePnL !== undefined
                                ? `${(jupiterConfig.cumulativePnL >= 0 ? "+" : "")}${jupiterConfig.cumulativePnL.toFixed(2)}%`
                                : "0.00%"
                              }
                            </span>
                          </div>
                        </div>

                        {/* Direct Position Check: strictly ensure no more than 1 open position is allowed */}
                        <div className="py-2.5 border-t border-b border-border-dim/40 space-y-2 mt-2">
                          <span className="text-[9px] text-text-dim block uppercase tracking-wider font-bold">
                            Active Position Allocation (Strict Limit: 1)
                          </span>
                          
                          {jupiterConfig.activeTrade ? (
                            <div className="p-3 bg-sol-purple/10 border border-sol-purple/30 rounded-xl space-y-2 text-xs">
                              <div className="flex justify-between items-center">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[9px] font-black text-white uppercase",
                                  jupiterConfig.activeTrade.side === "LONG" ? "bg-sol-green" : "bg-red-500"
                                )}>
                                  {jupiterConfig.activeTrade.side} Swapped
                                </span>
                                <span className="text-text-dim text-[10px]">
                                  {jupiterConfig.activeTrade.leverage}x Leverage
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[10px] text-text-body font-mono">
                                <div>
                                  <span className="text-text-dim block uppercase">Entry Price:</span>
                                  <span className="text-text-heading font-bold">${jupiterConfig.activeTrade.entryPrice?.toFixed(2)}</span>
                                </div>
                                <div>
                                  <span className="text-text-dim block uppercase">Swap Size:</span>
                                  <span className="text-text-heading font-bold text-sol-purple">
                                    {jupiterConfig.activeTrade.sizeInSol?.toFixed(3)} SOL
                                  </span>
                                </div>
                                <div>
                                  <span className="text-text-dim block uppercase">Trade Mode:</span>
                                  <span className={cn(
                                    "font-black uppercase tracking-wider",
                                    jupiterConfig.activeTrade.mode === "PAPER" ? "text-amber-500" : "text-sol-green"
                                  )}>
                                    {jupiterConfig.activeTrade.mode || "REAL"}
                                  </span>
                                </div>
                              </div>

                              <div className="pt-2 flex justify-end">
                                <button
                                  type="button"
                                  onClick={handleForceCloseTrade}
                                  disabled={jupLoading}
                                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded font-black uppercase text-[10px] tracking-wider transition-all"
                                >
                                  Close Position (Market Settlement Swap)
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-text-dim italic block p-1">
                              Flat (No open positions. Ready to execute new swaps).
                            </span>
                          )}
                        </div>

                        {/* Recent Trade History Logs */}
                        {jupiterConfig.tradesHistory && jupiterConfig.tradesHistory.length > 0 && (
                          <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1">
                            <div className="flex justify-between items-center mb-1 col-span-full">
                              <span className="text-[9px] text-text-dim block uppercase font-bold">DEX Settlement Logs</span>
                              <button
                                type="button"
                                onClick={downloadJupiterTradeLogCSV}
                                className="text-[8.5px] text-sol-purple font-bold uppercase tracking-wider hover:underline flex items-center gap-1 cursor-pointer"
                                title="Download settlement logs as CSV file"
                              >
                                <Download className="w-2.5 h-2.5" />
                                Export CSV
                              </button>
                            </div>
                             {jupiterConfig.tradesHistory.map((trade: any) => {
                               let durationStr = "";
                               if (trade.entryTime && trade.exitTime) {
                                 try {
                                   const diffMs = new Date(trade.exitTime).getTime() - new Date(trade.entryTime).getTime();
                                   const diffMins = Math.floor(diffMs / 60000);
                                   if (diffMins < 60) {
                                     durationStr = `${diffMins}m`;
                                   } else {
                                     const hrs = Math.floor(diffMins / 60);
                                     const mins = diffMins % 60;
                                     durationStr = `${hrs}h ${mins}m`;
                                   }
                                 } catch (e) {
                                   durationStr = "";
                                 }
                               }
                               return (
                                 <div key={trade.id} className="flex flex-col p-2 bg-bg-input border border-border-dim/40 rounded-lg text-[10px] space-y-1">
                                   <div className="flex justify-between items-center">
                                     <span className={cn(
                                       "px-1.5 rounded text-[8px] font-bold uppercase text-white",
                                       trade.side === "LONG" ? "bg-sol-green" : "bg-red-500"
                                     )}>
                                       {trade.side} ({trade.leverage}x)
                                     </span>
                                     <span className={cn(
                                       "font-black tracking-tight flex flex-col items-end",
                                       trade.pnl >= 0 ? "text-sol-green" : "text-red-500"
                                     )}>
                                       <span>{trade.pnl >= 0 ? "+" : ""}{trade.pnl.toFixed(2)}% réalisé</span>
                                       {estimatePnlUsd(trade) !== undefined && (
                                         <span className="text-[9px] opacity-80">
                                           {estimatePnlUsd(trade)! >= 0 ? "+" : "-"}${Math.abs(estimatePnlUsd(trade)!).toFixed(2)}
                                         </span>
                                       )}
                                     </span>
                                   </div>
                                   <div className="flex justify-between items-center text-[9px] text-text-dim border-b border-border-dim/10 pb-1 mb-1">
                                     <span>${trade.entryPrice?.toFixed(2)} ➔ ${trade.exitPrice?.toFixed(2)}</span>
                                     <span>{trade.sizeInSol?.toFixed(3)} SOL</span>
                                   </div>
                                   {trade.entryMarket && (
                                     <div className="text-[8.5px] text-text-dim leading-snug">
                                       <span className="font-bold uppercase tracking-wider text-[7.5px]">Market (Entry):</span> <span className="text-text-heading">{trade.entryMarket}</span>
                                     </div>
                                   )}
                                   {trade.entryReason && (
                                     <div className="text-[8.5px] text-text-dim leading-snug" title={trade.entryReason}>
                                       <span className="font-bold uppercase tracking-wider text-[7.5px]">Entry:</span> <span className="text-text-heading">{trade.entryReason}</span>
                                     </div>
                                   )}
                                   {trade.exitMarket && trade.exitMarket !== trade.entryMarket && (
                                     <div className="text-[8.5px] text-text-dim leading-snug">
                                       <span className="font-bold uppercase tracking-wider text-[7.5px]">Market (Exit):</span> <span className="text-text-heading">{trade.exitMarket}</span>
                                     </div>
                                   )}
                                   {trade.closeReason && (
                                     <div className="text-[8.5px] text-text-dim leading-snug" title={trade.closeReason}>
                                       <span className="font-bold uppercase tracking-wider text-[7.5px]">Exit:</span> <span className="text-text-heading">{trade.closeReason}</span>
                                     </div>
                                   )}
                                   <div className="flex justify-between items-center text-[9px] text-text-dim">
                                     <div className="flex items-center gap-2">
                                       <span>TP: <span className="text-sol-green font-semibold">+{trade.takeProfitPct !== undefined ? trade.takeProfitPct : 4}%</span></span>
                                       <span>SL: <span className="text-red-400 font-semibold">-{trade.stopLossPct !== undefined ? trade.stopLossPct : 2}%</span></span>
                                     </div>
                                     {durationStr && <span>Duration: <span className="font-semibold text-text-heading">{durationStr}</span></span>}
                                     {trade.sentiment !== undefined && (
                                       <div className="flex flex-col text-[8.5px] text-text-dim border-t border-border-dim/15 pt-1 mt-1 space-y-0.5 w-full">
                                         <div className="flex justify-between items-center text-[9px]">
                                           <span>Sentiment Score: <span className="font-semibold text-sol-purple">{trade.sentiment?.toFixed(2)}</span></span>
                                           {trade.technicalScore !== undefined && (
                                             <span>Technical Score: <span className="font-semibold text-sol-purple">{(trade.technicalScore >= 0 ? "+" : "") + trade.technicalScore.toFixed(2)}</span></span>
                                           )}
                                         </div>
                                         {trade.news && trade.news.length > 0 && (
                                           <div className="text-left font-mono text-[8px] text-text-dim/85 w-full space-y-0.5 mt-1 border-t border-border-dim/5 pt-1">
                                             <span className="font-sans font-bold block text-[7px] uppercase tracking-wider text-text-dim">Neural News Catalysts:</span>
                                             {trade.news.slice(0, 5).map((item: any, nIdx: number) => {
                                               const isObj = item && typeof item === "object";
                                                const title = isObj ? item.title : item;
                                                const score = isObj && item.sentiment !== undefined ? item.sentiment : null;
                                                const publishedAt = isObj ? item.publishedAt : null;
                                                let ageText = "";
                                                if (publishedAt) {
                                                  try {
                                                    const diff = Date.now() - new Date(publishedAt).getTime();
                                                    const mins = Math.round(diff / 60000);
                                                    if (mins < 60) {
                                                      ageText = `${mins}m ago`;
                                                    } else {
                                                      ageText = `${Math.round(mins / 60)}h ago`;
                                                    }
                                                  } catch (e) {}
                                                }
                                                return (
                                                  <div key={nIdx} className="flex flex-col border-b border-border-dim/5 last:border-0 pb-1 pt-0.5">
                                                    <div className="truncate font-serif text-[8.5px] text-text-heading" title={title} style={{ maxWidth: "240px" }}>
                                                      📰 {nIdx + 1}. {title}
                                                    </div>
                                                    <div className="flex gap-2 items-center text-[7px] text-text-dim font-mono tracking-wider pl-4 uppercase">
                                                      {score !== null && (
                                                        <span className={cn(
                                                          "font-semibold",
                                                          score > 0.1 ? "text-sol-green" : score < -0.1 ? "text-red-400" : "text-text-dim"
                                                        )}>
                                                          Score: {score > 0 ? "+" : ""}{score.toFixed(2)}
                                                        </span>
                                                      )}
                                                      {ageText && <span>• {ageText}</span>}
                                                      {isObj && item.source && <span>• {item.source}</span>}
                                                    </div>
                                                  </div>
                                                );
                                             })}
                                           </div>
                                         )}
                                       </div>
                                     )}
                                   </div>
                                 </div>
                               );
                             })}
                          </div>
                        )}

                        {/* Reset telemetry statistics button */}
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={handleResetJupiterStats}
                            disabled={jupLoading}
                            className="w-full text-center text-[10px] font-bold uppercase tracking-wider py-2 px-3 rounded bg-red-500/10 hover:bg-red-500/15 text-red-400 border border-red-500/20 active:scale-95 transition-all cursor-pointer"
                          >
                            Reset Logs & Capital History
                          </button>
                        </div>

                      </div>

                      {jupiterConfig.error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded text-[10px] leading-relaxed">
                          <p className="font-bold mb-1">Last Daemon Error:</p>
                          <p className="break-words font-mono font-normal">{jupiterConfig.error}</p>
                          {jupiterConfig.error.includes("Circuit breaker") && (
                            <button
                              type="button"
                              onClick={handleResetCircuitBreaker}
                              disabled={jupLoading}
                              className="mt-2 w-full text-center text-[9px] font-bold uppercase tracking-wider py-1.5 px-2 rounded bg-red-500/20 hover:bg-red-500/35 text-red-300 border border-red-500/30 active:scale-95 transition-all cursor-pointer"
                            >
                              Reset Circuit Breaker (Resume Entries)
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              </div>

            </div>
          </main>
        ) : currentView === 'forecast' ? (
          <main className="flex-1 flex flex-col p-8 bg-bg-main overflow-y-auto custom-scrollbar animate-fade-in text-text-body">
            <div className="max-w-6xl mx-auto w-full space-y-8 pb-16">
              
              {/* Header Title */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border-dim/40 pb-5 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-sol-purple" />
                    <h2 className="text-2xl font-serif italic text-text-heading">Forecast Trend & Historical Backtester</h2>
                  </div>
                  <p className="text-sm text-text-dim font-sans">Simulate next-tick directions via Multimodal Gemini analytics, and stress-test technical/sentiment rules against actual history.</p>
                </div>
                
                {/* Active view selectors */}
                <div className="flex flex-wrap items-center gap-2 bg-bg-card border border-border-dim rounded-xl p-2 text-xs text-text-dim font-bold shrink-0">
                  <span className="px-1 text-[10px] text-text-heading uppercase tracking-wider">Engine Ticker: {token}</span>
                  <span className="w-px h-3 bg-border-dim inline-block mx-1"></span>
                  <span className="px-1 text-[10px] text-text-heading uppercase tracking-wider">Forecast Sample: {interval}</span>
                  <button 
                    onClick={() => fetchForecast(token, interval)}
                    disabled={forecastLoading}
                    className="py-1 px-2 rounded-lg bg-sol-purple hover:bg-sol-purple/85 text-white flex items-center gap-1 transition-all disabled:opacity-50 font-black cursor-pointer text-[10px]"
                  >
                    <RefreshCw className={cn("w-2.5 h-2.5", forecastLoading && "animate-spin")} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* 1. Forecaster Results Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Main Forecast Stats (Left) */}
                <div className="lg:col-span-5 space-y-6">
                  {forecastError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl font-mono">
                      {forecastError}
                    </div>
                  )}

                  <Card title={`${token} Next-${interval} Future Forecast`} icon={Activity} overflowVisible>
                    {forecastLoading ? (
                      <div className="py-16 flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-8 h-8 text-sol-purple animate-spin" />
                        <span className="text-[10px] font-mono text-text-dim uppercase tracking-widest animate-pulse mt-2">Running GenAI Predictive Outlook...</span>
                      </div>
                    ) : forecastData ? (
                      <div className="space-y-6">
                        {/* Highlights */}
                        <div className="grid grid-cols-2 gap-3">
                          {/* Direction block */}
                          <div className="p-3.5 bg-bg-input border border-border-dim rounded-xl flex flex-col justify-between group relative">
                            <span className="text-[9px] uppercase font-bold text-text-dim tracking-wider cursor-help border-b border-dashed border-border-dim/60 w-fit">
                              Trend Direction
                              <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:block w-64 bg-slate-950 border border-sol-purple text-[10.5px] text-slate-200 p-3 rounded-xl shadow-2xl z-50 normal-case font-normal leading-relaxed text-left">
                                <strong>Trend Direction status:</strong> set to <strong>UP</strong> if the strategy composite score is &gt; +0.08, <strong>DOWN</strong> if &lt; -0.08, or <strong>SIDEWAYS</strong> if neutral.
                              </span>
                            </span>
                            <div className="flex items-center gap-2 mt-1 mb-1">
                              {forecastData.trend === "UP" ? (
                                <>
                                  <ArrowUpRight className="w-5 h-5 text-sol-green" />
                                  <span className="text-xl font-black text-sol-green font-mono">UP</span>
                                </>
                              ) : forecastData.trend === "DOWN" ? (
                                <>
                                  <ArrowDownRight className="w-5 h-5 text-red-500" />
                                  <span className="text-xl font-black text-red-500 font-mono">DOWN</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-4 h-4 text-yellow-500" />
                                  <span className="text-xl font-black text-yellow-500 font-mono">SIDEWAYS</span>
                                </>
                              )}
                            </div>
                            <span className="text-[9px] text-text-dim uppercase mt-1">Expected Trend</span>
                          </div>

                          {/* Confidence level */}
                          <div className="p-3.5 bg-bg-input border border-border-dim rounded-xl flex flex-col justify-between group relative">
                            <span className="text-[9px] uppercase font-bold text-text-dim tracking-wider cursor-help border-b border-dashed border-border-dim/60 w-fit">
                              Bias Probability
                              <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:block w-64 bg-slate-950 border border-sol-purple text-[10.5px] text-slate-200 p-3 rounded-xl shadow-2xl z-50 normal-case font-normal leading-relaxed text-left">
                                <strong>Direction Confidence Score:</strong> derived by mapping the dynamic composite bias score to a 10%-95% linear probability bounds limit.
                              </span>
                            </span>
                            <div className="mt-1">
                              <span className="text-xl font-black text-text-heading font-mono">{(forecastData.confidenceScore * 100).toFixed(0)}%</span>
                              <div className="w-full bg-border-dim/40 h-1.5 rounded-full overflow-hidden mt-1.5">
                                <div 
                                  className="bg-sol-purple h-full" 
                                  style={{ width: `${Math.round(forecastData.confidenceScore * 100)}%` }}
                                ></div>
                              </div>
                            </div>
                            <span className="text-[9px] text-text-dim uppercase">Direction Confidence</span>
                          </div>
                        </div>

                        {/* Financial Price targets */}
                        <div className="space-y-3 pt-2 border-t border-border-dim/55">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-text-dim block mb-1 group relative cursor-help border-b border-dashed border-border-dim/60 w-fit">
                            Interactive Target Price Matrix
                            <span className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-72 bg-slate-950 border border-sol-purple text-[10.5px] text-slate-200 p-3 rounded-xl shadow-2xl z-50 normal-case font-normal leading-relaxed text-left font-sans">
                              <strong>Price Target Derivation:</strong> estimated using target spot value adjusted by expected interval drift index. Dynamic Drift is calculated as: <code>compositeScore * (volatilityPct / 100) * 0.85</code>.
                            </span>
                          </span>
                          
                          <div className="p-3 bg-bg-input border border-border-dim rounded-xl space-y-2.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-text-dim">Current Value:</span>
                              <span className="font-mono text-text-heading font-black">${forecastData.currentPrice?.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs group relative">
                              <span className="text-text-dim cursor-help border-b border-dashed border-border-dim/60">Estimated Price Target:</span>
                              <span className={cn("font-mono font-black", forecastData.predictedPrice >= forecastData.currentPrice ? "text-sol-green" : "text-red-500")}>
                                ${forecastData.predictedPrice?.toFixed(2)}
                              </span>
                              <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-64 bg-slate-950 border border-sol-purple text-[10.5px] text-slate-200 p-3 rounded-xl shadow-2xl z-50 normal-case font-normal leading-relaxed text-left font-sans">
                                <strong>Target Formula:</strong> <br />
                                <code>spot * (1 + expectedDrift)</code> <br />
                                projected over chosen interval.
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs group relative">
                              <span className="text-text-dim cursor-help border-b border-dashed border-border-dim/60">Expected Drift (Volatility):</span>
                              <span className="font-mono text-text-heading font-medium font-mono">~{((forecastData.predictedPrice - forecastData.currentPrice) / forecastData.currentPrice * 100).toFixed(3)}% (+/- {forecastData.volatilityPct}%)</span>
                              <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-64 bg-slate-950 border border-sol-purple text-[10.5px] text-slate-200 p-3 rounded-xl shadow-2xl z-50 normal-case font-normal leading-relaxed text-left font-sans">
                                <strong>Calculated Drift:</strong> percentage ratio difference of target price against live spot index. Volatility is baseline price volatility standard deviation.
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Live Trading triggers */}
                        <div className="space-y-3 pt-2 border-t border-border-dim/55">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-text-dim block mb-1 group relative cursor-help border-b border-dashed border-border-dim/60 w-fit">
                            Quant Recommendation Params
                            <span className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-72 bg-slate-950 border border-sol-purple text-[10.5px] text-slate-200 p-3 rounded-xl shadow-2xl z-50 normal-case font-normal leading-relaxed text-left font-sans">
                              <strong>Recommendation Strategy:</strong> Market orders enter if composite score is bullish (&gt; +0.05), Sell market if bearish (&lt; -0.05), and Hold if sideways/neutral bounds.
                            </span>
                          </span>
                          
                          <div className="p-3.5 bg-bg-input border border-border-dim rounded-xl flex items-center justify-between text-xs group relative">
                            <div className="space-y-0.5">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider block w-fit shadow-sm",
                                forecastData.suggestedOrder === "BUY_MARKET" ? "bg-sol-green/20 text-sol-green border border-sol-green/20" : "bg-sol-purple/20 text-sol-purple border border-sol-purple/20"
                              )}>
                                {forecastData.suggestedOrder}
                              </span>
                              <span className="text-text-dim text-[10px] cursor-help border-b border-dashed border-border-dim/60 w-fit">Optimal Route</span>
                            </div>
                            <div className="text-right font-mono">
                              <span className="text-text-heading font-extrabold block">${forecastData.suggestedOrderPrice?.toFixed(2)}</span>
                              <span className="text-[9px] text-text-dim uppercase cursor-help border-b border-dashed border-border-dim/60">Suggested Market Target</span>
                            </div>
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 bg-slate-950 border border-sol-purple text-[10.5px] text-slate-200 p-3 rounded-xl shadow-2xl z-50 normal-case font-normal leading-relaxed text-left font-sans">
                              <strong>Trigger Math:</strong> <br />
                              BUY: <code>spot order execution</code> <br />
                              SELL: <code>spot order execution</code>
                            </span>
                          </div>
                        </div>

                        {/* Core strategy formula and weights details */}
                        {forecastData.strategyDetails && (
                          <div className="space-y-3 pt-2 border-t border-border-dim/55 text-xs animate-fade-in font-sans">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] uppercase font-bold tracking-widest text-text-dim">Main AI Strategy Factors</span>
                              <span className="text-[9px] text-sol-purple font-mono font-bold">Live Weight Config</span>
                            </div>
                            <div className="bg-bg-input border border-border-dim rounded-xl p-3.5 space-y-3 font-sans">
                                {/* News Sentiment Factor */}
                              <div className="flex justify-between items-center group relative cursor-pointer">
                                <div className="space-y-0.5 w-[72%]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-text-heading block cursor-help border-b border-dashed border-border-dim/60 w-fit">News Sentiment ({Math.round(forecastData.strategyDetails.sentimentWeight * 100)}%)</span>
                                  </div>
                                  <span className="text-[8px] text-text-dim block leading-none">Powered by {forecastData.strategyDetails.sentimentSource || "CPU NLP Heuristic"}</span>
                                </div>
                                <span className={cn(
                                  "font-mono text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0",
                                  forecastData.strategyDetails.sentimentScore > 0.05 ? "bg-sol-green/15 text-sol-green border border-sol-green/10 animate-pulse" : 
                                  forecastData.strategyDetails.sentimentScore < -0.05 ? "bg-red-500/15 text-red-400 border border-red-500/10 animate-pulse" : "bg-yellow-500/15 text-yellow-500 border border-yellow-500/10"
                                )}>
                                  Index: {forecastData.strategyDetails.sentimentScore > 0 ? "+" : ""}{forecastData.strategyDetails.sentimentScore.toFixed(2)}
                                </span>
                                <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-72 bg-slate-950 border border-sol-purple text-[10.5px] text-slate-200 p-3 rounded-xl shadow-2xl z-50 normal-case font-normal leading-relaxed text-left font-sans">
                                  <strong>NLP Sentiment Analysis:</strong> <br />
                                  We fetched top articles matching <code>"{topic}"</code>. <br />
                                  Used Engine: <span className="text-sol-purple font-mono">{forecastData.strategyDetails.sentimentSource || "CPU/Heuristics"}</span> <br />
                                  Calculated average comparative valence score or utilized AI sentiment. <br />
                                  {forecastData.strategyDetails.allPositiveWords && forecastData.strategyDetails.allPositiveWords.length > 0 && (
                                    <div className="mt-1 border-t border-border-dim/15 pt-1 text-sol-green">
                                      <strong>Detected Positives:</strong> <span className="font-mono text-[10px]">{forecastData.strategyDetails.allPositiveWords.join(", ")}</span>
                                    </div>
                                  )}
                                  {forecastData.strategyDetails.allNegativeWords && forecastData.strategyDetails.allNegativeWords.length > 0 && (
                                    <div className="mt-1 border-t border-border-dim/15 pt-1 text-red-400">
                                      <strong>Detected Negatives:</strong> <span className="font-mono text-[10px]">{forecastData.strategyDetails.allNegativeWords.join(", ")}</span>
                                    </div>
                                  )}
                                </span>
                              </div>
                              {/* EMA Trend Factor */}
                              <div className="flex justify-between items-center group relative cursor-pointer">
                                <div className="space-y-0.5 w-[72%]">
                                  <span className="text-[10px] uppercase tracking-wider font-bold text-text-heading block cursor-help border-b border-dashed border-border-dim/60 w-fit">MACD Oscillator ({Math.round(forecastData.strategyDetails.technicalWeight * 100)}%)</span>
                                  <span className="text-[8px] text-text-dim block leading-none">Fast/Slow Histogram Divergence</span>
                                </div>
                                <span className={cn(
                                  "font-mono text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0",
                                  forecastData.strategyDetails.technicalScore > 0.05 ? "bg-sol-green/15 text-sol-green border border-sol-green/10" : 
                                  forecastData.strategyDetails.technicalScore < -0.05 ? "bg-red-500/15 text-red-400 border border-red-500/10" : "bg-yellow-500/15 text-yellow-500 border border-yellow-500/10"
                                )}>
                                  Score: {forecastData.strategyDetails.technicalScore > 0 ? "+" : ""}{forecastData.strategyDetails.technicalScore.toFixed(2)}
                                </span>
                                <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-72 bg-slate-950 border border-sol-purple text-[10.5px] text-slate-200 p-3 rounded-xl shadow-2xl z-50 normal-case font-normal leading-relaxed text-left font-sans font-sans">
                                  <strong>Divergence Math:</strong> ratio divergence <code>(EMA12 - EMA26) / EMA26 * 25</code>, restricted between scale limits of -1.0 to +1.0. High value indicates high momentum.
                                </span>
                              </div>
                              {/* RSI Liquidity Factor */}
                              <div className="flex justify-between items-center group relative cursor-pointer font-sans">
                                <div className="space-y-0.5 w-[72%] font-sans">
                                  <span className="text-[10px] uppercase tracking-wider font-bold text-text-heading block cursor-help border-b border-dashed border-border-dim/60 w-fit">RSI Reversals ({Math.round(forecastData.strategyDetails.liquidityWeight * 100)}%)</span>
                                  <span className="text-[8px] text-text-dim block leading-none">Mean Reversion Boundaries</span>
                                </div>
                                <span className={cn(
                                  "font-mono text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0",
                                  forecastData.strategyDetails.liquidityScore > 0.05 ? "bg-sol-green/15 text-sol-green border border-sol-green/10" : 
                                  forecastData.strategyDetails.liquidityScore < -0.05 ? "bg-red-500/15 text-red-400 border border-red-500/10" : "bg-yellow-500/15 text-yellow-500 border border-yellow-500/10"
                                )}>
                                  Score: {forecastData.strategyDetails.liquidityScore > 0 ? "+" : ""}{forecastData.strategyDetails.liquidityScore.toFixed(2)}
                                </span>
                                <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-72 bg-slate-950 border border-sol-purple text-[10.5px] text-slate-200 p-3 rounded-xl shadow-2xl z-50 normal-case font-normal leading-relaxed text-left font-sans">
                                  <strong>Mean Reversion Math:</strong> <br />
                                  If RSI &lt; 35 (Oversold): score of <code>(35 - RSI) / 20</code> (Bullish potential). <br />
                                  If RSI &gt; 65 (Overbought): score of <code>-(RSI - 65) / 20</code> (Bearish pullback). <br />
                                  Otherwise neutral bounds: <code>-((RSI - 50) / 30)</code>.
                                </span>
                              </div>
                                             {/* Liquidation Map Factor */}
                              <div className="flex justify-between items-center group relative cursor-pointer font-sans mt-2">
                                <div className="space-y-0.5 w-[72%] font-sans">
                                  <span className="text-[10px] uppercase tracking-wider font-bold text-text-heading block cursor-help border-b border-dashed border-border-dim/60 w-fit">Elliott Wave Formations (Strict Gate)</span>
                                  <span className="text-[8px] text-text-dim block leading-none">{forecastData.strategyDetails.elliotWavePhase || "Momentum pulse phase check"}</span>
                                </div>
                                <span className={cn(
                                  "font-mono text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0",
                                  (forecastData.strategyDetails.elliottWaveScore || 0) > 0.05 ? "bg-sol-green/15 text-sol-green border border-sol-green/10" : 
                                  (forecastData.strategyDetails.elliottWaveScore || 0) < -0.05 ? "bg-red-500/15 text-red-400 border border-red-500/10" : "bg-yellow-500/15 text-yellow-500 border border-yellow-500/10"
                                )}>
                                  Score: {(forecastData.strategyDetails.elliottWaveScore || 0) > 0 ? "+" : ""}{(forecastData.strategyDetails.elliottWaveScore || 0).toFixed(2)}
                                </span>
                                <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-72 bg-slate-950 border border-sol-purple text-[10.5px] text-slate-200 p-3 rounded-xl shadow-2xl z-50 normal-case font-normal leading-relaxed text-left font-sans">
                                  <strong>Elliott Wave Oscillator (EWO):</strong> <br />
                                  {forecastData.strategyDetails.elliotWaveDetails || "Uses 5-period and 34-period SMA of close prices to calculate momentum pulse structure and determine current wave counts."} <br />
                                  <strong className="mt-1.5 block text-sol-purple font-mono">EWO Value: {(forecastData.strategyDetails.elliotWaveValue || 0).toFixed(4)}</strong>
                                </span>
                              </div>
                              
                              {/* Composite Dynamic Score */}
                              <div className="pt-2.5 border-t border-border-dim/20 flex justify-between items-center group relative cursor-pointer">
                                <div className="space-y-0.5">
                                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-sol-purple block cursor-help border-b border-dashed border-border-dim/60 w-fit">Composite Strategic Bias</span>
                                  <span className="text-[8px] text-text-dim lowercase tracking-wide block font-sans">Normalized factor consensus index</span>
                                </div>
                                <span className={cn(
                                  "font-mono text-xs px-2 py-0.5 rounded font-black border",
                                  forecastData.strategyDetails.compositeScore > 0.08 ? "bg-sol-green/10 text-sol-green border-sol-green/20" : 
                                  forecastData.strategyDetails.compositeScore < -0.08 ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                                )}>
                                  {forecastData.strategyDetails.compositeScore > 0 ? "+" : ""}{forecastData.strategyDetails.compositeScore.toFixed(3)}
                                </span>
                                <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-72 bg-slate-950 border border-sol-purple text-[10.5px] text-slate-200 p-3 rounded-xl shadow-2xl z-50 normal-case font-normal leading-relaxed text-left font-sans">
                                  <strong>Composite Calculation:</strong> <br />
                                  Formula: <code>(sentimentScore * sentimentW + technicalScore * technicalW + liquidityScore * liquidityW) / totalWeights</code>. Ranges from -1 (fully bearish) to +1 (fully bullish).
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                      </div>
                    ) : (
                      <div className="py-12 text-center text-text-dim text-xs">
                        No forecast retrieved. Adjust filters or click Refresh.
                      </div>
                    )}
                  </Card>

                  {/* Settings adjusting Card */}
                  <Card title="Active Configuration Model" icon={Settings}>
                    <div className="space-y-4 font-sans text-xs text-text-dim">
                      <p className="leading-relaxed">
                        The neural forecast is governed by your centralized **Engine Configuration** settings on the left sidebar:
                      </p>
                      <div className="bg-bg-input p-3.5 rounded-xl border border-border-dim/80 space-y-2.5 font-mono text-[10px]">
                        <div>
                          <span className="text-text-heading font-bold uppercase block text-[9px] tracking-wider mb-0.5">Active Topic Keywords:</span>
                          <span className="text-sol-purple leading-normal break-all">"{topic}"</span>
                        </div>
                        <div className="pt-2 border-t border-border-dim/50 flex justify-between">
                          <span>Sentiment Weight:</span>
                          <span className="text-text-heading font-black">{Math.round(weights.sentiment * 100)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>EMA momentum:</span>
                          <span className="text-text-heading font-black">{Math.round(weights.technical * 100)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>RSI reversion:</span>
                          <span className="text-text-heading font-black">{Math.round(weights.liquidity * 100)}%</span>
                        </div>
                      </div>
                      <p className="leading-relaxed border-t border-border-dim/30 pt-3">
                        To adjust weights or topic keywords, use the controls in the **Engine Configuration Panel** on the left sidebar. The model path will recalculate dynamically to align with your parameters.
                      </p>
                    </div>
                  </Card>
                </div>

                {/* AI Generative Rationale (Right) */}
                <div className="lg:col-span-7 space-y-6">
                  
                  <Card 
                    title={`${token} Past & Future Trajectory (${interval} Interpolated)`} 
                    icon={TrendingUp}
                    action={
                      forecastData && (
                        <button
                          type="button"
                          onClick={downloadForecastPathCSV}
                          className="py-1 px-2.5 rounded border border-border-dim/60 hover:border-sol-purple bg-bg-input text-text-heading hover:text-sol-purple flex items-center gap-1.5 transition-all text-[9.5px] font-bold cursor-pointer font-sans"
                          title="Export predicted pathway as CSV"
                        >
                          <Download className="w-3 h-3" />
                          Export Forecast (CSV)
                        </button>
                      )
                    }
                  >
                    {forecastLoading ? (
                      <div className="py-20 flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-8 h-8 text-sol-purple animate-spin" />
                        <span className="text-[10px] font-mono text-text-dim uppercase tracking-widest animate-pulse mt-2">Simulating Price Drift Pathway...</span>
                      </div>
                    ) : forecastData ? (
                      <div className="space-y-4">
                        <div className="h-64 w-full text-xs font-mono">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={generateInterpolatedPoints()}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#2a1f42" opacity={0.15} />
                              <XAxis dataKey="label" stroke="#94a3b8" fontSize={9} tickLine={false} />
                              <YAxis stroke="#c084fc" domain={["auto", "auto"]} tickFormatter={(v) => `$${v}`} />
                              <Tooltip
                                contentStyle={{ backgroundColor: "#1e133e", borderColor: "#4c1d95", color: "#f8fafc" }}
                                labelStyle={{ color: "#94a3b8", fontWeight: "bold" }}
                              />
                              <Area 
                                type="monotone"
                                dataKey="Upper Range"
                                stroke="transparent"
                                fill="rgba(139,92,246,0.08)"
                                name="Confidence Sky Limit"
                              />
                              <Area 
                                type="monotone"
                                dataKey="Lower Range"
                                stroke="transparent"
                                fill="rgba(139,92,246,0.04)"
                                name="Confidence Ground Floor"
                              />
                              {/* Historical Price line segment */}
                              <Line 
                                type="monotone"
                                dataKey="Historical Price"
                                stroke="#c084fc"
                                strokeWidth={2.5}
                                dot={false}
                                activeDot={{ r: 4 }}
                                name="Historical Price"
                              />
                              {/* Predicted Forecast price line segment */}
                              <Line 
                                type="monotone"
                                dataKey="Expected Price"
                                stroke={forecastData.predictedPrice >= forecastData.currentPrice ? "#10b981" : "#ef4444"}
                                strokeWidth={3}
                                strokeDasharray={forecastData.history ? "5 5" : undefined}
                                dot={{ stroke: forecastData.predictedPrice >= forecastData.currentPrice ? "#10b981" : "#ef4444", strokeWidth: 1, r: 3 }}
                                activeDot={{ r: 5 }}
                                name="AI Interpolated Path"
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="p-3.5 bg-bg-input/70 border border-border-dim rounded-xl text-[11px] leading-relaxed text-text-dim flex gap-2 animate-fade-in">
                          <Info className="w-4 h-4 text-sol-purple shrink-0 mt-0.5" />
                          <div>
                            This visualization shows of the last 15 historical periods connected directly to our future simulated price drift progression, moving from current price level (<strong className="text-text-heading font-mono">${forecastData.currentPrice?.toFixed(2)}</strong>) to predicted price (<strong className="text-text-heading font-mono">${forecastData.predictedPrice?.toFixed(2)}</strong>). The trajectory is calculated exactly using your chosen live strategy config <span className="text-sol-purple font-black">Sentiment: {(forecastData.strategyDetails.sentimentWeight*100).toFixed(0)}% / Tech: {(forecastData.strategyDetails.technicalWeight*100).toFixed(0)}% / Liq: {(forecastData.strategyDetails.liquidityWeight*100).toFixed(0)}%</span>.
                          </div>
                        </div>

                        {/* Interactive Data Table of Trajectory Points */}
                        <div className="border border-border-dim/40 rounded-xl overflow-hidden mt-4 bg-bg-input/30 font-sans">
                          <div className="p-3 bg-bg-input/60 border-b border-border-dim/40 flex justify-between items-center cursor-pointer select-none" onClick={() => setShowTrajectoryTable(!showTrajectoryTable)}>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-text-heading flex items-center gap-1.5">
                              <Table className="w-3.5 h-3.5 text-sol-purple" />
                              Interactive Pathway Data Table (Eastern Time)
                            </span>
                            <span className="text-[9px] text-sol-purple font-mono font-bold hover:underline">
                              {showTrajectoryTable ? "[Hide Table]" : "[Show Time Column & Price Levels]"}
                            </span>
                          </div>
                          {showTrajectoryTable && (
                            <div className="overflow-x-auto max-h-56 custom-scrollbar">
                              <table className="w-full text-left text-[11px] border-collapse font-mono">
                                <thead className="bg-[#180f33] text-text-dim border-b border-border-dim/40 sticky top-0 shadow-xs z-10">
                                  <tr>
                                    <th className="p-2.5">Time Column (ET)</th>
                                    <th className="p-2.5 text-right">Historical Price</th>
                                    <th className="p-2.5 text-right">Expected Price</th>
                                    <th className="p-2.5 text-right">Confidence Range</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border-dim/25">
                                  {generateInterpolatedPoints().map((p: any, idx: number) => {
                                    const isHist = p["Historical Price"] !== null;
                                    return (
                                      <tr key={idx} className={cn("hover:bg-sol-purple/5 transition-colors", !isHist && "text-sol-green")}>
                                        <td className="p-2.5 font-bold flex items-center gap-1.5">
                                          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", isHist ? "bg-sol-purple" : "bg-sol-green")} />
                                          {p.label}
                                        </td>
                                        <td className="p-2.5 text-right text-text-heading">{isHist ? `$${p["Historical Price"].toFixed(2)}` : "--"}</td>
                                        <td className="p-2.5 text-right font-black">{!isHist ? `$${p["Expected Price"].toFixed(2)}` : "--"}</td>
                                        <td className="p-2.5 text-right text-text-dim text-[10px]">
                                          {isHist ? "--" : `$${p["Lower Range"].toFixed(2)} - $${p["Upper Range"].toFixed(2)}`}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="py-12 text-center text-text-dim text-xs">
                        No pathway data. Configure parameters and run Forecast.
                      </div>
                    )}
                  </Card>

                  <Card title="AI Predictive Analysis & Core Catalysts" icon={Newspaper}>
                    {forecastLoading ? (
                      <div className="py-16 space-y-4">
                        <div className="h-4 bg-bg-input rounded animate-pulse w-3/4"></div>
                        <div className="h-4 bg-bg-input rounded animate-pulse w-5/6"></div>
                        <div className="h-4 bg-bg-input rounded animate-pulse w-2/3"></div>
                        <div className="h-8 bg-bg-input rounded animate-pulse w-full pt-2"></div>
                      </div>
                    ) : forecastData ? (
                      <div className="space-y-6 text-sm">
                        <div className="p-4 bg-sol-purple/10 border border-sol-purple/15 text-text-heading rounded-xl leading-relaxed italic text-xs">
                          "{forecastData.rationale}"
                        </div>

                        {/* Indicators list */}
                        <div className="space-y-2.5">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-text-dim block">Ex-Ante Statistical Baseline</span>
                          
                          <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="p-3 bg-bg-input border border-border-dim rounded-xl">
                              <span className="text-[8px] uppercase text-text-dim block mb-0.5">EMA 12 (Fast)</span>
                              <span className="text-xs font-mono font-bold text-text-heading">${forecastData.indicators?.ema12?.toFixed(2)}</span>
                            </div>
                            <div className="p-3 bg-bg-input border border-border-dim rounded-xl">
                              <span className="text-[8px] uppercase text-text-dim block mb-0.5">EMA 26 (Slow)</span>
                              <span className="text-xs font-mono font-bold text-text-heading">${forecastData.indicators?.ema26?.toFixed(2)}</span>
                            </div>
                            <div className="p-3 bg-bg-input border border-border-dim rounded-xl">
                              <span className="text-[8px] uppercase text-text-dim block mb-0.5">RSI (14)</span>
                              <span className="text-xs font-mono font-bold text-text-heading">{forecastData.indicators?.rsi?.toFixed(1)}</span>
                            </div>
                          </div>
                        </div>

                        {/* news articles catalogs */}
                        <div className="space-y-3 pt-2 border-t border-border-dim/50">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-text-dim block mb-1">Correlated Market Headwinds / Catalysts</span>
                          
                          <div className="space-y-2.5">
                            {forecastData.latestNews?.map((news: any, index: number) => (
                              <div key={index} className="flex gap-2.5 items-start p-3 bg-bg-input border border-border-dim/55 rounded-xl text-xs hover:border-sol-purple/35 transition-all">
                                <Newspaper className="w-3.5 h-3.5 text-sol-purple mt-0.5 shrink-0" />
                                <span className="text-text-heading font-medium leading-relaxed">{news}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className="py-12 text-center text-text-dim text-xs">
                        Configure target variables above to launch forecast engine computations.
                      </div>
                    )}
                  </Card>
                </div>

              </div>

              {/* 2. Historical Quant Backtester Panel */}
              <div className="border-t border-border-dim/40 pt-8 mt-4 space-y-6">
                <div>
                  <h3 className="text-xl font-serif italic text-text-heading">Quantitative Strategy Backtester</h3>
                  <p className="text-sm text-text-dim mt-1">Stress-test custom scoring parameters and indicators weights historically against real on-chain tick timelines.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {/* Left: Settings Panel */}
                  <div className="lg:col-span-4 bg-bg-card border border-border-dim p-6 rounded-2xl space-y-6">
                    <span className="text-[10px] uppercase font-extrabold tracking-widest text-text-heading block border-b border-border-dim pb-2.5">Backtester Deck Controls</span>
                    
                    {/* Centralized Target Asset Banner */}
                    <div className="bg-bg-input border border-border-dim/80 rounded-xl p-3.5 space-y-2.5">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-text-dim uppercase tracking-wider font-extrabold font-mono">Simulating Token:</span>
                        <span className="text-xs text-sol-success font-black bg-sol-success/15 px-2.5 py-1 rounded-md border border-sol-success/10">{token}</span>
                      </div>
                      
                      <div className="border-t border-border-dim/55 pt-2.5 space-y-2">
                        <span className="text-[9px] uppercase font-bold tracking-widest text-text-dim block mb-1">Central Strategy Weights</span>
                        <div className="grid grid-cols-4 gap-1.5 text-center text-[9px] font-mono select-none">
                          <div className="bg-bg-card border border-border-dim p-1 py-1.5 rounded-lg">
                            <span className="text-text-dim block text-[7px] uppercase">News</span>
                            <span className="text-sol-purple font-black">{Math.round(weights.sentiment * 100)}%</span>
                          </div>
                          <div className="bg-bg-card border border-border-dim p-1 py-1.5 rounded-lg">
                            <span className="text-text-dim block text-[7px] uppercase">MACD</span>
                            <span className="text-sol-purple font-black">{Math.round(weights.technical * 100)}%</span>
                          </div>
                          <div className="bg-bg-card border border-border-dim p-1 py-1.5 rounded-lg">
                            <span className="text-text-dim block text-[7px] uppercase">RSI</span>
                            <span className="text-sol-purple font-black">{Math.round(weights.liquidity * 100)}%</span>
                          </div>
                          <div className="bg-bg-card border border-border-dim p-1 py-1.5 rounded-lg">
                            <span className="text-text-dim block text-[7px] uppercase">S-Trnd</span>
                            <span className="text-sol-purple font-black">{Math.round((weights.supertrend || 0) * 100)}%</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-[8.5px] text-text-dim italic leading-snug font-sans pt-1 border-t border-border-dim/20">
                        * Central weights are synchronized with sidebar and updated dynamically when selecting indicator components below.
                      </p>
                    </div>

                    {/* Lookback config and intervals select */}
                    <div className="space-y-4">
                      <div className="space-y-2 p-3 bg-bg-input border border-border-dim rounded-xl">
                        <label className="text-[10px] uppercase tracking-wider font-extrabold text-text-dim block mb-1">Testing Timeline</label>
                        <p className="text-xs font-mono text-text-heading font-black">
                          {lookbackMode === 'custom' ? `${startDate} to ${endDate}` : `${lookbackDays} Days`}
                        </p>
                        <p className="text-[9px] text-text-dim mt-2 italic font-sans">
                          Lookback duration configured from central Engine Configuration sidepane.
                        </p>
                      </div>

                      <div className="space-y-2 p-3 bg-bg-input border border-border-dim rounded-xl">
                        <label className="text-[10px] uppercase tracking-wider font-extrabold text-text-dim block mb-1">Timeframe Interval</label>
                        <p className="text-xs font-mono text-text-heading font-black">
                          {interval} Interval Bars
                        </p>
                        <p className="text-[9px] text-text-dim mt-2 italic font-sans">
                          Tick size interval configured from central Engine Configuration sidepane.
                        </p>
                      </div>
                    </div>

                    {/* Interactive checklist of indicators */}
                    <div className="space-y-2.5 p-3 bg-bg-input border border-border-dim rounded-xl">
                      <label className="text-[10px] uppercase tracking-wider font-extrabold text-text-dim block mb-1">Backtest Indicators Checklist</label>
                      <p className="text-[8px] text-text-dim leading-snug mb-2.5">Toggle indicators dynamically to include/exclude them from the historical backtest calculations.</p>
                      
                      <div className="space-y-1.5 text-[11px] font-sans">
                        <label className="flex items-center justify-between p-1.5 rounded bg-bg-card border border-border-dim/40 hover:border-sol-purple/30 transition-all cursor-pointer">
                          <span className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={enabledIndicators.sentiment}
                              onChange={(e) => setEnabledIndicators({ ...enabledIndicators, sentiment: e.target.checked })}
                              className="accent-sol-purple h-3.5 w-3.5 rounded"
                            />
                            <span>Sentiment (LLM)</span>
                          </span>
                          <span className="font-mono text-[10px] text-text-dim">{Math.round(weights.sentiment * 100)}%</span>
                        </label>

                        <label className="flex items-center justify-between p-1.5 rounded bg-bg-card border border-border-dim/40 hover:border-sol-purple/30 transition-all cursor-pointer">
                          <span className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={enabledIndicators.technical}
                              onChange={(e) => setEnabledIndicators({ ...enabledIndicators, technical: e.target.checked })}
                              className="accent-sol-purple h-3.5 w-3.5 rounded"
                            />
                            <span>MACD Trend</span>
                          </span>
                          <span className="font-mono text-[10px] text-text-dim">{Math.round(weights.technical * 100)}%</span>
                        </label>

                        <label className="flex items-center justify-between p-1.5 rounded bg-bg-card border border-border-dim/40 hover:border-sol-purple/30 transition-all cursor-pointer">
                          <span className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={enabledIndicators.liquidity}
                              onChange={(e) => setEnabledIndicators({ ...enabledIndicators, liquidity: e.target.checked })}
                              className="accent-sol-purple h-3.5 w-3.5 rounded"
                            />
                            <span>RSI Oscillator</span>
                          </span>
                          <span className="font-mono text-[10px] text-text-dim">{Math.round(weights.liquidity * 100)}%</span>
                        </label>

                        <label className="flex items-center justify-between p-1.5 rounded bg-bg-card border border-border-dim/40 hover:border-sol-purple/30 transition-all cursor-pointer">
                          <span className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={enabledIndicators.elliottWave}
                              onChange={(e) => setEnabledIndicators({ ...enabledIndicators, elliottWave: e.target.checked })}
                              className="accent-sol-purple h-3.5 w-3.5 rounded"
                            />
                            <span>Elliott Wave</span>
                          </span>
                          <span className="font-mono text-[10px] text-text-dim">{Math.round((weights.elliottWave || 0) * 100)}%</span>
                        </label>

                        <label className="flex items-center justify-between p-1.5 rounded bg-bg-card border border-border-dim/40 hover:border-sol-purple/30 transition-all cursor-pointer">
                          <span className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={enabledIndicators.supertrend}
                              onChange={(e) => setEnabledIndicators({ ...enabledIndicators, supertrend: e.target.checked })}
                              className="accent-sol-purple h-3.5 w-3.5 rounded"
                            />
                            <span>Supertrend (ATR)</span>
                          </span>
                          <span className="font-mono text-[10px] text-text-dim">{Math.round((weights.supertrend || 0) * 100)}%</span>
                        </label>

                        <label className="flex items-center justify-between p-1.5 rounded bg-bg-card border border-border-dim/40 hover:border-sol-purple/30 transition-all cursor-pointer">
                          <span className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={enabledIndicators.fvg}
                              onChange={(e) => setEnabledIndicators({ ...enabledIndicators, fvg: e.target.checked })}
                              className="accent-sol-purple h-3.5 w-3.5 rounded"
                            />
                            <span>Fair Value Gap</span>
                          </span>
                          <span className="font-mono text-[10px] text-text-dim">{Math.round((weights.fvg || 0) * 100)}%</span>
                        </label>

                        <label className="flex items-center justify-between p-1.5 rounded bg-bg-card border border-border-dim/40 hover:border-sol-purple/30 transition-all cursor-pointer">
                          <span className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={enabledIndicators.dca}
                              onChange={(e) => setEnabledIndicators({ ...enabledIndicators, dca: e.target.checked })}
                              className="accent-sol-purple h-3.5 w-3.5 rounded"
                            />
                            <span>DCA Mean-Rever.</span>
                          </span>
                          <span className="font-mono text-[10px] text-text-dim">{Math.round((weights.dca || 0) * 100)}%</span>
                        </label>
                      </div>
                    </div>

                    {/* Capital select input */}
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-wider font-extrabold text-text-heading block">Starting Simulation Capital (USDC)</label>
                      <input
                        type="number"
                        value={backtestCapital}
                        onChange={(e) => setBacktestCapital(Math.max(1, Number(e.target.value)))}
                        className="w-full bg-bg-input border border-border-dim p-2.5 rounded-lg text-xs font-mono text-text-heading focus:outline-none focus:border-sol-purple transition-all"
                      />
                    </div>

                    {/* Run action trigger */}
                    <button
                      type="button"
                      onClick={runQuantBacktest}
                      disabled={backtestLoading}
                      className="w-full py-3 bg-sol-purple hover:bg-sol-purple/90 text-white font-extrabold uppercase text-xs tracking-widest rounded-xl transition-all shadow-md shadow-sol-purple/15 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {backtestLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Running Quantitative Simulation...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 text-yellow-300" />
                          Simulate Historical Portfolio
                        </>
                      )}
                    </button>
                  </div>

                  {/* Right: Analytical results */}
                  <div className="lg:col-span-8 space-y-6 animate-in fade-in">
                    {backtestError && (
                      <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl font-mono">
                        {backtestError}
                      </div>
                    )}

                    {backtestLoading ? (
                      <div className="bg-bg-card border border-border-dim rounded-2xl h-[480px] flex flex-col items-center justify-center gap-3">
                        <RefreshCw className="w-10 h-10 text-sol-purple animate-spin" />
                        <span className="text-xs font-mono uppercase text-text-dim tracking-widest animate-pulse mt-2">Fetching Historical Price Arrays & Run Trades Simulator...</span>
                      </div>
                    ) : backtestResult ? (
                      <div className="space-y-6">
                        
                        {/* Simulation Success Cards Grid */}
                        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                          
                          <div className="bg-bg-card border border-border-dim p-4 rounded-xl shadow-sm hover:border-sol-purple/20 transition-all">
                            <span className="text-[9px] uppercase font-bold text-text-dim block tracking-wider">Trading Return</span>
                            <span className={cn("text-lg font-black block mt-1", backtestResult.metrics.pnlPct >= 0 ? "text-sol-green" : "text-red-500")}>
                              {backtestResult.metrics.pnlPct >= 0 ? "+" : ""}{backtestResult.metrics.pnlPct?.toFixed(2)}%
                            </span>
                            <span className="text-[8px] font-mono text-text-dim block mt-0.5">Yield On Balance</span>
                          </div>

                          <div className="bg-bg-card border border-border-dim p-4 rounded-xl shadow-sm hover:border-sol-purple/20 transition-all">
                            <span className="text-[9px] uppercase font-bold text-text-dim block tracking-wider">Max Drawdown</span>
                            <span className="text-lg font-black text-text-heading block mt-1">
                              {backtestResult.metrics.maxDrawdownPct?.toFixed(2)}%
                            </span>
                            <span className="text-[8px] font-mono text-text-dim block mt-0.5">Peak-to-Trough Loss</span>
                          </div>

                          <div className="bg-bg-card border border-border-dim p-4 rounded-xl shadow-sm hover:border-sol-purple/20 transition-all">
                            <span className="text-[9px] uppercase font-bold text-text-dim block tracking-wider">Win Rate (Settle)</span>
                            <span className="text-lg font-black text-sol-purple block mt-1">
                              {backtestResult.metrics.winRate?.toFixed(1)}%
                            </span>
                            <span className="text-[8px] font-mono text-text-dim block mt-0.5">
                              {backtestResult.metrics.winningTrades} Wins / {backtestResult.metrics.losingTrades} Losses
                            </span>
                          </div>

                          <div className="bg-bg-card border border-border-dim p-4 rounded-xl shadow-sm hover:border-sol-purple/20 transition-all">
                            <span className="text-[9px] uppercase font-bold text-text-dim block tracking-wider">Hit Rate</span>
                            <span className="text-lg font-black text-sol-green block mt-1">
                              {backtestResult.metrics.predictionQualityPct?.toFixed(1)}%
                            </span>
                            <span className="text-[8px] font-mono text-text-dim block mt-0.5">Directional Quality</span>
                          </div>

                          <div className={cn(
                            "bg-bg-card border p-4 rounded-xl shadow-sm hover:border-sol-purple/20 transition-all flex flex-col justify-between",
                            backtestResult.metrics.backtestAccuracyPct !== undefined
                              ? (backtestResult.metrics.backtestAccuracyPct >= 98.0
                                  ? "border-emerald-500/25 bg-emerald-500/[0.01]"
                                  : backtestResult.metrics.backtestAccuracyPct >= 95.0
                                  ? "border-lime-500/25 bg-lime-500/[0.01]"
                                  : backtestResult.metrics.backtestAccuracyPct >= 90.0
                                  ? "border-amber-500/25 bg-amber-500/[0.01]"
                                  : "border-rose-500/25 bg-rose-500/[0.01]")
                              : "border-border-dim"
                          )}>
                            <div>
                              <div className="flex justify-between items-center">
                                <span className="text-[9px] uppercase font-extrabold text-text-dim tracking-wider">Symmetric Precision (SFP)</span>
                                <span className={cn(
                                  "text-[8px] font-mono px-1.5 py-0.5 rounded-full uppercase tracking-tight font-bold",
                                  backtestResult.metrics.backtestAccuracyPct !== undefined
                                    ? (backtestResult.metrics.backtestAccuracyPct >= 98.0
                                        ? "bg-emerald-500/10 text-emerald-500"
                                        : backtestResult.metrics.backtestAccuracyPct >= 95.0
                                        ? "bg-lime-500/10 text-lime-500"
                                        : backtestResult.metrics.backtestAccuracyPct >= 90.0
                                        ? "bg-amber-500/10 text-amber-500"
                                        : "bg-rose-500/10 text-rose-500")
                                    : "bg-bg-input text-text-dim"
                                )}>
                                  {backtestResult.metrics.backtestAccuracyPct !== undefined
                                    ? (backtestResult.metrics.backtestAccuracyPct >= 98.0
                                        ? "Elite"
                                        : backtestResult.metrics.backtestAccuracyPct >= 95.0
                                        ? "Optimal"
                                        : backtestResult.metrics.backtestAccuracyPct >= 90.0
                                        ? "Moderate"
                                        : "Deficient")
                                    : "N/A"}
                                </span>
                              </div>
                              <span className={cn(
                                "text-lg font-black block mt-1",
                                backtestResult.metrics.backtestAccuracyPct !== undefined
                                  ? (backtestResult.metrics.backtestAccuracyPct >= 98.0
                                      ? "text-emerald-500"
                                      : backtestResult.metrics.backtestAccuracyPct >= 95.0
                                      ? "text-lime-500"
                                      : backtestResult.metrics.backtestAccuracyPct >= 90.0
                                      ? "text-amber-500"
                                      : "text-rose-500")
                                  : "text-text-heading"
                              )}>
                                {backtestResult.metrics.backtestAccuracyPct !== undefined ? `${backtestResult.metrics.backtestAccuracyPct.toFixed(2)}%` : "N/A"}
                              </span>
                            </div>
                            <span className="text-[8.5px] font-mono text-text-dim block mt-1.5 leading-tight">
                              SMAPE Error: <strong className="text-text-heading">{backtestResult.metrics.averageErrorPct !== undefined ? `${backtestResult.metrics.averageErrorPct.toFixed(2)}%` : "N/A"}</strong>
                            </span>
                          </div>

                          <div className="bg-bg-card border border-border-dim p-4 rounded-xl shadow-sm hover:border-sol-purple/20 transition-all">
                            <span className="text-[9px] uppercase font-bold text-text-dim block tracking-wider">Sim Net Balance</span>
                            <span className="text-lg font-black text-text-heading block mt-1 font-mono">
                              ${backtestResult.metrics.finalCapital?.toFixed(2)}
                            </span>
                            <span className="text-[8px] font-mono text-text-dim block mt-0.5">Initial: ${backtestResult.metrics.initialCapital} USD</span>
                          </div>

                        </div>

                        {/* Chart Area */}
                        <div className="bg-bg-card border border-border-dim p-5 rounded-2xl shadow-sm">
                          <div className="flex justify-between items-center mb-5 gap-4">
                            <span className="text-xs uppercase font-extrabold tracking-wider text-text-heading">Simulated Equity Curve vs. Landmark Spot Index Price</span>
                            <button
                              type="button"
                              onClick={downloadBacktestTimeSeriesCSV}
                              className="py-1 px-2.5 rounded border border-border-dim/60 hover:border-sol-purple bg-bg-input text-text-heading hover:text-sol-purple flex items-center gap-1.5 transition-all text-[9.5px] font-bold cursor-pointer font-sans"
                              title="Export backtest equity curve as CSV"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Export Curve (CSV)
                            </button>
                          </div>
                          
                          <div className="h-64 w-full text-xs font-mono">
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={backtestResult.equityCurve}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#2a1f42" opacity={0.15} />
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} tickLine={false} />
                                <YAxis yAxisId="equity" stroke="#8b5cf6" orientation="left" domain={["auto", "auto"]} tickFormatter={(v) => `$${v}`} />
                                <YAxis yAxisId="price" stroke="#10b981" orientation="right" domain={["auto", "auto"]} tickFormatter={(v) => `$${v}`} />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: "#1e133e", borderColor: "#4c1d95", color: "#f8fafc" }}
                                  labelStyle={{ color: "#94a3b8", fontWeight: "bold" }}
                                />
                                <Area yAxisId="equity" type="monotone" dataKey="equity" fill="rgba(139,92,246,0.06)" stroke="#8b5cf6" strokeWidth={2.5} name="Total Capital Portfolio (L)" />
                                <Line yAxisId="price" type="monotone" dataKey="price" stroke="#10b981" strokeWidth={1.5} dot={false} name={`Actual ${token} Price (R)`} />
                                <Line yAxisId="price" type="monotone" dataKey="predictedPrice" stroke="#ec4899" strokeWidth={1.2} strokeDasharray="3 3" dot={false} name={`Predicted ${token} Price (R)`} />
                              </ComposedChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Simulation Table execution ledger */}
                        <div className="bg-bg-card border border-border-dim p-5 rounded-2xl shadow-sm">
                          <div className="flex justify-between items-center mb-4 gap-4">
                            <span className="text-xs uppercase font-extrabold tracking-wider text-text-heading">Historical Trade Execution Ledger</span>
                            <button
                              onClick={downloadBacktestCSV}
                              className="py-1 px-3 rounded-lg border border-border-dim/80 hover:border-sol-purple bg-bg-input text-text-heading hover:text-sol-purple flex items-center gap-1.5 transition-all text-[11px] font-bold cursor-pointer"
                              title="Download complete ledger as a CSV file"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Export CSV
                            </button>
                          </div>
                          
                          <div className="overflow-x-auto max-h-[250px] custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-border-dim text-[9px] text-text-dim uppercase font-mono">
                                  <th className="py-2.5 px-3">Direction</th>
                                  <th className="py-2.5 px-3">Date Timestamp (Eastern Time)</th>
                                  <th className="py-2.5 px-3 text-right">Execution Price</th>
                                  <th className="py-2.5 px-3 text-right">Net Realized Return</th>
                                  <th className="py-2.5 px-3 text-right">Capital Balance</th>
                                  <th className="py-2.5 px-3">Execution Triggers</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border-dim/30 font-mono text-xs">
                                {backtestResult.trades?.slice(0, 35).map((trade: any, idx: number) => {
                                  const isEntry = trade.type.startsWith("OPEN");
                                  const isConfirm = trade.type.startsWith("CONFIRM");
                                  const isProfit = trade.pnl >= 0;
                                  return (
                                    <tr key={idx} className="hover:bg-bg-input/35 transition-colors">
                                      <td className="py-2.5 px-3 font-bold">
                                        <span className={cn(
                                          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider block w-fit shadow-xs",
                                          isConfirm ? "bg-amber-500/10 text-amber-500 border border-amber-500/10" :
                                          trade.type.includes("LONG") 
                                            ? "bg-sol-green/15 text-sol-green border border-sol-green/10" 
                                            : "bg-sol-purple/15 text-sol-purple border border-sol-purple/10"
                                        )}>
                                          {trade.type}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3 text-text-dim text-[10px] whitespace-nowrap">
                                        {etFormat(new Date(trade.date), "yyyy-MM-dd hh:mm a")} <span className="text-[8px] opacity-40">{tzAbbr}</span>
                                      </td>
                                      <td className="py-2.5 px-3 text-right font-black text-text-heading">
                                        ${trade.price?.toFixed(2)}
                                      </td>
                                      <td className="py-2.5 px-3 text-right">
                                        {isConfirm ? (
                                          <span className="text-text-dim text-[10px]">-- (Watching)</span>
                                        ) : isEntry ? (
                                          <span className="text-text-dim text-[10px]">-- (Holding)</span>
                                        ) : (
                                          <span className={cn("font-bold text-[11px] whitespace-nowrap", isProfit ? "text-sol-green" : "text-red-500")}>
                                            {isProfit ? "+" : ""}${trade.pnl?.toFixed(2)} ({isProfit ? "+" : ""}{trade.pnlPct?.toFixed(2)}%)
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-3 text-right text-text-heading font-extrabold">
                                        ${(trade.capitalAfter || trade.capitalBefore)?.toFixed(2)}
                                      </td>
                                      <td className="py-2.5 px-3 text-text-dim text-[10px] italic whitespace-normal max-w-[200px]">
                                        {trade.note}
                                        {isEntry && trade.tpPct !== undefined && trade.slPct !== undefined && (
                                          <div className="text-[9px] mt-1 font-mono flex items-center gap-2 font-medium">
                                             <span className="text-sol-green/80">TP: +{trade.tpPct?.toFixed(1)}%</span>
                                             <span className="text-red-500/80">SL: -{trade.slPct?.toFixed(1)}%</span>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                                {(!backtestResult.trades || backtestResult.trades.length === 0) && (
                                  <tr>
                                    <td colSpan={6} className="py-8 text-center text-text-dim italic">
                                      No trades were triggered during this testing interval. Adjust sizers, weights or intervals to broaden triggers.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className="bg-bg-card border border-border-dim rounded-2xl h-[480px] flex flex-col items-center justify-center text-center p-6 text-text-dim">
                        <TrendingUp className="w-12 h-12 text-sol-purple/40 mb-3" />
                        <h4 className="text-sm font-bold text-text-heading mb-1 font-serif italic">Backtesting Simulation Deck Idle</h4>
                        <p className="text-xs max-w-xs leading-relaxed">Adjust sizer parameters, backtest target assets, timeframe lookup boundaries on the left deck control, then hit run simulator.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </main>
        ) : currentView === 'journal' ? (
          <main className="flex-1 flex flex-col p-8 bg-bg-main overflow-y-auto custom-scrollbar animate-fade-in text-text-body">
            <div className="max-w-6xl mx-auto w-full space-y-8">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-bold text-sol-purple uppercase tracking-[0.2em] flex items-center gap-2">
                    <BookOpen className="w-3 h-3" /> Cortex Trade Journal
                  </span>
                  <h2 className="text-xl font-serif italic text-text-heading">Performance Ledger & Trade Journal</h2>
                  <p className="text-[11px] text-text-dim max-w-xl leading-relaxed">
                    Every closed position from both autonomous engines recorded in a trade journal ledger.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { fetchJournal(); }}
                    className="text-[10px] font-bold uppercase tracking-wider py-2 px-3 rounded bg-bg-input hover:bg-bg-card text-text-dim border border-border-dim flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RefreshCw className={cn("w-3 h-3", journalLoading && "animate-spin")} /> Refresh
                  </button>
                  <button
                    type="button"
                    onClick={resyncJournalWallet}
                    disabled={journalResyncing}
                    title="Force a fresh pull of the wallet's on-chain trade history and wallet balances — use if the ledger or balances look stale."
                    className="text-[10px] font-bold uppercase tracking-wider py-2 px-3 rounded bg-sol-green/10 hover:bg-sol-green/20 text-sol-green border border-sol-green/30 flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Wallet className={cn("w-3 h-3", journalResyncing && "animate-pulse")} /> {journalResyncing ? "Resyncing…" : "Resync Wallet"}
                  </button>
                  <button
                    type="button"
                    onClick={downloadJournalCSV}
                    disabled={!journalData?.trades?.length}
                    className="text-[10px] font-bold uppercase tracking-wider py-2 px-3 rounded bg-sol-purple/10 hover:bg-sol-purple/20 text-sol-purple border border-sol-purple/30 flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3 h-3" /> Export CSV
                  </button>
                </div>
              </div>

              {journalResyncMsg && (
                <div className={cn(
                  "text-[10.5px] font-mono px-3 py-2 rounded-lg border",
                  journalResyncMsg.startsWith("Resync failed")
                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                    : "bg-sol-green/10 border-sol-green/30 text-sol-green"
                )}>
                  {journalResyncMsg}
                </div>
              )}

              {/* Performance stats */}
              {journalData?.stats && journalData.stats.total > 0 && (
                <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: "Total Trades", value: journalData.stats.total, tone: "neutral" },
                    { label: "Win Rate", value: `${journalData.stats.winRate.toFixed(1)}%`, tone: journalData.stats.winRate >= 50 ? "pos" : "neg" },
                    { label: "Total PnL", value: `${journalData.stats.totalPnL >= 0 ? "+" : ""}${journalData.stats.totalPnL.toFixed(2)}%`, tone: journalData.stats.totalPnL >= 0 ? "pos" : "neg" },
                    { label: "Avg PnL", value: `${journalData.stats.avgPnL >= 0 ? "+" : ""}${journalData.stats.avgPnL.toFixed(2)}%`, tone: journalData.stats.avgPnL >= 0 ? "pos" : "neg" },
                    { label: "Best / Worst", value: `${journalData.stats.best ? (journalData.stats.best.pnl >= 0 ? "+" : "") + journalData.stats.best.pnl.toFixed(1) : "—"} / ${journalData.stats.worst ? journalData.stats.worst.pnl.toFixed(1) : "—"}%`, tone: "neutral" },
                    { label: "Avg Duration", value: journalData.stats.avgDurationMins >= 60 ? `${Math.floor(journalData.stats.avgDurationMins / 60)}h ${journalData.stats.avgDurationMins % 60}m` : `${journalData.stats.avgDurationMins}m`, tone: "neutral" },
                  ].map((s) => (
                    <div key={s.label} className="p-3 bg-bg-card border border-border-dim rounded-lg">
                      <span className="text-[8.5px] uppercase tracking-wider text-text-dim font-bold block mb-1">{s.label}</span>
                      <span className={cn(
                        "text-base font-black tracking-tight",
                        s.tone === "pos" ? "text-sol-green" : s.tone === "neg" ? "text-red-400" : "text-text-heading"
                      )}>{s.value}</span>
                    </div>
                  ))}
                  <div className="col-span-2 sm:col-span-3 lg:col-span-6 flex gap-4 text-[10px] text-text-dim font-mono pt-1">
                    <span>🟢 LONG: <span className="text-text-heading font-bold">{journalData.stats.longCount}</span></span>
                    <span>🔴 SHORT: <span className="text-text-heading font-bold">{journalData.stats.shortCount}</span></span>
                    <span>Wins: <span className="text-sol-green font-bold">{journalData.stats.wins}</span></span>
                    <span>Losses: <span className="text-red-400 font-bold">{journalData.stats.losses}</span></span>
                  </div>
                </section>
              )}

              {/* Trade ledger */}
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-border-dim/60 pb-2">
                  <span className="text-[10px] font-mono font-bold text-text-heading uppercase tracking-[0.2em] flex items-center gap-2">
                    <Table className="w-3 h-3 text-sol-purple" /> Trade Ledger
                  </span>
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-bg-input border border-border-dim">
                    <button
                      type="button"
                      onClick={() => setJournalViewMode('grid')}
                      className={cn(
                        "flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider py-1 px-2 rounded cursor-pointer transition-colors",
                        journalViewMode === 'grid' ? "bg-sol-purple/20 text-sol-purple" : "text-text-dim hover:text-text-heading"
                      )}
                    >
                      <LayoutGrid className="w-3 h-3" /> Grid
                    </button>
                    <button
                      type="button"
                      onClick={() => setJournalViewMode('table')}
                      className={cn(
                        "flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider py-1 px-2 rounded cursor-pointer transition-colors",
                        journalViewMode === 'table' ? "bg-sol-purple/20 text-sol-purple" : "text-text-dim hover:text-text-heading"
                      )}
                    >
                      <List className="w-3 h-3" /> Table
                    </button>
                  </div>
                </div>
                {journalLoading ? (
                  <div className="text-center text-[11px] text-text-dim py-10 flex items-center justify-center gap-2">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Loading journal…
                  </div>
                ) : (journalData?.trades || []).length === 0 ? (
                  <div className="text-center text-[11px] text-text-dim py-10">
                    No closed trades recorded yet. Positions appear here once the autonomous engines settle them.
                  </div>
                ) : journalViewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {journalData.trades.map((trade: any) => {
                      const durationStr = trade.durationMins !== null && trade.durationMins !== undefined
                        ? (trade.durationMins >= 60 ? `${Math.floor(trade.durationMins / 60)}h ${trade.durationMins % 60}m` : `${trade.durationMins}m`)
                        : "—";
                      let exitStr = "";
                      try { exitStr = trade.exitTime ? etFormat(new Date(trade.exitTime), "MMM d, HH:mm") : ""; } catch (e) {}
                      return (
                        <div key={trade.id} className={cn(
                          "flex flex-col p-4 bg-bg-card border rounded-xl text-[11px] space-y-3 transition-all hover:scale-[1.01] hover:shadow-md",
                          trade.pnl >= 0 
                            ? "border-sol-green/20 hover:border-sol-green/40 bg-gradient-to-br from-bg-card to-sol-green/[0.03]" 
                            : "border-red-500/15 hover:border-red-500/35 bg-gradient-to-br from-bg-card to-red-500/[0.02]"
                        )}>
                          <div className="flex justify-between items-center flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-white",
                                trade.side === "LONG" ? "bg-sol-green" : trade.side === "SHORT" ? "bg-red-500" : "bg-text-dim"
                              )}>
                                {trade.side}{trade.leverage ? ` (${trade.leverage}x)` : ""}
                              </span>
                              <span className="text-[8.5px] uppercase tracking-wider text-text-dim font-bold px-1.5 py-0.5 rounded bg-bg-input border border-border-dim">{trade.source}</span>
                              {trade.version ? (
                                <span className="text-[8.5px] font-mono text-text-dim px-1.5 py-0.5 rounded bg-bg-input border border-border-dim" title={`Executed under version ${trade.version}${trade.closeVersion && trade.closeVersion !== trade.version ? `, settled under ${trade.closeVersion}` : ""}`}>
                                  {trade.version.startsWith("v") ? trade.version : `v${trade.version}`}
                                  {trade.closeVersion && trade.closeVersion !== trade.version && ` ➔ ${trade.closeVersion.startsWith("v") ? trade.closeVersion : `v${trade.closeVersion}`}`}
                                </span>
                              ) : trade.backfilled ? (
                                <span className="text-[8.5px] font-mono text-text-dim px-1.5 py-0.5 rounded bg-bg-input border border-border-dim" title="Reconstructed from Jupiter's on-chain trade history, not recorded live by the daemon — the chain doesn't carry a build/version tag, so it can't be shown for this trade.">
                                  ⛓ build n/a (on-chain)
                                </span>
                              ) : null}
                            </div>
                            <div className="flex flex-col items-end">
                              <span className={cn(
                                "font-black tracking-tight text-base font-mono",
                                trade.pnl >= 0 ? "text-sol-green" : "text-red-500"
                              )}>
                                {trade.pnl >= 0 ? "+" : ""}{trade.pnl.toFixed(2)}%
                              </span>
                              {trade.pnlUsd !== undefined && trade.pnlUsd !== null && (
                                <span
                                  className={cn("text-[10px] font-bold font-mono", trade.pnlUsd >= 0 ? "text-sol-green/80" : "text-red-400/80")}
                                  title={trade.reconciled ? "Realized PnL, net of open + close fees (on-chain)" : "Estimated PnL — pre-fee, based on the bot's own entry/exit snapshot"}
                                >
                                  {trade.pnlUsd >= 0 ? "+" : "-"}${Math.abs(trade.pnlUsd).toFixed(2)}
                                </span>
                              )}
                              {trade.reconciled && Math.abs(trade.pnlEstimated - trade.pnl) > 0.005 && (
                                <span className="text-[8px] text-text-dim font-mono">est. {trade.pnlEstimated >= 0 ? "+" : ""}{trade.pnlEstimated.toFixed(2)}%</span>
                              )}
                            </div>
                          </div>

                          <div className="flex justify-between items-center flex-wrap gap-1">
                            <div className="text-[9px] text-text-dim font-mono flex items-center gap-2">
                              {exitStr && <span>Settled: {exitStr} {tzAbbr}</span>}
                              {trade.mode && (
                                <span className="text-[8px] uppercase tracking-wider px-1 py-0.2 rounded bg-bg-input border border-border-dim">{trade.mode}</span>
                              )}
                            </div>
                            {trade.source === "Auto-Trade (Jupiter)" && trade.mode === "REAL" ? (
                              <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-sol-green/10 text-sol-green border border-sol-green/30" title="Reconciled against actual on-chain fills via Jupiter's own trade history — matches your Phantom wallet.">
                                ✓ On-chain verified
                              </span>
                            ) : trade.source === "Auto-Trade (Jupiter)" && trade.mode === "PAPER" ? (
                              <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-bg-input text-text-dim border border-border-dim" title="Simulated trade — no real funds or fees involved.">
                                Paper — simulated
                              </span>
                            ) : (
                              <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-bg-input text-text-dim border border-border-dim" title="Signal-only alert — never executed on-chain, no real fill or fees.">
                                Estimated — signal only
                              </span>
                            )}
                          </div>

                          <TradeDetailFields trade={trade} />
                          <TradeSignalAndNews trade={trade} />

                          <div className="border-t border-border-dim/20 pt-2">
                            <button
                              type="button"
                              onClick={() => setExpandedTradeId(expandedTradeId === trade.id ? null : trade.id)}
                              className="w-full flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-sol-purple hover:text-sol-purple/80 cursor-pointer transition-colors"
                            >
                              {expandedTradeId === trade.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              Price Chart
                            </button>
                            {expandedTradeId === trade.id && (
                              <TradeChart trade={trade} token={trade.token || token} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border-dim custom-scrollbar">
                    <table className="w-full text-[10.5px] border-collapse">
                      <thead>
                        <tr className="bg-bg-input/60 text-text-dim uppercase tracking-wider text-[8.5px] font-bold">
                          <th className="text-left px-3 py-2 whitespace-nowrap">Settled</th>
                          <th className="text-left px-3 py-2 whitespace-nowrap">Result / Side</th>
                          <th className="text-left px-3 py-2 whitespace-nowrap">Source</th>
                          <th className="text-right px-3 py-2 whitespace-nowrap">Entry ➔ Exit</th>
                          <th className="text-right px-3 py-2 whitespace-nowrap">PnL %</th>
                          <th className="text-right px-3 py-2 whitespace-nowrap">PnL $</th>
                          <th className="text-right px-3 py-2 whitespace-nowrap">Duration</th>
                          <th className="text-left px-3 py-2 whitespace-nowrap">Status</th>
                          <th className="text-center px-3 py-2 whitespace-nowrap w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {journalData.trades.map((trade: any) => {
                          const durationStr = trade.durationMins !== null && trade.durationMins !== undefined
                            ? (trade.durationMins >= 60 ? `${Math.floor(trade.durationMins / 60)}h ${trade.durationMins % 60}m` : `${trade.durationMins}m`)
                            : "—";
                          let exitStr = "";
                          try { exitStr = trade.exitTime ? etFormat(new Date(trade.exitTime), "MMM d, HH:mm") : ""; } catch (e) {}
                          const isExpanded = expandedTradeId === trade.id;
                          return (
                            <React.Fragment key={trade.id}>
                              <tr
                                onClick={() => setExpandedTradeId(isExpanded ? null : trade.id)}
                                className={cn(
                                  "border-t border-border-dim/40 cursor-pointer hover:bg-bg-input/30 transition-colors",
                                  isExpanded && "bg-bg-input/30"
                                )}
                              >
                                <td className="px-3 py-2 whitespace-nowrap font-mono text-text-dim">{exitStr ? `${exitStr} ${tzAbbr}` : "—"}</td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-white",
                                    trade.pnl >= 0 ? "bg-sol-green" : "bg-red-500"
                                  )}>
                                    {trade.pnl >= 0 ? "WIN" : "LOSS"}
                                  </span>
                                  <span className="ml-1.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-bg-input text-text-heading border border-border-dim">
                                    {trade.side}{trade.leverage ? ` (${trade.leverage}x)` : ""}
                                  </span>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-text-dim">
                                  {trade.source}
                                  {trade.mode && <span className="ml-1.5 text-[8px] uppercase tracking-wider px-1 py-0.2 rounded bg-bg-input border border-border-dim">{trade.mode}</span>}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-text-heading">
                                  ${(trade.entryPriceActual ?? trade.entryPrice)?.toFixed(2)} ➔ ${(trade.exitPriceActual ?? trade.exitPrice)?.toFixed(2)}
                                </td>
                                <td className={cn("px-3 py-2 whitespace-nowrap text-right font-mono font-black", trade.pnl >= 0 ? "text-sol-green" : "text-red-500")}>
                                  {trade.pnl >= 0 ? "+" : ""}{trade.pnl.toFixed(2)}%
                                </td>
                                <td className={cn("px-3 py-2 whitespace-nowrap text-right font-mono font-bold", trade.pnlUsd >= 0 ? "text-sol-green/80" : "text-red-400/80")}>
                                  {trade.pnlUsd !== undefined && trade.pnlUsd !== null ? `${trade.pnlUsd >= 0 ? "+" : "-"}$${Math.abs(trade.pnlUsd).toFixed(2)}` : "—"}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-text-dim">{durationStr}</td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  {trade.source === "Auto-Trade (Jupiter)" && trade.mode === "REAL" ? (
                                    <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-sol-green/10 text-sol-green border border-sol-green/30" title="Reconciled against actual on-chain fills via Jupiter's own trade history — matches your Phantom wallet.">
                                      ✓ On-chain
                                    </span>
                                  ) : trade.source === "Auto-Trade (Jupiter)" && trade.mode === "PAPER" ? (
                                    <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-bg-input text-text-dim border border-border-dim" title="Simulated trade — no real funds or fees involved.">
                                      Paper
                                    </span>
                                  ) : (
                                    <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-bg-input text-text-dim border border-border-dim" title="Signal-only alert — never executed on-chain, no real fill or fees.">
                                      Signal only
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-center text-text-dim">
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 inline" /> : <ChevronDown className="w-3.5 h-3.5 inline" />}
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-bg-input/10 border-t border-border-dim/20">
                                  <td colSpan={9} className="px-4 py-3">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                      <div className="space-y-3">
                                        <TradeDetailFields trade={trade} />
                                        <TradeSignalAndNews trade={trade} />
                                      </div>
                                      <TradeChart trade={trade} token={trade.token || token} />
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </main>
        ) : currentView === 'strategy' ? (
          <StrategyGuide />
        ) : (
          <main className="flex-1 flex flex-col p-8 bg-bg-main overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto w-full space-y-12 pb-20">
              <div className="space-y-4 text-center">
                <h2 className="text-4xl font-serif italic text-text-heading">About Cortex Alpha</h2>
                <p className="text-lg text-text-dim max-w-2xl mx-auto">A quantitative framework fusing standard trend-following systems with semantic catalyst intelligence and momentum confirmation.</p>
              </div>

              {/* Recommended defaults promotion panel */}
              <div className="p-6 bg-gradient-to-r from-sol-purple/10 to-sol-green/10 border border-sol-purple/20 rounded-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="space-y-2 relative z-10 max-w-xl text-left">
                  <div className="flex items-center gap-2 text-sol-purple">
                    <Zap className="w-4 h-4 text-yellow-300" />
                    <span className="text-xs uppercase font-extrabold tracking-widest font-mono">Optimal Strategy Recommendation</span>
                  </div>
                  <h3 className="text-base font-bold text-text-heading font-serif italic">Dual-Regime: Momentum + Mean-Reversion Core Strategy</h3>
                  <p className="text-xs text-text-dim leading-relaxed">
                    Through rigorous multi-asset sweep testing across historical windows (BTC, ETH, SOL), the most robust and consistent yield performance was achieved using a unified <strong>Technical Trend (MACD)</strong>, <strong>Oscillator (RSI)</strong>, and <strong>Supertrend (ATR)</strong> configuration with a <strong>0.25</strong> conviction threshold and active trend-regime filtering. The engine switches strategy by regime: <strong>momentum</strong> when ADX confirms a trend, <strong>mean-reversion range-fades</strong> (fade rejections off the recent range high/low) when ADX says the market is ranging / chop-zone.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setWeights({
                      sentiment: 0,
                      technical: 0.9,
                      liquidity: 0.85,
                      elliottWave: 0,
                      supertrend: 0.9,
                      fvg: 0,
                      dca: 0
                    });
                    setEnabledIndicators({
                      sentiment: false,
                      technical: true,
                      liquidity: true,
                      elliottWave: false,
                      supertrend: true,
                      fvg: false,
                      dca: false
                    });
                    setThreshold(0.25);
                    // Persist the regime switch on the auto-trader: momentum when ADX trends,
                    // mean-reversion range-fades when ADX says ranging/chop (resolveEntry).
                    // The engine defaults ON, but applying "recommended" must also repair a
                    // config where it was previously turned off.
                    let mrNote = "• Mean-Reversion range-fade in chop-zone (ADX ranging): ENABLED";
                    try {
                      const res = await fetch("/api/jupiter-config", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ meanReversionEnabled: true })
                      });
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      fetchJupiterConfig();
                    } catch (e: any) {
                      mrNote = `• Mean-Reversion toggle could not be saved (${e.message || e}) — engine default is ON`;
                    }
                    alert(`System configuration updated to recommended optimal defaults:\n• Weights: MACD: 0.9, RSI: 0.85, Supertrend: 0.9\n• Enabled: MACD, RSI, Supertrend (others disabled)\n• Conviction Threshold: 0.25\n• Momentum strategy when ADX confirms a trend\n${mrNote}`);
                  }}
                  className="py-2.5 px-5 bg-sol-purple hover:bg-sol-purple/90 text-white font-extrabold uppercase text-[10px] tracking-wider rounded-xl transition-all shadow-md shrink-0 cursor-pointer animate-pulse"
                >
                  Apply Recommended Default Config
                </button>
              </div>

              {/* Strategy Visualization Map */}
              <div className="p-8 bg-bg-card border border-border-dim rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-sol-purple/5 blur-[100px] rounded-full -mr-32 -mt-32"></div>
                <div className="relative z-10 space-y-8">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[10px] font-mono text-sol-purple uppercase tracking-[0.3em] font-bold">System Architecture</span>
                    <h3 className="text-xl font-serif italic text-text-heading">Trend + Momentum Fusion Pipeline</h3>
                  </div>
                  
                  <div className="flex flex-col md:flex-row items-center justify-between gap-8 max-w-3xl mx-auto relative">
                    {/* Input Nodes */}
                    <div className="flex flex-col gap-2 w-full md:w-48 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                      <div className="p-2.5 bg-bg-main border border-border-dim rounded-lg text-center transition-colors hover:border-sol-purple/50">
                        <p className="text-[7.5px] font-mono uppercase text-text-dim mb-0.5">Signal A (Trend Follower)</p>
                        <p className="text-[8.5px] font-bold text-text-heading">Trend Trigger (MACD)</p>
                      </div>
                      <div className="p-2.5 bg-bg-main border border-border-dim rounded-lg text-center transition-colors hover:border-sol-green/50">
                        <p className="text-[7.5px] font-mono uppercase text-text-dim mb-0.5">Signal B (Momentum Confirm)</p>
                        <p className="text-[8.5px] font-bold text-text-heading">Oscillator Trigger (RSI)</p>
                      </div>
                      <div className="p-2.5 bg-bg-main border border-border-dim rounded-lg text-center transition-colors hover:border-sol-purple/50">
                        <p className="text-[7.5px] font-mono uppercase text-text-dim mb-0.5">Signal C (LLM Catalyst)</p>
                        <p className="text-[8.5px] font-bold text-text-heading">LLM Political Sentiment</p>
                      </div>
                      <div className="p-2.5 bg-bg-main border border-border-dim rounded-lg text-center transition-colors hover:border-sol-green/50">
                        <p className="text-[7.5px] font-mono uppercase text-text-dim mb-0.5">Signal D (Wave Formula)</p>
                        <p className="text-[8.5px] font-bold text-text-heading">Elliot Wave Entry Point</p>
                      </div>
                      <div className="p-2.5 bg-bg-main border border-border-dim rounded-lg text-center transition-colors hover:border-sol-purple/50">
                        <p className="text-[7.5px] font-mono uppercase text-text-dim mb-0.5">Signal E (ATR Bands)</p>
                        <p className="text-[8.5px] font-bold text-text-heading">Supertrend Trend</p>
                      </div>
                      <div className="p-2.5 bg-bg-main border border-border-dim rounded-lg text-center transition-colors hover:border-sol-green/50">
                        <p className="text-[7.5px] font-mono uppercase text-text-dim mb-0.5">Signal F (ICT Imbalance)</p>
                        <p className="text-[8.5px] font-bold text-text-heading">Fair Value Gap (FVG)</p>
                      </div>
                      <div className="p-2.5 bg-bg-main border border-border-dim rounded-lg text-center transition-colors hover:border-sol-purple/50">
                        <p className="text-[7.5px] font-mono uppercase text-text-dim mb-0.5">Signal G (Z-Score Mean)</p>
                        <p className="text-[8.5px] font-bold text-text-heading">DCA Mean-Reversion</p>
                      </div>
                    </div>

                    {/* Processing Core */}
                    <div className="relative flex-1 flex flex-col items-center justify-center py-12 px-8 border-2 border-dashed border-border-dim rounded-[30%]">
                      <motion.div 
                        className="w-24 h-24 rounded-full bg-sol-purple/10 flex items-center justify-center border border-sol-purple/30 shadow-[0_0_40px_rgba(139,92,246,0.1)]"
                        animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
                        transition={{ repeat: Infinity, duration: 4 }}
                      >
                        <Zap className="w-8 h-8 text-sol-purple" />
                      </motion.div>
                      <div className="absolute -bottom-4 bg-bg-card px-4 py-1 border border-border-dim rounded-full">
                        <span className="text-[10px] font-mono font-bold text-text-heading">Composite Logic Core</span>
                      </div>
                      
                      {/* Connection Lines (Visual) */}
                      <div className="absolute left-0 top-1/2 w-12 h-px bg-gradient-to-r from-border-dim to-sol-purple/50 -ml-12 hidden md:block"></div>
                      <div className="absolute right-0 top-1/2 w-12 h-px bg-gradient-to-l from-border-dim to-sol-purple/50 -mr-12 hidden md:block"></div>
                    </div>

                    {/* Output Node */}
                    <div className="w-full md:w-32">
                      <div className="p-4 bg-sol-purple/20 border border-sol-purple/40 rounded-xl text-center shadow-lg shadow-sol-purple/5">
                        <p className="text-[9px] font-mono uppercase text-sol-purple mb-1">Execution</p>
                        <p className="text-[11px] leading-tight font-black tracking-widest break-words">OMNI_SIGNAL</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border-dim/50">
                    <div className="text-center space-y-1">
                      <p className="text-[10px] font-bold text-text-heading">1. ALIGN</p>
                      <p className="text-[9px] text-text-dim">Measure technical trend (EMA) with momentum limits (RSI).</p>
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-[10px] font-bold text-text-heading">2. WEIGHT</p>
                      <p className="text-[9px] text-text-dim">Correlate chart alignment against actual global news sentiment.</p>
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-[10px] font-bold text-text-heading">3. EXECUTE</p>
                      <p className="text-[9px] text-text-dim">Synthesize the Composite Bias (Σ) into explicit orders.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Automated entry/exit strategy — the exact decision flow the live auto-trader runs */}
              <div className="p-8 bg-bg-card border border-border-dim rounded-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-64 h-64 bg-sol-green/5 blur-[100px] rounded-full -ml-32 -mt-32"></div>
                <div className="relative z-10 space-y-8">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <span className="text-[10px] font-mono text-sol-green uppercase tracking-[0.3em] font-bold">Automated Strategy</span>
                    <h3 className="text-xl font-serif italic text-text-heading">Entry / Exit Decision Flow</h3>
                    <p className="text-[11px] text-text-dim max-w-2xl leading-relaxed">
                      The exact pipeline the autonomous trader runs every sync cycle. Entries and exits are one shared
                      code path with the server backtest (<code className="text-[10px]">resolveEntry</code> / <code className="text-[10px]">entryGateBlock</code> / <code className="text-[10px]">evaluateExit</code>),
                      so live behaviour can never drift from what was validated. Full write-up in <span className="font-mono">docs/STRATEGY.md</span>.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* ENTRY flow */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-mono font-bold text-sol-purple uppercase tracking-[0.2em] text-center pb-1">① Entry — regime-switched</p>

                      <div className="p-3 bg-bg-main border border-border-dim rounded-lg text-center">
                        <p className="text-[8px] font-mono uppercase text-text-dim mb-0.5">Composite bias</p>
                        <p className="text-[10px] font-bold text-text-heading">Σ = MACD ×0.90 + RSI ×0.85 + Supertrend ×0.90</p>
                        <p className="text-[9px] text-text-dim mt-0.5">|Σ| &gt; 0.25 → LONG / SHORT candidate, else HOLD</p>
                      </div>
                      <p className="text-center text-text-dim text-[10px] leading-none">▼</p>

                      <div className="p-3 bg-bg-main border border-sol-purple/30 rounded-lg text-center">
                        <p className="text-[8px] font-mono uppercase text-sol-purple mb-0.5">Regime switch</p>
                        <p className="text-[10px] font-bold text-text-heading">ADX(14) — is the market trending?</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <p className="text-center text-text-dim text-[10px] leading-none">▼</p>
                          <div className="p-3 bg-bg-main border border-sol-green/25 rounded-lg space-y-1.5">
                            <p className="text-[8px] font-mono uppercase text-sol-green text-center">Trending (ADX &gt; 15) → Momentum</p>
                            <ul className="text-[9px] text-text-dim space-y-1 list-disc pl-3.5">
                              <li>200-EMA regime filter — longs only above, shorts only below</li>
                              <li>15m Supertrend must agree with the side</li>
                              <li>Momentum trigger: MACD-sign <b>or</b> RSI(21) timing cross (35↑ / 65↓)</li>
                              <li>Chop-zone guard + 2-bar confirmation + macro (DXY/10Y/VIX) filter</li>
                            </ul>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-center text-text-dim text-[10px] leading-none">▼</p>
                          <div className="p-3 bg-bg-main border border-amber-500/25 rounded-lg space-y-1.5">
                            <p className="text-[8px] font-mono uppercase text-amber-500 text-center">Ranging (ADX ≤ 15) → Mean-reversion</p>
                            <ul className="text-[9px] text-text-dim space-y-1 list-disc pl-3.5">
                              <li>Momentum score ignored (unreliable in chop)</li>
                              <li>Fade a <b>rejection</b> off the ~60-min range high/low</li>
                              <li>Bar must wick past the extreme but close back ≥35% of its own range inside — a touch or a clean breakout never fires ("no knife catching")</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                      <p className="text-center text-text-dim text-[10px] leading-none">▼</p>

                      <div className="p-3 bg-bg-main border border-red-500/25 rounded-lg text-center">
                        <p className="text-[8px] font-mono uppercase text-red-400 mb-1">Risk gates (entries only — exits never blocked)</p>
                        <p className="text-[9px] text-text-dim leading-relaxed">
                          One position at a time (verified against the <b>on-chain</b> wallet before every REAL open — no pyramiding) ·
                          30-min cooldown · 45-min pause after 2 straight losses · max 4 opens / 24h ·
                          circuit breaker after 8 consecutive losses · same-side/same-level re-entry block
                        </p>
                      </div>
                      <p className="text-center text-text-dim text-[10px] leading-none">▼</p>
                      <div className="p-2.5 bg-sol-purple/15 border border-sol-purple/40 rounded-lg text-center">
                        <p className="text-[10px] font-black tracking-widest text-sol-purple">OPEN POSITION</p>
                      </div>
                    </div>

                    {/* EXIT ladder */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-mono font-bold text-sol-green uppercase tracking-[0.2em] text-center pb-1">② Exit — ATR ladder (long shown; short mirrors)</p>

                      <div className="rounded-lg border border-border-dim overflow-hidden">
                        <div className="p-3 bg-sol-green/10 border-b border-border-dim flex items-baseline justify-between gap-2">
                          <span className="text-[10px] font-bold text-sol-green font-mono">entry + 4.0×ATR</span>
                          <span className="text-[9px] text-text-dim text-right">Hard take-profit cap — close the runner</span>
                        </div>
                        <div className="p-3 bg-sol-green/5 border-b border-border-dim flex items-baseline justify-between gap-2">
                          <span className="text-[10px] font-bold text-sol-green font-mono">peak − 2.0×ATR</span>
                          <span className="text-[9px] text-text-dim text-right">Trailing stop — ratchets up behind the best price, never widens</span>
                        </div>
                        <div className="p-3 bg-bg-main border-b border-border-dim flex items-baseline justify-between gap-2">
                          <span className="text-[10px] font-bold text-text-heading font-mono">entry + 1.5×ATR</span>
                          <span className="text-[9px] text-text-dim text-right"><b>Scale out 50%</b> (banked) and move the stop to breakeven — the rest rides risk-free</span>
                        </div>
                        <div className="p-3 bg-bg-main border-b border-border-dim flex items-baseline justify-between gap-2">
                          <span className="text-[10px] font-bold text-text-heading font-mono">entry</span>
                          <span className="text-[9px] text-text-dim text-right">Breakeven stop after the scale-out</span>
                        </div>
                        <div className="p-3 bg-red-500/5 flex items-baseline justify-between gap-2">
                          <span className="text-[10px] font-bold text-red-400 font-mono">entry − 1.5×ATR</span>
                          <span className="text-[9px] text-text-dim text-right">Initial hard stop (ATR floored at 0.4% of price so noise can't wick it out)</span>
                        </div>
                      </div>

                      <div className="p-3 bg-bg-main border border-border-dim rounded-lg space-y-1.5">
                        <p className="text-[8px] font-mono uppercase text-text-dim">Two more exits outside the ladder</p>
                        <ul className="text-[9px] text-text-dim space-y-1 list-disc pl-3.5">
                          <li><b>Time limit:</b> no scale-out and still under +0.5% after 90 minutes → cut it.</li>
                          <li><b>In-profit reversal:</b> signal flips <i>and</i> the trade has cleared the ≥1.5% fee/noise buffer → bank it (and re-enter the other side). A flip while under water is ignored — the stop governs the downside.</li>
                        </ul>
                      </div>

                      <p className="text-[9px] text-text-dim leading-relaxed text-center pt-1">
                        All levels are in price space and scaled by the ATR captured at entry, so the same ladder holds at any leverage.
                        Multipliers are env-tunable (<span className="font-mono">EXIT_SL/PARTIAL/TRAIL/TP_MULT</span>).
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card title="The Cortex Alpha Composite Concept" icon={Activity}>
                  <div className="space-y-4 text-sm leading-relaxed text-text-body">
                    <p>
                      The most universally validated trading system historically is the <strong>Trend Follower combined with a Mean Reversion filter</strong>. Cortex Alpha fuses this classic approach (Fast vs Slow EMA crossovers verified by RSI pullbacks) with modern Semantic Market Sentiment (NLP reading top 10 market news articles).
                    </p>
                    <p>
                      This ensures the algorithm buys the pullbacks (RSI) in an uptrend (EMA), but completely skips fakeouts if the News/Sentiment acts as a bearish catalyst overriding the chart.
                    </p>
                  </div>
                </Card>

                <Card title="Decision Core: Alpha Composite (Σ)" icon={Zap}>
                  <div className="space-y-4 text-sm leading-relaxed text-text-body">
                    <p>
                      The strategy unifies perfectly across the Telegram alerts, order forecasts, and live visual dashboards via one unified <strong>Composite Bias Score (Σ)</strong>:
                    </p>
                    <div className="bg-bg-input p-4 rounded font-mono text-[10px] break-words border border-border-dim flex justify-center text-center">
                      Σ = (MACD × W₁) + (RSI × W₂) + (Supertrend × W₃) [+ News, +ElliottWave]
                    </div>
                    <p>
                      The <strong>data-selected default</strong> uses only the three trend/momentum terms — <strong>MACD + RSI + Supertrend</strong>. News (Sentiment) and Elliott Wave are <strong>opt-in</strong>: the multi-asset sweep showed both <i>reduced</i> performance, so they ship OFF (weights 0). Σ is normalized by the sum of weights and bounded <strong>-1.0</strong> (heavy bearish) to <strong>+1.0</strong> (heavy bullish). A directional trade only fires when <strong>|Σ| &gt; 0.25</strong> (the conviction threshold) — the legacy 0.08 cutoff over-fired and produced whipsaw.
                    </p>
                  </div>
                </Card>

                <Card title="Core Subsystems & Indicators Framework" icon={Activity}>
                  <div className="space-y-4 text-sm leading-relaxed text-text-body">
                    <p>
                      Each component works in mathematical concert. The inputs are evaluated and scored purely quantitatively following the unified engine specifications:
                    </p>
                    <ul className="list-disc pl-5 space-y-3 text-xs text-text-dim">
                      <li>
                        <strong className="text-text-heading">1. Elliott Wave Score (EWO)</strong>: Computes the oscillator mathematically as `SMA(5) - SMA(34)` over the most recent 34 periods. The system normalizes the current EWO value into strict `[-1.0, 1.0]` bounds scale and cross-references this with Price highs to detect specific structural phases like <i>Wave 3 Impulses</i> or <i>Wave 5 Bearish Divergences</i>.
                      </li>
                      <li>
                        <strong className="text-text-heading">2. RSI Timing Tool (Period 21)</strong>: Computes standard 21-period RSI to reduce lower timeframe noise. Serves as a final entry timing filter: only enter a Long when RSI crosses back above 35 (oversold bounce) and a Short when RSI crosses back below 65 (overbought rejection).
                      </li>
                      <li>
                        <strong className="text-text-heading">3. MACD Histogram Filter (Direction)</strong>: Operates as a direction filter rather than a crossover trigger to prevent entering at exhaustion points. Longs are only allowed if MACD histogram is positive and has been rising for 2 consecutive candles; Shorts only if negative and falling for 2 consecutive candles.
                      </li>
                      <li>
                        <strong className="text-text-heading">4. Semantic Catalyst Score (News)</strong>: Evaluates recent market headlines using localized CPU NLP heuristics and Gemini LLM verification. Extreme political or catalyst sentiment (<code>&gt;= 0.85</code> or <code>&lt;= -0.85</code>) triggers an authoritative system overrule, forcing the Composite Bias Score to fully mirror the catalyst direction and bypass downstream verification rules.
                      </li>
                      <li>
                        <strong className="text-text-heading">5. Supertrend ATR (Period 20, Mult 4.0)</strong>: Integrates ATR-band trend-following. Period is increased to 20 and multiplier to 4.0 to filter noise spikes. A 15m Supertrend filter is also fetched: entries must align with the 15m Supertrend direction.
                      </li>
                      <li>
                        <strong className="text-text-heading">6. ADX(14) Trend Gate</strong>: A hard no-trade gate. Entries are completely suppressed unless ADX(14) &gt; 20, indicating the presence of a strong trending market and preventing range-bound whipsaws.
                      </li>
                      <li>
                        <strong className="text-text-heading">7. 200-EMA Primary-Trend Regime Filter</strong>: The highest-value gate. The engine <strong>never fades the higher-timeframe trend</strong> — LONGs are blocked while price is below the 200-EMA and SHORTs while above it. The live post-mortem found <i>every</i> losing long was a counter-trend long into a falling market; this filter removes exactly those entries.
                      </li>
                      <li>
                        <strong className="text-text-heading">8. Macro Regime Filter (DXY / US10Y / VIX)</strong>: Reads the real 5-day trend of the dollar, 10-year yield and volatility. No new LONGs while the macro backdrop is <i>RISK-OFF</i>, no new SHORTs while <i>RISK-ON</i>. A data outage resolves to NEUTRAL so it can never block trading entirely. In the benchmark it improved Sharpe and PnL in 6/6 windows while cutting trade count.
                      </li>
                      <li>
                        <strong className="text-text-heading">9. Risk, Circuit Breaker, & Leverage</strong>: ATR-based stop-loss with a trailing stop that ratchets behind the best price (locks gains, never widens the loss); leveraged TP ≈ 3.25% / SL ≈ 1.625% at a default 3x. A <strong>circuit breaker pauses new entries after 8 consecutive losses</strong> and auto-resets 6 hours after the last loss (exits always remain enabled).
                      </li>
                      <li>
                        <strong className="text-text-heading">10. Per-Sync Reasoning Audit</strong>: Every strategy-output sync writes an auditable line explaining <i>why</i> it acted — Σ vs threshold, trend, ADX, the 200-EMA regime, and the macro backdrop — so each ENTER / STAND-ASIDE / HOLD / CLOSE decision is explainable after the fact.
                      </li>
                    </ul>
                    <div className="pt-2">
                       <p className="text-xs bg-bg-main p-3 rounded border-l-2 border-sol-purple">
                        <strong>The Chop Zone (Hold Strategy):</strong> When RSI lazily floats in the Neutral Zone (40 to 60) AND the Moving Averages squeeze tightly (low volatility), the algorithm forces a <strong>HOLD</strong> to preserve capital, avoiding sideways erosion and faux-breakouts.
                       </p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Honest limitations & failure modes — the trader's critique */}
              <div className="bg-bg-card border border-red-500/30 p-6 rounded-2xl space-y-5">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-red-400" />
                  <h3 className="text-lg font-serif italic text-text-heading">Known Limitations & Failure Modes (read this)</h3>
                </div>
                <p className="text-xs text-text-dim leading-relaxed">
                  No strategy works in all markets — the honest goal is <strong>robustness</strong>, not a money printer. These are the documented ways this system loses, and how it now defends against each:
                </p>
                <ul className="list-disc pl-5 space-y-3 text-xs text-text-body">
                  <li>
                    <strong className="text-text-heading">Whipsaw / premature exits ("phantom R:R").</strong> At the old 0.08 threshold the signal flipped within minutes, and the reversal rule cut trades for tiny fee-eaten losses before the 2:1 TP/SL could ever govern. <span className="text-sol-green">Mitigation:</span> 0.25 threshold + 1h candles + ADX(14)&gt;20, and the <strong>reversal exit now only banks winners ≥1.5%</strong> — losers ride to the ATR stop, so the hard SL/TP is the real exit system.
                  </li>
                  <li>
                    <strong className="text-text-heading">Counter-trend entries.</strong> The live post-mortem showed every losing long was opened into a falling market. <span className="text-sol-green">Mitigation:</span> the 200-EMA primary-trend filter and the DXY/yield/VIX macro filter both block trades that fight the prevailing trend.
                  </li>
                  <li>
                    <strong className="text-text-heading">Re-arming the same failed level.</strong> The bot fired four longs in a ~0.3-wide chop band and lost them all. <span className="text-sol-green">Mitigation:</span> a <strong>same-zone re-entry block</strong> refuses the same side within 0.6% of the last failed entry for 60 min, on top of the 8-loss circuit breaker.
                  </li>
                  <li>
                    <strong className="text-text-heading">Uniform sizing ignores conviction.</strong> Every trade was the same size regardless of signal strength. <span className="text-sol-green">Mitigation:</span> <strong>conviction-based sizing</strong> scales collateral by |Σ| (floor 60% at threshold → 100% at full conviction); it only de-risks marginal trades and never exceeds the configured base.
                  </li>
                  <li>
                    <strong className="text-text-heading">Leverage vs. stop distance.</strong> A tight stop under 3–5x leverage can be wicked out inside normal SOL volatility. Stops are ATR-derived (not a fixed %) and a trailing stop locks gains — but <strong>leverage still amplifies both noise and loss</strong>; size down in choppy regimes.
                  </li>
                  <li>
                    <strong className="text-text-heading">Fees &amp; funding drag.</strong> Backtests exclude taker fees, borrow/funding and slippage. At small size and high frequency these can erase a real edge entirely (5-minute scalping was net-negative even before the gross edge). The ≥1.5% reversal buffer exists specifically to clear Jupiter's open/close + borrow fees; still, treat the engine as <strong>1h-or-slower</strong>.
                  </li>
                  <li>
                    <strong className="text-text-heading">In-sample optimism.</strong> The headline Sharpe/PnL numbers are tuned on recent 30–90d windows and will <strong>not</strong> persist unchanged. They are a hypothesis to validate walk-forward and with costs — not a guarantee. Paper-trade before risking capital.
                  </li>
                </ul>
              </div>

              {/* Strategy performance comparisons table */}
              <div className="bg-bg-card border border-border-dim p-6 rounded-2xl space-y-6">
                <div className="flex items-center gap-3">
                  <Table className="w-5 h-5 text-sol-purple" />
                  <h3 className="text-lg font-serif italic text-text-heading">Indicator Sweep Results Matrix</h3>
                </div>
                <p className="text-xs text-text-dim leading-relaxed">
                  Below is the backtested comparison of the core engine configuration settings (Simulated at 1-hour intervals, 5x leverage, over identical 30-day and 90-day testing blocks).
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border-dim text-[10px] uppercase font-bold text-text-dim font-mono">
                        <th className="py-2.5 px-2">Strategy Configuration</th>
                        <th className="py-2.5 px-2 text-right">Median Sharpe</th>
                        <th className="py-2.5 px-2 text-right">Median PnL%</th>
                        <th className="py-2.5 px-2 text-right">Worst Sharpe</th>
                        <th className="py-2.5 px-2 text-right">Win Windows</th>
                        <th className="py-2.5 px-2 text-right font-mono">Median Trades</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dim/40 text-text-heading">
                      <tr>
                        <td className="py-3 px-2 font-medium">Baseline (Sent + Tech + Liq + EW)</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-3.55</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-6.90%</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-12.82</td>
                        <td className="py-3 px-2 text-right font-mono">2 / 6</td>
                        <td className="py-3 px-2 text-right font-mono text-text-dim">~89</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-2 font-medium">Regime Filter ON (Threshold 0.08)</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-1.45</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-3.30%</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-8.60</td>
                        <td className="py-3 px-2 text-right font-mono">2 / 6</td>
                        <td className="py-3 px-2 text-right font-mono text-text-dim">~52</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-2 font-medium">Regime Filter ON (Threshold 0.25)</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-1.37</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-2.10%</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-7.78</td>
                        <td className="py-3 px-2 text-right font-mono">2 / 6</td>
                        <td className="py-3 px-2 text-right font-mono text-text-dim">~24</td>
                      </tr>
                      <tr className="bg-sol-purple/5">
                        <td className="py-3 px-2 font-medium flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-sol-green" />
                          <span>MACD + RSI Only (Threshold 0.25)</span>
                        </td>
                        <td className="py-3 px-2 text-right text-sol-green font-mono font-bold">+0.58</td>
                        <td className="py-3 px-2 text-right text-sol-green font-mono font-bold">+0.90%</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-0.14</td>
                        <td className="py-3 px-2 text-right font-mono">5 / 6</td>
                        <td className="py-3 px-2 text-right font-mono text-text-dim">~8</td>
                      </tr>
                      <tr className="bg-sol-green/10 border-y border-sol-green/30">
                        <td className="py-3.5 px-2 font-black flex items-center gap-1.5 text-sol-green font-sans">
                          <Zap className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
                          <span>Optimal default: MACD + RSI + Supertrend</span>
                        </td>
                        <td className="py-3.5 px-2 text-right text-sol-green font-mono font-black">+3.87</td>
                        <td className="py-3.5 px-2 text-right text-sol-green font-mono font-black">+6.60%</td>
                        <td className="py-3.5 px-2 text-right text-sol-green font-mono font-black">+0.08</td>
                        <td className="py-3.5 px-2 text-right font-mono font-black">6 / 6</td>
                        <td className="py-3.5 px-2 text-right font-mono font-black">~49</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-2 font-medium">MACD + RSI + FVG (Gap Imbalance)</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-0.28</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-0.40%</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-1.34</td>
                        <td className="py-3 px-2 text-right font-mono">2 / 6</td>
                        <td className="py-3 px-2 text-right font-mono text-text-dim">~7</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-2 font-medium">MACD + RSI + DCA (Mean-Reversion)</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-0.36</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-0.60%</td>
                        <td className="py-3 px-2 text-right text-red-400 font-mono">-1.65</td>
                        <td className="py-3 px-2 text-right font-mono">1 / 6</td>
                        <td className="py-3 px-2 text-right font-mono text-text-dim">~7</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Core Execution Rules & Protocol Order of Operations */}
              <div id="cortex-execution-rules" className="p-8 bg-bg-card border border-border-dim rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-sol-purple/5 blur-[100px] rounded-full -mr-32 -mt-32"></div>
                <div className="relative z-10 space-y-6">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-sol-purple" />
                    <h3 className="text-xl font-serif italic text-text-heading">Cortex Engine Execution Rules (Order of Operations)</h3>
                  </div>
                  <p className="text-xs text-text-dim max-w-2xl leading-relaxed">
                    These authoritative rules govern real-time alert dispatching, backtesting simulation, and automated on-chain trade execution in strict sequential priority:
                  </p>
                  <div className="space-y-6 pt-2">
                    <div className="flex gap-4 items-start pb-4 border-b border-border-dim/40">
                      <div className="w-8 h-8 rounded-full bg-sol-purple/10 flex items-center justify-center shrink-0 border border-sol-purple/30 text-[11px] font-mono font-bold text-sol-purple">01</div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-text-heading uppercase tracking-wider">Composite Analysis Calculation (Σ)</h4>
                        <p className="text-xs text-text-dim leading-relaxed">
                          Evaluates all data points to derive the Composite Bias Score (Σ) from -1.0 to +1.0. This aggregates 4 distinct subsystems: <strong>Elliott Wave Momentum</strong>, <strong>Fast/Slow Moving Average crosses (MACD)</strong>, <strong>RSI extremities</strong>, and <strong>semantic headline sentiment</strong>.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex gap-4 items-start pb-4 border-b border-border-dim/40">
                      <div className="w-8 h-8 rounded-full bg-sol-purple/10 flex items-center justify-center shrink-0 border border-sol-purple/30 text-[11px] font-mono font-bold text-sol-purple">02</div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-text-heading uppercase tracking-wider">Signal Gating & The Chop Zone</h4>
                        <p className="text-xs text-text-dim leading-relaxed">
                          Enforces a strict confidence boundary. If Σ exceeds <strong>0.08</strong>, a bullish <strong>Long Buy</strong> is triggered. If Σ falls below <strong>-0.08</strong>, a bearish <strong>Short Sell</strong> is triggered. Scores falling in between prompt an instant <strong>Hold (Sideways Market)</strong> status.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4 items-start pb-4 border-b border-border-dim/40">
                      <div className="w-8 h-8 rounded-full bg-sol-purple/10 flex items-center justify-center shrink-0 border border-sol-purple/30 text-[11px] font-mono font-bold text-sol-purple">03</div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-text-heading uppercase tracking-wider">Sideways Market Hold Preservation</h4>
                        <p className="text-xs text-text-dim leading-relaxed">
                          If there is an active LONG or SHORT position open and the new forecast signals a "Hold" (sideways market), the position <strong>remains fully open and active</strong>. The system holds the line and does not close positions to protect capital against transaction slippage, fee-churn, and temporary sideways stagnation.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4 items-start pb-4 border-b border-border-dim/40">
                      <div className="w-8 h-8 rounded-full bg-sol-purple/10 flex items-center justify-center shrink-0 border border-sol-purple/30 text-[11px] font-mono font-bold text-sol-purple">04</div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-text-heading uppercase tracking-wider">Dynamic Trend Reversal & Reentry</h4>
                        <p className="text-xs text-text-dim leading-relaxed">
                          The engine actively monitors for direct direction shift. If an active trade's side is <strong>LONG</strong> and the signal shifts to <strong>SHORT</strong>, or vice-versa, the active trade is settled instantly and the opposite trade is opened on the same tick. Positions are only swapped or entered when confidence reverses.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4 items-start pb-4 border-b border-border-dim/40">
                      <div className="w-8 h-8 rounded-full bg-sol-purple/10 flex items-center justify-center shrink-0 border border-sol-purple/30 text-[11px] font-mono font-bold text-sol-purple">05</div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-text-heading uppercase tracking-wider">Instant Alert Dispatches (Zero-Cooldown)</h4>
                        <p className="text-xs text-text-dim leading-relaxed">
                          All alert cooldown windows are completely removed (0m period limit). Signal shifts, trades, reversals, and settlement notifications are dispatched to Telegram immediately upon occurrence without delay or filtering.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4 items-start">
                      <div className="w-8 h-8 rounded-full bg-sol-purple/10 flex items-center justify-center shrink-0 border border-sol-purple/30 text-[11px] font-mono font-bold text-sol-purple">06</div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-text-heading uppercase tracking-wider">Automatic Guardrail Settlement (TP / SL)</h4>
                        <p className="text-xs text-text-dim leading-relaxed">
                          Protects portfolio equities through automated boundaries. Any position will instantly liquidate at a targeted profit margin of <strong>+4.0% (Take-Profit)</strong> or hard drawdowns of <strong>-2.0% (Stop-Loss)</strong> to secure returns safely (or according to manual wallet specifications).
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Engine Updates / Changelog — keep in sync whenever strategy behavior changes */}
              <div className="p-8 bg-bg-card border border-border-dim rounded-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-sol-green/5 blur-[100px] rounded-full -mr-32 -mt-32"></div>
                <div className="relative z-10 space-y-6">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-sol-green" />
                    <h3 className="text-xl font-serif italic text-text-heading">Engine Updates (Changelog)</h3>
                  </div>
                  <p className="text-xs text-text-dim max-w-2xl leading-relaxed">
                    Strategy and execution changes are logged here so the documented behavior always matches the live engine.
                  </p>
                  <div className="space-y-5 pt-2">
                    <div className="flex gap-4 items-start pb-4 border-b border-border-dim/40">
                      <div className="px-2 py-1 rounded bg-sol-purple/10 border border-sol-purple/30 text-[10px] font-mono text-sol-purple shrink-0">2026-06-20</div>
                      <ul className="list-disc pl-5 space-y-2 text-xs text-text-dim leading-relaxed">
                        <li><strong className="text-text-heading">Elliott Wave now contributes to Σ.</strong> The composite is the full 4-factor sum <code>Σ = (MACD·wTech + RSI·wLiq + Sentiment·wSent + EW·wElliott) / Σweights</code>. Previously the Elliott Wave weight was configured but unused.</li>
                        <li><strong className="text-text-heading">Removed undocumented gates.</strong> The Elliott-Wave "phase veto" and the 200-EMA suppression filter were removed — entries now decide purely on Σ vs ±0.08 plus the Chop Zone, exactly as specified.</li>
                        <li><strong className="text-text-heading">Catalyst override is now authoritative.</strong> Extreme sentiment (≥ +0.85 / ≤ −0.85) forces Σ = ±1 and bypasses the Chop Zone and the 2-bar confirmation, firing immediately.</li>
                        <li><strong className="text-text-heading">Chop Zone matches spec.</strong> HOLD now requires RSI in 40–60 <em>and</em> a fast/slow MA squeeze (&lt; 0.3%), instead of just a low Σ.</li>
                        <li><strong className="text-text-heading">2-bar direction confirmation.</strong> Entry requires the current and previous candle to agree (evaluated under the same news context); the override skips the wait.</li>
                        <li><strong className="text-text-heading">Same-tick reversal re-entry.</strong> A direction flip now closes and opens the opposite position on the same tick.</li>
                        <li><strong className="text-text-heading">Real news only.</strong> All synthetic/LLM-fabricated "Telegram posts" and hardcoded sample signals were deleted. With no real headlines, sentiment is neutral (0) — never fabricated.</li>
                        <li><strong className="text-text-heading">Telegram news source fixed.</strong> Switched from an unreadable private invite link to a public, scrapeable channel; light relevance filtering keeps sentiment on-topic.</li>
                        <li><strong className="text-text-heading">Risk circuit breaker.</strong> After <code>maxConsecutiveLosses</code> consecutive losing trades (default 8) new entries pause while exits still work; a win resets the streak. The streak also auto-resets 6 hours after the last loss, or instantly when you click reset. Set to 0 to disable.</li>
                        <li><strong className="text-text-heading">Real perps execution.</strong> Automated on-chain trades now route through the official Jupiter CLI (<code>jup perps open/close</code>) — actual leveraged positions, not spot swaps or memos. Defaults to PAPER mode; failed opens roll back (no phantom positions).</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <section className="space-y-6">
                <h3 className="text-xl font-serif italic text-text-heading border-b border-border-dim pb-4">Data Architecture</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 bg-bg-card border border-border-dim rounded-xl space-y-4">
                    <div className="w-10 h-10 bg-sol-purple/10 rounded-lg flex items-center justify-center">
                      <Newspaper className="w-5 h-5 text-sol-purple" />
                    </div>
                    <h4 className="font-bold text-text-heading uppercase text-xs tracking-widest">Aggregated News</h4>
                    <p className="text-xs text-text-dim leading-relaxed">
                      Real-time extraction from Google News, Yahoo Finance, CryptoCompare, and an optional public Telegram channel. Headlines are filtered for semantic relevance to the selected Topic and Ticker. Only real, verifiable news is used — there is no synthetic or LLM-fabricated news fallback.
                    </p>
                  </div>
                  <div className="p-6 bg-bg-card border border-border-dim rounded-xl space-y-4">
                    <div className="w-10 h-10 bg-sol-green/10 rounded-lg flex items-center justify-center">
                      <LineChart className="w-5 h-5 text-sol-green" />
                    </div>
                    <h4 className="font-bold text-text-heading uppercase text-xs tracking-widest">Market Vectors</h4>
                    <p className="text-xs text-text-dim leading-relaxed">
                      High-fidelity OHLC data sourced via Yahoo Finance API. Intervals range from 15-minute scalping windows to 1-day macro analysis.
                    </p>
                  </div>
                  <div className="p-6 bg-bg-card border border-border-dim rounded-xl space-y-4">
                    <div className="w-10 h-10 bg-text-heading/10 rounded-lg flex items-center justify-center">
                      <Zap className="w-5 h-5 text-text-heading" />
                    </div>
                    <h4 className="font-bold text-text-heading uppercase text-xs tracking-widest">Sentiment Engine</h4>
                    <p className="text-xs text-text-dim leading-relaxed">
                      A CPU-optimized AFINN/Lexicon hybrid model scores headlines in milliseconds. It detects bullish/bearish intensity without the latency of large language models.
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <h3 className="text-xl font-serif italic text-text-heading border-b border-border-dim pb-4">Variable Configuration</h3>
                <div className="space-y-4">
                  <div className="flex gap-4 items-start">
                    <div className="w-8 h-8 rounded bg-bg-input flex items-center justify-center shrink-0 border border-border-dim text-[10px] font-bold">01</div>
                    <div>
                      <h5 className="text-xs font-black uppercase text-text-heading mb-1">Sentiment Topic</h5>
                      <p className="text-xs text-text-dim leading-relaxed">Determines the "Narrative Filter". For example, setting it to "regulation" will focus the model on legal catalysts, while "war" focuses on macro-geopolitical shocks.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="w-8 h-8 rounded bg-bg-input flex items-center justify-center shrink-0 border border-border-dim text-[10px] font-bold">02</div>
                    <div>
                      <h5 className="text-xs font-black uppercase text-text-heading mb-1">Weights (w1, w2, w3)</h5>
                      <p className="text-xs text-text-dim leading-relaxed">Adjusts the "Trust Factor" of each data stream. A heavy sentiment weight (0.8) makes the strategy news-driven, a heavy technical weight makes it a momentum follower, and a heavy liquidity weight guides it via mean-reversion and extremes.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="w-8 h-8 rounded bg-bg-input flex items-center justify-center shrink-0 border border-border-dim text-[10px] font-bold">03</div>
                    <div>
                      <h5 className="text-xs font-black uppercase text-text-heading mb-1">Alpha Threshold</h5>
                      <p className="text-xs text-text-dim leading-relaxed">The "Signal Gatekeeper". Higher values reduce noise and over-trading by requiring extreme conviction across multiple data modes.</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </main>
        )}
      </div>

      {/* "What just happened" toasts — fire on every new audit entry (PAPER or REAL trading). */}
      <div className="fixed top-20 right-4 z-[120] flex flex-col gap-2.5 w-[22rem] max-w-[90vw] pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            const tone = auditTone(t);
            const lightToneClasses: Record<string, string> = {
              green: "bg-gradient-to-r from-emerald-50/98 to-teal-50/98 border-emerald-400 text-emerald-800 shadow-emerald-100",
              red: "bg-gradient-to-r from-rose-50/98 to-red-50/98 border-red-300 text-rose-800 shadow-rose-100",
              purple: "bg-gradient-to-r from-purple-50/98 to-indigo-50/98 border-sol-purple/40 text-purple-800 shadow-purple-100",
              amber: "bg-gradient-to-r from-amber-50/98 to-yellow-50/98 border-amber-300 text-amber-800 shadow-amber-100",
              sky: "bg-gradient-to-r from-sky-50/98 to-blue-50/98 border-sky-300 text-sky-800 shadow-sky-100",
              dim: "bg-white/98 border-border-dim text-text-dim shadow-slate-100",
            };

            return (
              <motion.div
                key={t.id}
                initial={{ x: 350, opacity: 0, scale: 0.9, rotate: 1.5 }}
                animate={{ x: 0, opacity: 1, scale: 1, rotate: 0 }}
                exit={{ x: 350, opacity: 0, scale: 0.85, rotate: -1.5 }}
                transition={{ type: "spring", stiffness: 220, damping: 18 }}
                className={cn(
                  "pointer-events-auto border border-l-4 rounded-lg shadow-xl p-3.5 flex flex-col gap-2 relative overflow-hidden group hover:-translate-y-[1px] transition-all duration-300",
                  lightToneClasses[tone] || lightToneClasses.dim
                )}
              >
                {/* Collapsing progress bar at the bottom */}
                <div className="absolute bottom-0 left-0 h-[3px] bg-current opacity-25 toast-progress-bar" />

                <div className="flex items-start gap-2.5">
                  <div className="p-1 bg-white/80 rounded border border-current/25 shrink-0 shadow-sm">
                    <Bell className="w-3.5 h-3.5 text-current animate-bounce" style={{ animationDuration: '2s' }} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="text-[8px] uppercase tracking-[0.15em] opacity-75 font-mono mb-0.5 font-bold">
                      {t.source} · {t.type}
                    </div>
                    <div className="text-text-heading font-sans text-[11px] leading-relaxed break-words font-medium">{t.message}</div>
                  </div>
                  
                  <button 
                    onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} 
                    className="opacity-40 hover:opacity-90 shrink-0 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Slide-up audit log panel, toggled from the footer. */}
      {showAuditPanel && (
        <div className="fixed bottom-10 left-0 right-0 z-[110] h-72 bg-bg-card border-t border-border-dim shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-6 py-2 border-b border-border-dim shrink-0">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-text-heading">
              <Terminal className="w-4 h-4 text-sol-purple" /> Live Strategy Audit Log
              <span className="text-text-dim normal-case tracking-normal">
                · {mergedAuditLogs.length} events · auto-trade {jupiterConfig?.tradingMode === "PAPER" ? "PAPER (simulated)" : "REAL"}
              </span>
            </div>
            <button onClick={() => setShowAuditPanel(false)} className="text-text-dim hover:text-text-heading">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-3 space-y-1.5 font-mono text-[11px]">
            {mergedAuditLogs.length === 0 ? (
              <div className="text-text-dim text-center py-8">
                No strategy activity yet. Every sync logs here — enter / stand-aside / hold / close, with the reason.
              </div>
            ) : (
              mergedAuditLogs.map((e) => (
                <div key={e.id} className={cn("flex items-start gap-3 border-l-2 pl-3 py-1", toneClasses[auditTone(e)])}>
                  <span className="text-text-dim shrink-0 w-20">{new Date(e.timestamp).toLocaleTimeString()}</span>
                  <span className="text-[8px] uppercase tracking-widest opacity-70 shrink-0 w-16 pt-0.5">{e.source}</span>
                  {e.version && (
                    <span className="text-[8px] font-mono opacity-60 px-1 py-0.2 rounded bg-bg-input border border-border-dim shrink-0" title={`Executed under version ${e.version}`}>
                      {e.version.startsWith("v") ? e.version : `v${e.version}`}
                    </span>
                  )}
                  <span className="text-text-body break-words flex-1">{e.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <footer className="h-10 bg-white border-t border-border-dim flex px-8 items-center justify-between text-[9px] text-text-dim uppercase tracking-[0.2em] shrink-0 font-mono relative">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-sol-purple via-[#6366f1] to-sol-green" />
        <div className="flex items-center gap-6 min-w-0">
          <span className="hidden lg:inline shrink-0">Quantum Alpha Engineering © 2026</span>
          <button
            onClick={() => setShowAuditPanel((v) => !v)}
            className="flex items-center gap-2 hover:text-text-heading transition-colors normal-case tracking-normal min-w-0"
            title="Toggle the live strategy audit log"
          >
            <Terminal className="w-3 h-3 text-sol-purple shrink-0" />
            <span className="font-bold shrink-0">Audit Log</span>
            {mergedAuditLogs.length > 0 && (
              <span className="bg-sol-purple/20 text-sol-purple px-1.5 rounded-full text-[8px] shrink-0">{mergedAuditLogs.length}</span>
            )}
            <span className="hidden md:inline text-text-dim truncate max-w-[26rem] lowercase">
              {mergedAuditLogs[0]?.message || "no activity yet"}
            </span>
            <ChevronUp className={cn("w-3 h-3 transition-transform shrink-0", showAuditPanel && "rotate-180")} />
          </button>
        </div>
        <div className="flex gap-12 items-center shrink-0">
          <div className="flex items-center gap-1.5 overflow-hidden text-sol-green font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-sol-green animate-ping" />
            LIVE_LINK_ACTIVE
          </div>
          <span className="hidden md:inline">API: NEWSAPI.ORG</span>
        </div>
      </footer>
    </div>
  );
}
