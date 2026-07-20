import React, { useEffect, useRef, useState } from "react";
import { Send, Loader2, Sparkles, Wrench, History as HistoryIcon, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  displayContent?: string; // shown in the bubble instead of `content` — used to hide the raw JSON context sent for a seeded trade behind a short human-readable line.
  toolCalls?: Array<{ name: string; input: any }>;
}

interface HistoryEntry {
  id: string;
  createdAt: string;
  kind: "trade" | "performance";
  label?: string;
  period?: string;
  trade?: { side?: string; token?: string; pnl?: number };
  analysis: string;
}

const SUGGESTED_PROMPTS = [
  "What's wrong with my last 5 losing trades, and how could each have been won?",
  "Is my current TP/SL sizing appropriate for the leverage I'm running?",
  "Why did the bot skip entries this week — check the audit log.",
  "Do SHORT trades underperform LONG trades in my history?",
];

const ChatPanel: React.FC<{ seedTrade?: any | null; onSeedConsumed?: () => void }> = ({ seedTrade, onSeedConsumed }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSeedIdRef = useRef<string | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // display is what renders in the bubble; payload (defaults to display) is what's actually sent
  // to Claude — lets a seeded trade show a short human line while Claude still gets the full JSON.
  const send = async (display: string, payload?: string) => {
    const displayText = display.trim();
    if (!displayText || sending) return;
    const payloadText = (payload ?? display).trim();
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: payloadText, displayContent: displayText }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/claude/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Chat request failed.");
      setMessages([...nextMessages, { role: "assistant", content: json.reply, toolCalls: json.toolCalls }]);
    } catch (e: any) {
      setError(e.message || "Chat request failed.");
    } finally {
      setSending(false);
    }
  };

  // A trade clicked via "Discuss with Assistant" seeds the conversation automatically — the user
  // shouldn't have to re-describe context the app already has.
  useEffect(() => {
    if (!seedTrade || !seedTrade.id || lastSeedIdRef.current === seedTrade.id) return;
    lastSeedIdRef.current = seedTrade.id;
    const label = `${seedTrade.side || ""} ${seedTrade.token || ""} ${typeof seedTrade.pnl === "number" ? (seedTrade.pnl >= 0 ? "+" : "") + seedTrade.pnl.toFixed(2) + "%" : ""}`.trim();
    let whenStr = "";
    try { whenStr = format(new Date(seedTrade.exitTime || seedTrade.entryTime), "MMM d, HH:mm"); } catch {}
    const display = `Let's discuss this trade: ${label}${whenStr ? ` (${whenStr})` : ""}`;
    const isLoss = typeof seedTrade.pnl === "number" && seedTrade.pnl < 0;
    const payload = `I want to discuss this specific trade from my journal. ${
      isLoss
        ? "It lost — tell me the smallest concrete change that would have won it or cut the loss, without touching what's working elsewhere in the strategy."
        : "It won — tell me what specifically worked, and flag anything that was actually a close call worth a second look."
    }\n\nTrade data (JSON):\n${JSON.stringify(seedTrade, null, 2)}`;
    send(display, payload);
    // Consumed once — clears the parent's seed so a later, unrelated visit to this tab (e.g. via
    // the nav bar) doesn't silently re-fire the same trade context into a fresh mount.
    onSeedConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedTrade]);

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4">
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-2 pt-4">
            <div className="text-[11px] text-text-dim uppercase tracking-wider font-bold">Try asking</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send(p)}
                  className="text-left text-[11px] text-text-body bg-bg-input/40 hover:bg-bg-input/70 border border-border-dim/40 rounded-lg px-3 py-2 transition-colors cursor-pointer"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] bg-sol-purple/15 border border-sol-purple/30 rounded-lg px-3 py-2 text-[12px] text-text-heading whitespace-pre-wrap"
                  : "max-w-[85%] bg-bg-input/40 border border-border-dim/40 rounded-lg px-3 py-2 text-[12px] text-text-body whitespace-pre-wrap"
              }
            >
              {m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {m.toolCalls.map((tc, idx) => (
                    <span
                      key={idx}
                      className="flex items-center gap-1 text-[8px] uppercase tracking-wider font-bold text-sol-purple bg-sol-purple/10 border border-sol-purple/30 rounded px-1.5 py-0.5"
                    >
                      <Wrench className="w-2.5 h-2.5" /> {tc.name.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
              {m.displayContent ?? m.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex items-center gap-1.5 text-[11px] text-text-dim">
            <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
          </div>
        )}
        {error && <div className="text-[11px] text-red-400">{error}</div>}
      </div>

      <div className="flex items-end gap-2 border-t border-border-dim/60 pt-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask about your trades, strategy config, or a specific issue…"
          rows={2}
          className="flex-1 resize-none bg-bg-input/40 border border-border-dim rounded-lg px-3 py-2 text-[12px] text-text-heading placeholder:text-text-dim focus:outline-none focus:border-sol-purple/60"
        />
        <button
          type="button"
          onClick={() => send(input)}
          disabled={sending || !input.trim()}
          className="flex items-center justify-center gap-1.5 h-full px-4 py-2 rounded-lg bg-sol-purple text-white text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sol-purple/90 transition-colors cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" /> Send
        </button>
      </div>
    </div>
  );
};

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
    return <div className="text-[11px] text-text-dim text-center py-6">No recommendations yet — run an analysis from a trade or the Journal Stats panel.</div>;
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
                  {e.kind === "trade" ? "Trade" : "Performance"}
                </span>
                <span className="text-[10.5px] text-text-heading font-mono truncate">{e.label || "Analysis"}</span>
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
              <div className="px-3 py-2.5 text-[10.5px] leading-relaxed text-text-body whitespace-pre-wrap font-sans border-t border-border-dim/30">
                {e.analysis}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const ClaudeChat: React.FC<{ seedTrade?: any | null; onSeedConsumed?: () => void }> = ({ seedTrade, onSeedConsumed }) => {
  const [tab, setTab] = useState<"chat" | "history">("chat");

  // A seeded trade should always land on the live chat, even if the user was browsing History.
  useEffect(() => {
    if (seedTrade) setTab("chat");
  }, [seedTrade]);

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

      {tab === "chat" ? <ChatPanel seedTrade={seedTrade} onSeedConsumed={onSeedConsumed} /> : <HistoryPanel />}
    </div>
  );
};
