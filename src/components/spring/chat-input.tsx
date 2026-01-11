"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onFileClick?: () => void;
  onImageClick?: () => void;
}

export function ChatInput({
  onSend,
  isLoading = false,
  placeholder = "Send a message...",
  value,
  onChange,
  onFileClick,
  onImageClick,
}: ChatInputProps) {
  const [internalMessage, setInternalMessage] = useState("");

  // Use controlled or uncontrolled mode
  const message = value !== undefined ? value : internalMessage;
  const setMessage = onChange || setInternalMessage;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleSubmit = () => {
    if (!message.trim() || isLoading) return;
    onSend(message.trim());
    // Only clear internal state if uncontrolled
    if (value === undefined) {
      setInternalMessage("");
    }
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative max-w-3xl mx-auto">
      <div className="flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-200 focus-within:border-pink-300 focus-within:ring-2 focus-within:ring-pink-100 transition-all">
        {/* File attachment button */}
        <button
          type="button"
          onClick={onFileClick}
          className="p-3 text-gray-400 hover:text-gray-600 transition-colors"
          title="Upload file"
        >
          <PaperclipIcon className="w-5 h-5" />
        </button>

        {/* Image generation button */}
        <button
          type="button"
          onClick={onImageClick}
          className="p-3 text-gray-400 hover:text-gray-600 transition-colors"
          title="Generate image"
        >
          <ImageIcon className="w-5 h-5" />
        </button>

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          rows={1}
          className="flex-1 py-3 pr-2 bg-transparent resize-none outline-none text-gray-900 placeholder-gray-400 max-h-[200px]"
        />

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={!message.trim() || isLoading}
          className={`
            p-3 m-1.5 rounded-xl transition-all
            ${
              message.trim() && !isLoading
                ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:from-pink-600 hover:to-rose-600 shadow-sm"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }
          `}
        >
          {isLoading ? (
            <LoadingIcon className="w-5 h-5 animate-spin" />
          ) : (
            <SendIcon className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Character count (optional, shows when typing) */}
      {message.length > 0 && (
        <div className="absolute -bottom-5 right-0 text-xs text-gray-400">
          {message.length.toLocaleString()} characters
        </div>
      )}
    </div>
  );
}

// Icons
function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
      />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
      />
    </svg>
  );
}

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}
