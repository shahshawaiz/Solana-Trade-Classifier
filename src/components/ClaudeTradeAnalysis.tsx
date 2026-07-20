import React, { useEffect, useState } from "react";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";

// Shared between the grid and table Trade Journal views (mirrors TradeChart's placement) so a
// single "Analyze with Claude" entry point works from either layout without duplicating the
// fetch/render logic.
export const ClaudeTradeAnalysis: React.FC<{ trade: any }> = ({ trade }) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingHistory, setCheckingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Every analysis is persisted server-side (see /api/claude/history) — on mount, pull the most
  // recent one for this trade so a past recommendation is there again without re-running it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/claude/history?kind=trade&tradeId=${encodeURIComponent(trade.id)}&limit=1`);
        const json = await res.json();
        if (!cancelled && json.entries?.length) setAnalysis(json.entries[0].analysis);
      } catch (e) {
        // no persisted analysis yet — not an error, just show the "Analyze" button.
      } finally {
        if (!cancelled) setCheckingHistory(false);
      }
    })();
    return () => { cancelled = true; };
  }, [trade.id]);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/claude/analyze-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trade }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Analysis failed.");
      setAnalysis(json.analysis);
    } catch (e: any) {
      setError(e.message || "Analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingHistory) return null;

  return (
    <div className="mt-2 border-t border-border-dim/20 pt-2">
      {!analysis && !loading && (
        <button
          type="button"
          onClick={runAnalysis}
          className="w-full flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-sol-purple hover:text-sol-purple/80 cursor-pointer transition-colors"
        >
          <Sparkles className="w-3 h-3" /> Analyze with Claude
        </button>
      )}
      {loading && (
        <div className="flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-text-dim py-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Analyzing…
        </div>
      )}
      {error && (
        <div className="text-[10px] text-red-400 text-center py-1">{error}</div>
      )}
      {analysis && (
        <div className="mt-1 bg-bg-input/30 rounded-lg border border-border-dim/40 p-3 text-[10.5px] leading-relaxed text-text-body whitespace-pre-wrap font-sans">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-[8.5px] uppercase tracking-wider text-sol-purple font-bold">
              <Sparkles className="w-3 h-3" /> Claude Analysis
            </div>
            <button
              type="button"
              onClick={runAnalysis}
              disabled={loading}
              title="Re-run analysis"
              className="flex items-center gap-1 text-[8.5px] uppercase tracking-wider text-text-dim hover:text-text-heading cursor-pointer disabled:opacity-40"
            >
              <RefreshCw className="w-2.5 h-2.5" /> Re-analyze
            </button>
          </div>
          {analysis}
        </div>
      )}
    </div>
  );
};
