"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { LandingNav } from "@/components/shared/site-nav";
import { DEMO_NPC, getDemoSignupPath } from "@/lib/playground/demo-npc";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

interface MemoryEntry {
  id: string;
  content: string;
  memoryType: string;
  tags: string[];
  confidence: number;
  importance: number;
  createdAt: string;
  persisted: boolean;
}

interface ApiResponse {
  success: boolean;
  data?: {
    message: string;
    memory: MemoryEntry | null;
    session: {
      id: string;
      limit: number;
      remaining: number;
      resetAt: string;
      windowSeconds: number;
    };
  };
  error?: {
    code: string;
    message: string;
    retryAfterSeconds?: number;
    resetAt?: string;
  };
}

interface RateLimitState {
  message: string;
  retryAfterSeconds: number;
  resetAt?: string;
}

interface PlaygroundClientProps {
  dict: Dictionary;
  locale: Locale;
}

const STORAGE_KEY = "seizn_playground_session_id";

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "I am Archivist Vale. Give me one detail about your player, promise, fear, or last visit, and I will keep it on the scene ledger.",
  },
];

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return newId("session");
}

function getInitialMemories(): MemoryEntry[] {
  const now = new Date().toISOString();
  return DEMO_NPC.seedMemories.map((memory, index) => ({
    id: `seed_${index}`,
    content: memory.content,
    memoryType: memory.memoryType,
    tags: memory.tags,
    confidence: memory.confidence,
    importance: memory.importance,
    createdAt: now,
    persisted: true,
  }));
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "0s";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes <= 0) return `${remainder}s`;
  return `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
}

export function PlaygroundClient({ dict, locale }: PlaygroundClientProps) {
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [memories, setMemories] = useState<MemoryEntry[]>(() => getInitialMemories());
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitState | null>(null);
  const [sessionRemaining, setSessionRemaining] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const signupPath = useMemo(() => getDemoSignupPath(), []);
  const compareLabel = dict.extremeHome?.nav?.compare || "Integrations";
  const enterpriseLabel = dict.extremeHome?.nav?.enterprise || "For Studios";
  const navLabels = {
    docs: dict.nav.docs,
    pricing: dict.nav.pricing,
    compare: compareLabel,
    enterprise: enterpriseLabel,
    status: dict.footer.status,
    cta: "Fork this NPC",
  };
  const userMessageCount = messages.filter((message) => message.role === "user").length;

  function ensureSessionId(): string {
    if (sessionId) return sessionId;
    const next = createSessionId();
    window.localStorage.setItem(STORAGE_KEY, next);
    setSessionId(next);
    return next;
  }

  useEffect(() => {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) {
      setSessionId(existing);
      return;
    }

    const next = createSessionId();
    window.localStorage.setItem(STORAGE_KEY, next);
    setSessionId(next);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (!rateLimit) return;
    if (rateLimit.retryAfterSeconds <= 0) {
      setRateLimit(null);
      return;
    }

    const timer = window.setInterval(() => {
      setRateLimit((current) => {
        if (!current) return null;
        const nextSeconds = Math.max(0, current.retryAfterSeconds - 1);
        if (nextSeconds === 0) return null;
        return { ...current, retryAfterSeconds: nextSeconds };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [rateLimit]);

  async function sendMessage(value?: string) {
    const text = (value ?? input).trim();
    if (!text || isSending || rateLimit) return;

    setInput("");
    setNotice(null);
    setIsSending(true);
    const activeSessionId = ensureSessionId();

    const userMessage: ChatMessage = {
      id: newId("user"),
      role: "user",
      content: text,
    };
    const history = messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map(({ role, content }) => ({ role, content }));

    setMessages((current) => [...current, userMessage]);

    try {
      const response = await fetch("/api/playground/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-playground-session": activeSessionId,
        },
        body: JSON.stringify({
          sessionId: activeSessionId,
          message: text,
          history,
          memories: memories.map((memory) => memory.content).slice(-10),
        }),
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success || !payload.data) {
        const retryAfter = Number(response.headers.get("Retry-After") || payload.error?.retryAfterSeconds || 0);
        if (response.status === 429) {
          setRateLimit({
            message: payload.error?.message || "The public playground is cooling down.",
            retryAfterSeconds: Math.max(1, retryAfter || 60),
            resetAt: payload.error?.resetAt,
          });
        }
        setNotice(payload.error?.message || "The playground could not answer this turn.");
        return;
      }

      const data = payload.data;

      setMessages((current) => [
        ...current,
        {
          id: newId("assistant"),
          role: "assistant",
          content: data.message,
        },
      ]);

      if (data.memory) {
        const nextMemory = data.memory;
        setMemories((current) => [nextMemory, ...current].slice(0, 12));
      }
      setSessionRemaining(data.session.remaining);
    } catch {
      setNotice("The playground could not reach the live memory route.");
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  return (
    <main className="dark min-h-screen bg-szn-bg text-szn-text-1">
      <LandingNav locale={locale} labels={navLabels} ctaHref={signupPath} ctaLabel="Fork this NPC" />

      <section className="mx-auto grid max-w-7xl gap-0 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)] lg:px-8">
        <div className="min-h-[calc(100vh-7.5rem)] overflow-hidden rounded-xl border border-szn-border-subtle bg-szn-surface-1 lg:rounded-r-none lg:border-r-0">
          <div className="border-b border-szn-border-subtle px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="szn-section-number">
                  Playground / Live NPC
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-szn-signal">
                  Live NPC Playground
                </p>
                <h1 className="szn-serif mt-2 text-3xl font-semibold tracking-normal text-szn-text-1 sm:text-4xl">
                  {DEMO_NPC.name}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-szn-text-2">
                  {DEMO_NPC.title}. Real turns flow through the public chat route, rate limits, and demo memory ledger.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-szn-border-subtle bg-szn-surface-2 px-3 py-2 text-xs text-szn-text-2">
                <Zap className="h-4 w-4 text-szn-signal" aria-hidden="true" />
                {sessionRemaining == null ? "10 turns per session" : `${sessionRemaining} turns left`}
              </div>
            </div>
          </div>

          <div className="flex h-[calc(100vh-17rem)] min-h-[430px] flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[86%] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm ${
                        message.role === "user"
                          ? "bg-szn-signal-soft text-szn-text-1"
                          : "border border-szn-border-subtle bg-szn-surface-1 text-szn-text-1"
                      }`}
                    >
                      <p className="break-words">{message.content}</p>
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-lg border border-szn-border-subtle bg-szn-surface-1 px-4 py-3 text-sm text-szn-text-2">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Vale is indexing the turn
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="border-t border-szn-border-subtle bg-szn-bg p-4 sm:p-5">
              {userMessageCount === 0 && (
                <div className="mb-4 grid gap-2 sm:grid-cols-3">
                  {DEMO_NPC.examplePrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendMessage(prompt)}
                      disabled={isSending || Boolean(rateLimit)}
                      className="min-h-20 rounded-md border border-szn-border-subtle bg-szn-surface-1 p-3 text-left text-xs leading-5 text-szn-text-2 transition-colors hover:border-szn-signal-line hover:bg-szn-signal-soft disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {notice && (
                <div className="mb-3 rounded-md border border-szn-border-subtle bg-szn-surface-1 px-3 py-2 text-sm text-szn-text-1">
                  {notice}
                  {rateLimit && (
                    <span className="ml-1 font-mono text-xs text-szn-signal">
                      {formatCountdown(rateLimit.retryAfterSeconds)}
                    </span>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Tell Vale something the next scene should remember"
                  rows={2}
                  maxLength={1000}
                  disabled={isSending || Boolean(rateLimit)}
                  className="min-h-12 flex-1 resize-none rounded-md border border-szn-border-subtle bg-szn-surface-1 px-3 py-3 text-sm text-szn-text-1 outline-none transition-colors placeholder:text-szn-text-3 focus:border-szn-signal-line disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isSending || Boolean(rateLimit)}
                  className="szn-btn-glass h-12 w-12 shrink-0 !p-0 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Send message"
                >
                  {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              </form>
            </div>
          </div>
        </div>

        <aside className="min-h-[calc(100vh-7.5rem)] overflow-hidden rounded-xl border border-szn-border-subtle bg-szn-surface-1 lg:rounded-l-none">
          <div className="border-b border-szn-border-subtle px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-szn-signal-soft text-szn-signal">
                <Brain className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-normal">Memory stream</h2>
                <p className="text-xs text-szn-text-3">Live entries appear at the top.</p>
              </div>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            <section className="rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-szn-text-1">
                <Sparkles className="h-4 w-4 text-szn-signal" aria-hidden="true" />
                Scene state
              </div>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-szn-text-3">NPC</dt>
                  <dd className="mt-1 font-medium text-szn-text-2">{DEMO_NPC.id}</dd>
                </div>
                <div>
                  <dt className="text-szn-text-3">Namespace</dt>
                  <dd className="mt-1 font-medium text-szn-text-2">{DEMO_NPC.namespace}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-szn-text-1">
                <ShieldCheck className="h-4 w-4 text-szn-signal" aria-hidden="true" />
                Canon locks
              </div>
              <div className="space-y-3">
                {DEMO_NPC.canonLocks.map((lock) => (
                  <div key={lock.id} className="rounded-md border border-szn-border-subtle bg-szn-surface-2 p-3">
                    <p className="text-xs font-mono uppercase tracking-[0.14em] text-szn-signal">{lock.id}</p>
                    <p className="mt-2 text-xs leading-5 text-szn-text-2">{lock.statement}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="space-y-3">
                {memories.map((memory) => (
                  <article key={memory.id} className="rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-sm bg-szn-signal-soft px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-szn-signal">
                        {memory.memoryType}
                      </span>
                      <span className="text-[11px] text-szn-text-3">
                        {memory.persisted ? "stored" : "live buffer"}
                      </span>
                    </div>
                    <p className="break-words text-sm leading-6 text-szn-text-1">{memory.content}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {memory.tags.map((tag) => (
                        <span key={`${memory.id}-${tag}`} className="rounded-sm border border-szn-border-subtle px-2 py-1 text-[11px] text-szn-text-3">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </aside>
      </section>
    </main>
  );
}
