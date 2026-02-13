"use client";

import { useState } from "react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { RequestConfig } from "./request-builder";
import { copyToClipboard } from "@/lib/clipboard";

// PrismLight lets us register only the languages we actually render, which keeps the bundle small.
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("python", python);

interface SnippetTabsProps {
  config: RequestConfig;
  traceId?: string | null;
  onShareTrace?: () => void;
}

type Language = "curl" | "javascript" | "python" | "postman";

const LANGUAGES: { id: Language; label: string }[] = [
  { id: "curl", label: "cURL" },
  { id: "javascript", label: "JavaScript" },
  { id: "python", label: "Python" },
  { id: "postman", label: "Postman" },
];

export function SnippetTabs({ config, traceId, onShareTrace }: SnippetTabsProps) {
  const [activeTab, setActiveTab] = useState<Language>("curl");
  const [copied, setCopied] = useState(false);

  const snippet = generateSnippet(config, activeTab);

  const handleCopy = async () => {
    const result = await copyToClipboard(snippet);
    if (result.success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-gray-900 rounded-2xl overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-1">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              onClick={() => setActiveTab(lang.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === lang.id
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {/* Share Trace Button */}
          {traceId && onShareTrace && (
            <button
              onClick={onShareTrace}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-amber-400 hover:text-amber-300 bg-amber-500/10 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share Trace
            </button>
          )}
          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code */}
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          language={activeTab === "curl" ? "bash" : activeTab === "postman" ? "json" : activeTab}
          style={oneLight}
          customStyle={{
            margin: 0,
            padding: "1.5rem",
            background: "#111827",
            fontSize: "0.875rem",
            lineHeight: "1.5",
          }}
          codeTagProps={{
            style: {
              color: "#e5e7eb",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            },
          }}
        >
          {snippet}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

function generateSnippet(config: RequestConfig, language: Language): string {
  const options = {
    collection_id: config.dataset,
    query: config.query || "Your search query here",
    top_k: config.topK,
    autopilot: {
      enabled: true,
      budget_ms: config.budgetMs,
    },
    hybrid: config.hybridSearch,
    rerank: config.rerank,
    answer_contract: config.answerContract,
  };

  switch (language) {
    case "curl":
      return `curl -X POST 'https://api.seizn.com/v1/summer/retrieve' \\
  -H 'Authorization: Bearer $SEIZN_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify(options, null, 2)}'`;

    case "javascript":
      return `import { Seizn } from 'seizn';

const seizn = new Seizn({
  apiKey: process.env.SEIZN_API_KEY,
});

const results = await seizn.summer.retrieve({
  collectionId: '${config.dataset}',
  query: '${config.query || "Your search query here"}',
  topK: ${config.topK},
  autopilot: {
    enabled: true,
    budgetMs: ${config.budgetMs},
  },
  hybrid: ${config.hybridSearch},
  rerank: ${config.rerank},
  answerContract: ${config.answerContract},
});

console.log(results);`;

    case "python":
      return `from seizn import Seizn
import os

seizn = Seizn(api_key=os.environ["SEIZN_API_KEY"])

results = seizn.summer.retrieve(
    collection_id="${config.dataset}",
    query="${config.query || "Your search query here"}",
    top_k=${config.topK},
    autopilot={
        "enabled": True,
        "budget_ms": ${config.budgetMs},
    },
    hybrid=${config.hybridSearch ? "True" : "False"},
    rerank=${config.rerank ? "True" : "False"},
    answer_contract=${config.answerContract ? "True" : "False"},
)

print(results)`;

    case "postman":
      // Postman collection JSON format
      const postmanCollection = {
        info: {
          name: "Seizn Summer API",
          schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        item: [
          {
            name: "Summer Retrieve",
            request: {
              method: "POST",
              header: [
                { key: "Authorization", value: "Bearer {{SEIZN_API_KEY}}" },
                { key: "Content-Type", value: "application/json" },
              ],
              body: {
                mode: "raw",
                raw: JSON.stringify(options, null, 2),
              },
              url: {
                raw: "https://api.seizn.com/v1/summer/retrieve",
                protocol: "https",
                host: ["api", "seizn", "com"],
                path: ["v1", "summer", "retrieve"],
              },
            },
          },
        ],
        variable: [
          { key: "SEIZN_API_KEY", value: "", type: "string" },
        ],
      };
      return JSON.stringify(postmanCollection, null, 2);

    default:
      return "";
  }
}
