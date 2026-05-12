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
    description: "Run LangChain NPC agents with durable memory, faction state, and relationship recall.",
    category: "frameworks",
    icon: "🦜",
    status: "available",
    docsUrl: "/docs/integrations/langchain",
    installCommand: "pip install langchain-seizn",
  },
  {
    id: "llamaindex",
    name: "LlamaIndex",
    description: "Add long-term NPC memory and event recall to LlamaIndex retrieval flows.",
    category: "frameworks",
    icon: "🦙",
    status: "available",
    docsUrl: "/docs/integrations/llamaindex",
    installCommand: "pip install llama-index-memory-seizn",
  },
  {
    id: "haystack",
    name: "Haystack",
    description: "Layer NPC memory retrieval into quest, dialogue, and world-state pipelines.",
    category: "frameworks",
    icon: "🌾",
    status: "beta",
    docsUrl: "/docs/integrations/haystack",
  },
  {
    id: "semantic-kernel",
    name: "Semantic Kernel",
    description: "Persist NPC memory and relationship state across Semantic Kernel orchestration.",
    category: "frameworks",
    icon: "🔷",
    status: "coming_soon",
  },
  // LLMs
  {
    id: "openai",
    name: "OpenAI",
    description: "Power GPT-driven NPC dialogue while Seizn stores long-term memory and recall.",
    category: "llms",
    icon: "🤖",
    status: "available",
    docsUrl: "/docs/integrations/openai",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    description: "Run Claude-based NPCs with durable memory, relationships, and cross-session context.",
    category: "llms",
    icon: "🧠",
    status: "available",
    docsUrl: "/docs/integrations/anthropic",
  },
  {
    id: "google-gemini",
    name: "Google Gemini",
    description: "Retrieve NPC context and world-state memory inside Gemini-powered game flows.",
    category: "llms",
    icon: "💎",
    status: "available",
    docsUrl: "/docs/integrations/gemini",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    description: "Give Mistral-powered NPCs durable recall between sessions and events.",
    category: "llms",
    icon: "🌊",
    status: "beta",
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Pair local dialogue models with Seizn for persistent NPC memory.",
    category: "llms",
    icon: "🦙",
    status: "available",
    docsUrl: "/docs/integrations/ollama",
  },
  // Databases
  {
    id: "supabase",
    name: "Supabase",
    description: "Sync NPC memory entities, relationships, and auth-backed project access with Supabase.",
    category: "databases",
    icon: "⚡",
    status: "available",
    docsUrl: "/docs/integrations/supabase",
  },
  {
    id: "pinecone",
    name: "Pinecone",
    description: "Use Pinecone alongside Seizn's NPC memory graph and relationship layer.",
    category: "databases",
    icon: "🌲",
    status: "coming_soon",
  },
  {
    id: "weaviate",
    name: "Weaviate",
    description: "Self-host vector search while Seizn owns NPC memory, entities, and relations.",
    category: "databases",
    icon: "🔮",
    status: "coming_soon",
  },
  // Platforms
  {
    id: "vercel-ai",
    name: "Vercel AI SDK",
    description: "Stream NPC dialogue with Seizn memory in the loop using Vercel AI SDK.",
    category: "platforms",
    icon: "▲",
    status: "available",
    docsUrl: "/docs/integrations/vercel",
    installCommand: "npm install @seizn/vercel-ai",
  },
  {
    id: "nextjs",
    name: "Next.js",
    description: "Ship NPC memory-backed game tools, live ops, and dashboards with Next.js.",
    category: "platforms",
    icon: "⬛",
    status: "available",
    docsUrl: "/docs/integrations/nextjs",
  },
  {
    id: "cloudflare-workers",
    name: "Cloudflare Workers",
    description: "Run edge NPC services with Seizn-backed memory retrieval and recall.",
    category: "platforms",
    icon: "☁️",
    status: "beta",
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "Trigger NPC memory workflows across live-ops and support tools without code.",
    category: "platforms",
    icon: "⚡",
    status: "coming_soon",
  },
];

function getIntegrationStatusLabel(
  status: Integration["status"],
  t: ReturnType<typeof useDashboardTranslation>["t"]
) {
  if (status === "available") return t("dashboard.integrations.status.available");
  if (status === "beta") return t("dashboard.integrations.status.beta");
  return t("dashboard.integrations.status.comingSoon");
}

