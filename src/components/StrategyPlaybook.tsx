import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { GATES, PLAYBOOK, SCENARIOS, fmtPct, netUsd, simulate, tickLabel, type Frame, type Scenario } from "../lib/strategyPlaybook";

/**
 * Animated scenario walkthrough of the live strategy, shown at the top of the Strategy Guide.
 * The scenario engine (src/lib/strategyPlaybook.ts) ports the daemon's exit rules and is
 * parity-tested against server.ts in test.ts.
 */

const C = {
  ink: "#1e293b", muted: "#64748b", line: "#e2e8f0", card: "#ffffff",
  long: "#10b981", loss: "#f43f5e", trail: "#8b5cf6", amber: "#d97706", accent: "#0ea5e9", hold: "#94a3b8",
};
const W = 760, PADL = 58, PADR = 92, PADT = 18, PLOT_B = 318, RIB_T = 332, RIB_H = 12;
const SPEEDS = [900, 650, 430, 280, 160];
const SUB = 6;

const toneClass: Record<string, string> = {
  trade: "text-text-heading font-semibold",
  good: "text-emerald-600",
  bad: "text-rose-600",
  warn: "text-amber-600",
  info: "text-text-dim",
};

function Chart({ sc, frames, closedAt, k, frac }: { sc: Scenario; frames: Frame[]; closedAt: number; k: number; frac: number }) {
  const P = PLAYBOOK;
  const n = sc.px.length;
  const lo = Math.min(...sc.px, sc.side ? P.ENTRY - P.SL * P.ATR : Infinity) - 0.35;
  const hi = Math.max(...sc.px, sc.side ? P.ENTRY + P.PARTIAL * P.ATR + 0.4 : -Infinity) + 0.35;
  const x = (i: number) => PADL + (i / Math.max(1, n - 1)) * (W - PADL - PADR);
  const y = (p: number) => PADT + ((hi - p) / (hi - lo)) * (PLOT_B - PADT);
  const upto = Math.min(k, n - 1);
  const shown = frames[upto];

  const stepP = hi - lo > 4 ? 1 : 0.5;
  const grid: number[] = [];
  for (let p = Math.ceil(lo / stepP) * stepP; p <= hi; p += stepP) grid.push(p);
  const every = Math.max(1, Math.round(n / 7));

  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= upto; i++) pts.push([x(i), y(sc.px[i])]);
  if (upto < n - 1 && frac > 0) {
    const a = sc.px[upto], b = sc.px[upto + 1];
    pts.push([x(upto) + frac * (x(upto + 1) - x(upto)), y(a + (b - a) * frac)]);
  }
  const inTrade = pts.filter((_, i) => i <= closedAt);
  const after = pts.filter((_, i) => i >= closedAt);
  const head = pts[pts.length - 1];

  let stopPath = "";
  let lastY = 0;
  for (let i = 0; i <= upto; i++) {
    const f = frames[i];
    if (f.stop == null) break;
    const xs = x(i), ys = y(f.stop);
    stopPath += stopPath ? ` L${xs},${lastY} L${xs},${ys}` : `M${xs},${ys}`;
    lastY = ys;
    if (f.closed) break;
  }
  const stopColor = shown?.partial ? C.trail : C.loss;
  const bufPx = P.ENTRY * (1 + P.BUFFER / 100 / P.LEV);
  const cw = (W - PADL - PADR) / Math.max(1, n - 1);

  const Level = ({ p, color, label, dash, width = 1.5 }: { p: number; color: string; label: string; dash?: string; width?: number }) => (
    <g>
      <line x1={PADL} x2={W - PADR} y1={y(p)} y2={y(p)} stroke={color} strokeWidth={width} strokeDasharray={dash} />
      <text x={W - PADR + 6} y={y(p) + 4} fill={color} fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={600}>{label}</text>
    </g>
  );

  return (
    <svg viewBox={`0 0 ${W} 380`} className="block w-full h-auto min-w-[520px]" role="img" aria-label={`${sc.name}: animated SOL price path with the exit ladder`}>
      {grid.map(p => (
        <g key={p}>
          <line x1={PADL} x2={W - PADR} y1={y(p)} y2={y(p)} stroke={C.line} />
          <text x={PADL - 8} y={y(p) + 4} textAnchor="end" fill={C.muted} fontSize={11} fontFamily="JetBrains Mono, monospace">${p.toFixed(stepP < 1 ? 1 : 0)}</text>
        </g>
      ))}
      {Array.from({ length: n }, (_, i) => i).filter(i => i % every === 0).map(i => (
        <text key={i} x={x(i)} y={RIB_T + RIB_H + 16} textAnchor="middle" fill={C.muted} fontSize={11} fontFamily="JetBrains Mono, monospace">{tickLabel(i)}</text>
      ))}

      {sc.side && (
        <>
          <Level p={P.ENTRY} color={C.muted} label="entry" dash="4 4" />
          <Level p={P.ENTRY + P.PARTIAL * P.ATR} color={C.long} label="scale-out" dash="2 4" />
          {hi >= P.ENTRY + P.TP * P.ATR && <Level p={P.ENTRY + P.TP * P.ATR} color={C.accent} label="TP cap" />}
          <Level p={bufPx} color={C.accent} label="+1.5% buffer" dash="1 5" width={1} />
          {stopPath && <path d={stopPath} fill="none" stroke={stopColor} strokeWidth={2} />}
          {shown && shown.stop != null && (
            <text x={W - PADR + 6} y={y(shown.stop) + 4} fill={stopColor} fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={600}>
              {shown.partial ? (shown.stop > P.ENTRY + 1e-6 ? "trail stop" : "breakeven") : "stop"}
            </text>
          )}
        </>
      )}

      <text x={PADL - 8} y={RIB_T + RIB_H - 2} textAnchor="end" fill={C.muted} fontSize={10} fontFamily="JetBrains Mono, monospace">signal</text>
      {frames.slice(0, upto + 1).map(f => (
        <rect key={f.i} x={x(f.i) - cw / 2 + 1} y={RIB_T} width={Math.max(2, cw - 2)} height={RIB_H} rx={2}
          fill={f.sig === "LONG" ? C.long : f.sig === "SHORT" ? C.loss : C.hold} opacity={0.85} />
      ))}

      {inTrade.length > 1 && (
        <polyline points={inTrade.map(p => p.join(",")).join(" ")} fill="none" stroke={sc.side ? C.ink : C.hold} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {after.length > 1 && <polyline points={after.map(p => p.join(",")).join(" ")} fill="none" stroke={C.hold} strokeWidth={1.6} strokeDasharray="3 4" />}
      {head && <circle cx={head[0]} cy={head[1]} r={5} fill={C.accent} stroke={C.card} strokeWidth={2} />}

      {sc.side && (
        <>
          <circle cx={x(0)} cy={y(P.ENTRY)} r={6} fill={C.card} stroke={sc.orphan ? C.amber : C.long} strokeWidth={2.5} />
          {sc.orphan && <text x={x(0)} y={y(P.ENTRY) - 12} textAnchor="middle" fill={C.amber} fontSize={12} fontFamily="JetBrains Mono, monospace" fontWeight={600}>adopted</text>}
          {frames.slice(1, upto + 1).map(f => {
            const prev = frames[f.i - 1];
            const els: React.ReactNode[] = [];
            if (f.partial && !prev.partial) els.push(<path key="p" d={`M${x(f.i)},${y(f.px) - 14} l-6,9 h12 z`} fill={C.long} />);
            if (f.closed && f.pnl != null) {
              const c = f.pnl >= 0 ? C.long : C.loss;
              els.push(<rect key="r" x={x(f.i) - 6} y={y(f.px) - 6} width={12} height={12} rx={2} fill={c} stroke={C.card} strokeWidth={2} />);
              els.push(<text key="t" x={x(f.i)} y={y(f.px) + (f.pnl >= 0 ? -14 : 22)} textAnchor="middle" fill={c} fontSize={12.5} fontFamily="JetBrains Mono, monospace" fontWeight={700}>{fmtPct(f.pnl)}%</text>);
            }
            return <g key={f.i}>{els}</g>;
          })}
        </>
      )}
    </svg>
  );
}

export const StrategyPlaybook = () => {
  const reduceMotion = useMemo(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  const [scId, setScId] = useState(SCENARIOS[0].id);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(3);
  const [notional, setNotional] = useState(30);
  const [pos, setPos] = useState(() => ({ k: reduceMotion ? SCENARIOS[0].px.length - 1 : 0, frac: 0, runId: 0 }));
  const logRef = useRef<HTMLOListElement>(null);

  const sc = SCENARIOS.find(s => s.id === scId) || SCENARIOS[0];
  const run = useMemo(() => simulate(sc), [sc]);
  const n = sc.px.length;
  const closedAt = run.closed ? run.closed.i : Infinity;

  const restart = (id = scId) => {
    setScId(id);
    setPos(p => ({ k: reduceMotion ? SCENARIOS.find(s => s.id === id)!.px.length - 1 : 0, frac: 0, runId: p.runId + 1 }));
  };

  useEffect(() => {
    if (reduceMotion || !playing) return;
    const done = pos.k >= n - 1;
    const t = window.setTimeout(() => {
      if (done) { setPos(p => ({ k: 0, frac: 0, runId: p.runId + 1 })); return; }
      setPos(p => {
        const frac = p.frac + 1 / SUB;
        return frac >= 1 - 1e-9 ? { ...p, k: p.k + 1, frac: 0 } : { ...p, frac };
      });
    }, done ? 2600 : SPEEDS[speed - 1] / SUB);
    return () => window.clearTimeout(t);
  }, [pos, playing, speed, n, reduceMotion]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [pos.k, scId]);

  const k = Math.min(pos.k, n - 1);
  const frame = run.frames[k];
  const lastTrade = run.frames.slice(0, k + 1).filter(f => f.pnl != null).pop();
  const endTick = run.closed && k >= run.closed.i ? run.closed.i : k;
  const usd = lastTrade && lastTrade.pnl != null ? netUsd(lastTrade.pnl, endTick, notional) : 0;
  const logLines = run.frames.slice(0, k + 1).flatMap(f => f.log.map((l, j) => ({ key: `${f.i}-${j}`, t: tickLabel(f.i), tone: l[0], msg: l[1] })));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Scenario">
        {SCENARIOS.map(s => (
          <button
            key={s.id}
            type="button"
            aria-pressed={s.id === scId}
            onClick={() => { setPlaying(true); restart(s.id); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-full border text-[11px] font-bold transition-all cursor-pointer ${
              s.id === scId ? "border-sol-purple bg-violet-50 text-text-heading ring-1 ring-sol-purple" : "border-border-dim bg-bg-card text-text-body hover:border-border-strong"
            }`}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
            {s.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div className="bg-bg-card border border-border-dim rounded-2xl p-4 space-y-3 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-xl">
              <h4 className="text-sm font-black text-text-heading">{sc.name}</h4>
              <p className="text-[11px] text-text-dim leading-relaxed">{sc.sub}</p>
            </div>
            <div className="flex items-center gap-2">
              {!reduceMotion && (
                <button type="button" onClick={() => setPlaying(p => !p)} className="p-2 rounded-lg border border-border-dim bg-bg-input hover:border-sol-purple cursor-pointer" aria-label={playing ? "Pause" : "Play"}>
                  {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
              )}
              <button type="button" onClick={() => { setPlaying(true); restart(); }} className="p-2 rounded-lg border border-border-dim bg-bg-input hover:border-sol-purple cursor-pointer" aria-label="Replay">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              {!reduceMotion && (
                <label className="flex items-center gap-1.5 text-[10px] font-mono text-text-dim">
                  speed
                  <input type="range" min={1} max={5} value={speed} onChange={e => setSpeed(Number(e.target.value))} className="w-20 accent-violet-500" />
                </label>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Chart sc={sc} frames={run.frames} closedAt={closedAt} k={pos.k} frac={pos.frac} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border-dim border border-border-dim rounded-xl overflow-hidden" aria-live="polite">
            {[
              ["Elapsed", `${k * PLAYBOOK.TICK_MIN} min`, ""],
              ["SOL mark", `$${frame.px.toFixed(2)}`, ""],
              ["Trade P&L (3×)", sc.side && lastTrade?.pnl != null ? `${fmtPct(lastTrade.pnl)}%` : "no position", sc.side && lastTrade?.pnl != null ? (lastTrade.pnl >= 0 ? "text-emerald-600" : "text-rose-600") : ""],
              [`Net $ at $${notional}`, `${usd >= 0 ? "+$" : "−$"}${Math.abs(usd).toFixed(2)}`, usd > 0 ? "text-emerald-600" : usd < 0 ? "text-rose-600" : ""],
            ].map(([label, value, cls]) => (
              <div key={label} className="bg-bg-input px-3 py-2">
                <div className="text-[9px] font-mono uppercase tracking-widest text-text-dim">{label}</div>
                <div className={`text-sm font-mono font-bold tabular-nums text-text-heading ${cls}`}>{value}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-text-dim">Position notional for the $ readout. Fees and hourly borrow are deducted.</span>
            <div className="inline-flex rounded-lg border border-border-dim overflow-hidden" role="group" aria-label="Position size">
              {[30, 300].map(v => (
                <button key={v} type="button" aria-pressed={notional === v} onClick={() => setNotional(v)}
                  className={`px-3 py-1.5 text-[10px] font-mono font-bold cursor-pointer ${notional === v ? "bg-sol-purple text-white" : "bg-bg-input text-text-dim"}`}>
                  {v === 30 ? "$30 today" : "$300"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <div className="bg-bg-card border border-border-dim rounded-2xl p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-text-dim mb-2">Entry gates</div>
            <ul className="space-y-1.5">
              {GATES.map(([name, hint], i) => {
                const g = sc.gates[i] || { ok: null };
                return (
                  <li key={name} className={`grid grid-cols-[18px_1fr] gap-2 items-start ${g.ok === null ? "opacity-35" : ""}`}>
                    <span className={`text-[10px] font-mono font-bold text-center rounded leading-[18px] h-[18px] ${
                      g.ok === true ? "bg-emerald-50 text-emerald-600" : g.ok === false ? "bg-rose-50 text-rose-600" : "bg-bg-input text-text-dim"
                    }`}>{g.ok === true ? "✓" : g.ok === false ? "✕" : "·"}</span>
                    <div className="text-[11px] text-text-heading leading-snug">
                      {name}
                      <span className="block text-[10px] font-mono text-text-dim">{g.note || hint}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="bg-bg-card border border-border-dim rounded-2xl p-4 flex flex-col min-h-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-text-dim mb-2">Audit log</div>
            <ol ref={logRef} className="max-h-72 overflow-y-auto custom-scrollbar space-y-1 font-mono text-[10.5px] leading-snug">
              {logLines.map((l, idx) => (
                <li key={l.key} className={`grid grid-cols-[44px_1fr] gap-2 py-1 ${idx ? "border-t border-dashed border-border-dim" : ""}`}>
                  <span className="text-text-dim">+{l.t}</span>
                  <span className={toneClass[l.tone]}>{l.msg}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-text-dim leading-relaxed">
        Illustrative prices around a $118.00 entry with a $1.00 ATR, one tick per 20-minute daemon cycle. The rules, thresholds and order of checks are the live
        daemon's: price exits first, then the signal exit, then the time-stop. The scenario engine is parity-tested against the server's own exit functions.
      </p>
    </div>
  );
};
