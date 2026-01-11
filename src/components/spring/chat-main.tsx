"use client";

import { useState, useRef, useEffect } from "react";
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

  const mainPadding = isSidebarOpen ? "lg:pl-80" : "lg:pl-20";

  return (
    <main className={`min-h-screen flex flex-col bg-white transition-[padding] duration-300 ${mainPadding}`}>
      {/* Header */}
      <header className="h-14 border-b border-gray-100 flex items-center justify-between px-4">
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
          <WelcomeScreen onSuggestionClick={handleSend} />
        ) : (
          <MessageList messages={messages} />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-100 p-4">
        <div className="max-w-4xl mx-auto space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
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
function WelcomeScreen({ onSuggestionClick }: { onSuggestionClick: (message: string) => void }) {
  const suggestions = [
    "Help me write a professional email",
    "Explain quantum computing simply",
    "Create a weekly meal plan",
    "Debug this code for me",
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8">
      <div className="w-16 h-16 bg-gradient-to-br from-pink-400 to-rose-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
        <span className="text-white text-2xl font-bold">S</span>
      </div>

      <h2 className="text-2xl font-semibold text-gray-900 mb-2">
        Welcome to Spring
      </h2>
      <p className="text-gray-500 text-center max-w-md mb-8">
        Multi-AI chat with memory. Ask anything, and I&apos;ll remember our
        conversations.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            onClick={() => onSuggestionClick(suggestion)}
            className="text-left p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors group"
          >
            <p className="text-sm text-gray-700 group-hover:text-gray-900">
              {suggestion}
            </p>
            <ArrowIcon className="w-4 h-4 text-gray-400 group-hover:text-pink-500 mt-2 transition-colors" />
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
