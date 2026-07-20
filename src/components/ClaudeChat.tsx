import React, { useEffect, useRef, useState } from "react";
import { Send, Loader2, Sparkles, Wrench } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; input: any }>;
}

const SUGGESTED_PROMPTS = [
  "What's wrong with my last 5 losing trades?",
  "Is my current TP/SL sizing appropriate for the leverage I'm running?",
  "Why did the bot skip entries this week — check the audit log.",
  "Do SHORT trades underperform LONG trades in my history?",
];

export const ClaudeChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
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

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full p-6 gap-4">
      <div className="border-b border-border-dim/60 pb-3">
        <h2 className="text-xl font-serif italic text-text-heading flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-sol-purple" /> Strategy Assistant
        </h2>
        <p className="text-[11px] text-text-dim mt-1">
          Powered by Claude, with live access to your trade journal, strategy config, docs, and audit log.
        </p>
      </div>

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
              {m.content}
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
