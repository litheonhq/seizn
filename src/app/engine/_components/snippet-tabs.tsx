"use client";

import { useState } from "react";

type Lang = "TypeScript" | "Python" | "cURL" | "C# / Unity";

const SNIPPETS: Record<Lang, { install: string; code: string }> = {
  TypeScript: {
    install: "npm install @seizn/sdk",
    code: `import { SeiznClient } from '@seizn/sdk';

const seizn = new SeiznClient({ apiKey: process.env.SEIZN_API_KEY });

// Give Vale a memory of meeting the player
await seizn.remember({
  entity: 'npc:vale',
  event: 'met_player',
  context: { player_id: 'p1', mood: 'curious' },
});

// 14 days later, Vale recalls the player
const memory = await seizn.recall({
  entity: 'npc:vale',
  about: 'p1',
});
// → { last_met: '14d ago', mood: 'curious', salience: 0.8 }`,
  },
  Python: {
    install: "pip install seizn",
    code: `from seizn import SeiznClient

seizn = SeiznClient(api_key=os.environ["SEIZN_API_KEY"])

# Give Vale a memory of meeting the player
seizn.remember(
    entity="npc:vale",
    event="met_player",
    context={"player_id": "p1", "mood": "curious"},
)

# 14 days later, Vale recalls the player
memory = seizn.recall(entity="npc:vale", about="p1")
# → { 'last_met': '14d ago', 'mood': 'curious', 'salience': 0.8 }`,
  },
  cURL: {
    install: "# HTTP API · v1",
    code: `curl https://engine.seizn.com/v1/remember \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "entity": "npc:vale",
    "event": "met_player",
    "context": { "player_id": "p1", "mood": "curious" }
  }'

curl https://engine.seizn.com/v1/recall \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -G --data-urlencode 'entity=npc:vale' \\
     --data-urlencode 'about=p1'
# → { "last_met": "14d ago", "mood": "curious", "salience": 0.8 }`,
  },
  "C# / Unity": {
    install: "dotnet add package Seizn.Sdk",
    code: `using Seizn;

var seizn = new SeiznClient(Environment.GetEnvironmentVariable("SEIZN_API_KEY"));

// Give Vale a memory of meeting the player
await seizn.RememberAsync(new RememberRequest {
    Entity  = "npc:vale",
    Event   = "met_player",
    Context = new { player_id = "p1", mood = "curious" }
});

// 14 days later, Vale recalls the player
var memory = await seizn.RecallAsync("npc:vale", about: "p1");
// → { last_met: "14d ago", mood: "curious", salience: 0.8 }`,
  },
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const KEYWORDS = new Set([
  "import", "from", "const", "let", "var", "await", "async", "function",
  "new", "return", "using", "public", "private", "class", "null", "true",
  "false", "None", "True", "False", "in", "as",
]);

const COLOR = {
  string:  "#34D399",
  comment: "#8EA0B8",
  keyword: "#A78BFA",
  number:  "#FBBF24",
  fn:      "#22D3EE",
} as const;

const wrap = (text: string, color: string, italic = false) =>
  `<span style="color:${color}${italic ? ";font-style:italic" : ""}">${escapeHtml(text)}</span>`;

// Single-pass tokenizer. Order matters: comments + strings consume whole regions
// before we tokenize identifiers / keywords / numbers.
function highlight(code: string, lang: Lang): string {
  const out: string[] = [];
  let i = 0;
  const len = code.length;
  const isPyOrCurl = lang === "Python" || lang === "cURL";
  const lineCommentStart = isPyOrCurl ? "#" : "//";

  while (i < len) {
    const ch = code[i];

    // Line comment
    if (
      (lineCommentStart === "#" && ch === "#") ||
      (lineCommentStart === "//" && ch === "/" && code[i + 1] === "/")
    ) {
      let j = i;
      while (j < len && code[j] !== "\n") j++;
      out.push(wrap(code.slice(i, j), COLOR.comment, true));
      i = j;
      continue;
    }

    // String literal
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < len) {
        if (code[j] === "\\") { j += 2; continue; }
        if (code[j] === quote) { j++; break; }
        j++;
      }
      out.push(wrap(code.slice(i, j), COLOR.string));
      i = j;
      continue;
    }

    // Number
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < len && /[0-9.]/.test(code[j])) j++;
      out.push(wrap(code.slice(i, j), COLOR.number));
      i = j;
      continue;
    }

    // Identifier (keyword / function call / plain)
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < len && /[A-Za-z0-9_]/.test(code[j])) j++;
      const word = code.slice(i, j);
      if (KEYWORDS.has(word)) {
        out.push(wrap(word, COLOR.keyword));
      } else {
        // peek for "(" — function call coloring
        let k = j;
        while (k < len && code[k] === " ") k++;
        if (code[k] === "(") {
          out.push(wrap(word, COLOR.fn));
        } else {
          out.push(escapeHtml(word));
        }
      }
      i = j;
      continue;
    }

    // Anything else (punctuation, whitespace) — escape and emit
    out.push(escapeHtml(ch));
    i++;
  }

  return out.join("");
}

