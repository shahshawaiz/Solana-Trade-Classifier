import React, { useState, useEffect, useMemo } from "react";
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
  Zap
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
import { motion, AnimatePresence } from "motion/react";
import { runBacktest, calculateRSI, calculateEMA, MarketData } from "./lib/backtest";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---



const Card = ({ children, className, title, icon: Icon }: any) => (
  <div className={cn("bg-bg-card border border-border-dim rounded-lg overflow-hidden flex flex-col shadow-sm", className)}>
    {(title || Icon) && (
      <div className="px-4 py-3 border-b border-border-dim flex items-center justify-between bg-bg-main/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-text-heading">{title}</span>
        </div>
        {Icon && <Icon className="w-3.5 h-3.5 text-sol-purple opacity-70" />}
      </div>
    )}
    <div className="p-5 flex-1 flex flex-col min-h-0 overflow-hidden">
      {children}
    </div>
  </div>
);

const Stat = ({ label, value, subValue, trend }: any) => (
  <div className="bg-bg-card p-5 rounded-lg border border-border-dim shadow-sm">
    <p className="text-[10px] uppercase tracking-widest text-text-dim mb-2">{label}</p>
    <div className="flex items-baseline gap-2">
      <span className={cn(
        "text-3xl font-serif font-medium",
        trend !== undefined ? (trend > 0 ? "text-sol-green" : trend < 0 ? "text-red-500" : "text-text-heading") : "text-text-heading"
      )}>{value}</span>
      {trend !== undefined && (
        <span className={cn(
          "text-[10px] font-mono",
          trend > 0 ? "text-sol-green" : "text-red-500"
        )}>
          {trend > 0 ? "↑" : "↓"}{Math.abs(trend).toFixed(1)}%
        </span>
      )}
    </div>
    {subValue && <p className="text-[9px] text-text-dim mt-2 uppercase tracking-[0.1em]">{subValue}</p>}
  </div>
);

