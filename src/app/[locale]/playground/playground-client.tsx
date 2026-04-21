"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  GitFork,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { DEMO_NPC, getDemoSignupPath } from "@/lib/playground/demo-npc";
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

export function PlaygroundClient({ locale }: PlaygroundClientProps) {
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
  const userMessageCount = messages.filter((message) => message.role === "user").length;
  const homePath = `/${locale}`;

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
    <main className="min-h-screen bg-[#07111e] text-white">
      <header className="border-b border-white/10 bg-[#07111e]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href={homePath} className="flex items-center gap-2 text-sm text-slate-300 transition-colors hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <Image src="/seizn-icon.svg" alt="Seizn" width={26} height={26} className="h-6 w-6" unoptimized />
            <span className="font-medium">Seizn</span>
          </Link>
          <Link
            href={signupPath}
            className="inline-flex items-center gap-2 rounded-md bg-[#63f2b5] px-3 py-2 text-sm font-semibold text-[#04110b] transition-colors hover:bg-[#82f6c5]"
          >
            <GitFork className="h-4 w-4" aria-hidden="true" />
            Fork this NPC
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-0 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)] lg:px-8">
        <div className="min-h-[calc(100vh-7.5rem)] border border-white/10 bg-[#0b1625] lg:border-r-0">
          <div className="border-b border-white/10 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#63f2b5]">
                  Live NPC Playground
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                  {DEMO_NPC.name}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  {DEMO_NPC.title}. Real turns flow through the public chat route, rate limits, and demo memory ledger.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
                <Zap className="h-4 w-4 text-[#63f2b5]" aria-hidden="true" />
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
                          ? "bg-[#63f2b5] text-[#06120d]"
                          : "border border-white/10 bg-white/[0.05] text-slate-100"
                      }`}
                    >
                      <p className="break-words">{message.content}</p>
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-slate-300">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Vale is indexing the turn
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="border-t border-white/10 bg-[#07111e] p-4 sm:p-5">
              {userMessageCount === 0 && (
                <div className="mb-4 grid gap-2 sm:grid-cols-3">
                  {DEMO_NPC.examplePrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendMessage(prompt)}
                      disabled={isSending || Boolean(rateLimit)}
                      className="min-h-20 rounded-md border border-white/10 bg-white/[0.04] p-3 text-left text-xs leading-5 text-slate-200 transition-colors hover:border-[#63f2b5]/70 hover:bg-[#63f2b5]/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {notice && (
                <div className="mb-3 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                  {notice}
                  {rateLimit && (
                    <span className="ml-1 font-mono text-xs text-amber-200">
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
                  className="min-h-12 flex-1 resize-none rounded-md border border-white/10 bg-white/[0.06] px-3 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-[#63f2b5]/70 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isSending || Boolean(rateLimit)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#63f2b5] text-[#04110b] transition-colors hover:bg-[#82f6c5] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Send message"
                >
                  {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              </form>
            </div>
          </div>
        </div>

        <aside className="min-h-[calc(100vh-7.5rem)] border border-white/10 bg-[#0a1422]">
          <div className="border-b border-white/10 px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#63f2b5]/12 text-[#63f2b5]">
                <Brain className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-normal">Memory stream</h2>
                <p className="text-xs text-slate-400">Live entries appear at the top.</p>
              </div>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                <Sparkles className="h-4 w-4 text-[#63f2b5]" aria-hidden="true" />
                Scene state
              </div>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-slate-500">NPC</dt>
                  <dd className="mt-1 font-medium text-slate-200">{DEMO_NPC.id}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Namespace</dt>
                  <dd className="mt-1 font-medium text-slate-200">{DEMO_NPC.namespace}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                <ShieldCheck className="h-4 w-4 text-[#63f2b5]" aria-hidden="true" />
                Canon locks
              </div>
              <div className="space-y-3">
                {DEMO_NPC.canonLocks.map((lock) => (
                  <div key={lock.id} className="rounded-md border border-white/10 bg-black/20 p-3">
                    <p className="text-xs font-mono uppercase tracking-[0.14em] text-[#63f2b5]">{lock.id}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-300">{lock.statement}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="space-y-3">
                {memories.map((memory) => (
                  <article key={memory.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-sm bg-[#63f2b5]/12 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#63f2b5]">
                        {memory.memoryType}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {memory.persisted ? "stored" : "live buffer"}
                      </span>
                    </div>
                    <p className="break-words text-sm leading-6 text-slate-100">{memory.content}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {memory.tags.map((tag) => (
                        <span key={`${memory.id}-${tag}`} className="rounded-sm border border-white/10 px-2 py-1 text-[11px] text-slate-400">
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
