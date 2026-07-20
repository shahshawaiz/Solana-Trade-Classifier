import React, { useEffect, useRef, useState } from "react";
import { Send, Loader2, Wrench, BookmarkPlus, Check } from "lucide-react";

export interface ChatConversationMessage {
  role: "user" | "assistant";
  content: string;
  displayContent?: string; // shown in the bubble instead of `content` — hides raw JSON seed context behind a short human-readable line.
  toolCalls?: Array<{ name: string; input: any }>;
}

export interface ChatConversationSeed {
  display: string; // what shows in the chat bubble
  payload: string; // what's actually sent to Claude (may include full JSON context)
  id: string; // change this to re-trigger seeding (e.g. a trade id or a timestamp)
}

export interface ChatConversationSaveMeta {
  kind: string;
  label?: string;
  trade?: any;
  period?: string;
  stats?: any;
}

interface ChatConversationProps {
  seed?: ChatConversationSeed | null;
  onSeedConsumed?: () => void;
  saveMeta?: ChatConversationSaveMeta;
  suggestedPrompts?: string[];
  emptyHint?: string;
  compact?: boolean; // smaller text/spacing for the floating widget
}

// Shared by the full-page Assistant tab and the floating widget so both surfaces (general chat,
// and a trade/performance analysis seeded from the Journal) run through one conversation +
// save-to-memory implementation instead of drifting apart.
export const ChatConversation: React.FC<ChatConversationProps> = ({ seed, onSeedConsumed, saveMeta, suggestedPrompts, emptyHint, compact }) => {
  const [messages, setMessages] = useState<ChatConversationMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSeedIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatConversationMessage[]>([]);
  messagesRef.current = messages;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (display: string, payload?: string) => {
    const displayText = display.trim();
    if (!displayText || sending) return;
    const payloadText = (payload ?? display).trim();
    const nextMessages: ChatConversationMessage[] = [...messagesRef.current, { role: "user", content: payloadText, displayContent: displayText }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);
    setSaveState("idle");
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

  // A seed (trade/performance context, or a re-opened analysis) auto-sends on arrival.
  useEffect(() => {
    if (!seed || lastSeedIdRef.current === seed.id) return;
    lastSeedIdRef.current = seed.id;
    send(seed.display, seed.payload);
    onSeedConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const saveToMemory = async () => {
    if (!messages.length || saveState === "saving") return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/claude/save-to-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: saveMeta?.kind || "chat",
          label: saveMeta?.label,
          trade: saveMeta?.trade,
          period: saveMeta?.period,
          stats: saveMeta?.stats,
          transcript: messages.map((m) => ({ role: m.role, content: m.displayContent ?? m.content })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed.");
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2500);
    } catch (e) {
      setSaveState("error");
    }
  };

  const textSize = compact ? "text-[11px]" : "text-[12px]";

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3">
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-2 pt-2">
            {emptyHint && <div className="text-[11px] text-text-dim">{emptyHint}</div>}
            {suggestedPrompts && suggestedPrompts.length > 0 && (
              <>
                <div className="text-[10px] text-text-dim uppercase tracking-wider font-bold">Try asking</div>
                <div className={compact ? "flex flex-col gap-1.5" : "grid grid-cols-1 sm:grid-cols-2 gap-2"}>
                  {suggestedPrompts.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => send(p)}
                      className="text-left text-[10.5px] text-text-body bg-bg-input/40 hover:bg-bg-input/70 border border-border-dim/40 rounded-lg px-2.5 py-2 transition-colors cursor-pointer"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? `max-w-[85%] bg-sol-purple/15 border border-sol-purple/30 rounded-lg px-3 py-2 ${textSize} text-text-heading whitespace-pre-wrap`
                  : `max-w-[85%] bg-bg-input/40 border border-border-dim/40 rounded-lg px-3 py-2 ${textSize} text-text-body whitespace-pre-wrap`
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

      <div className="flex items-center justify-between gap-2 border-t border-border-dim/60 pt-2.5">
        <button
          type="button"
          onClick={saveToMemory}
          disabled={!messages.length || saveState === "saving"}
          title="Persist this conversation to Assistant > History (journal memory)"
          className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-text-dim hover:text-text-heading cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {saveState === "saving" ? (
            <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
          ) : saveState === "saved" ? (
            <><Check className="w-3 h-3 text-sol-green" /> Saved to memory</>
          ) : (
            <><BookmarkPlus className="w-3 h-3" /> Save to memory</>
          )}
        </button>
        {saveState === "error" && <span className="text-[9px] text-red-400">Save failed</span>}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask a follow-up…"
          rows={compact ? 1 : 2}
          className="flex-1 resize-none bg-bg-input/40 border border-border-dim rounded-lg px-3 py-2 text-[12px] text-text-heading placeholder:text-text-dim focus:outline-none focus:border-sol-purple/60"
        />
        <button
          type="button"
          onClick={() => send(input)}
          disabled={sending || !input.trim()}
          className="flex items-center justify-center gap-1.5 h-full px-3 py-2 rounded-lg bg-sol-purple text-white text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sol-purple/90 transition-colors cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
