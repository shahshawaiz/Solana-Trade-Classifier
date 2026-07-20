import React, { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { format } from "date-fns";
import { ChatConversation, ChatConversationSeed, ChatConversationSaveMeta } from "./ChatConversation";

export type FloatingChatSeed =
  | { kind: "trade"; trade: any }
  | { kind: "performance"; trades: any[]; stats: any; period: string };

interface Built {
  title: string;
  chatSeed: ChatConversationSeed;
  saveMeta: ChatConversationSaveMeta;
}

function buildFromSeed(seed: FloatingChatSeed): Built {
  if (seed.kind === "trade") {
    const t = seed.trade;
    const label = `${t.side || ""} ${t.token || ""} ${typeof t.pnl === "number" ? (t.pnl >= 0 ? "+" : "") + t.pnl.toFixed(2) + "%" : ""}`.trim();
    let whenStr = "";
    try { whenStr = format(new Date(t.exitTime || t.entryTime), "MMM d, HH:mm"); } catch {}
    const isLoss = typeof t.pnl === "number" && t.pnl < 0;
    return {
      title: `Trade: ${label}`,
      chatSeed: {
        id: `trade:${t.id}:${Date.now()}`,
        display: `Let's discuss this trade: ${label}${whenStr ? ` (${whenStr})` : ""}`,
        payload: `I want to discuss this specific trade from my journal. ${
          isLoss
            ? "It lost — tell me the smallest concrete change that would have won it or cut the loss, without touching what's working elsewhere in the strategy."
            : "It won — tell me what specifically worked, and flag anything that was actually a close call worth a second look."
        }\n\nTrade data (JSON):\n${JSON.stringify(t, null, 2)}`,
      },
      saveMeta: { kind: "trade", label, trade: t },
    };
  }

  const { trades, stats, period } = seed;
  // Trim to what actually informs a pattern-level critique — full news/version metadata per
  // trade would just burn tokens without changing the analysis.
  const trimmed = trades.slice(0, 100).map((t: any) => ({
    side: t.side, pnl: t.pnl, entryPrice: t.entryPrice, exitPrice: t.exitPrice,
    takeProfitPct: t.takeProfitPct, stopLossPct: t.stopLossPct, leverage: t.leverage,
    durationMins: t.durationMins, entryReason: t.entryReason, closeReason: t.closeReason,
    entryMarket: t.entryMarket, sentiment: t.sentiment, technicalScore: t.technicalScore,
    entryTime: t.entryTime, exitTime: t.exitTime,
  }));
  const label = `${period} · ${trades.length} trade${trades.length === 1 ? "" : "s"}${typeof stats?.totalPnL === "number" ? ` · ${stats.totalPnL >= 0 ? "+" : ""}${stats.totalPnL.toFixed(2)}%` : ""}`;
  return {
    title: `Performance: ${label}`,
    chatSeed: {
      id: `performance:${period}:${Date.now()}`,
      display: `Let's analyze recent performance: ${label}`,
      payload: `Analyze the following batch of closed trades (period: ${period}) from my automated Solana perps \
strategy. Look for patterns across trades: recurring losing setups, TP/SL sizing issues, time-of-day or duration \
effects, sides that underperform, entries whose stated reasoning doesn't match the outcome. For the recurring loss \
patterns you find, recommend the smallest concrete adjustment that would flip them to wins WITHOUT loosening the \
core gates responsible for the winning trades (the strategy is validated in aggregate — the goal is fixing specific \
leaks, not redesigning it). Be specific and cite actual trades/numbers. End with the 2-3 most actionable \
recommendations, ranked.\n\nAggregate stats (JSON): ${JSON.stringify(stats)}\n\nTrades (JSON): ${JSON.stringify(trimmed)}`,
    },
    saveMeta: { kind: "performance", label, period, stats },
  };
}

interface FloatingChatWidgetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seed: FloatingChatSeed | null;
  onSeedConsumed: () => void;
}

// Bottom-right popup so "Analyze with Claude" (on a trade or the Journal Stats panel) opens a
// live conversation without leaving whatever tab the user was on. Stays mounted (just visually
// hidden) once opened once, so minimizing it doesn't lose the conversation, and the header/title
// stick to the last analysis even after the parent clears its `seed` prop post-consumption.
export const FloatingChatWidget: React.FC<FloatingChatWidgetProps> = ({ open, onOpenChange, seed, onSeedConsumed }) => {
  const [hasEverOpened, setHasEverOpened] = useState(false);
  const [built, setBuilt] = useState<Built | null>(null);
  const lastSeedRef = useRef<FloatingChatSeed | null>(null);

  useEffect(() => {
    if (open) setHasEverOpened(true);
  }, [open]);

  useEffect(() => {
    if (!seed || seed === lastSeedRef.current) return;
    lastSeedRef.current = seed;
    setBuilt(buildFromSeed(seed));
  }, [seed]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      {hasEverOpened && (
        <div
          className={`${open ? "flex" : "hidden"} w-[380px] max-w-[92vw] h-[520px] max-h-[75vh] bg-bg-card border border-border-dim rounded-xl shadow-2xl flex-col overflow-hidden`}
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border-dim/60 bg-bg-input/30 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-sol-purple shrink-0" />
              <span className="text-[11px] font-bold text-text-heading truncate" title={built?.title}>
                {built?.title || "Strategy Assistant"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-text-dim hover:text-text-heading cursor-pointer shrink-0"
              title="Minimize"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 p-3">
            <ChatConversation
              compact
              seed={built?.chatSeed}
              onSeedConsumed={onSeedConsumed}
              saveMeta={built?.saveMeta}
              emptyHint="Ask about your trades, strategy config, or a specific issue."
            />
          </div>
        </div>
      )}
      {hasEverOpened && !open && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          title="Reopen Strategy Assistant"
          className="w-12 h-12 rounded-full bg-sol-purple text-white shadow-2xl flex items-center justify-center hover:bg-sol-purple/90 transition-colors cursor-pointer"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
