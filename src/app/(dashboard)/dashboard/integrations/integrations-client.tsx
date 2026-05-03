"use client";

import { useState } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

type CategoryType = "all" | "frameworks" | "llms" | "databases" | "platforms";

interface Integration {
  id: string;
  name: string;
  description: string;
  category: CategoryType;
  icon: string;
  status: "available" | "coming_soon" | "beta";
  docsUrl?: string;
  installCommand?: string;
}

const integrations: Integration[] = [
  // Frameworks
  {
    id: "langchain",
    name: "LangChain",
    description: "Build context-aware AI apps with LangChain's memory integration",
    category: "frameworks",
    icon: "🦜",
    status: "available",
    docsUrl: "/docs/integrations/langchain",
    installCommand: "pip install langchain-seizn",
  },
  {
    id: "llamaindex",
    name: "LlamaIndex",
    description: "Augment LlamaIndex pipelines with persistent memory",
    category: "frameworks",
    icon: "🦙",
    status: "available",
    docsUrl: "/docs/integrations/llamaindex",
    installCommand: "pip install llama-index-memory-seizn",
  },
  {
    id: "haystack",
    name: "Haystack",
    description: "Add memory to your Haystack RAG pipelines",
    category: "frameworks",
    icon: "🌾",
    status: "beta",
    docsUrl: "/docs/integrations/haystack",
  },
  {
    id: "semantic-kernel",
    name: "Semantic Kernel",
    description: "Microsoft's AI orchestration with Seizn memory",
    category: "frameworks",
    icon: "🔷",
    status: "coming_soon",
  },
  // LLMs
  {
    id: "openai",
    name: "OpenAI",
    description: "Use Seizn memory with GPT-4, GPT-3.5, and other OpenAI models",
    category: "llms",
    icon: "🤖",
    status: "available",
    docsUrl: "/docs/integrations/openai",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    description: "Integrate Seizn with Claude for persistent conversations",
    category: "llms",
    icon: "🧠",
    status: "available",
    docsUrl: "/docs/integrations/anthropic",
  },
  {
    id: "google-gemini",
    name: "Google Gemini",
    description: "Memory-augmented responses with Gemini Pro and Ultra",
    category: "llms",
    icon: "💎",
    status: "available",
    docsUrl: "/docs/integrations/gemini",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    description: "Add context retention to Mistral models",
    category: "llms",
    icon: "🌊",
    status: "beta",
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Local LLMs with Seizn memory support",
    category: "llms",
    icon: "🦙",
    status: "available",
    docsUrl: "/docs/integrations/ollama",
  },
  // Databases
  {
    id: "supabase",
    name: "Supabase",
    description: "Sync memories with Supabase PostgreSQL and auth",
    category: "databases",
    icon: "⚡",
    status: "available",
    docsUrl: "/docs/integrations/supabase",
  },
  {
    id: "pinecone",
    name: "Pinecone",
    description: "Use Pinecone as the vector backend for Seizn",
    category: "databases",
    icon: "🌲",
    status: "coming_soon",
  },
  {
    id: "weaviate",
    name: "Weaviate",
    description: "Self-hosted vector storage with Seizn's memory layer",
    category: "databases",
    icon: "🔮",
    status: "coming_soon",
  },
  // Platforms
  {
    id: "vercel-ai",
    name: "Vercel AI SDK",
    description: "Stream responses with memory using Vercel AI SDK",
    category: "platforms",
    icon: "▲",
    status: "available",
    docsUrl: "/docs/integrations/vercel",
    installCommand: "npm install @seizn/vercel-ai",
  },
  {
    id: "nextjs",
    name: "Next.js",
    description: "Full-stack AI apps with Next.js App Router",
    category: "platforms",
    icon: "⬛",
    status: "available",
    docsUrl: "/docs/integrations/nextjs",
  },
  {
    id: "cloudflare-workers",
    name: "Cloudflare Workers",
    description: "Edge-deployed memory-augmented AI",
    category: "platforms",
    icon: "☁️",
    status: "beta",
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "No-code memory integration with 5000+ apps",
    category: "platforms",
    icon: "⚡",
    status: "coming_soon",
  },
];

