import React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  BookOpen,
  Clock,
  Gauge,
  Layers,
  Shield,
  Target,
  TrendingUp,
  Zap
} from "lucide-react";

/**
 * Strategy Guide — in-app visual explainer of the automated strategy.
 * Mirrors README.md / docs/STRATEGY.md; the code in server.ts (resolveEntry →
 * entryGateBlock → evaluateExit) is the source of truth. Update this view when
 * gates, intervals, or exit geometry change.
 */

const FlowArrow = ({ label }: { label?: string }) => (
  <div className="flex flex-col items-center py-1">
    {label && <span className="text-[9px] font-mono text-text-dim mb-0.5">{label}</span>}
    <ArrowDown className="w-4 h-4 text-border-strong" />
  </div>
);

const FlowBox = ({
  tone = "neutral",
  title,
  children
}: {
  tone?: "neutral" | "green" | "amber" | "blue" | "red" | "purple";
  title: string;
  children?: React.ReactNode;
}) => {
  const tones: Record<string, string> = {
    neutral: "bg-bg-card border-border-dim",
    green: "bg-emerald-50 border-emerald-200",
    amber: "bg-amber-50 border-amber-200",
    blue: "bg-sky-50 border-sky-200",
    red: "bg-rose-50 border-rose-200",
    purple: "bg-violet-50 border-violet-200"
  };
  const titleTones: Record<string, string> = {
    neutral: "text-text-heading",
    green: "text-emerald-700",
    amber: "text-amber-700",
    blue: "text-sky-700",
    red: "text-rose-700",
    purple: "text-violet-700"
  };
  return (
    <div className={`border rounded-xl px-4 py-3 ${tones[tone]}`}>
      <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${titleTones[tone]}`}>{title}</div>
      {children && <div className="text-[11px] leading-relaxed text-text-body">{children}</div>}
    </div>
  );
};

const SectionHeading = ({ icon: Icon, kicker, title }: { icon: any; kicker: string; title: string }) => (
  <div className="space-y-1 mb-4">
    <span className="text-[10px] font-mono font-bold text-sol-purple uppercase tracking-[0.2em] flex items-center gap-2">
      <Icon className="w-3 h-3" /> {kicker}
    </span>
    <h3 className="text-lg font-serif italic text-text-heading">{title}</h3>
  </div>
);

// Exit ladder levels for a LONG (short mirrors). Positions are % from the top of the diagram.
const LADDER = [
  {
    level: "entry + 4.0×ATR",
    name: "Hard TP cap",
    desc: "Close the runner — don't give a 4×ATR windfall back.",
    color: "bg-emerald-500",
    text: "text-emerald-700",
    dashed: false
  },
  {
    level: "peak − 2.0×ATR",
    name: "Trailing stop",
    desc: "Ratchets behind the best price seen — favorable-only, never loosens.",
    color: "bg-emerald-400",
    text: "text-emerald-600",
    dashed: true
  },
  {
    level: "entry + 1.5×ATR",
    name: "Scale-out 50%",
    desc: "Bank half, move the stop to breakeven → the rest rides risk-free.",
    color: "bg-violet-500",
    text: "text-violet-700",
    dashed: false
  },
  {
    level: "entry",
    name: "Breakeven stop",
    desc: "Active after the scale-out — the trade can no longer lose.",
    color: "bg-slate-400",
    text: "text-text-dim",
    dashed: true
  },
  {
    level: "entry − 1.5×ATR",
    name: "Initial hard stop",
    desc: "Loss cap, live ON-CHAIN from the first second (ATR floored at 0.4% of price).",
    color: "bg-rose-500",
    text: "text-rose-700",
    dashed: false
  }
];

const TIMEFRAMES = [
  { tf: "1h candles", role: "All signal indicators: composite Σ, ADX(14), RSI, MACD, EMA200, ATR, Supertrend", knob: "interval (clamped to 1h/1d)" },
  { tf: "every 20 min", role: "Daemon wake-up: evaluate entries / manage the open position", knob: "MIN_SYNC_MINUTES" },
  { tf: "instant", role: "Hard TP + SL trigger orders on-chain — Jupiter keepers fill them even while the bot sleeps", knob: "attached on every REAL open" },
  { tf: "2 × 1h bars", role: "Entry confirmation — current and previous bar must agree on direction", knob: "2-bar confirmation" },
  { tf: "last ~60 min", role: "Range window for the mean-reversion fade (ranging regime only)", knob: "MEAN_REVERSION_LOOKBACK_MINUTES" },
  { tf: "8 × 1h bars", role: "200-EMA slope — blocks longs into a falling EMA and vice versa", knob: "REGIME_SLOPE_BARS" },
  { tf: "200 × 1h bars (~8 days)", role: "200-EMA primary-trend regime: longs above, shorts below", knob: "useRegimeFilter" },
  { tf: "5 days", role: "Macro regime from DXY / 10-Y yield / VIX trend → RISK-ON / OFF / NEUTRAL", knob: "useMacroFilter" },
  { tf: "30m / 45m / 6h", role: "Entry cooldown · pause after 2 straight losses · circuit-breaker auto-reset", knob: "risk rails" },
  { tf: "360 min", role: "Stagnation stop: still under +0.5% with no scale-out → cut it before borrow fees bleed it", knob: "STAGNANT_EXIT_MINUTES" },
  { tf: "rolling 24 h", role: "Maximum 4 position opens", knob: "daily cap" }
];

const RISK_RAILS = [
  { name: "Single position", desc: "One open position at a time — the wallet's real on-chain positions are re-checked before every REAL open, so a state desync can never double exposure." },
  { name: "Macro filter", desc: "No new longs while the dollar/yields/volatility backdrop is RISK-OFF; no new shorts while RISK-ON." },
  { name: "Cooldowns", desc: "30 min between entries · 45 min pause after 2 consecutive losses · circuit breaker at 8 straight losses (auto-resets 6h after the last loss)." },
  { name: "Leverage cap", desc: "Hard MAX_LEVERAGE (5×) clamp at config load, config save, and trade sizing — 89% of all historical losses came from 11–20× May trades." },
  { name: "Daily cap", desc: "At most 4 position opens per rolling 24 hours." },
  { name: "Re-entry block", desc: "Never re-arms the same side at the same price level right after a loss." }
];

export const StrategyGuide = () => (
  <main className="flex-1 flex flex-col p-8 bg-bg-main overflow-y-auto custom-scrollbar animate-fade-in text-text-body">
    <div className="max-w-5xl mx-auto w-full space-y-10 pb-16">
      {/* Header */}
      <div className="space-y-1">
        <span className="text-[10px] font-mono font-bold text-sol-purple uppercase tracking-[0.2em] flex items-center gap-2">
          <BookOpen className="w-3 h-3" /> Strategy Guide
        </span>
        <h2 className="text-xl font-serif italic text-text-heading">How the automated strategy works</h2>
        <p className="text-[11px] text-text-dim max-w-2xl leading-relaxed">
          The live trader, the server backtest, and the benchmark all run one shared code path
          (<span className="font-mono">resolveEntry → entryGateBlock → evaluateExit</span>), so live behaviour cannot
          drift from what was validated. Expect <strong>~3–4 trades/week in trends and near-zero in chop</strong> —
          quiet stretches are the strategy standing aside on purpose (the audit log records a reasoned HOLD every cycle).
        </p>
      </div>

      {/* 30-second version */}
      <section>
        <SectionHeading icon={Zap} kicker="The 30-second version" title="Four questions, every 20 minutes" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            ["Is there a bias?", "Weighted composite Σ of MACD, RSI and Supertrend on 1h candles must exceed ±0.25 conviction."],
            ["What market is this?", "ADX(14) routes it: strong trend → momentum · ranging → fade the range edge · weak trend → stand aside."],
            ["Is the entry safe?", "Trend-alignment, no-chasing, macro, cooldown and pyramiding gates all have to agree."],
            ["Manage what's open", "ATR ladder banks half at +1.5×ATR, moves the stop to breakeven, trails the rest. Hard TP/SL live on-chain."]
          ].map(([t, d], i) => (
            <div key={t} className="bg-bg-card border border-border-dim rounded-xl p-4">
              <div className="w-7 h-7 rounded bg-bg-input flex items-center justify-center border border-border-dim text-[10px] font-bold mb-2">
                {String(i + 1).padStart(2, "0")}
              </div>
              <h5 className="text-xs font-black uppercase text-text-heading mb-1">{t}</h5>
              <p className="text-[11px] text-text-dim leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Entry pipeline */}
      <section>
        <SectionHeading icon={Activity} kicker="Entry pipeline" title="From candles to an open position" />
        <div className="bg-bg-card border border-border-dim rounded-2xl p-5">
          <div className="max-w-md mx-auto">
            <FlowBox title="⏱ Every 20 minutes">Fetch fresh 1-hour candles and compute all indicators.</FlowBox>
            <FlowArrow />
            <FlowBox title="Composite bias Σ">
              MACD <span className="font-mono">×0.90</span> · RSI <span className="font-mono">×0.85</span> · Supertrend{" "}
              <span className="font-mono">×0.90</span> → one score in [−1, +1].
              <div className="mt-1 text-[10px] text-text-dim">|Σ| ≤ 0.25 → <strong>HOLD</strong> (no conviction) · |Σ| &gt; 0.25 → continue ↓</div>
            </FlowBox>
            <FlowArrow label="ADX(14) regime switch" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-1">
            <div>
              <div className="text-center text-[10px] font-mono font-bold text-sky-600 mb-1">ADX ≤ 15 · RANGING</div>
              <FlowBox tone="blue" title="Mean-reversion fade">
                Fade a <strong>rejection</strong> off the ~60-min range edge: the bar wicks past the extreme but closes
                ≥35% of its own range back inside. A mere touch, or a close through the level, never fires — no knife-catching.
              </FlowBox>
            </div>
            <div>
              <div className="text-center text-[10px] font-mono font-bold text-amber-600 mb-1">15 &lt; ADX ≤ 25 · WEAK TREND</div>
              <FlowBox tone="amber" title="Stand aside">
                The fee-negative zone: round-trip fees + hourly borrow (~0.35%/trade) ate every weak-trend entry variant
                in the Mar–Jul backtest sweep. Trend exists, but not enough to pay the costs.
              </FlowBox>
            </div>
            <div>
              <div className="text-center text-[10px] font-mono font-bold text-emerald-600 mb-1">ADX &gt; 25 · STRONG TREND</div>
              <FlowBox tone="green" title="Momentum entry checks">
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>200-EMA <strong>side and slope</strong> agree — never fade the primary trend</li>
                  <li>MACD-sign <strong>or</strong> RSI(21) timing cross</li>
                  <li>No chasing: price ≤ 1.5×ATR from the EMA26 mean</li>
                  <li>Chop-zone guard · 2-bar confirmation</li>
                </ul>
              </FlowBox>
            </div>
          </div>

          <div className="max-w-md mx-auto">
            <FlowArrow />
            <FlowBox tone="neutral" title="🛡 Risk rails (entries only — exits are never blocked)">
              Macro filter · single position with pre-open <strong>on-chain</strong> wallet check · 30-min cooldown ·
              45-min pause after 2 losses · max 4 opens/24h · circuit breaker at 8 straight losses.
            </FlowBox>
            <FlowArrow label="all clear" />
            <FlowBox tone="purple" title="Open on Jupiter Perps">
              Sized by <span className="font-mono">positionSizeUsd</span> (default $20 notional, collateral = size ÷ leverage)
              at ≤5× leverage — with hard on-chain TP + SL trigger orders attached <strong>at the moment of entry</strong>.
            </FlowBox>
          </div>
        </div>
      </section>

      {/* Exit ladder */}
      <section>
        <SectionHeading icon={Target} kicker="Exit ladder" title="Volatility-adaptive, in price space" />
        <div className="bg-bg-card border border-border-dim rounded-2xl p-5">
          <p className="text-[11px] text-text-dim mb-4 leading-relaxed">
            All levels scale with the ATR captured at entry (floored at 0.4% of price so a quiet tape can't place the
            stop inside noise). LONG shown; SHORT mirrors. Levels are price-space, so leverage changes the PnL, not the geometry.
          </p>
          <div className="space-y-0">
            {LADDER.map((l, i) => (
              <div key={l.name} className="flex items-center gap-3 group">
                <div className="w-28 md:w-36 shrink-0 text-right">
                  <span className={`text-[10px] font-mono font-bold ${l.text}`}>{l.level}</span>
                </div>
                <div className="flex flex-col items-center self-stretch">
                  <div className={`w-px flex-1 ${i === 0 ? "opacity-0" : "bg-border-dim"}`} />
                  <div className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
                  <div className={`w-px flex-1 ${i === LADDER.length - 1 ? "opacity-0" : "bg-border-dim"}`} />
                </div>
                <div className="flex-1 py-2.5">
                  <div className={`h-1 rounded-full ${l.color} ${l.dashed ? "opacity-40" : ""} mb-1.5`} style={{ width: `${88 - i * 12}%` }} />
                  <span className="text-xs font-black uppercase text-text-heading">{l.name}</span>
                  <span className="text-[11px] text-text-dim"> — {l.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
            <FlowBox tone="amber" title="Stagnation time-stop (6h)">
              No scale-out and still under +0.5% (leveraged) after 360 minutes → cut it. Perps borrow fees accrue
              hourly on notional — a "flat" 19-hour short once realized −1.89% purely from fees.
            </FlowBox>
            <FlowBox tone="blue" title="In-profit reversal">
              Signal flips <strong>and</strong> the trade has cleared a ≥1.5% fee/noise buffer → bank it and re-enter the
              other side. A flip while under water is ignored — the stop governs the downside (no fee-eaten churn).
            </FlowBox>
          </div>
        </div>
      </section>

      {/* Timeframes */}
      <section>
        <SectionHeading icon={Clock} kicker="Timeframes" title="What interval is used for what" />
        <div className="bg-bg-card border border-border-dim rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border-dim bg-bg-input/60">
                  <th className="px-4 py-2.5 text-[10px] font-mono font-bold uppercase tracking-widest text-text-dim whitespace-nowrap">Timeframe</th>
                  <th className="px-4 py-2.5 text-[10px] font-mono font-bold uppercase tracking-widest text-text-dim">Used for</th>
                  <th className="px-4 py-2.5 text-[10px] font-mono font-bold uppercase tracking-widest text-text-dim whitespace-nowrap">Where</th>
                </tr>
              </thead>
              <tbody>
                {TIMEFRAMES.map((r) => (
                  <tr key={r.tf} className="border-b border-border-dim/60 last:border-0">
                    <td className="px-4 py-2.5 text-[11px] font-mono font-bold text-text-heading whitespace-nowrap">{r.tf}</td>
                    <td className="px-4 py-2.5 text-[11px] text-text-body leading-relaxed">{r.role}</td>
                    <td className="px-4 py-2.5 text-[10px] font-mono text-text-dim whitespace-nowrap">{r.knob}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-bg-input/40 border-t border-border-dim text-[11px] text-text-dim leading-relaxed">
            <strong className="text-text-heading">Why 1h and not 5m/15m?</strong> Fees + hourly borrow cost ~0.35% per
            round trip while sub-hourly ATR targets are only ~0.5–0.9% — every sub-hourly entry variant in the Mar–Jul
            2026 sweep lost money. The server refuses sub-hourly trading intervals at config load <em>and</em> save.
          </div>
        </div>
      </section>

      {/* Protection layers */}
      <section>
        <SectionHeading icon={Layers} kicker="Sudden reversals" title="What if the market flips violently between checks?" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-bg-card border border-emerald-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-emerald-600" />
              <h5 className="text-xs font-black uppercase text-emerald-700">Layer 1 — on-chain · instant</h5>
            </div>
            <p className="text-[11px] text-text-body leading-relaxed">
              Hard TP and SL trigger orders are held by Jupiter's keepers and fill at the trigger price within
              seconds — even if the bot is asleep, restarting, or down entirely. A 5-minute crash against an open
              position hits this stop long before the next daemon check.
            </p>
          </div>
          <div className="bg-bg-card border border-border-dim rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Gauge className="w-4 h-4 text-sol-purple" />
              <h5 className="text-xs font-black uppercase text-text-heading">Layer 2 — daemon loop · every 20 min</h5>
            </div>
            <p className="text-[11px] text-text-body leading-relaxed">
              The softer management logic: partial scale-out, breakeven move, ATR trailing, stagnation time-stop and
              the in-profit reversal exit. The 1h interval only slows how fast a <em>new</em> trend is entered — by
              design, since 5-minute "trend changes" are usually noise and trading them is what historically lost money.
            </p>
          </div>
        </div>
      </section>

      {/* Risk rails */}
      <section>
        <SectionHeading icon={Shield} kicker="Risk rails" title="Guards around every entry" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {RISK_RAILS.map((r) => (
            <div key={r.name} className="bg-bg-card border border-border-dim rounded-xl p-4">
              <h5 className="text-xs font-black uppercase text-text-heading mb-1">{r.name}</h5>
              <p className="text-[11px] text-text-dim leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 leading-relaxed">
            Backtest numbers are in-sample and optimistic — the honest expectation is break-even-to-slightly-positive
            pre-fees. Rails limit damage; they do not create edge. Exits are never blocked by entry rails.
          </p>
        </div>
      </section>

      {/* Journal note */}
      <section className="bg-bg-card border border-border-dim rounded-2xl p-5 flex items-start gap-3">
        <TrendingUp className="w-4 h-4 text-sol-green shrink-0 mt-0.5" />
        <p className="text-[11px] text-text-body leading-relaxed">
          <strong className="text-text-heading">The journal only shows what the chain confirms.</strong> REAL trades
          appear once matched to actual on-chain fills from Jupiter's own history — prices, fees and PnL come from the
          chain, never from the bot's estimates. Paper and signal-only rows are clearly labeled simulated.
        </p>
      </section>
    </div>
  </main>
);
