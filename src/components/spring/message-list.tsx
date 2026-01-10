"use client";

import { memo, useState, Suspense, lazy } from "react";
import type { Message } from "@/lib/spring/types";
import ReactMarkdown from "react-markdown";

// Dynamic import for syntax highlighter to reduce initial bundle size
const SyntaxHighlighter = lazy(() =>
  import("react-syntax-highlighter/dist/esm/prism-light").then((mod) => ({
    default: mod.default,
  }))
);

// Dynamically import only the theme
const getOneDarkStyle = () =>
  import("react-syntax-highlighter/dist/esm/styles/prism/one-dark").then(
    (mod) => mod.default
  );

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  );
}

const MessageItem = memo(function MessageItem({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isStreaming = message.id.startsWith("temp-assistant-") && !message.content;

  return (
    <div className={`flex gap-4 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`
          w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center
          ${isUser
            ? "bg-gradient-to-br from-blue-500 to-indigo-600"
            : "bg-gradient-to-br from-pink-400 to-rose-500"
          }
        `}
      >
        <span className="text-white text-sm font-medium">
          {isUser ? "U" : "S"}
        </span>
      </div>

      {/* Content */}
      <div className={`flex-1 max-w-[85%] ${isUser ? "text-right" : ""}`}>
        <div
          className={`
            inline-block rounded-2xl px-4 py-3
            ${isUser
              ? "bg-blue-500 text-white rounded-tr-sm"
              : "bg-gray-100 text-gray-900 rounded-tl-sm"
            }
          `}
        >
          {isStreaming ? (
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          ) : isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none prose-p:my-2 prose-headings:my-3 prose-li:my-0.5">
              <ReactMarkdown
                components={{
                  code({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode }) {
                    const match = /language-(\w+)/.exec(className || "");
                    return !inline && match ? (
                      <CodeBlock language={match[1]} {...props}>
                        {String(children).replace(/\n$/, "")}
                      </CodeBlock>
                    ) : (
                      <code
                        className="bg-gray-200 text-pink-600 px-1.5 py-0.5 rounded text-xs font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Metadata */}
        {!isUser && message.model && (
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
            <span>{getModelName(message.model)}</span>
            {message.input_tokens && message.output_tokens && (
              <span>
                · {message.input_tokens + message.output_tokens} tokens
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// Separate CodeBlock component with lazy loading
function CodeBlock({ language, children, ...props }: { language: string; children: string }) {
  const [style, setStyle] = useState<Record<string, React.CSSProperties> | null>(null);

  // Load style on mount
  if (!style) {
    getOneDarkStyle().then(setStyle);
  }

  return (
    <div className="relative group">
      <Suspense
        fallback={
          <pre className="bg-gray-800 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto">
            <code>{children}</code>
          </pre>
        }
      >
        {style ? (
          <SyntaxHighlighter
            style={style}
            language={language}
            PreTag="div"
            className="rounded-lg !my-3 text-xs"
            {...props}
          >
            {children}
          </SyntaxHighlighter>
        ) : (
          <pre className="bg-gray-800 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto">
            <code>{children}</code>
          </pre>
        )}
      </Suspense>
      <CopyButton text={children} />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 bg-gray-700/50 hover:bg-gray-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
      title="Copy code"
    >
      <CopyIcon className="w-4 h-4 text-gray-300" />
    </button>
  );
}

function getModelName(model: string): string {
  const names: Record<string, string> = {
    // OpenAI
    "gpt-4o-mini": "GPT-4o Mini",
    "gpt-4o": "GPT-4o",
    "gpt-4-turbo": "GPT-4 Turbo",
    "gpt-5": "GPT-5",
    "o1-preview": "o1 Preview",
    "o1-mini": "o1 Mini",
    "o3-mini": "o3 Mini",
    // Anthropic
    "claude-3-5-sonnet-20241022": "Claude Sonnet",
    "claude-3-5-haiku-20241022": "Claude Haiku",
    "claude-3-opus-20240229": "Claude 3 Opus",
    "claude-opus-4-20250514": "Claude Opus 4",
    // Google
    "gemini-2.0-flash-exp": "Gemini 2.0",
    "gemini-1.5-pro": "Gemini 1.5 Pro",
    // DeepSeek
    "deepseek-chat": "DeepSeek V3",
    "deepseek-reasoner": "DeepSeek R1",
    // Mistral
    "mistral-large-latest": "Mistral Large",
    "mistral-small-latest": "Mistral Small",
    "codestral-latest": "Codestral",
    // xAI
    "grok-2": "Grok 2",
    "grok-2-vision": "Grok 2 Vision",
  };
  return names[model] || model;
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}
