"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { Conversation, Message, AIModel } from "@/lib/spring/types";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale } from "@/i18n/config";
import { ModelSelector } from "./model-selector";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { SessionCostTracker } from "./cost-meter";
import { ModelRecommendation } from "./model-recommendation";
import { ImageGenerator } from "./image-generator";
import { FileUploadModal } from "./file-upload";

interface ChatMainProps {
  conversation: Conversation | null;
  messages: Message[];
  onSendMessage: (content: string, model: AIModel) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  locale: Locale;
}

export function ChatMain({
  conversation,
  messages,
  onSendMessage,
  isSidebarOpen,
  onToggleSidebar,
  locale,
}: ChatMainProps) {
  const [selectedModel, setSelectedModel] = useState<AIModel>(
    (conversation?.default_model as AIModel) || "gpt-4o-mini"
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [showImageGenerator, setShowImageGenerator] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Update model when conversation changes
  useEffect(() => {
    if (conversation?.default_model) {
      setSelectedModel(conversation.default_model as AIModel);
    }
  }, [conversation]);

  const handleSend = async (content: string) => {
    if (!content.trim()) return;
    setInputValue("");
    setIsStreaming(true);
    try {
      await onSendMessage(content, selectedModel);
    } finally {
      setIsStreaming(false);
    }
  };

  const mainPadding = isSidebarOpen ? "lg:pl-[18rem]" : "lg:pl-[4.5rem]";

  const welcomeCopy = useMemo(() => {
    switch (locale) {
      case "ko":
        return {
          title: "Spring에 오신 것을 환영해요",
          subtitle: "다중 모델 대화와 메모리. 무엇이든 물어보면 대화를 기억해둘게요.",
        };
      case "ja":
        return {
          title: "Springへようこそ",
          subtitle: "マルチモデルのチャットとメモリ。聞いてくれれば会話を覚えておきます。",
        };
      default:
        return {
          title: "Welcome to Spring",
          subtitle: "Multi-AI chat with memory. Ask anything, and I'll remember our conversations.",
        };
    }
  }, [locale]);

  return (
    <main className={`min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-white transition-[padding] duration-300 ${mainPadding}`}>
      {/* Header */}
      <header className="h-14 border-b border-gray-100/80 bg-white/80 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {!isSidebarOpen && (
            <button
              onClick={onToggleSidebar}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <MenuIcon className="w-5 h-5 text-gray-600" />
            </button>
          )}
          <h1 className="font-medium text-gray-900 truncate max-w-[200px] sm:max-w-md">
            {conversation?.title || "New Chat"}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSwitcher currentLocale={locale} className="hidden sm:block" />
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <WelcomeScreen onSuggestionClick={handleSend} copy={welcomeCopy} locale={locale} />
        ) : (
          <MessageList messages={messages} />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200/60 bg-white/80 backdrop-blur-sm p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ModelSelector
                selectedModel={selectedModel}
                onSelect={setSelectedModel}
              />
              <SessionCostTracker />
            </div>
            <LanguageSwitcher currentLocale={locale} className="sm:hidden inline-flex" />
          </div>
          <ModelRecommendation
            query={inputValue}
            currentModel={selectedModel}
            onSelectModel={setSelectedModel}
            className="max-w-3xl"
          />
          <ChatInput
            onSend={handleSend}
            isLoading={isStreaming}
            placeholder="Send a message..."
            value={inputValue}
            onChange={setInputValue}
            onFileClick={() => setShowFileUpload(true)}
            onImageClick={() => setShowImageGenerator(true)}
          />
          <p className="text-xs text-center text-gray-400">
            Spring uses AI models. Check important info.
          </p>
        </div>
      </div>

      {/* Modals */}
      {showImageGenerator && (
        <ImageGenerator
          onClose={() => setShowImageGenerator(false)}
          onImageGenerated={(image) => {
            // Optionally add image to chat
            console.log("Image generated:", image);
          }}
        />
      )}

      {showFileUpload && (
        <FileUploadModal
          onClose={() => setShowFileUpload(false)}
          conversationId={conversation?.id}
          onFileAnalyzed={(file) => {
            // Optionally add file analysis to chat
            console.log("File analyzed:", file);
          }}
        />
      )}
    </main>
  );
}

// Welcome Screen Component
function WelcomeScreen({
  onSuggestionClick,
  copy,
  locale,
}: {
  onSuggestionClick: (message: string) => void;
  copy: { title: string; subtitle: string };
  locale: Locale;
}) {
  const suggestions = useMemo(() => {
    if (locale === "ko") {
      return [
        { text: "이메일 초안 작성 도와줘", icon: "✉️" },
        { text: "양자컴퓨팅을 쉽게 설명해줘", icon: "🔬" },
        { text: "주간 식단을 만들어줘", icon: "🍽️" },
        { text: "이 코드 디버그해줘", icon: "🐛" },
      ];
    }
    if (locale === "ja") {
      return [
        { text: "メール文面を作成して", icon: "✉️" },
        { text: "量子コンピュータをやさしく説明して", icon: "🔬" },
        { text: "1週間の食事プランを作って", icon: "🍽️" },
        { text: "このコードをデバッグして", icon: "🐛" },
      ];
    }
    return [
      { text: "Help me write a professional email", icon: "✉️" },
      { text: "Explain quantum computing simply", icon: "🔬" },
      { text: "Create a weekly meal plan", icon: "🍽️" },
      { text: "Debug this code for me", icon: "🐛" },
    ];
  }, [locale]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] px-6 py-12">
      {/* Logo */}
      <div className="relative mb-8">
        <div className="w-20 h-20 bg-gradient-to-br from-pink-400 via-rose-500 to-pink-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-pink-500/30">
          <span className="text-white text-3xl font-bold">S</span>
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-400 rounded-full border-4 border-white shadow-sm" />
      </div>

      {/* Title */}
      <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3 text-center">
        {copy.title}
      </h2>
      <p className="text-gray-500 text-center max-w-lg mb-10 text-lg">
        {copy.subtitle}
      </p>

      {/* Suggestion Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl">
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            onClick={() => onSuggestionClick(suggestion.text)}
            className="group relative text-left p-5 bg-white hover:bg-gray-50 rounded-2xl border border-gray-200 hover:border-pink-300 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-start gap-4">
              <span className="text-2xl">{suggestion.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 font-medium group-hover:text-pink-600 transition-colors">
                  {suggestion.text}
                </p>
              </div>
              <ArrowIcon className="w-5 h-5 text-gray-300 group-hover:text-pink-500 group-hover:translate-x-1 transition-all flex-shrink-0 mt-0.5" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Icons
function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}
