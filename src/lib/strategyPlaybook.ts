// Scenario engine for the in-app Strategy Playbook animation (StrategyGuide → StrategyPlaybook).
//
// A browser-safe port of the live daemon's exit rules in server.ts — evaluateExit (ATR stop →
// 50% scale-out + breakeven → 2×ATR trail → 4×ATR cap), signalExitReason (reversal / thesis lapse
// above the +1.5% buffer) and the STAGNANT_* time-stop — applied in the daemon's order: price
// exits, then the signal exit, then the time-stop. test.ts replays every scenario through the
// server's own functions and asserts the same close tick, reason and P&L, so if the server rules
// change this file (and the animation) must change with them.

export type Side = "LONG" | "SHORT";
export type Sig = "LONG" | "SHORT" | "HOLD";

export const PLAYBOOK = {
  LEV: 3,
  ATR: 1.0,
  ENTRY: 118.0,
  TICK_MIN: 20,
  SL: 1.5,
  PARTIAL: 1.5,
  FRAC: 0.5,
  TRAIL: 2.0,
  TP: 4.0,
  BUFFER: 1.5,
  STAG_MIN: 600,
  STAG_PNL: 0.5,
  FEE_SIDE: 0.0007,
  BORROW_HR: 0.00005,
};

export const GATES: Array<[string, string]> = [
  ["Σ beyond ±0.25", "MACD ×0.9 · RSI ×0.85 · Supertrend ×0.9"],
  ["ADX(14) above 25", "15–25 is fee-negative, so it stands aside"],
  ["MACD sign or RSI(21) cross", "momentum trigger"],
  ["Within 1.5×ATR of EMA26", "no chasing extended moves"],
  ["200-EMA side and slope agree", "never fade the primary trend"],
  ["Same side two bars running", "2-bar confirmation"],
  ["Macro, cooldown, 6/day cap", "risk rails"],
  ["Wallet has no open position", "checked on-chain before every open"],
];

export type GateResult = { ok: boolean | null; note?: string };
export interface Scenario {
  id: string;
  name: string;
  color: string; // hex, used for the chip dot
  side: Side | null;
  orphan?: boolean;
  sub: string;
  gates: GateResult[];
  px: number[];
  sig: Sig[];
  holdLabel?: Record<number, string>;
}

const allOk = (notes: Record<number, string>): GateResult[] => GATES.map((_, i) => ({ ok: true, note: notes[i] }));
const sigs = (s: string): Sig[] => s.split("").map(c => (c === "L" ? "LONG" : c === "S" ? "SHORT" : "HOLD"));

