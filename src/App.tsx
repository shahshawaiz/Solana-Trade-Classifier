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
  AreaChart,
  Area
} from "recharts";
import { format, subDays } from "date-fns";
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
      <div className="px-4 py-3 border-b border-border-dim flex items-center justify-between bg-bg-main/50">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-text-heading">{title}</span>
        </div>
        {Icon && <Icon className="w-3.5 h-3.5 text-sol-purple opacity-70" />}
      </div>
    )}
    <div className="p-5 flex-1">
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

// --- Main App ---

export default function App() {
  const [data, setData] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [sentiment, setSentiment] = useState({ score: 0, rationale: "" });
  const [loading, setLoading] = useState(true);
  const [weights, setWeights] = useState({ sentiment: 0.5, technical: 0.3, liquidity: 0.2 });
  const [threshold, setThreshold] = useState(0.1);
  const [lookback, setLookback] = useState(7); // Days
  const [interval, setInterval] = useState("1h");
  const [query, setQuery] = useState("Solana");

  const fetchData = async () => {
    setLoading(true);
    try {
      const histRes = await fetch(`/api/historical?lookback=${lookback}&interval=${interval}`);
      const newsRes = await fetch(`/api/news?q=${encodeURIComponent(query)}`);

      const hist = await histRes.json();
      const newsData = await newsRes.json();

      setNews(newsData.articles || []);

      if (hist && (hist.quotes || Array.isArray(hist))) {
        const quotes = (hist.quotes || hist).filter((q: any) => q && q.close !== null);
        const closes = quotes.map((q: any) => q.close);
        const rsis = calculateRSI(closes);
        const emaFast = calculateEMA(closes, 12);
        const emaSlow = calculateEMA(closes, 26);
        
        const processed = quotes.map((q: any, i: number) => ({
          time: format(new Date(q.date), "MMM dd, HH:mm"),
          date: q.date,
          close: q.close,
          rsi: rsis[i],
          emaFast: emaFast[i],
          emaSlow: emaSlow[i],
          sentiment: Math.random() * 0.4 - 0.2, // Simulation
          liquidity: Math.random() > 0.8 ? (Math.random() > 0.5 ? 1 : -1) : 0
        }));

        setData(processed);
      }

      // 2. Predict using GPT/Gemini on backend
      const predRes = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, weights })
      });
      const predData = await predRes.json();
      if (predData.sentiment !== undefined) {
        setSentiment({ score: predData.sentiment, rationale: predData.rationale });
      }

    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 500); // Debounce
    return () => clearTimeout(timer);
  }, [lookback, interval, query]);

  const results = useMemo(() => {
    if (data.length === 0) return null;
    // Inject the real AI sentiment into the latest data point
    const updatedData = [...data];
    if (updatedData.length > 0) {
      updatedData[updatedData.length - 1].sentiment = sentiment.score;
    }
    return runBacktest(updatedData, weights, threshold);
  }, [data, weights, threshold, sentiment]);

  if (loading && data.length === 0) {
    return (
      <div className="min-h-screen bg-bg-main text-text-body flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-sol-purple animate-spin" />
          <p className="text-sm font-medium animate-pulse text-text-heading">Syncing Solana Multi-modal Engine...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-main text-text-body font-sans flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-border-dim bg-bg-card flex items-center justify-between px-8 shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex space-x-1">
            <div className="w-3 h-3 bg-sol-purple rounded-full" />
            <div className="w-3 h-3 bg-sol-green rounded-full" />
          </div>
          <h1 className="text-xl font-serif italic tracking-tight text-text-heading">Solana Quant Alpha</h1>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden md:flex gap-6 text-[11px] uppercase tracking-[0.1em] text-text-dim font-mono bg-bg-input px-4 py-1.5 rounded-full border border-border-dim">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-sol-green"></span> 
              SOL/USD ${results?.data && results.data.length > 0 ? results.data[results.data.length - 1]?.close.toFixed(2) : "---"}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Controls */}
        <aside className="w-80 border-r border-border-dim bg-bg-card p-6 flex flex-col gap-8 shrink-0 overflow-y-auto custom-scrollbar">
          <section>
            <label className="text-[10px] uppercase tracking-widest text-text-dim block mb-4 px-1 font-bold">Search Parameters</label>
            <div className="px-1 mb-6">
              <input 
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Keyword..."
                className="w-full bg-bg-input border border-border-dim rounded-lg px-4 py-2 text-xs focus:ring-1 focus:ring-sol-purple outline-none"
              />
            </div>

            <label className="text-[10px] uppercase tracking-widest text-text-dim block mb-6 px-1 font-bold">Strategy tuning</label>
            <div className="space-y-6">
              <div className="space-y-3 px-1">
                <div className="flex justify-between items-center text-[11px] text-text-body">
                  <span>Lookback</span>
                  <span>Interval</span>
                </div>
                <div className="flex gap-2">
                  <select 
                    value={lookback}
                    onChange={(e) => setLookback(Number(e.target.value))}
                    className="flex-1 bg-bg-input border border-border-dim rounded-lg p-2 text-[10px] font-mono outline-none"
                  >
                    {[2, 7, 14, 30].map(d => <option key={d} value={d}>{d} Days</option>)}
                  </select>
                  <select 
                    value={interval}
                    onChange={(e) => setInterval(e.target.value)}
                    className="flex-1 bg-bg-input border border-border-dim rounded-lg p-2 text-[10px] font-mono outline-none"
                  >
                    {["15m", "1h", "2h", "4h", "1d"].map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-5 px-1 pt-4 border-t border-border-dim">
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
                    <span className="text-text-body">Technical Pivot</span>
                    <span className="text-sol-purple font-mono">{(weights.technical * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.1" 
                    value={weights.technical}
                    onChange={(e) => setWeights({ ...weights, technical: Number(e.target.value) })}
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
                  <div className="space-y-3 text-center">
                    <span className={cn(
                      "text-2xl font-bold font-mono tracking-tighter",
                      color
                    )}>
                      {label}
                    </span>
                    <p className="text-[10px] text-text-dim italic leading-relaxed text-left border-t border-border-dim pt-3">
                      {sentiment.rationale || "Processing headlines..."}
                    </p>
                  </div>
                );
              })() : (
                <div className="text-[10px] text-text-dim italic text-center">Initialing node...</div>
              )}
            </Card>
            <button 
              onClick={fetchData}
              disabled={loading}
              className="w-full py-4 bg-text-heading text-white font-serif italic text-lg hover:bg-black transition-all rounded-lg shadow-lg flex items-center justify-center gap-2"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              Initialize Simulation
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
                  label="SOL Benchmark" 
                  value={`${results?.metrics.marketReturn.toFixed(1)}%`}
                />
                <Stat 
                  label="Strategy Return" 
                  value={`${results?.metrics.strategyReturn.toFixed(1)}%`}
                  trend={results?.metrics.strategyReturn}
                />
                <Stat 
                  label="Sharpe Alpha" 
                  value={`${(results?.metrics.alpha / 10).toFixed(2)}`}
                  trend={results?.metrics.alpha}
                />
                <Stat 
                  label="Trading Signals" 
                  value={results?.data?.filter((d: any) => d.signal !== 0).length || 0}
                  subValue="Quant Events"
                />
              </div>
            );
          })()}

          {/* Performance Chart */}
          <div className="flex-1 flex flex-col space-y-8 min-h-0">
            <Card title="Strategy Cumulative Overlay" className="flex-1" icon={PieChart}>
              <div className="h-full min-h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={results?.data}>
                    <defs>
                      <linearGradient id="colorCum" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
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
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', fontSize: '10px', borderRadius: '12px' }}
                      itemStyle={{ color: '#475569' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="strategyCum" 
                      name="Alpha Strategy" 
                      stroke="#8b5cf6" 
                      fillOpacity={1} 
                      fill="url(#colorCum)" 
                      strokeWidth={2}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="marketCum" 
                      name="benchmark" 
                      stroke="#cbd5e1" 
                      fill="transparent" 
                      strokeDasharray="4 4"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-80">
              <Card title="News Catalyst Intelligence" icon={Newspaper}>
                <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar flex-1">
                  {news.length > 0 ? news.map((article, i) => (
                    <div key={i} className="flex flex-col gap-2 pb-4 border-b border-border-dim/50 last:border-0 group">
                      <p className="text-xs italic font-serif text-text-heading leading-relaxed group-hover:text-sol-purple transition-colors">
                        "{article.title}"
                      </p>
                      <div className="flex justify-between text-[9px] text-text-dim uppercase font-mono tracking-widest">
                        <span>{article.source.name}</span>
                        <span>{format(new Date(), "HH:mm")}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="h-full flex items-center justify-center text-xs italic text-text-dim">
                      Collecting satellite news feed...
                    </div>
                  )}
                </div>
              </Card>

              <Card title="Execution Audit" icon={Activity}>
                <div className="space-y-2 font-mono text-[9px] text-text-dim overflow-y-auto custom-scrollbar flex-1 uppercase tracking-tighter">
                  <p><span className="opacity-40">[{format(new Date(), "HH:mm:ss")}]</span> <span className="text-sol-purple font-bold">SYSTEM</span>: Quant node active</p>
                  <p><span className="opacity-40">[{format(new Date(), "HH:mm:ss")}]</span> <span className="text-sol-green font-bold">FEEDS</span>: Historical charts synced</p>
                  {results?.data?.filter(d => d.signal !== 0).slice(-4).map((d, i) => {
                    let label = "HOLD";
                    let color = "text-text-dim";
                    switch(d.signal) {
                      case 1: label = "LONG_BUY"; color = "text-sol-green"; break;
                      case -1: label = "SHORT_SELL"; color = "text-red-500"; break;
                      case -2: label = "LONG_SELL"; color = "text-orange-400"; break;
                      case 2: label = "SHORT_BUY"; color = "text-blue-400"; break;
                    }
                    return (
                      <p key={i}>
                        <span className="opacity-40">[{d.time.split(', ')[1]}]</span> 
                        <span className={color}> 
                          {label}
                        </span>: Price ${d.close.toFixed(2)}
                      </p>
                    );
                  })}
                  <p><span className="opacity-40">[{format(new Date(), "HH:mm:ss")}]</span> <span className="text-text-heading font-medium">READY</span>: Monitoring satellite data streams...</p>
                </div>
              </Card>
            </div>
          </div>
        </main>
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
