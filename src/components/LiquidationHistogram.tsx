import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine
} from 'recharts';

interface LiquidationHistogramProps {
  spotPrice: number;
  token: string;
  spread: number;
  onSpreadChange: (s: number) => void;
}

export const LiquidationHistogram: React.FC<LiquidationHistogramProps> = ({ spotPrice, token, spread, onSpreadChange }) => {

  // Generate mock data for the histogram based on spotPrice
  const data = useMemo(() => {
    const numBars = 50;
    const centerBucketed = Math.round(spotPrice / spread) * spread;
    
    const chartData = [];
    
    for (let i = -numBars; i <= numBars; i++) {
      const p = centerBucketed + i * spread;
      if (p <= 0) continue;
      const isShort = p > spotPrice;
      const distance = Math.abs(p - spotPrice) / spotPrice;
      
      // Basic random volume with some normal distribution and decay away from spot
      let baseVolume = Math.max(100000, 500000 * Math.exp(-distance * 20) + Math.random() * 200000);
      
      const pMod = Math.abs(p);
      const isMultipleOf = (num: number, multiple: number) => {
        const diff = Math.abs(Math.round(num / multiple) * multiple - num);
        return diff < 1e-5;
      };

      // Add clusters at round numbers or specific intervals
      if (isMultipleOf(pMod, 10)) baseVolume += 1000000 + Math.random() * 500000;
      else if (isMultipleOf(pMod, 5)) baseVolume += 500000 + Math.random() * 200000;
      else if (isMultipleOf(pMod, 1)) baseVolume += 200000 + Math.random() * 100000;
      else if (isMultipleOf(pMod, 0.1)) baseVolume += 50000 + Math.random() * 50000;
      
      if (distance > 0.045 && distance < 0.055) baseVolume += 800000 + Math.random() * 500000;
      if (distance > 0.075 && distance < 0.085) baseVolume += 1500000 + Math.random() * 800000;
      
      const multiplier = spread / 0.01;
      baseVolume *= multiplier;
      
      chartData.push({
        price: p,
        priceLabel: spread >= 1 ? p.toFixed(0) : spread >= 0.1 ? p.toFixed(1) : spread >= 0.01 ? p.toFixed(2) : p.toFixed(3),
        volume: baseVolume,
        side: isShort ? 'Short' : 'Long',
        fill: isShort ? '#ef4444' : '#22c55e' // Red for shorts above, Green for longs below
      });
    }
    return chartData;
  }, [spotPrice, spread]);

  return (
    <div className="w-full h-[500px] bg-bg-card rounded-xl border border-border-dim p-4 flex flex-col">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold text-text-heading font-serif italic">{token.toUpperCase()}/USD Liquidation Pool Histogram</h3>
          <p className="text-[11px] text-text-dim uppercase tracking-wider mt-1">Estimated Cumulative Leverage Liquidations by Price Level</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2 border border-border-dim bg-bg-main px-2 py-1 rounded-lg">
            <span className="text-[10px] uppercase font-bold text-text-dim tracking-wider">Spread:</span>
            <select
              className="bg-transparent text-text-heading text-xs outline-none font-mono font-bold cursor-pointer"
              value={spread}
              onChange={(e) => onSpreadChange(Number(e.target.value))}
            >
              <option value={1}>1</option>
              <option value={0.1}>0.1</option>
              <option value={0.01}>0.01</option>
              <option value={0.001}>0.001</option>
            </select>
          </div>
          <div className="flex items-center gap-4 text-[10px] uppercase font-bold tracking-widest text-text-dim bg-bg-main px-3 py-1.5 rounded-lg border border-border-dim">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sol-green"></span> Long Liq (Support)</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500"></span> Short Liq (Resistance)</span>
          </div>
        </div>
      </div>
      <div className="flex-1 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            barCategoryGap="10%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
            <XAxis 
              dataKey="priceLabel" 
              stroke="#555" 
              tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }}
              tickFormatter={(val, i) => i % 5 === 0 ? `$${val}` : ''}
              tickMargin={10}
            />
            <YAxis 
              stroke="#555" 
              tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }}
              tickFormatter={(val) => `$${(val / 1000000).toFixed(1)}M`}
              tickMargin={10}
            />
            <Tooltip 
              cursor={{ fill: '#ffffff08' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-bg-input border border-border-dim p-3 rounded-lg shadow-xl shrink-0 whitespace-nowrap z-50 font-sans">
                      <p className="font-bold text-white text-[12px] mb-1 pb-1 border-b border-border-dim/50">Price Level: ${Number(data.price).toFixed(3)}</p>
                      <p className="text-[11px] mt-1.5">
                        <span className="text-text-dim mr-2 uppercase tracking-wide text-[9px] font-bold">Estimated Liquidation Volume:</span> 
                        <strong className={data.side === 'Short' ? 'text-red-400' : 'text-sol-green'}>
                          ${(data.volume / 1000).toFixed(1)}K ({data.side})
                        </strong>
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <ReferenceLine 
              x={data[50]?.priceLabel || ''} 
              stroke="#a855f7" 
              strokeDasharray="4 4" 
              label={{ position: 'top', value: 'CURRENT SPOT', fill: '#a855f7', fontSize: 10, fontWeight: 'bold' }} 
            />
            <Bar dataKey="volume" radius={[2, 2, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