export const SCENARIOS: Scenario[] = [
  {
    id: "winner", name: "Scale-out and trail", color: "#10b981", side: "LONG",
    sub: "Price reaches +1.5×ATR, half is sold, the stop jumps to breakeven, and the runner trails the peak by 2×ATR until it is stopped out in profit.",
    gates: allOk({ 1: "ADX 34", 3: "0.8×ATR from EMA26" }),
    px: [118.0, 118.15, 118.05, 118.35, 118.6, 118.9, 119.2, 119.55, 119.8, 120.1, 120.5, 120.9, 121.3, 121.0, 120.6, 120.2, 119.9, 119.6, 119.25],
    sig: sigs("LLLLLLLLLLLLLLLLLLL"),
  },
  {
    id: "lapse", name: "Thesis lapse", color: "#0ea5e9", side: "LONG",
    sub: "The most common real exit. A HOLD at a small profit is ignored. Once the trade is past the +1.5% buffer, the next HOLD banks it before the scale-out level.",
    gates: allOk({ 1: "ADX 29", 3: "0.6×ATR from EMA26" }),
    px: [118.0, 118.1, 117.95, 118.2, 118.45, 118.7, 118.85],
    sig: sigs("LLLHLLH"),
    holdLabel: { 3: "Hold Chop Zone", 6: "Hold (extended: px 1.6×ATR from EMA26)" },
  },
  {
    id: "stop", name: "Stop loss", color: "#f43f5e", side: "LONG",
    sub: "The trend fails. HOLD signals while the trade is under water change nothing; the −1.5×ATR stop caps the loss.",
    gates: allOk({ 1: "ADX 27", 3: "1.1×ATR from EMA26" }),
    px: [118.0, 117.9, 118.1, 117.7, 117.4, 117.2, 116.9, 116.6, 116.45],
    sig: sigs("LLLHHHLHH"),
    holdLabel: { 3: "Hold (Σ below threshold)", 4: "Hold Chop Zone", 5: "Hold Chop Zone", 7: "Hold Chop Zone", 8: "Hold Chop Zone" },
  },
  {
    id: "time", name: "Time stop", color: "#f59e0b", side: "LONG",
    sub: "Price goes nowhere. After 600 minutes without a scale-out and under +0.5%, the trade is cut before borrow fees bleed it further.",
    gates: allOk({ 1: "ADX 26", 3: "0.4×ATR from EMA26" }),
    px: [118.0, 118.08, 117.95, 118.12, 118.05, 117.9, 117.98, 118.1, 118.15, 118.02, 117.88, 117.8, 117.92, 118.06, 118.14, 118.0, 117.86, 117.78, 117.9, 118.04, 118.12, 118.08, 117.96, 117.84, 117.8, 117.92, 118.02, 117.98, 117.88, 117.93, 117.9],
    sig: sigs("LLLLLHLLLLHHLLLLHHLLLLLHHLLLLHH"),
  },
  {
    id: "rev", name: "Reversal", color: "#8b5cf6", side: "LONG",
    sub: "The signal turns SHORT while the long is past the buffer. The long is banked, and a short may open on the same tick if it passes every gate.",
    gates: allOk({ 1: "ADX 31", 3: "0.7×ATR from EMA26" }),
    px: [118.0, 118.2, 118.5, 118.75, 118.65],
    sig: sigs("LLLLS"),
  },
  {
    id: "orphan", name: "Open that “failed”", color: "#d97706", side: "LONG", orphan: true,
    sub: "The open command reports an error, but the position landed on-chain. The daemon now checks the wallet and keeps managing it. Before, it forgot the position, which cost $1.50 across three trades in Aug–Sep.",
    gates: allOk({ 1: "ADX 30", 3: "0.9×ATR from EMA26" }),
    px: [118.0, 118.12, 118.3, 118.52, 118.66],
    sig: sigs("LLLLH"),
    holdLabel: { 4: "Hold (trend too weak: ADX 24 <= 25)" },
  },
  {
    id: "aside", name: "Stand aside", color: "#94a3b8", side: null,
    sub: "Σ says long, but ADX is 21: a weak trend where fees ate every tested entry variant. No trade. Most 20-minute cycles end like this.",
    gates: GATES.map((_, i) => (i === 0 ? { ok: true, note: "Σ +0.35" } : i === 1 ? { ok: false, note: "ADX 21 ≤ 25" } : { ok: null })),
    px: [118.0, 118.2, 118.05, 118.4, 118.3, 118.6, 118.45, 118.25, 118.5, 118.35],
    sig: sigs("LLHLLHLLHL"),
  },
];

export type LogTone = "trade" | "good" | "bad" | "warn" | "info";
export interface Frame {
  i: number;
  px: number;
  stop: number | null;
  pnl: number | null; // whole-trade leveraged %, banked partial included
  sig: Sig;
  partial: boolean;
  closed: boolean;
  log: Array<[LogTone, string]>;
}
export interface Run {
  frames: Frame[];
  closed: { i: number; total: number; reason: string; kind: "stop" | "trail" | "tp" | "thesis-lapse" | "reversal" | "time" } | null;
}

export const fmtPct = (n: number, d = 2) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(d);
export const tickLabel = (i: number) => {
  const m = i * PLAYBOOK.TICK_MIN;
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
};
export const levPct = (side: Side, entry: number, px: number) => (side === "LONG" ? px / entry - 1 : 1 - px / entry) * 100 * PLAYBOOK.LEV;

// Net $ for a position of `notional` USD after ~0.07%/leg fees and hourly borrow (matches on-chain fills).
export function netUsd(pnlPct: number, ticks: number, notional: number): number {
  const P = PLAYBOOK;
  const collateral = notional / P.LEV;
  const hours = (ticks * P.TICK_MIN) / 60;
  const costPct = (2 * P.FEE_SIDE + hours * P.BORROW_HR) * P.LEV * 100;
  return (collateral * (pnlPct - costPct)) / 100;
}

