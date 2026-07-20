import React, { useEffect, useState } from "react";
import { Sparkles, Loader2, History as HistoryIcon, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { ChatConversation } from "./ChatConversation";

interface HistoryEntry {
  id: string;
  createdAt: string;
  kind: "trade" | "performance" | "chat";
  label?: string;
  period?: string;
  trade?: { side?: string; token?: string; pnl?: number };
  transcript?: Array<{ role: "user" | "assistant"; content: string }>;
}

const SUGGESTED_PROMPTS = [
  "What's wrong with my last 5 losing trades, and how could each have been won?",
  "Is my current TP/SL sizing appropriate for the leverage I'm running?",
  "Why did the bot skip entries this week — check the audit log.",
  "Do SHORT trades underperform LONG trades in my history?",
];

const HistoryPanel: React.FC = () => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/claude/history?limit=100");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load history.");
        if (!cancelled) setEntries(json.entries || []);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="flex items-center gap-1.5 text-[11px] text-text-dim py-6 justify-center"><Loader2 className="w-3 h-3 animate-spin" /> Loading history…</div>;
  }
  if (error) return <div className="text-[11px] text-red-400 text-center py-6">{error}</div>;
  if (!entries.length) {
    return <div className="text-[11px] text-text-dim text-center py-6">Nothing saved yet — hit "Save to memory" at the bottom of a conversation to keep it here.</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 min-h-0">
      {entries.map((e) => {
        const isExpanded = expandedId === e.id;
        let dateStr = "";
        try { dateStr = format(new Date(e.createdAt), "MMM d, HH:mm"); } catch {}
        const pnl = e.trade?.pnl;
        return (
          <div key={e.id} className="border border-border-dim/40 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : e.id)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-bg-input/30 hover:bg-bg-input/50 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sol-purple/10 text-sol-purple border border-sol-purple/30 shrink-0">
                  {e.kind === "trade" ? "Trade" : e.kind === "performance" ? "Performance" : "Chat"}
                </span>
                <span className="text-[10.5px] text-text-heading font-mono truncate">{e.label || "Saved conversation"}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {typeof pnl === "number" && (
                  <span className={`text-[10px] font-bold font-mono ${pnl >= 0 ? "text-sol-green" : "text-red-400"}`}>
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
                  </span>
                )}
                <span className="text-[9px] text-text-dim font-mono">{dateStr}</span>
                {isExpanded ? <ChevronUp className="w-3 h-3 text-text-dim" /> : <ChevronDown className="w-3 h-3 text-text-dim" />}
              </div>
            </button>
            {isExpanded && (
              <div className="px-3 py-2.5 space-y-2 border-t border-border-dim/30">
                {(e.transcript || []).map((m, i) => (
                  <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[85%] bg-sol-purple/15 border border-sol-purple/30 rounded-lg px-2.5 py-1.5 text-[10.5px] text-text-heading whitespace-pre-wrap"
                          : "max-w-[85%] bg-bg-input/40 border border-border-dim/40 rounded-lg px-2.5 py-1.5 text-[10.5px] text-text-body whitespace-pre-wrap"
                      }
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const ClaudeChat: React.FC = () => {
  const [tab, setTab] = useState<"chat" | "history">("chat");

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full p-6 gap-4 min-h-0">
      <div className="border-b border-border-dim/60 pb-3 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-serif italic text-text-heading flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sol-purple" /> Strategy Assistant
          </h2>
          <p className="text-[11px] text-text-dim mt-1">
            Powered by Claude, with live access to your trade journal, strategy config, docs, and audit log.
          </p>
        </div>
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-bg-input border border-border-dim">
          <button
            type="button"
            onClick={() => setTab("chat")}
            className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider py-1 px-2.5 rounded cursor-pointer transition-colors ${tab === "chat" ? "bg-sol-purple/20 text-sol-purple" : "text-text-dim hover:text-text-heading"}`}
          >
            <Sparkles className="w-3 h-3" /> Chat
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider py-1 px-2.5 rounded cursor-pointer transition-colors ${tab === "history" ? "bg-sol-purple/20 text-sol-purple" : "text-text-dim hover:text-text-heading"}`}
          >
            <HistoryIcon className="w-3 h-3" /> History
          </button>
        </div>
      </div>

      {tab === "chat" ? (
        <ChatConversation suggestedPrompts={SUGGESTED_PROMPTS} saveMeta={{ kind: "chat" }} />
      ) : (
        <HistoryPanel />
      )}
    </div>
  );
};