const categories = [
  { id: "all" as CategoryType, label: "All", count: integrations.length },
  { id: "frameworks" as CategoryType, label: "Frameworks", count: integrations.filter(i => i.category === "frameworks").length },
  { id: "llms" as CategoryType, label: "LLMs", count: integrations.filter(i => i.category === "llms").length },
  { id: "databases" as CategoryType, label: "Databases", count: integrations.filter(i => i.category === "databases").length },
  { id: "platforms" as CategoryType, label: "Platforms", count: integrations.filter(i => i.category === "platforms").length },
];

export default function IntegrationsClient() {
  const { t } = useDashboardTranslation();
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);

  const filteredIntegrations = integrations.filter((integration) => {
    const matchesCategory = selectedCategory === "all" || integration.category === selectedCategory;
    const matchesSearch =
      searchQuery === "" ||
      integration.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      integration.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--ink-900)]">
          {t("dashboard.integrations.title") || "Integrations"}
        </h1>
        <p className="text-[var(--ink-600)] mt-1">
          {t("dashboard.integrations.subtitle") || "Connect Seizn with your favorite tools and frameworks"}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="szn-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔌</span>
            <span className="text-sm text-[var(--ink-600)]">{t("dashboard.integrations.stats.total") || "Total Integrations"}</span>
          </div>
          <p className="text-2xl font-bold text-[var(--ink-900)]">{integrations.length}</p>
        </div>
        <div className="szn-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">✅</span>
            <span className="text-sm text-[var(--ink-600)]">{t("dashboard.integrations.stats.available") || "Available"}</span>
          </div>
          <p className="text-2xl font-bold text-[var(--signal-canon)]">{integrations.filter(i => i.status === "available").length}</p>
        </div>
        <div className="szn-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🧪</span>
            <span className="text-sm text-[var(--ink-600)]">{t("dashboard.integrations.stats.beta") || "In Beta"}</span>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{integrations.filter(i => i.status === "beta").length}</p>
        </div>
        <div className="szn-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔜</span>
            <span className="text-sm text-[var(--ink-600)]">{t("dashboard.integrations.stats.comingSoon") || "Coming Soon"}</span>
          </div>
          <p className="text-2xl font-bold text-[var(--ink-600)]">{integrations.filter(i => i.status === "coming_soon").length}</p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("dashboard.integrations.searchPlaceholder") || "Search integrations..."}
            className="w-full px-4 py-2 border border-[var(--ink-200)] rounded-lg bg-[var(--ink-0)] text-[var(--ink-900)] placeholder-[var(--ink-500)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-900)]"
          />
        </div>
        <div className="flex gap-1 bg-[var(--ink-50)] rounded-lg p-1 overflow-x-auto">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                selectedCategory === category.id
                  ? "bg-[var(--ink-0)] text-[var(--ink-900)] shadow-sm"
                  : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
              }`}
            >
              {category.label}
              <span className="ml-1 text-xs text-[var(--ink-500)]">({category.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Integration Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredIntegrations.map((integration) => (
          <div
            key={integration.id}
            onClick={() => setSelectedIntegration(integration)}
            className={`szn-card rounded-xl p-4 cursor-pointer transition-all hover:shadow-md hover:ring-1 hover:ring-[var(--ink-900)]/40 ${
              selectedIntegration?.id === integration.id ? "ring-2 ring-[var(--ink-900)]" : ""
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{integration.icon}</span>
                <div>
                  <h3 className="font-semibold text-[var(--ink-900)]">{integration.name}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      integration.status === "available"
                        ? "bg-[var(--signal-canon)]/10 text-[var(--signal-canon)]"
                        : integration.status === "beta"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                          : "bg-[var(--ink-50)] text-[var(--ink-600)]"
                    }`}
                  >
                    {integration.status === "available"
                      ? "Available"
                      : integration.status === "beta"
                        ? "Beta"
                        : "Coming Soon"}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-sm text-[var(--ink-600)] line-clamp-2">{integration.description}</p>

            {integration.status === "available" && (
              <div className="mt-3 flex gap-2">
                {integration.docsUrl && (
                  <a
                    href={integration.docsUrl}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs px-3 py-1.5 bg-[var(--ink-50)] text-[var(--ink-900)] rounded-lg hover:bg-[var(--ink-50)] transition-colors"
                  >
                    Docs
                  </a>
                )}
                {integration.installCommand && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(integration.installCommand || "");
                    }}
                    className="text-xs px-3 py-1.5 bg-[var(--signal-canon)]/10 text-[var(--signal-canon)] rounded-lg hover:bg-[var(--signal-canon)]/20 transition-colors"
                  >
                    Copy Install
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredIntegrations.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[var(--ink-600)]">No integrations found matching your criteria</p>
        </div>
      )}

      {/* Detail Modal */}
      {selectedIntegration && (
        <IntegrationModal
          integration={selectedIntegration}
          onClose={() => setSelectedIntegration(null)}
        />
      )}
    </div>
  );
}

function IntegrationModal({
  integration,
  onClose,
}: {
  integration: Integration;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (integration.installCommand) {
      navigator.clipboard.writeText(integration.installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
        onClick={onClose}
      >
      <div
        className="bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-lg max-w-lg w-full p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 mb-4">
          <span className="text-4xl">{integration.icon}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-[var(--ink-900)]">{integration.name}</h2>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  integration.status === "available"
                    ? "bg-[var(--signal-canon)]/10 text-[var(--signal-canon)]"
                    : integration.status === "beta"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                      : "bg-[var(--ink-50)] text-[var(--ink-600)]"
                }`}
              >
                {integration.status === "available"
                  ? "Available"
                  : integration.status === "beta"
                    ? "Beta"
                    : "Coming Soon"}
              </span>
            </div>
            <p className="text-[var(--ink-600)] mt-1">{integration.description}</p>
          </div>
        </div>

        {integration.status === "available" && (
          <>
            {integration.installCommand && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--ink-900)] mb-2">
                  Installation
                </label>
                <div className="flex items-center gap-2 bg-[var(--ink-900)] rounded-lg p-3">
                  <code className="flex-1 text-sm text-[var(--signal-canon)] font-mono">
                    {integration.installCommand}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="px-3 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--ink-900)] mb-2">
                Quick Start
              </label>
              <div className="bg-[var(--ink-50)] rounded-lg p-4">
                <pre className="text-sm text-[var(--ink-900)] overflow-x-auto">
                  {getQuickStartCode(integration.id)}
                </pre>
              </div>
            </div>
          </>
        )}

        {integration.status === "coming_soon" && (
          <div className="bg-[var(--ink-50)] rounded-lg p-4 mb-4">
            <p className="text-sm text-[var(--ink-600)]">
              This integration is currently in development. Sign up to get notified when it&apos;s available.
            </p>
            <button className="mt-3 px-4 py-2 bg-[var(--signal-canon)] text-white text-sm rounded-lg hover:bg-[var(--signal-canon)]/90">
              Notify Me
            </button>
          </div>
        )}

        {integration.status === "beta" && (
          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-700 dark:text-blue-200">
              This integration is in beta. Some features may change before the final release.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-[var(--ink-200)] text-[var(--ink-900)] rounded-lg hover:bg-[var(--ink-50)] transition-colors"
          >
            Close
          </button>
          {integration.docsUrl && (
            <a
              href={integration.docsUrl}
              className="flex-1 px-4 py-2 bg-[var(--ink-900)] text-white text-center rounded-lg hover:bg-[var(--ink-900)]/90"
            >
              View Documentation
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function getQuickStartCode(integrationId: string): string {
  const codeSnippets: Record<string, string> = {
    langchain: `from langchain_seizn import SeiznMemory

memory = SeiznMemory(api_key="your_key")
chain = ConversationChain(
    llm=ChatOpenAI(),
    memory=memory
)`,
    llamaindex: `from llama_index.memory.seizn import SeiznMemory

memory = SeiznMemory(api_key="your_key")
index = VectorStoreIndex.from_documents(
    documents,
    memory=memory
)`,
    openai: `from seizn import Seizn
from openai import OpenAI

seizn = Seizn(api_key="szn_xxx")
openai = OpenAI()

# Search relevant memories
memories = seizn.search("user preferences")

# Include in prompt
response = openai.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": f"Context: {memories}"},
        {"role": "user", "content": query}
    ]
)`,
    "vercel-ai": `import { seizn } from '@seizn/vercel-ai';
import { streamText } from 'ai';

const result = await streamText({
  model: openai('gpt-4'),
  prompt: query,
  memory: seizn({ apiKey: 'szn_xxx' }),
});`,
    nextjs: `// app/api/chat/route.ts
import { Seizn } from 'seizn';

const seizn = new Seizn({ apiKey: process.env.SEIZN_API_KEY });

export async function POST(req: Request) {
  const { message } = await req.json();

  // Get relevant context
  const memories = await seizn.search(message);

  // Use with your LLM...
}`,
  };

  return codeSnippets[integrationId] || `// Documentation coming soon for ${integrationId}`;
}