export default function IntegrationsClient() {
  const { t } = useDashboardTranslation();
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const categories = [
    { id: "all" as CategoryType, label: t("dashboard.integrations.categories.all"), count: integrations.length },
    { id: "frameworks" as CategoryType, label: t("dashboard.integrations.categories.frameworks"), count: integrations.filter(i => i.category === "frameworks").length },
    { id: "llms" as CategoryType, label: t("dashboard.integrations.categories.llms"), count: integrations.filter(i => i.category === "llms").length },
    { id: "databases" as CategoryType, label: t("dashboard.integrations.categories.databases"), count: integrations.filter(i => i.category === "databases").length },
    { id: "platforms" as CategoryType, label: t("dashboard.integrations.categories.platforms"), count: integrations.filter(i => i.category === "platforms").length },
  ];

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
        <h1 className="text-2xl font-bold text-szn-text-1">
          {t("dashboard.integrations.title")}
        </h1>
        <p className="text-szn-text-2 mt-1">
          {t("dashboard.integrations.subtitle")}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="szn-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔌</span>
            <span className="text-sm text-szn-text-2">{t("dashboard.integrations.stats.total")}</span>
          </div>
          <p className="text-2xl font-bold text-szn-text-1">{integrations.length}</p>
        </div>
        <div className="szn-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">✅</span>
            <span className="text-sm text-szn-text-2">{t("dashboard.integrations.stats.available")}</span>
          </div>
          <p className="text-2xl font-bold text-szn-success">{integrations.filter(i => i.status === "available").length}</p>
        </div>
        <div className="szn-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🧪</span>
            <span className="text-sm text-szn-text-2">{t("dashboard.integrations.stats.beta")}</span>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{integrations.filter(i => i.status === "beta").length}</p>
        </div>
        <div className="szn-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔜</span>
            <span className="text-sm text-szn-text-2">{t("dashboard.integrations.stats.comingSoon")}</span>
          </div>
          <p className="text-2xl font-bold text-szn-text-2">{integrations.filter(i => i.status === "coming_soon").length}</p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex-1">
          <input aria-label="Search query"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("dashboard.integrations.searchPlaceholder")}
            className="w-full px-4 py-2 border border-szn-border rounded-lg bg-szn-card text-szn-text-1 placeholder-szn-text-3 focus:outline-none focus:ring-2 focus:ring-szn-accent"
          />
        </div>
        <div className="flex gap-1 bg-szn-surface rounded-lg p-1 overflow-x-auto">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                selectedCategory === category.id
                  ? "bg-szn-card text-szn-text-1 shadow-sm"
                  : "text-szn-text-2 hover:text-szn-text-1"
              }`}
            >
              {category.label}
              <span className="ml-1 text-xs text-szn-text-3">({category.count})</span>
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
            className={`szn-card rounded-xl p-4 cursor-pointer transition-all hover:shadow-md hover:ring-1 hover:ring-szn-accent/40 ${
              selectedIntegration?.id === integration.id ? "ring-2 ring-szn-accent" : ""
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{integration.icon}</span>
                <div>
                  <h3 className="font-semibold text-szn-text-1">{integration.name}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      integration.status === "available"
                        ? "bg-szn-success/10 text-szn-success"
                        : integration.status === "beta"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                          : "bg-szn-surface text-szn-text-2"
                    }`}
                  >
                    {getIntegrationStatusLabel(integration.status, t)}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-sm text-szn-text-2 line-clamp-2">{integration.description}</p>

            {integration.status === "available" && (
              <div className="mt-3 flex gap-2">
                {integration.docsUrl && (
                  <a
                    href={integration.docsUrl}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs px-3 py-1.5 bg-szn-surface text-szn-text-1 rounded-lg hover:bg-szn-surface-1 transition-colors"
                  >
                    {t("dashboard.integrations.docs")}
                  </a>
                )}
                {integration.installCommand && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(integration.installCommand || "");
                    }}
                    className="text-xs px-3 py-1.5 bg-szn-success/10 text-szn-success rounded-lg hover:bg-szn-success/20 transition-colors"
                  >
                    {t("dashboard.integrations.copyInstall")}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredIntegrations.length === 0 && (
        <div className="text-center py-12">
          <p className="text-szn-text-2">{t("dashboard.integrations.noResults")}</p>
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
  const { t } = useDashboardTranslation();
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
        className="bg-szn-card border border-szn-border rounded-lg max-w-lg w-full p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 mb-4">
          <span className="text-4xl">{integration.icon}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-szn-text-1">{integration.name}</h2>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  integration.status === "available"
                    ? "bg-szn-success/10 text-szn-success"
                    : integration.status === "beta"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                      : "bg-szn-surface text-szn-text-2"
                }`}
              >
                {getIntegrationStatusLabel(integration.status, t)}
              </span>
            </div>
            <p className="text-szn-text-2 mt-1">{integration.description}</p>
          </div>
        </div>

        {integration.status === "available" && (
          <>
            {integration.installCommand && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-szn-text-1 mb-2">
                  {t("dashboard.integrations.installation")}
                </label>
                <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-3">
                  <code className="flex-1 text-sm text-szn-success font-mono">
                    {integration.installCommand}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="px-3 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                  >
                    {copied ? t("dashboard.integrations.copied") : t("dashboard.integrations.copy")}
                  </button>
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-szn-text-1 mb-2">
                {t("dashboard.integrations.quickStart")}
              </label>
              <div className="bg-szn-bg rounded-lg p-4">
                <pre className="text-sm text-szn-text-1 overflow-x-auto">
                  {getQuickStartCode(integration.id)}
                </pre>
              </div>
            </div>
          </>
        )}

        {integration.status === "coming_soon" && (
          <div className="bg-szn-bg rounded-lg p-4 mb-4">
            <p className="text-sm text-szn-text-2">
              {t("dashboard.integrations.comingSoonMsg")}
            </p>
            <button className="mt-3 px-4 py-2 bg-szn-success text-white text-sm rounded-lg hover:bg-szn-success/90">
              {t("dashboard.integrations.notifyMe")}
            </button>
          </div>
        )}

        {integration.status === "beta" && (
          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-700 dark:text-blue-200">
              {t("dashboard.integrations.betaMsg")}
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-szn-border text-szn-text-1 rounded-lg hover:bg-szn-surface-1 transition-colors"
          >
            {t("dashboard.integrations.close")}
          </button>
          {integration.docsUrl && (
            <a
              href={integration.docsUrl}
              className="flex-1 px-4 py-2 bg-szn-accent text-white text-center rounded-lg hover:bg-szn-accent/90"
            >
              {t("dashboard.integrations.viewDocs")}
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