export function SnippetTabs() {
  const langs = Object.keys(SNIPPETS) as Lang[];
  const [active, setActive] = useState<Lang>("TypeScript");
  const [copied, setCopied] = useState(false);
  const snip = SNIPPETS[active];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snip.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — silent */
    }
  };

  return (
    <div style={{ background: "var(--engine-bg-card)", border: "1px solid var(--engine-line)", borderRadius: 14, overflow: "hidden" }}>
      <div className="engine-snippet-toolbar" style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--engine-line)", background: "rgba(255,255,255,0.012)" }}>
        <div className="engine-snippet-tabs" style={{ display: "flex" }}>
          {langs.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setActive(l)}
              className="engine-mono"
              style={{
                padding: "12px 18px",
                fontSize: 12,
                color: l === active ? "var(--engine-text-strong)" : "var(--engine-text-muted)",
                borderBottom: `2px solid ${l === active ? "var(--engine-violet)" : "transparent"}`,
                borderRight: "1px solid var(--engine-line)",
                background: l === active ? "rgba(124,58,237,0.06)" : "transparent",
                letterSpacing: "0.02em",
                cursor: "pointer",
                borderTop: 0,
                borderLeft: 0,
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={copy}
          className="engine-mono"
          style={{
            padding: "12px 18px",
            fontSize: 11,
            color: copied ? "var(--engine-cyan)" : "var(--engine-text-muted)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            background: "transparent",
            border: 0,
            cursor: "pointer",
          }}
        >
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
      <div
        className="engine-snippet-install"
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid var(--engine-line)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "var(--engine-bg-sunken)",
        }}
      >
        <span className="engine-mono" style={{ color: "var(--engine-violet-soft)", fontSize: 13 }}>$</span>
        <span className="engine-mono" style={{ fontSize: 13, color: "var(--engine-text-strong)" }}>{snip.install}</span>
      </div>
      <div className="engine-snippet-code-grid" style={{ display: "grid", gridTemplateColumns: "auto 1fr" }}>
        <pre
          className="engine-mono engine-snippet-line-numbers"
          style={{
            margin: 0,
            padding: "20px 12px 20px 20px",
            fontSize: 12.5,
            color: "var(--engine-text-dim)",
            textAlign: "right",
            lineHeight: 1.7,
            userSelect: "none",
            borderRight: "1px solid var(--engine-line)",
          }}
        >
          {snip.code.split("\n").map((_, i) => i + 1).join("\n")}
        </pre>
        <pre
          className="engine-mono"
          tabIndex={0}
          style={{
            margin: 0,
            padding: "20px 22px",
            fontSize: 12.5,
            color: "var(--engine-text-base)",
            lineHeight: 1.7,
            overflowX: "auto",
          }}
        >
          <code dangerouslySetInnerHTML={{ __html: highlight(snip.code, active) }} />
        </pre>
      </div>
    </div>
  );
}
