"use client";

import { useEffect, useRef, useState } from "react";

type DayKey = "d1" | "d3" | "d14";
type Day = 1 | 3 | 14;

type Write = {
  entity: string;
  event: string;
  ctx: Record<string, unknown>;
  season: "Spring" | "Summer" | "Fall" | "Winter";
};

type Turn = {
  player: string;
  vale: string;
  writes: Write[];
  highlight?: boolean;
};

const VALE_SCRIPT: Record<DayKey, Turn[]> = {
  d1: [
    {
      player: "Hello, I'm looking for books on cryptography.",
      vale: "Welcome. Cryptography — a broad field. We hold the Friedman lectures, Kahn's Codebreakers, and the Singh primer. Are you drawn to history, or to the mathematics?",
      writes: [
        { entity: "npc:vale", event: "met_player", ctx: { player_id: "p1", topic: "cryptography", mood: "curious" }, season: "Spring" },
        { entity: "player:p1", event: "interest_recorded", ctx: { topic: "cryptography" }, season: "Spring" },
      ],
    },
    {
      player: "What about ancient ciphers specifically?",
      vale: "Then you'll want the Voynich folios — we keep facsimiles in the east stacks. Also the Beale ciphers, and a fine edition of Trithemius. Shall I set them aside?",
      writes: [
        { entity: "player:p1", event: "interest_refined", ctx: { topic: "ancient_ciphers", artifacts: ["voynich", "beale", "trithemius"] }, season: "Spring" },
        { entity: "npc:vale", event: "offered_reservation", ctx: { player_id: "p1" }, season: "Spring" },
      ],
    },
  ],
  d3: [
    {
      player: "Do you have anything by Mary Beard?",
      vale: "Several — SPQR, of course, and the Twelve Caesars. A small departure from our last conversation. Is your interest shifting toward Rome?",
      writes: [
        { entity: "player:p1", event: "interest_added", ctx: { topic: "roman_history", author: "mary_beard" }, season: "Summer" },
        { entity: "npc:vale", event: "noted_topic_shift", ctx: { from: "ancient_ciphers", to: "roman_history" }, season: "Summer" },
      ],
    },
  ],
  d14: [
    {
      player: "I'm back.",
      vale: "You came back. Last time you asked about the Voynich Manuscript — did you find what you were looking for?",
      writes: [
        { entity: "npc:vale", event: "recognized_returning_player", ctx: { player_id: "p1", absence_days: 13 }, season: "Winter" },
        { entity: "npc:vale", event: "recall", ctx: { about: "p1.last_topic", value: "voynich_manuscript", salience: 0.82 }, season: "Winter" },
      ],
      highlight: true,
    },
    {
      player: "Any new arrivals on cryptography?",
      vale: "Two. A reprint of Friedman's lectures arrived Tuesday, and a curious monograph on the Beale papers — which I recall you took an interest in. Shelf 14, if you'd like to see them.",
      writes: [
        { entity: "npc:vale", event: "personalized_recommendation", ctx: { based_on: ["cryptography", "beale_ciphers"], items: ["friedman_lectures", "beale_monograph"] }, season: "Winter" },
      ],
    },
  ],
};

type Message =
  | { id: string; who: "player" | "vale"; text: string; day: string; highlight?: boolean }
  | { id: string; who: "system"; text: string; day: string };

type MemoryEntry = Write & { id: string; day: string };

const SEASON_COLOR: Record<Write["season"], string> = {
  Spring: "var(--engine-spring)",
  Summer: "var(--engine-summer)",
  Fall: "var(--engine-fall)",
  Winter: "var(--engine-winter)",
};

let cursor = 0;
const nextId = () => `pg-${Date.now().toString(36)}-${(cursor++).toString(36)}`;

