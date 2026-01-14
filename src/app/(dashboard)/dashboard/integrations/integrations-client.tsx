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
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("integrations.title") || "Integrations"}
        </h1>
        <p className="text-gray-500 mt-1">
          {t("integrations.subtitle") || "Connect Seizn with your favorite tools and frameworks"}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔌</span>
            <span className="text-sm text-gray-500">{t("integrations.stats.total") || "Total Integrations"}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{integrations.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">✅</span>
            <span className="text-sm text-gray-500">{t("integrations.stats.available") || "Available"}</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{integrations.filter(i => i.status === "available").length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🧪</span>
            <span className="text-sm text-gray-500">{t("integrations.stats.beta") || "In Beta"}</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">{integrations.filter(i => i.status === "beta").length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔜</span>
            <span className="text-sm text-gray-500">{t("integrations.stats.comingSoon") || "Coming Soon"}</span>
          </div>
          <p className="text-2xl font-bold text-gray-600">{integrations.filter(i => i.status === "coming_soon").length}</p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("integrations.searchPlaceholder") || "Search integrations..."}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                selectedCategory === category.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {category.label}
              <span className="ml-1 text-xs text-gray-400">({category.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Integration Grid */}
      <div className="grid grid-cols-3 gap-4">
        {filteredIntegrations.map((integration) => (
          <div
            key={integration.id}
            onClick={() => setSelectedIntegration(integration)}
            className={`bg-white rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md hover:border-emerald-300 ${
              selectedIntegration?.id === integration.id ? "ring-2 ring-emerald-500" : ""
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{integration.icon}</span>
                <div>
                  <h3 className="font-semibold text-gray-900">{integration.name}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      integration.status === "available"
                        ? "bg-emerald-100 text-emerald-700"
                        : integration.status === "beta"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
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
            <p className="text-sm text-gray-500 line-clamp-2">{integration.description}</p>

            {integration.status === "available" && (
              <div className="mt-3 flex gap-2">
                {integration.docsUrl && (
                  <a
                    href={integration.docsUrl}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs px-3 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
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
                    className="text-xs px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors"
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
          <p className="text-gray-500">No integrations found matching your criteria</p>
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
        className="bg-white rounded-2xl max-w-lg w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 mb-4">
          <span className="text-4xl">{integration.icon}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">{integration.name}</h2>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  integration.status === "available"
                    ? "bg-emerald-100 text-emerald-700"
                    : integration.status === "beta"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {integration.status === "available"
                  ? "Available"
                  : integration.status === "beta"
                    ? "Beta"
                    : "Coming Soon"}
              </span>
            </div>
            <p className="text-gray-500 mt-1">{integration.description}</p>
          </div>
        </div>

        {integration.status === "available" && (
          <>
            {integration.installCommand && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Installation
                </label>
                <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-3">
                  <code className="flex-1 text-sm text-emerald-400 font-mono">
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quick Start
              </label>
              <div className="bg-gray-50 rounded-lg p-4">
                <pre className="text-sm text-gray-700 overflow-x-auto">
                  {getQuickStartCode(integration.id)}
                </pre>
              </div>
            </div>
          </>
        )}

        {integration.status === "coming_soon" && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-600">
              This integration is currently in development. Sign up to get notified when it&apos;s available.
            </p>
            <button className="mt-3 px-4 py-2 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600">
              Notify Me
            </button>
          </div>
        )}

        {integration.status === "beta" && (
          <div className="bg-blue-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-700">
              This integration is in beta. Some features may change before the final release.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
          {integration.docsUrl && (
            <a
              href={integration.docsUrl}
              className="flex-1 px-4 py-2 bg-emerald-500 text-white text-center rounded-lg hover:bg-emerald-600"
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
import { Seizn } from '@seizn/sdk';

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