const TradeHistory = ({ trades }: { trades: any[] }) => {
  if (!trades || trades.length === 0) {
    return (
      <div className="p-8 text-center border border-dashed border-border-dim rounded-lg">
        <p className="text-[10px] uppercase tracking-widest text-text-dim">Operational History Empty</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-border-dim rounded-lg">
      <table className="w-full text-left text-[11px] border-collapse">
        <thead className="bg-bg-main/50 sticky top-0 shadow-sm">
          <tr>
            <th className="p-3 border-b border-border-dim font-serif italic text-text-dim font-normal uppercase tracking-wider">Entry</th>
            <th className="p-3 border-b border-border-dim font-serif italic text-text-dim font-normal uppercase tracking-wider">Type</th>
            <th className="p-3 border-b border-border-dim font-serif italic text-text-dim font-normal uppercase tracking-wider">Entry Price</th>
            <th className="p-3 border-b border-border-dim font-serif italic text-text-dim font-normal uppercase tracking-wider">Exit Price</th>
            <th className="p-3 border-b border-border-dim font-serif italic text-text-dim font-normal uppercase tracking-wider text-right">PnL</th>
            <th className="p-3 border-b border-border-dim font-serif italic text-text-dim font-normal uppercase tracking-wider text-right">Cum. PnL</th>
          </tr>
        </thead>
        <tbody className="bg-bg-card divide-y divide-border-dim font-mono">
          {trades.map((trade, i) => (
            <tr key={i} className="hover:bg-bg-main/30 transition-colors">
              <td className="p-3 text-text-dim">{trade.entryTime}</td>
              <td className="p-3">
                <span className={cn(
                  "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                  trade.type === 'Long' ? "bg-sol-green/10 text-sol-green" : "bg-red-500/10 text-red-500"
                )}>
                  {trade.type}
                </span>
              </td>
              <td className="p-3 text-text-heading">${trade.entryPrice.toFixed(2)}</td>
              <td className="p-3 text-text-heading">${trade.exitPrice?.toFixed(2) || "OPEN"}</td>
              <td className={cn(
                "p-3 text-right font-bold",
                trade.pnl > 0 ? "text-sol-green" : trade.pnl < 0 ? "text-red-500" : "text-text-dim"
              )}>
                {(trade.pnl * 100).toFixed(2)}%
              </td>
              <td className={cn(
                "p-3 text-right font-bold",
                trade.cumPnL > 0 ? "text-sol-green" : "text-red-500"
              )}>
                {(trade.cumPnL * 100).toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [data, setData] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [sentiment, setSentiment] = useState<any>({ score: 0, rationale: "", action: "", inputData: null });
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [weights, setWeights] = useState({ sentiment: 0.5, technical: 0.3, liquidity: 0.2 });
  const [threshold, setThreshold] = useState(0.1);

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
  const [startDate, setStartDate] = useState(etFormat(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(etFormat(new Date(), "yyyy-MM-dd"));
  const [interval, setInterval] = useState("1h");
  const [topic, setTopic] = useState("Trump war");
  const [token, setToken] = useState("SOL");
  const [predictionHeadlines, setPredictionHeadlines] = useState<any[]>([]);
  const [currentView, setCurrentView] = useState<'dashboard' | 'apiDocs' | 'about'>('dashboard');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setLoadingStep("Syncing Historical Market Data...");
    setErrorMsg(null);
    try {
      const histRes = await fetch(`/api/historical?token=${token}&startDate=${startDate}&endDate=${endDate}&interval=${interval}`);
      if (!histRes.headers.get("content-type")?.includes("application/json")) {
        const text = await histRes.text();
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
      
      setLoadingStep("Extracting Global News Context...");
      const newsRes = await fetch(`/api/news?topic=${encodeURIComponent(topic)}&token=${token}&from=${startTime}&to=${endTime}`);
      if (!newsRes.headers.get("content-type")?.includes("application/json")) {
        const text = await newsRes.text();
        throw new Error(`News api non-json response: ${newsRes.status} ${text.substring(0, 50)}`);
      }
      const newsData = await newsRes.json();
      if (!newsRes.ok) {
        throw new Error(newsData.error || `News API error: ${newsRes.statusText}`);
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

      setNews(articles);

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
      const predRes = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, topic, weights, interval })
      });
      if (!predRes.headers.get("content-type")?.includes("application/json")) {
         const text = await predRes.text();
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
      setLastUpdated(etFormat(new Date(), "HH:mm:ss"));
    } catch (error: any) {
      console.error("Failed to fetch data", error);
      setErrorMsg(error.message || "Network error or server disconnected.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 500); // Debounce
    return () => clearTimeout(timer);
  }, [startDate, endDate, interval, topic, token]);

  const results = useMemo(() => {
    if (data.length === 0) return null;
    // Inject the real AI sentiment into the latest data point
    const updatedData = [...data];
    if (updatedData.length > 0) {
      updatedData[updatedData.length - 1].sentiment = sentiment.score;
    }
    return runBacktest(updatedData, weights, threshold, cooldown, tradeSize, maxPosition);
  }, [data, weights, threshold, sentiment, cooldown, tradeSize, maxPosition]);

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
            <h1 className="text-sm font-black uppercase tracking-[.3em] text-text-heading flex items-center gap-2">
              {token === 'SOL' ? 'Solana' : token} Quant Alpha <span className="text-[9px] font-mono text-sol-purple bg-sol-purple/10 px-1 py-0.5 rounded border border-sol-purple/20">V2.0</span>
            </h1>
            <p className="text-[9px] text-text-dim uppercase tracking-widest font-medium">Multimodal Sentiment & Quantitative Arbitrage</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-1 bg-sol-purple/5 border border-sol-purple/20 rounded-full animate-in fade-in transition-all">
              <RefreshCw className="w-3 h-3 text-sol-purple animate-spin" />
              <span className="text-[10px] font-mono text-sol-purple uppercase tracking-tight">{loadingStep || "Logic Sync..."}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[10px] font-mono text-text-dim uppercase tracking-tight">Sync: {lastUpdated} {tzAbbr}</span>
            )}
          </div>
        </div>
      </header>

      <div className="flex items-center gap-6 px-8 h-12 bg-bg-card border-b border-border-dim justify-between">
        <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-text-dim">
          <button 
            onClick={() => setCurrentView('dashboard')} 
            className={cn("hover:text-sol-purple transition-colors", currentView === 'dashboard' && "text-sol-purple")}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setCurrentView('apiDocs')} 
            className={cn("hover:text-sol-purple transition-colors", currentView === 'apiDocs' && "text-sol-purple")}
          >
            API Docs
          </button>
          <button 
            onClick={() => setCurrentView('about')} 
            className={cn("hover:text-sol-purple transition-colors", currentView === 'about' && "text-sol-purple")}
          >
            About
          </button>
        </div>
        <div className="hidden md:flex gap-6 text-[11px] uppercase tracking-[0.1em] text-text-dim font-mono bg-bg-input px-4 py-1.5 rounded-full border border-border-dim">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-sol-green"></span> 
            {token.toUpperCase()}/USD ${results?.data && results.data.length > 0 ? results.data[results.data.length - 1]?.close.toFixed(2) : "---"}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {currentView === 'dashboard' ? (
          <>
            {/* Left Sidebar: Controls */}
            <aside className="w-80 border-r border-border-dim bg-bg-card p-6 flex flex-col gap-8 shrink-0 overflow-y-auto custom-scrollbar">
          <section>
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
            </div>

            <label className="text-[10px] uppercase tracking-widest text-text-dim block mb-2 px-1 font-bold flex items-center justify-between">
              Strategy tuning
              <Info className="w-2.5 h-2.5 opacity-50" />
            </label>
            <p className="text-[9px] text-text-dim px-1 mb-6 leading-relaxed italic">Calibrate risk parameters, historical range, and trade execution frequency for the neural backtest.</p>
            <div className="space-y-6">
              <div className="space-y-3 px-1">
                <div className="text-[11px] text-text-body space-y-3">
                  <div className="flex flex-col gap-1">
                    <span>Performance Interval</span>
                    <select 
                      value={interval}
                      onChange={(e) => setInterval(e.target.value)}
                      className="w-full bg-bg-input border border-border-dim rounded-lg p-2 text-[10px] font-mono outline-none"
                    >
                      {["15m", "30m", "1h", "1d", "1wk"].map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <span className="text-[9px] uppercase tracking-wide opacity-60">Start Date</span>
                      <input 
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-bg-input border border-border-dim rounded-lg p-2 text-[10px] font-mono outline-none text-text-heading"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <span className="text-[9px] uppercase tracking-wide opacity-60">End Date</span>
                      <input 
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-bg-input border border-border-dim rounded-lg p-2 text-[10px] font-mono outline-none text-text-heading"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 px-1 pt-4 border-t border-border-dim">
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
                  <p className="text-[8px] text-text-dim leading-tight opacity-70">Adjust sensitivity between Sentiment, Technical trends, and RSI-based Mean Reversion.</p>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-3">
                    <span className="text-text-body">Sentiment Alpha</span>
                    <span className="text-sol-purple font-mono">{(weights.sentiment * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.1" 
                    value={weights.sentiment}
                    onChange={(e) => setWeights({ ...weights, sentiment: Number(e.target.value) })}
                    className="w-full accent-sol-purple"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-3">
                    <span className="text-text-body">Technical Pivot (EMA)</span>
                    <span className="text-sol-purple font-mono">{(weights.technical * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.1" 
                    value={weights.technical}
                    onChange={(e) => setWeights({ ...weights, technical: Number(e.target.value) })}
                    className="w-full accent-sol-purple"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-3">
                    <span className="text-text-body">Mean Reversion (RSI)</span>
                    <span className="text-sol-purple font-mono">{(weights.liquidity * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.1" 
                    value={weights.liquidity}
                    onChange={(e) => setWeights({ ...weights, liquidity: Number(e.target.value) })}
                    className="w-full accent-sol-purple"
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

        {/* Main Simulation Canvas */}
        <main className="flex-1 flex flex-col p-8 bg-bg-main space-y-8 overflow-y-auto custom-scrollbar">
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
            <Card title="Performance Overlay (Equity Curve)" className="flex-1" icon={PieChart}>
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
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:h-96">
              <Card title="Multi-Source Catalyst Intelligence" icon={Newspaper} className="h-[300px] lg:h-auto">
                <div className="mb-4 border-b border-border-dim pb-2">
                  <p className="text-[10px] text-text-dim italic">Aggregated headlines from Google News, Yahoo Finance, and CryptoCompare with precise interval temporal filtering.</p>
                </div>
                <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar flex-1">
                  {news.length > 0 ? news.map((article, i) => (
                    <div key={i} className="flex flex-col gap-2 pb-4 border-b border-border-dim/50 last:border-0 group">
                      <p className="text-xs italic font-serif text-text-heading leading-relaxed group-hover:text-sol-purple transition-colors">
                        "{article.title}"
                      </p>
                      <div className="flex justify-between text-[9px] text-text-dim uppercase font-mono tracking-widest">
                        <span>{article.source.name}</span>
                        <span>{etFormat(new Date(article.publishedAt), "HH:mm")} <span className="opacity-40">{tzAbbr}</span></span>
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-sol-purple" />
                  <h3 className="text-xs uppercase tracking-widest font-bold text-text-heading">Trading Logic Audit Log - Positions</h3>
                </div>
                <p className="text-[10px] text-text-dim uppercase tracking-[0.15em] font-mono">PnL Summary: {results?.trades.reduce((acc, t) => acc + t.pnl, 0).toFixed(2)}x Aggregated</p>
              </div>
              <TradeHistory trades={results?.trades || []} />
            </section>
          </div>
        </main>
          </>
        ) : currentView === 'apiDocs' ? (
          <main className="flex-1 flex flex-col p-8 bg-bg-main overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto w-full space-y-8">
              <div className="space-y-2">
                <h2 className="text-2xl font-serif italic text-text-heading">REST API Reference</h2>
                <p className="text-sm text-text-dim">Programmatic access to the prediction engine.</p>
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
            </div>
          </main>
        ) : (
          <main className="flex-1 flex flex-col p-8 bg-bg-main overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto w-full space-y-12 pb-20">
              <div className="space-y-4 text-center">
                <h2 className="text-4xl font-serif italic text-text-heading">Cortex Alpha: Multimodal Quant</h2>
                <p className="text-lg text-text-dim max-w-2xl mx-auto">A multimodal arbitrage framework fusing raw market data with semantic catalyst intelligence.</p>
              </div>

              {/* Strategy Visualization Map */}
              <div className="p-8 bg-bg-card border border-border-dim rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-sol-purple/5 blur-[100px] rounded-full -mr-32 -mt-32"></div>
                <div className="relative z-10 space-y-8">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[10px] font-mono text-sol-purple uppercase tracking-[0.3em] font-bold">System Architecture</span>
                    <h3 className="text-xl font-serif italic text-text-heading">Multi-Factor Fusion Pipeline</h3>
                  </div>
                  
                  <div className="flex flex-col md:flex-row items-center justify-between gap-8 max-w-3xl mx-auto relative">
                    {/* Input Nodes */}
                    <div className="flex flex-col gap-3 w-full md:w-40">
                      <div className="p-3 bg-bg-main border border-border-dim rounded-lg text-center transition-colors hover:border-sol-purple/50">
                        <p className="text-[8px] font-mono uppercase text-text-dim mb-0.5">Mode A</p>
                        <p className="text-[9px] font-bold text-text-heading">Sentiment Catalysts</p>
                      </div>
                      <div className="p-3 bg-bg-main border border-border-dim rounded-lg text-center transition-colors hover:border-sol-green/50">
                        <p className="text-[8px] font-mono uppercase text-text-dim mb-0.5">Mode B</p>
                        <p className="text-[9px] font-bold text-text-heading">Technical Pivot (EMA)</p>
                      </div>
                      <div className="p-3 bg-bg-main border border-border-dim rounded-lg text-center transition-colors hover:border-sol-purple/50">
                        <p className="text-[8px] font-mono uppercase text-text-dim mb-0.5">Mode C</p>
                        <p className="text-[9px] font-bold text-text-heading">Mean Reversion (RSI)</p>
                      </div>
                    </div>

                    {/* Processing Core */}
                    <div className="relative flex-1 flex flex-col items-center justify-center py-12 px-8 border-2 border-dashed border-border-dim rounded-full">
                      <motion.div 
                        className="w-24 h-24 rounded-full bg-sol-purple/10 flex items-center justify-center border border-sol-purple/30 shadow-[0_0_40px_rgba(139,92,246,0.1)]"
                        animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
                        transition={{ repeat: Infinity, duration: 4 }}
                      >
                        <Zap className="w-8 h-8 text-sol-purple" />
                      </motion.div>
                      <div className="absolute -bottom-4 bg-bg-card px-4 py-1 border border-border-dim rounded-full">
                        <span className="text-[10px] font-mono font-bold text-text-heading">Logic Fusion Core</span>
                      </div>
                      
                      {/* Connection Lines (Visual) */}
                      <div className="absolute left-0 top-1/2 w-12 h-px bg-gradient-to-r from-border-dim to-sol-purple/50 -ml-12 hidden md:block"></div>
                      <div className="absolute right-0 top-1/2 w-12 h-px bg-gradient-to-l from-border-dim to-sol-purple/50 -mr-12 hidden md:block"></div>
                    </div>

                    {/* Output Node */}
                    <div className="w-full md:w-32">
                      <div className="p-4 bg-sol-purple/20 border border-sol-purple/40 rounded-xl text-center shadow-lg shadow-sol-purple/5">
                        <p className="text-[9px] font-mono uppercase text-sol-purple mb-1">Execution</p>
                        <p className="text-xs font-black tracking-widest">SIGNAL_ALPHA</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border-dim/50">
                    <div className="text-center space-y-1">
                      <p className="text-[10px] font-bold text-text-heading">1. EXTRACT</p>
                      <p className="text-[9px] text-text-dim">Isolating semantically relevant catalysts from global news feeds.</p>
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-[10px] font-bold text-text-heading">2. WEIGHT</p>
                      <p className="text-[9px] text-text-dim">Assigning credibility to price momentum vs. narrative sentiment shifts.</p>
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-[10px] font-bold text-text-heading">3. EXECUTE</p>
                      <p className="text-[9px] text-text-dim">Dynamic position sizing based on Alpha Score (Σ) conviction.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card title="The Multimodal Approach" icon={Activity}>
                  <div className="space-y-4 text-sm leading-relaxed text-text-body">
                    <p>
                      Traditional trading algorithms often fail because they ignore the qualitative "why" behind price movements. The **Multimodal Arbitrage** approach treats news as a leading indicator of volatility and technicals as the validation of trend.
                    </p>
                    <p>
                      By correlating semantic shifts (News) with momentum shifts (EMA/RSI), the engine identifies "Signal Alignment" windows where probability of success is statistically higher.
                    </p>
                  </div>
                </Card>

                <Card title="Decision Core: Alpha Score" icon={Zap}>
                  <div className="space-y-4 text-sm leading-relaxed text-text-body">
                    <p>
                      The strategy revolves around a dynamic **Alpha Score (Σ)**, calculated as:
                    </p>
                    <div className="bg-bg-input p-4 rounded font-mono text-xs border border-border-dim">
                      Σ = (Sentiment × w1) + (Technical × w2) + (Liquidity × w3)
                    </div>
                    <p>
                      Signals are only generated when Σ crosses the **Alpha Threshold**. This ensures the strategy remains defensive unless all "modes" of data are in agreement.
                    </p>
                  </div>
                </Card>

                <Card title="Quantifying 'Liquidity'" icon={Activity}>
                  <div className="space-y-4 text-sm leading-relaxed text-text-body">
                    <p>
                      In typical trading, **Liquidity** refers to market depth or buyer/seller exhaustion. In this quantitative engine, we utilize the **Relative Strength Index (RSI)** as our Liquidity and Mean Reversion indicator:
                    </p>
                    <ul className="list-disc pl-5 space-y-2 text-xs">
                      <li><strong>Oversold Sweep (RSI &lt; 30)</strong>: Denotes severe seller exhaustion or a "liquidity sweep" in support zones (signals buying interest, yielding <code>+1</code>).</li>
                      <li><strong>Overbought Block (RSI &gt; 70)</strong>: Denotes extreme buyer exhaustion (signals high saturation, yielding <code>-1</code>).</li>
                    </ul>
                    <p>
                      By adjusting the <strong>Mean Reversion (RSI)</strong> weight slider, you increase/decrease the strategy's sensitivity to these extreme exhaustion triggers, aiding in timing exact trend reversals!
                    </p>
                  </div>
                </Card>
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
                      Real-time extraction from Google News, Yahoo Finance, and CryptoCompare. Headlines are filtered for semantic relevance to the selected **Topic** and **Ticker**.
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

      <footer className="h-10 bg-white border-t border-border-dim flex px-8 items-center justify-between text-[9px] text-text-dim uppercase tracking-[0.2em] shrink-0 font-mono">
        <div>Quantum Alpha Engineering © 2026</div>
        <div className="flex gap-12 items-center">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="w-1.5 h-1.5 rounded-full bg-sol-green animate-ping" />
            LIVE_LINK_ACTIVE
          </div>
          <span>API: NEWSAPI.ORG</span>
        </div>
      </footer>
    </div>
  );
}