export function Playground({ accent = "violet" }: { accent?: "violet" | "cyan" }) {
  const [day, setDay] = useState<Day>(1);
  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [thinking, setThinking] = useState(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const accentColor = accent === "cyan" ? "var(--engine-cyan)" : "var(--engine-violet)";
  const dayKey: DayKey = day === 1 ? "d1" : day === 3 ? "d3" : "d14";
  const currentScript = VALE_SCRIPT[dayKey];
  const isDone = step >= currentScript.length;

  const reset = () => {
    setDay(1);
    setStep(0);
    setMessages([]);
    setMemories([]);
  };

  const advance = () => {
    if (thinking || isDone) return;
    const turn = currentScript[step];
    const dayLabel = `Day ${day}`;
    const playerId = nextId();
    setMessages((m) => [...m, { id: playerId, who: "player", text: turn.player, day: dayLabel }]);
    setThinking(true);
    setStep((s) => s + 1);
    window.setTimeout(() => {
      const valeId = nextId();
      setMessages((m) => [...m, { id: valeId, who: "vale", text: turn.vale, day: dayLabel, highlight: turn.highlight }]);
      turn.writes.forEach((w, i) => {
        window.setTimeout(() => {
          setMemories((mem) => [{ ...w, id: nextId(), day: dayLabel }, ...mem]);
        }, 280 + i * 220);
      });
      setThinking(false);
    }, 720);
  };

  const jumpTo = (targetDay: Day) => {
    if (targetDay === day) return;
    const delta = targetDay - day;
    setMessages((m) => [
      ...m,
      {
        id: nextId(),
        who: "system",
        text: `${delta > 0 ? `+${delta}d` : `${delta}d`} time elapsed · NPC offline · memory consolidating`,
        day: `Day ${targetDay}`,
      },
    ]);
    setDay(targetDay);
    setStep(0);
  };

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  return (
    <div
      className="engine-playground-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "1.1fr 1fr",
        gap: 0,
        background: "var(--engine-bg-card)",
        border: "1px solid var(--engine-line)",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 30px 80px -40px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.05) inset",
      }}
    >
      {/* LEFT — chat */}
      <div className="engine-playground-chat" style={{ display: "flex", flexDirection: "column", borderRight: "1px solid var(--engine-line)", minHeight: 560 }}>
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--engine-line)",
            background: "rgba(255,255,255,0.015)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 99,
                background: `linear-gradient(135deg, ${accentColor}, var(--engine-cyan))`,
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              V
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--engine-text-strong)", fontWeight: 500 }}>Archivist Vale</div>
              <div className="engine-mono" style={{ fontSize: 10.5, color: "var(--engine-text-dim)", letterSpacing: "0.06em" }}>
                npc:vale · libran-st-9
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--engine-live)", boxShadow: "0 0 8px var(--engine-live)" }} />
            <span className="engine-mono" style={{ fontSize: 11, color: "var(--engine-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Day {day}
            </span>
          </div>
        </div>

        {/* transcript */}
        <div
          ref={transcriptRef}
          tabIndex={0}
          style={{
            flex: 1,
            padding: "20px 18px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          {messages.length === 0 && !thinking ? (
            <div style={{ margin: "auto", textAlign: "center", color: "var(--engine-text-dim)", padding: 24 }}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>An interactive demo of persistent NPC memory.</div>
              <div className="engine-mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--engine-text-muted)" }}>
                Press Send to begin the scenario.
              </div>
            </div>
          ) : null}
          {messages.map((m) => {
            if (m.who === "system") {
              return (
                <div
                  key={m.id}
                  className="engine-mono"
                  style={{
                    alignSelf: "center",
                    fontSize: 11,
                    color: "var(--engine-text-dim)",
                    letterSpacing: "0.06em",
                    padding: "6px 12px",
                    border: "1px dashed var(--engine-line-bright)",
                    borderRadius: 99,
                  }}
                >
                  {m.text}
                </div>
              );
            }
            const isPlayer = m.who === "player";
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isPlayer ? "flex-end" : "flex-start",
                  gap: 4,
                  animation: "engine-slide-up-in 280ms ease-out both",
                }}
              >
                <div className="engine-mono" style={{ fontSize: 10, color: "var(--engine-text-dim)", letterSpacing: "0.08em" }}>
                  {isPlayer ? "PLAYER" : "VALE"} · {m.day}
                </div>
                <div
                  style={{
                    maxWidth: "86%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: isPlayer ? "rgba(124,58,237,0.10)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${
                      isPlayer
                        ? "rgba(124,58,237,0.35)"
                        : m.highlight
                          ? "rgba(34,211,238,0.55)"
                          : "var(--engine-line)"
                    }`,
                    color: "var(--engine-text-strong)",
                    boxShadow: m.highlight ? "0 0 24px -8px rgba(34,211,238,0.5)" : "none",
                  }}
                >
                  {m.text}
                </div>
                {m.highlight ? (
                  <div
                    className="engine-mono"
                    style={{
                      fontSize: 10,
                      color: "var(--engine-cyan)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 2,
                    }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: 99, background: "var(--engine-cyan)" }} />
                    recall(npc:vale, about:p1) → 13d ago
                  </div>
                ) : null}
              </div>
            );
          })}
          {thinking ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
              <div className="engine-mono" style={{ fontSize: 10, color: "var(--engine-text-dim)", letterSpacing: "0.08em" }}>
                VALE · Day {day}
              </div>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--engine-line)",
                  display: "flex",
                  gap: 4,
                }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 99,
                      background: "var(--engine-text-muted)",
                      animation: `engine-pulse-soft 1.2s ease-in-out ${i * 0.15}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* control bar */}
        <div
          style={{
            borderTop: "1px solid var(--engine-line)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            background: "rgba(255,255,255,0.012)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              className="engine-mono"
              style={{ fontSize: 10, letterSpacing: "0.10em", color: "var(--engine-text-dim)", textTransform: "uppercase" }}
            >
              jump
            </span>
            {([1, 3, 14] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => jumpTo(d)}
                className="engine-mono"
                style={{
                  fontSize: 11,
                  padding: "5px 10px",
                  borderRadius: 4,
                  border: `1px solid ${d === day ? "rgba(124,58,237,0.55)" : "var(--engine-line-bright)"}`,
                  background: d === day ? "rgba(124,58,237,0.18)" : "transparent",
                  color: d === day ? "var(--engine-violet-soft)" : "var(--engine-text-muted)",
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                }}
              >
                Day {d}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={reset}
              className="engine-mono"
              style={{
                fontSize: 11,
                color: "var(--engine-text-dim)",
                letterSpacing: "0.06em",
                background: "transparent",
                border: 0,
                cursor: "pointer",
              }}
            >
              ↻ reset
            </button>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              border: "1px solid var(--engine-line-bright)",
              borderRadius: 8,
              padding: "9px 12px",
              background: "var(--engine-bg-base)",
            }}
          >
            <span className="engine-mono" style={{ color: "var(--engine-violet-soft)", fontSize: 13 }}>›</span>
            <span
              style={{
                flex: 1,
                fontSize: 13,
                color: isDone ? "var(--engine-text-dim)" : "var(--engine-text-base)",
                fontFamily: "var(--engine-font-sans)",
              }}
            >
              {isDone
                ? `Scenario complete for Day ${day} — jump forward in time.`
                : currentScript[step].player}
              {!isDone ? (
                <span
                  style={{
                    display: "inline-block",
                    width: 1,
                    height: 14,
                    background: "var(--engine-violet-soft)",
                    marginLeft: 4,
                    verticalAlign: "middle",
                    animation: "engine-blink 1s steps(1) infinite",
                  }}
                />
              ) : null}
            </span>
            <button
              type="button"
              onClick={advance}
              disabled={isDone || thinking}
              className="engine-mono"
              style={{
                fontSize: 11,
                padding: "5px 12px",
                borderRadius: 4,
                background: isDone ? "rgba(255,255,255,0.04)" : "var(--engine-violet)",
                color: isDone ? "var(--engine-text-dim)" : "#fff",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                opacity: thinking ? 0.6 : 1,
                border: 0,
                cursor: isDone || thinking ? "not-allowed" : "pointer",
              }}
            >
              ↵ Send
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT — memory panel */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 560, background: "var(--engine-bg-sunken)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--engine-line)",
          }}
        >
          <div className="engine-mono" style={{ fontSize: 11, color: "var(--engine-text-strong)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
            Memory · live trace
          </div>
          <div className="engine-mono" style={{ fontSize: 10.5, color: "var(--engine-text-dim)", letterSpacing: "0.06em" }}>
            {memories.length} writes
          </div>
        </div>

        <div className="engine-memory-tier-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--engine-line)" }}>
          {(["Spring", "Summer", "Fall", "Winter"] as const).map((s) => {
            const count = memories.filter((m) => m.season === s).length;
            return (
              <div
                key={s}
                style={{
                  padding: "10px 12px",
                  borderRight: s !== "Winter" ? "1px solid var(--engine-line)" : "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 99,
                      background: SEASON_COLOR[s],
                      boxShadow: count ? `0 0 8px ${SEASON_COLOR[s]}` : "none",
                    }}
                  />
                  <span className="engine-mono" style={{ fontSize: 10, color: "var(--engine-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {s}
                  </span>
                </div>
                <span
                  className="engine-mono"
                  style={{ fontSize: 18, color: count ? "var(--engine-text-strong)" : "var(--engine-text-dim)", fontWeight: 500 }}
                >
                  {String(count).padStart(2, "0")}
                </span>
              </div>
            );
          })}
        </div>

        <div tabIndex={0} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {memories.length === 0 ? (
            <div className="engine-mono" style={{ margin: "auto", textAlign: "center", color: "var(--engine-text-dim)", fontSize: 12 }}>
              {"// memory.writes will appear here"}
            </div>
          ) : null}
          {memories.map((m) => (
            <div
              key={m.id}
              style={{
                border: "1px solid var(--engine-line)",
                borderLeft: `2px solid ${SEASON_COLOR[m.season]}`,
                borderRadius: 6,
                padding: "8px 10px",
                background: "rgba(255,255,255,0.015)",
                animation: "engine-slide-up-in 240ms ease-out both",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span
                  className="engine-mono"
                  style={{ fontSize: 10, color: SEASON_COLOR[m.season], letterSpacing: "0.08em", textTransform: "uppercase" }}
                >
                  {m.season}
                </span>
                <span style={{ width: 1, height: 8, background: "var(--engine-line)" }} />
                <span className="engine-mono" style={{ fontSize: 10, color: "var(--engine-text-muted)" }}>{m.day}</span>
                <span style={{ flex: 1 }} />
                <span className="engine-mono" style={{ fontSize: 10, color: "var(--engine-text-dim)" }}>+ write</span>
              </div>
              <div className="engine-mono" style={{ fontSize: 11.5, color: "var(--engine-text-strong)", letterSpacing: "-0.005em" }}>
                <span style={{ color: "var(--engine-cyan)" }}>{m.entity}</span>
                <span style={{ color: "var(--engine-text-dim)" }}>.</span>
                <span style={{ color: "var(--engine-violet-soft)" }}>{m.event}</span>
                <span style={{ color: "var(--engine-text-dim)" }}>(</span>
              </div>
              <pre
                className="engine-mono"
                style={{
                  margin: "2px 0 0 0",
                  fontSize: 10.5,
                  color: "var(--engine-text-muted)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  lineHeight: 1.5,
                }}
              >
                {"  " + JSON.stringify(m.ctx).replace(/,/g, ", ").replace(/\{/g, "{ ").replace(/\}/g, " }")}
              </pre>
              <div className="engine-mono" style={{ fontSize: 11, color: "var(--engine-text-dim)" }}>)</div>
            </div>
          ))}
        </div>

        <div
          style={{
            borderTop: "1px solid var(--engine-line)",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span className="engine-mono" style={{ fontSize: 10, color: "var(--engine-text-dim)", letterSpacing: "0.08em" }}>
            tamper-evident · sha256
          </span>
          <span className="engine-mono" style={{ fontSize: 10, color: "var(--engine-text-dim)" }}>region: ap-northeast-2</span>
        </div>
      </div>
    </div>
  );
}
