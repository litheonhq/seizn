"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Conversation } from "@/lib/spring/types";
import type { Locale } from "@/i18n/config";
import { QuotaDisplay } from "./quota-display";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  isOpen: boolean;
  isLoading: boolean;
  onNewChat: () => void;
  onSelectConversation: (conversation: Conversation) => void;
  onDeleteConversation: (id: string) => void;
  onToggle: () => void;
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  locale: Locale;
}

export function ChatSidebar({
  conversations,
  activeConversation,
  isOpen,
  isLoading,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onToggle,
  user,
  locale,
}: ChatSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px] lg:hidden"
          onClick={onToggle}
        />
      )}
      <div className="fixed inset-y-0 left-0 z-40 flex">
        <aside
          className={`
            relative h-full bg-white border-r border-gray-200 shadow-xl flex flex-col overflow-hidden
            transition-[width,transform] duration-300 ease-in-out
            ${isOpen ? "w-72 translate-x-0" : "w-16 -translate-x-1 lg:translate-x-0"}
          `}
        >
          {/* Toggle rail */}
          <button
            onClick={onToggle}
            className="absolute top-4 -right-4 w-8 h-8 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center hover:shadow-lg transition-all"
            aria-label={isOpen ? "사이드바 닫기" : "사이드바 열기"}
          >
            {isOpen ? <SidebarIcon className="w-4 h-4 text-gray-500" /> : <MenuIcon className="w-4 h-4 text-gray-600" />}
          </button>

          {/* Header */}
          <div className="p-3 border-b border-gray-100 flex items-center gap-3">
            <Link
              href={`/${locale}/spring`}
              className="flex items-center gap-2 group"
              title="Spring 홈"
            >
              <div className="w-9 h-9 bg-gradient-to-br from-pink-400 to-rose-500 rounded-xl flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-sm">S</span>
              </div>
              {isOpen && (
                <span className="font-semibold text-lg bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-transparent">
                  Spring
                </span>
              )}
            </Link>
          </div>

          {/* Actions */}
          <div className="px-3 pt-3 pb-2 border-b border-gray-100">
            <button
              onClick={onNewChat}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm hover:shadow-md transition-all ${
                isOpen ? "" : "justify-center"
              }`}
              title="새 대화"
            >
              <PlusIcon className="w-5 h-5" />
              {isOpen && <span className="font-medium">새 대화</span>}
            </button>
          </div>

          {/* Quota Display */}
          {isOpen && (
            <div className="px-3 py-2 border-b border-gray-100">
              <QuotaDisplay compact />
            </div>
          )}

          {/* Conversations List */}
          <div className={`flex-1 overflow-y-auto p-2 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8 px-4">
                <ChatBubbleIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">대화가 없습니다</p>
                <p className="text-gray-400 text-xs mt-1">새 대화를 시작해보세요</p>
              </div>
            ) : (
              <div className="space-y-1">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    onMouseEnter={() => setHoveredId(conversation.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => onSelectConversation(conversation)}
                    className={`
                      group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
                      transition-all duration-150
                      ${
                        activeConversation?.id === conversation.id
                          ? "bg-pink-50 text-pink-700"
                          : "hover:bg-gray-50 text-gray-700"
                      }
                    `}
                  >
                    <ChatBubbleIcon
                      className={`w-4 h-4 flex-shrink-0 ${
                        activeConversation?.id === conversation.id
                          ? "text-pink-500"
                          : "text-gray-400"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {conversation.title}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {formatDate(conversation.updated_at)}
                      </p>
                    </div>

                    {/* Delete button */}
                    {hoveredId === conversation.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation(conversation.id);
                        }}
                        className="absolute right-2 p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                        aria-label="대화 삭제"
                      >
                        <TrashIcon className="w-4 h-4 text-red-500" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* User Profile */}
          <div className="p-3 border-t border-gray-100 mt-auto">
            <div
              className={`flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors ${
                isOpen ? "" : "justify-center"
              }`}
            >
              {user.image ? (
                <Image
                  src={user.image} width={32} height={32} unoptimized
                  alt={user.name || "User"}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 bg-gradient-to-br from-pink-400 to-rose-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {user.name?.[0] || user.email?.[0] || "U"}
                  </span>
                </div>
              )}
              {isOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user.name || "User"}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

// Helper function
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString();
}

// Icons
function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function SidebarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
