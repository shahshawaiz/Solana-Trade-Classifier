import React, { useState, useEffect, useMemo, useRef } from "react";
import { Flame, RefreshCw, Layers, Crosshair, ChevronRight, Settings, Download, Trash } from "lucide-react";

interface LiquidityHeatmapProps {
  token: string;
  spotPrice: number;
}

interface CustomOrder {
  id: string;
  price: number;
  size: number;
  type: "BUY" | "SELL";
  timestamp: string;
}

export const LiquidityHeatmap: React.FC<LiquidityHeatmapProps> = ({ token, spotPrice }) => {
  const [filterMode, setFilterMode] = useState<"ALL" | "BIDS" | "ASKS">("ALL");
  const [sensitivity, setSensitivity] = useState<number>(1.2); // Sensitivity Multiplier for heatmap colors
  const [placedOrders, setPlacedOrders] = useState<CustomOrder[]>([]);
  const [simulationActive, setSimulationActive] = useState<boolean>(false);
  const [updateTick, setUpdateTick] = useState<number>(0);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Time ticks for the horizontal axis (16 columns)
  const columnsCount = 16;
  
  // Price offset levels vertical (percentage from spot price)
  const rows = useMemo(() => [
    { label: "+2.5%", offset: 0.025, side: "ASK" },
    { label: "+2.0%", offset: 0.020, side: "ASK" },
    { label: "+1.5%", offset: 0.015, side: "ASK" },
    { label: "+1.0%", offset: 0.010, side: "ASK" },
    { label: "+0.5%", offset: 0.005, side: "ASK" },
    { label: "+0.2%", offset: 0.002, side: "ASK" },
    { label: "SPOT", offset: 0.0, side: "SPOT" },
    { label: "-0.2%", offset: -0.002, side: "BID" },
    { label: "-0.5%", offset: -0.005, side: "BID" },
    { label: "-1.0%", offset: -0.010, side: "BID" },
    { label: "-1.5%", offset: -0.015, side: "BID" },
    { label: "-2.0%", offset: -0.020, side: "BID" },
    { label: "-2.5%", offset: -0.025, side: "BID" }
  ], []);

  // Grid Matrix state: rows.length rows by columnsCount columns
  // Each element represents volume size in token units
  const [matrix, setMatrix] = useState<number[][]>(() => {
    return Array.from({ length: rows.length }, () =>
      Array.from({ length: columnsCount }, () => 0)
    );
  });

  // Keep static mock order walls to make simulation highly realistic
  // Level index matching high-liquidity sell/buy walls
  const wallIndices = useMemo(() => {
    return {
      asksWall: 2, // Index of +1.5% row
      bidsWall: 10 // Index of -1.5% row
    };
  }, []);

  // Populate or evolve the liquidity matrix as a time series
  useEffect(() => {
    // Generate initial matrix with realistic volume clusters
    const initialMatrix = rows.map((row, rIdx) => {
      return Array.from({ length: columnsCount }, () => {
        let baseVol = 0;
        // Asks vs Bids depth
        if (row.side === "ASK") {
          baseVol = Math.random() * 25000 + 5000;
          if (rIdx === wallIndices.asksWall) {
            baseVol += 85000; // Large sell wall
          }
        } else if (row.side === "BID") {
          baseVol = Math.random() * 28000 + 4000;
          if (rIdx === wallIndices.bidsWall) {
            baseVol += 92000; // Giant buy wall
          }
        } else {
          baseVol = Math.random() * 2000 + 100; // Center spread
        }
        return baseVol;
      });
    });
    setMatrix(initialMatrix);
  }, [rows, wallIndices]);

  // Handle live incremental updates (rolling columns left)
  useEffect(() => {
    if (!simulationActive) return;

    const interval = setInterval(() => {
      setMatrix(prev => {
        return prev.map((rowArr, rIdx) => {
          // Slide existing values left
          const nextRow = [...rowArr.slice(1)];
          
          // Generate realistic new column item centering on current layout sides
          const rowDef = rows[rIdx];
          let newVol = 0;
          
          if (rowDef.side === "ASK") {
            newVol = Math.random() * 24000 + 6000;
            // Retain order wall probability
            if (rIdx === wallIndices.asksWall) {
              newVol += Math.random() > 0.15 ? 90000 : 35000;
            }
          } else if (rowDef.side === "BID") {
            newVol = Math.random() * 26000 + 5000;
            if (rIdx === wallIndices.bidsWall) {
              newVol += Math.random() > 0.15 ? 95000 : 40000;
            }
          } else {
            newVol = Math.random() * 1500 + 100;
          }

          // Merge in user placed active limit order volumes
          const rowPrice = spotPrice * (1 + rowDef.offset);
          const activeOrdersAtLevel = placedOrders.filter(o => {
            const diffPct = Math.abs((o.price - rowPrice) / rowPrice);
            return diffPct < 0.0015; // Within 15 bps limit
          });

          if (activeOrdersAtLevel.length > 0) {
            const customOrderVol = activeOrdersAtLevel.reduce((sum, o) => sum + o.size, 0);
            newVol += customOrderVol * 15; // Multiply visual impact of custom orders
          }

          nextRow.push(newVol);
          return nextRow;
        });
      });
      setUpdateTick(t => t + 1);
    }, 4000);

    return () => clearInterval(interval);
  }, [simulationActive, rows, wallIndices, spotPrice, placedOrders]);

  // Trigger feedback messages timers
  useEffect(() => {
    if (feedbackMsg) {
      const timer = setTimeout(() => setFeedbackMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMsg]);

  // Volume color scoring and intensity mapper
  const getIntensityRGB = (vol: number, isBid: boolean) => {
    const maxVal = 140000; // Cap visual bounds
    const normalized = Math.min((vol * sensitivity) / maxVal, 1.0);
    
    // Choose theme colors: Custom Emerald/Pink spectrum matching design
    if (isBid) {
      // Bids use Solana-green shades: rgba(0, 255, 163, opacity)
      return {
        background: `rgba(0, 255, 163, ${Math.max(normalized, 0.03).toFixed(3)})`,
        border: normalized > 0.65 ? "border border-sol-green/35" : ""
      };
    } else {
      // Asks use Solana-purple/magenta shades: rgba(139, 92, 246, opacity)
      return {
        background: `rgba(139, 92, 246, ${Math.max(normalized, 0.03).toFixed(3)})`,
        border: normalized > 0.65 ? "border border-sol-purple/35" : ""
      };
    }
  };

  // Click on a heatmap cell to trigger placing a mock Limit Order there
  const handleCellClick = (rIdx: number) => {
    const rowDef = rows[rIdx];
    if (rowDef.side === "SPOT") {
      setFeedbackMsg("❌ Limit orders cannot be placed exactly at spot price spread.");
      return;
    }

    const orderPrice = spotPrice * (1 + rowDef.offset);
    const orderSize = rowDef.side === "BID" ? 250 : 180; // Default sizing in tokens
    const type = rowDef.side === "BID" ? "BUY" : "SELL";

    const newOrder: CustomOrder = {
      id: `limit_${Date.now()}`,
      price: orderPrice,
      size: orderSize,
      type,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    setPlacedOrders(prev => [newOrder, ...prev]);
    setFeedbackMsg(`⚡ Order Placed: Limit ${type} ${orderSize} ${token} at $${orderPrice.toFixed(2)} added directly to Liquidity Book.`);

    // Instantly inject order volume to the last column of simulation
    setMatrix(prev => {
      const copy = prev.map(arr => [...arr]);
      copy[rIdx][columnsCount - 1] += orderSize * 15;
      return copy;
    });
  };

  const cancelOrder = (orderId: string) => {
    setPlacedOrders(prev => prev.filter(o => o.id !== orderId));
    setFeedbackMsg("🗑️ Custom Limit Order revoked from book.");
  };

  const clearAllOrders = () => {
    setPlacedOrders([]);
    setFeedbackMsg("🧹 All custom limit orders removed.");
  };

  // Export Depth Matrix as a structured spreadsheet
  const exportHeatmapCSV = () => {
    const headers = ["Price Level", "Percentage Offset", "Market Depth Side", ...Array.from({ length: columnsCount }, (_, i) => `Tick T-${columnsCount - 1 - i}`)];
    const dataRows = rows.map((row, rIdx) => {
      const calcPrice = spotPrice * (1 + row.offset);
      return [
        `$${calcPrice.toFixed(3)}`,
        row.label,
        row.side,
        ...matrix[rIdx].map(val => val.toFixed(0))
      ];
    });

    const csvContent = [headers.join(","), ...dataRows.map(row => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `liquidity_heatmap_${token}_depth_history.csv`;
    link.click();
  };

  // Compute stats metrics about the book
  const { totalAsksDepth, totalBidsDepth, orderBookImbalance, spreadPct } = useMemo(() => {
    let asksSum = 0;
    let bidsSum = 0;
    
    rows.forEach((row, rIdx) => {
      const latestColValue = matrix[rIdx][columnsCount - 1];
      if (row.side === "ASK") {
        asksSum += latestColValue;
      } else if (row.side === "BID") {
        bidsSum += latestColValue;
      }
    });

    const imbalance = (bidsSum / (asksSum + bidsSum || 1)) * 100;
    return {
      totalAsksDepth: asksSum,
      totalBidsDepth: bidsSum,
      orderBookImbalance: imbalance,
      spreadPct: 0.04  // Mock tight spread
    };
  }, [matrix, rows]);

  return (
    <div className="bg-bg-card border border-border-dim rounded-2xl p-5 flex flex-col space-y-5 animate-fade-in shadow-sm">
      
      {/* Top Title Bar Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-border-dim/50 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-sol-purple/10 border border-sol-purple/20 rounded-lg text-sol-purple">
              <Flame className="w-4 h-4 text-sol-purple" />
            </span>
            <div>
              <span className="text-[10px] font-mono font-bold text-sol-purple uppercase tracking-[0.2em] block">
                Quant Orderflow Core
              </span>
              <h2 className="text-sm font-serif italic text-text-heading flex items-center gap-1.5 font-bold">
                {token.toUpperCase()}/USD Real-time Liquidation Map
              </h2>
            </div>
          </div>
          <p className="text-[10.5px] text-text-dim mt-1.5 leading-relaxed font-sans">
            Visualizes buy wall (bids) and sell wall (asks) concentration indices (Liquidation Map). **Click on any cell to place a limit order** directly into the order book cluster.
          </p>
        </div>

        {/* Global Toolbar */}
        <div className="flex flex-wrap items-center gap-2 font-sans w-full md:w-auto justify-end">
          {/* Filters toggle */}
          <div className="flex items-center gap-1 bg-bg-input border border-border-dim/80 p-1.5 rounded-lg text-[10px] select-none">
            {(["ALL", "BIDS", "ASKS"] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setFilterMode(m)}
                className={`px-2 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  filterMode === m 
                    ? "bg-sol-purple border border-sol-purple/20 text-white" 
                    : "text-text-dim hover:text-text-heading"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Export tools */}
          <button
            type="button"
            onClick={exportHeatmapCSV}
            title="Export full orderbook history"
            className="p-2 border border-border-dim hover:border-sol-purple rounded-lg bg-bg-input text-text-dim hover:text-sol-purple cursor-pointer transition-all flex items-center"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Dedicated Auto-Sync switch button */}
          <button
            type="button"
            onClick={() => setSimulationActive(!simulationActive)}
            className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-[10px] font-mono uppercase tracking-[0.05em] font-bold transition-all cursor-pointer ${
              simulationActive 
                ? "border-sol-green/45 text-sol-green bg-sol-green/10" 
                : "border-border-dim/80 text-text-dim bg-bg-input hover:text-text-heading hover:border-border-dim"
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${simulationActive ? "animate-spin" : ""}`} style={{ animationDuration: '3s' }} />
            <span>Auto-Sync: {simulationActive ? "ON" : "OFF"}</span>
          </button>
        </div>
      </div>

      {/* Grid Heatmap Visualization Core */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Heatmap Cell Matrix (8 cols in Grid) */}
        <div className="lg:col-span-8 flex flex-col space-y-1.5 bg-bg-input border border-border-dim p-4 rounded-xl relative overflow-hidden">
          
          {/* Header column timeline marks */}
          <div className="flex text-[8.5px] font-mono text-text-dim border-b border-border-dim/50 pb-2 mb-1 justify-between select-none p-1">
            <span>T-15 (Historical blocks)</span>
            <span>Real-time Flow updates</span>
            <span className="text-sol-purple font-black">Latest Stream (T-0)</span>
          </div>

          <div className="space-y-1">
            {rows.map((row, rIdx) => {
              // Hide rows if filter mode excludes side
              if (filterMode === "BIDS" && row.side === "ASK") return null;
              if (filterMode === "ASKS" && row.side === "BID") return null;

              const isSpot = row.side === "SPOT";
              const isBid = row.side === "BID";
              const valPrice = spotPrice * (1 + row.offset);

              // Check if user has an active limit order at this exact offset row
              const rowActiveOrders = placedOrders.filter(o => {
                const diffPct = Math.abs((o.price - valPrice) / valPrice);
                return diffPct < 0.0015;
              });

              return (
                <div key={row.label} className="flex items-center gap-2 font-mono text-[10px]">
                  
                  {/* Left row labels: offsets and actual calc price */}
                  <div className="w-20 shrink-0 text-left select-none flex flex-col leading-none">
                    <span className={`text-[9.5px] font-black ${
                      isSpot ? "text-sol-purple" : (isBid ? "text-sol-green" : "text-sol-purple/95")
                    }`}>
                      {row.label === "SPOT" ? "SPOT PRICE" : `${row.side === "BID" ? "-" : "+"}${row.label.replace("+","").replace("-","")}`}
                    </span>
                    <span className="text-[8.5px] text-text-dim mt-0.5">${valPrice.toFixed(2)}</span>
                  </div>

                  {/* Grid squares timeline elements */}
                  <div className="flex-1 grid grid-cols-16 gap-0.5">
                    {matrix[rIdx].map((colVal, cIdx) => {
                      const isLastCol = cIdx === columnsCount - 1;
                      const cStyles = getIntensityRGB(colVal, isBid);
                      const hasOrderMark = isLastCol && rowActiveOrders.length > 0;

                      return (
                        <div
                          key={cIdx}
                          onClick={() => handleCellClick(rIdx)}
                          title={`${row.side === "ASK" ? "ASK" : "BID"} Wall price level: $${valPrice.toFixed(2)}\nTotal Volume: ${colVal.toLocaleString(undefined, {maximumFractionDigits:0})} ${token} units (${(colVal * valPrice / 1000).toFixed(0)}k USD)`}
                          style={{ backgroundColor: isSpot ? "transparent" : cStyles.background }}
                          className={`h-6.5 rounded-sm transition-all relative group cursor-crosshair hover:scale-105 active:scale-95 ${
                            isSpot 
                              ? "bg-bg-input border-y border-dashed border-sol-purple/35 flex items-center justify-center" 
                              : `border-transparent ${cStyles.border}`
                          } ${hasOrderMark ? "ring-2 ring-amber-400 animate-pulse bg-gradient-to-r from-amber-400/20 to-transparent" : ""}`}
                        >
                          {/* Indicator for SPOT center line */}
                          {isSpot && cIdx === 8 && (
                            <span className="text-[8px] uppercase tracking-widest text-sol-purple font-black">
                              SPREAD GAP
                            </span>
                          )}

                          {/* Hover visual tag for any cell */}
                          <div className="pointer-events-none opacity-0 group-hover:opacity-100 absolute left-full z-50 bg-slate-950 border border-sol-purple p-2 text-[9px] text-slate-100 rounded-lg shadow-2xl transition-all duration-150 ml-2 whitespace-nowrap">
                            <span className="font-extrabold block text-sol-purple">{row.side === "ASK" ? "🛡️ Sell Liquidity (Ask)" : "🌊 Buy Liquidity (Bid)"}</span>
                            <span>Price: <strong className="text-white">${valPrice.toFixed(2)}</strong></span> <br />
                            <span>Depth Vol: <strong className="text-white">{colVal.toLocaleString(undefined, {maximumFractionDigits:0})} {token}</strong></span> <br />
                            <span>Value: <strong className="text-sol-green">${(colVal * valPrice).toLocaleString(undefined, {maximumFractionDigits:0})}</strong></span>
                          </div>

                          {/* Floating yellow target glyph for custom user ordered positions */}
                          {hasOrderMark && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="w-2 h-2 rounded-full bg-amber-400 shadow shadow-amber-500/80"></span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                </div>
              );
            })}
          </div>

          {/* Feedback message banner inside chart */}
          {feedbackMsg && (
            <div className="absolute bottom-2 left-2 right-2 bg-slate-950/95 border border-sol-purple/75 px-3 py-2 rounded-lg text-[9px] text-slate-200 animate-in fade-in slide-in-from-bottom-2 leading-tight font-sans shadow-xl flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-sol-green animate-ping shrink-0"></span>
              <span className="flex-1">{feedbackMsg}</span>
            </div>
          )}

        </div>

        {/* Analytics & Custom Orders Log Side Deck (4 cols in grid) */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Liquidity Vitality summary panel */}
          <div className="bg-bg-input border border-border-dim p-4 rounded-xl space-y-3 font-mono text-[10.5px]">
            <span className="text-[9px] uppercase font-bold text-text-dim tracking-wider block border-b border-border-dim/40 pb-2">
              Orderflow Book Analytics
            </span>
            
            <div className="flex justify-between">
              <span className="text-text-dim">Spread Width / Cost:</span>
              <span className="font-bold text-text-heading">{(spreadPct * 10).toFixed(2)} bps / $0.05</span>
            </div>

            <div className="flex justify-between">
              <span className="text-text-dim">Total Bid Depth Vol:</span>
              <span className="font-bold text-sol-green">
                {totalBidsDepth.toLocaleString(undefined, { maximumFractionDigits: 0 })} {token}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-text-dim">Total Ask Depth Vol:</span>
              <span className="font-bold text-sol-purple">
                {totalAsksDepth.toLocaleString(undefined, { maximumFractionDigits: 0 })} {token}
              </span>
            </div>

            {/* Book imbalance meter */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-[9px] font-bold text-text-dim">
                <span>IMBALANCE (BIDS VS ASKS):</span>
                <span>{orderBookImbalance.toFixed(1)}% BIDS</span>
              </div>
              <div className="w-full bg-bg-card h-1.5 rounded-full overflow-hidden flex border border-border-dim">
                <div 
                  style={{ width: `${orderBookImbalance}%` }} 
                  className="bg-sol-green h-full transition-all duration-500"
                />
                <div 
                  style={{ width: `${100 - orderBookImbalance}%` }} 
                  className="bg-sol-purple h-full transition-all duration-500"
                />
              </div>
              <p className="text-[8.5px] text-text-dim mt-1.5 leading-snug font-sans italic">
                {orderBookImbalance > 52 
                  ? "🔥 Heavy buy-wall clustering detected below current spot price: bullish support builds." 
                  : orderBookImbalance < 48 ? "🛡️ High-density sell walls overhead: impending resistance clusters." : "⚖️ Symmetrical depth allocation: passive spread mean-reversion favored."}
              </p>
            </div>
          </div>

          {/* User Placed Limit Positions panel */}
          <div className="bg-bg-input border border-border-dim p-4 rounded-xl space-y-3 flex flex-col h-60 min-h-0">
            <div className="flex justify-between items-center border-b border-border-dim/40 pb-2 shrink-0">
              <span className="text-[9px] uppercase font-bold text-text-dim tracking-wider">
                My Simulated Limit Orders ({placedOrders.length})
              </span>
              {placedOrders.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllOrders}
                  className="text-[9px] text-red-500 hover:text-red-400 font-bold flex items-center gap-0.5"
                >
                  <Trash className="w-3 h-3" /> Clear Book
                </button>
              )}
            </div>

            {/* List orders details */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar text-[10px] select-none font-mono">
              {placedOrders.length > 0 ? (
                placedOrders.map(order => (
                  <div 
                    key={order.id} 
                    className="p-2.5 bg-bg-card border border-border-dim rounded-lg flex items-center justify-between hover:border-sol-purple/20 transition-all text-[9.5px]"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1 rounded text-[8px] font-black uppercase ${
                          order.type === "BUY" ? "bg-sol-green/20 text-sol-green" : "bg-sol-purple/20 text-sol-purple"
                        }`}>
                          {order.type} LIMIT
                        </span>
                        <span className="text-text-heading font-extrabold">${order.price.toFixed(2)}</span>
                      </div>
                      <span className="text-text-dim text-[8px] block">
                        Size: {order.size} {token} • {order.timestamp}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => cancelOrder(order.id)}
                      className="p-1 text-text-dim hover:text-red-500 hover:bg-red-500/10 rounded transition-all cursor-pointer"
                      title="Revoke order"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-text-dim space-y-2 py-4 italic">
                  <Crosshair className="w-5 h-5 opacity-25 mx-auto" />
                  <p className="text-[9.5px]">No active limit orders placed directly on heatmap levels.</p>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