export function simulate(sc: Scenario): Run {
  const P = PLAYBOOK;
  const frames: Frame[] = [];
  let closed: Run["closed"] = null;
  const side = sc.side;
  const st = side
    ? { entry: P.ENTRY, peak: P.ENTRY, stop: side === "LONG" ? P.ENTRY - P.SL * P.ATR : P.ENTRY + P.SL * P.ATR, partial: false, banked: 0, rem: 1 }
    : null;

  for (let i = 0; i < sc.px.length; i++) {
    const px = sc.px[i];
    const sig = sc.sig[i];
    const log: Frame["log"] = [];

    if (i === 0) {
      if (!side) log.push(["warn", "STAND ASIDE: Σ +0.35 says LONG, but trend too weak for momentum entry (ADX 21 ≤ 25)."]);
      else if (sc.orphan) {
        log.push(["trade", `ENTER LONG @ $${px.toFixed(2)}: all gates pass.`]);
        log.push(["bad", "jup perps open → error: transaction confirmation timeout."]);
        log.push(["warn", `Checking wallet on-chain… LONG 0.26 SOL @ $${px.toFixed(2)} found.`]);
        log.push(["good", "OPEN reported failure but the position IS on-chain. Tracking it; TP/SL attached."]);
      } else {
        log.push(["trade", `ENTER LONG @ $${px.toFixed(2)}: Σ +0.35, all gates pass. Stop $${(P.ENTRY - P.SL * P.ATR).toFixed(2)}, scale-out $${(P.ENTRY + P.PARTIAL * P.ATR).toFixed(2)}.`]);
      }
      frames.push({ i, px, stop: st ? st.stop : null, pnl: st ? 0 : null, sig, partial: false, closed: false, log });
      continue;
    }

    if (!side || !st || closed) {
      if (!side && sig !== "HOLD" && i % 3 === 0) log.push(["info", "STAND ASIDE: ADX still ≤ 25."]);
      frames.push({ i, px, stop: null, pnl: null, sig, partial: false, closed: false, log });
      continue;
    }

    const long = side === "LONG";
    let reason: string | null = null;
    let kind: NonNullable<Run["closed"]>["kind"] | null = null;

    // 1. Price exits (evaluateExit order: stop → partial+breakeven → trail → TP cap).
    st.peak = long ? Math.max(st.peak, px) : Math.min(st.peak, px);
    if (long ? px <= st.stop : px >= st.stop) {
      const be = long ? st.stop >= st.entry : st.stop <= st.entry;
      kind = !st.partial ? "stop" : be ? "trail" : "stop";
      reason = kind === "trail" ? "Trailing Stop" : "Stop Loss";
    } else {
      if (!st.partial && (long ? px >= st.entry + P.PARTIAL * P.ATR : px <= st.entry - P.PARTIAL * P.ATR)) {
        const legPct = levPct(side, st.entry, px) * P.FRAC;
        st.partial = true;
        st.banked += legPct;
        st.rem -= P.FRAC;
        st.stop = long ? Math.max(st.stop, st.entry) : Math.min(st.stop, st.entry);
        log.push(["good", `SCALE-OUT 50% @ $${px.toFixed(2)} (+1.5×ATR), banked ${fmtPct(legPct)}%. Stop → breakeven $${st.entry.toFixed(2)}.`]);
      }
      if (st.partial) {
        const trail = long ? st.peak - P.TRAIL * P.ATR : st.peak + P.TRAIL * P.ATR;
        const ns = long ? Math.max(st.stop, trail) : Math.min(st.stop, trail);
        if (Math.abs(ns - st.stop) > 1e-9) {
          st.stop = ns;
          log.push(["info", `Trail ratchets the stop to $${ns.toFixed(2)} (peak $${st.peak.toFixed(2)} − 2×ATR).`]);
        }
      }
      if (long ? px >= st.entry + P.TP * P.ATR : px <= st.entry - P.TP * P.ATR) { reason = "Take Profit Cap"; kind = "tp"; }
    }

    const pnlNow = levPct(side, st.entry, px);
    const total = st.banked + st.rem * pnlNow;

    // 2. Signal exit (signalExitReason).
    if (!reason && sig !== side) {
      const label = (sc.holdLabel && sc.holdLabel[i]) || (sig === "SHORT" ? "Short Sell" : sig === "LONG" ? "Long Buy" : "Hold");
      if (pnlNow >= P.BUFFER) {
        kind = sig === "HOLD" ? "thesis-lapse" : "reversal";
        reason = kind === "thesis-lapse" ? `Thesis Lapse: signal no longer ${side} (${label})` : `Trend Reversal: signal flipped to ${sig}`;
      } else {
        log.push(["info", `Signal ${sig} (${label}) at ${fmtPct(pnlNow)}%: under the +1.5% buffer, so no signal exit. Stop governs.`]);
      }
    }

    // 3. Stagnation time-stop (pre-scale-out only).
    if (!reason && !st.partial && i * P.TICK_MIN >= P.STAG_MIN && pnlNow < P.STAG_PNL) {
      kind = "time";
      reason = `Time Stop: stagnant ${i * P.TICK_MIN} min (${fmtPct(pnlNow)}% < +0.5%)`;
    }

    if (reason && kind) {
      log.push([total >= 0 ? "good" : "bad", `CLOSE ${side} @ $${px.toFixed(2)}: ${reason}. Realized ${fmtPct(total)}%.`]);
      if (kind === "reversal") log.push(["trade", "Reversal re-entry: the opposite side is evaluated through the same gates on this tick."]);
      closed = { i, total, reason, kind };
    } else if (!log.length && i % 4 === 0) {
      log.push(["info", `HOLD ${side}, mark $${px.toFixed(2)}, ${fmtPct(total)}%. Thesis intact.`]);
    }
    frames.push({ i, px, stop: st.stop, pnl: total, sig, partial: st.partial, closed: !!reason, log });
  }
  return { frames, closed };
}
