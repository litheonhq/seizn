"use client";

import { useState, useEffect, useCallback } from "react";
import type { Locale } from "@/i18n/config";
import { ChatSidebar } from "@/components/spring/chat-sidebar";
import { ChatMain } from "@/components/spring/chat-main";
import type { Conversation, Message, AIModel } from "@/lib/spring/types";

interface ChatPageClientProps {
  locale: Locale;
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export function ChatPageClient({ locale, user }: ChatPageClientProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [fallbackNotification, setFallbackNotification] = useState<{
    message: string;
    originalModel: string;
  } | null>(null);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/spring/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await fetch(`/api/spring/conversations/${conversationId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveConversation(data.conversation);
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Create new conversation
  const handleNewChat = async () => {
    setActiveConversation(null);
    setMessages([]);
  };

  // Select conversation
  const handleSelectConversation = async (conversation: Conversation) => {
    setActiveConversation(conversation);
    await fetchMessages(conversation.id);
  };

  // Delete conversation
  const handleDeleteConversation = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/spring/conversations/${conversationId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));
        if (activeConversation?.id === conversationId) {
          setActiveConversation(null);
          setMessages([]);
        }
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  // Send message
  const handleSendMessage = async (
    content: string,
    model: AIModel = "gpt-4o-mini"
  ) => {
    // Optimistic update - add user message
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConversation?.id || "",
      user_id: user.id || "",
      role: "user",
      content,
      created_at: new Date().toISOString(),
      is_deleted: false,
    };

    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      const res = await fetch("/api/spring/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: activeConversation?.id,
          message: content,
          model,
          stream: true,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to send message");
      }

      // Handle streaming response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      let assistantContent = "";
      let assistantMessageId = "";
      let conversationId = activeConversation?.id;

      // Add placeholder assistant message
      const tempAssistantMessage: Message = {
        id: `temp-assistant-${Date.now()}`,
        conversation_id: conversationId || "",
        user_id: user.id || "",
        role: "assistant",
        content: "",
        model,
        created_at: new Date().toISOString(),
        is_deleted: false,
      };

      setMessages((prev) => [...prev, tempAssistantMessage]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "start") {
                conversationId = data.conversation_id;
                // Handle model fallback notification
                if (data.fallback?.occurred) {
                  setFallbackNotification({
                    message: data.fallback.message || "모델이 변경되었습니다.",
                    originalModel: data.fallback.originalModel || "",
                  });
                  // Auto-dismiss after 5 seconds
                  setTimeout(() => setFallbackNotification(null), 5000);
                }
                // Update conversation ID if new
                if (!activeConversation) {
                  fetchConversations();
                }
              } else if (data.type === "content") {
                assistantContent += data.content;
                // Update assistant message content
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === tempAssistantMessage.id
                      ? { ...msg, content: assistantContent }
                      : msg
                  )
                );
              } else if (data.type === "done") {
                assistantMessageId = data.message_id;
                // Update with final message ID
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === tempAssistantMessage.id
                      ? { ...msg, id: assistantMessageId }
                      : msg
                  )
                );

                // Refresh conversation list if new
                if (!activeConversation && conversationId) {
                  await fetchConversations();
                  const conv = conversations.find((c) => c.id === conversationId);
                  if (conv) {
                    setActiveConversation(conv);
                  }
                }
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      // Remove failed messages
      setMessages((prev) =>
        prev.filter(
          (msg) =>
            msg.id !== tempUserMessage.id &&
            !msg.id.startsWith("temp-assistant-")
        )
      );
    }
  };

  return (
    <>
      {/* Fallback Notification */}
      {fallbackNotification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 shadow-lg flex items-center gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-amber-800">{fallbackNotification.message}</span>
            <button
              onClick={() => setFallbackNotification(null)}
              className="text-amber-500 hover:text-amber-700 ml-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <ChatSidebar
        conversations={conversations}
        activeConversation={activeConversation}
        isOpen={isSidebarOpen}
        isLoading={isLoading}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        user={user}
        locale={locale}
      />

      {/* Main Chat Area */}
      <ChatMain
        conversation={activeConversation}
        messages={messages}
        onSendMessage={handleSendMessage}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        locale={locale}
      />
    </>
  );
}
