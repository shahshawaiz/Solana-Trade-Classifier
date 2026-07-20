import React from "react";
import { Sparkles } from "lucide-react";

// Shared between the grid and table Trade Journal views so a single "Analyze with Claude" entry
// point works from either layout. Opens the floating chat widget (bottom-right) seeded with this
// trade's context — the actual conversation lives there now, not inline in the trade card.
export const ClaudeTradeAnalysis: React.FC<{ trade: any; onAnalyze: (trade: any) => void }> = ({ trade, onAnalyze }) => {
  return (
    <div className="mt-2 border-t border-border-dim/20 pt-2">
      <button
        type="button"
        onClick={() => onAnalyze(trade)}
        className="w-full flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-sol-purple hover:text-sol-purple/80 cursor-pointer transition-colors border border-border-dim/40 rounded-lg py-1.5"
      >
        <Sparkles className="w-3 h-3" /> Analyze with Claude
      </button>
    </div>
  );
};
