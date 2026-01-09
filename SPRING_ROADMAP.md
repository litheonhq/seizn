# Seizn Spring Roadmap

## Product Overview

**Spring**은 Seizn의 B2C AI 챗봇 서비스로, 여러 AI 모델(GPT-4, Claude, Gemini, Llama, Mistral)을 하나의 인터페이스에서 사용할 수 있으며, 영구 메모리 기능을 통해 대화 컨텍스트가 세션과 모델 간에 유지됩니다.

- **Target Users**: 일반 사용자 (B2C)
- **Pricing**: Free + Pro ($9.99/month)
- **Core Value**: "One Chat. Every AI." - 모든 AI 모델을 하나의 인터페이스에서, 기억과 함께

---

## Current Status (v0.1 - Landing Page)

### Implemented Features
| Feature | Status | Location |
|---------|--------|----------|
| Landing Page | Done | `src/app/[locale]/spring/` |
| Multi-language Support | Done | en, ko, ja |
| Waitlist Form (Mock) | Done | spring-client.tsx |
| Feature Showcase | Done | Multi-model, Memory, Pricing |
| Responsive Design | Done | Mobile/Desktop |

### Tech Stack (Existing)
| Layer | Technology |
|-------|------------|
| Framework | Next.js 15.5 (App Router) |
| Auth | NextAuth v5 (beta) |
| Database | Supabase (PostgreSQL + pgvector) |
| Cache | Upstash Redis |
| Payments | LemonSqueezy |
| Embeddings | Voyage AI (voyage-3) |
| AI | Anthropic Claude (haiku/sonnet) |
| Email | Resend |
| Monitoring | Sentry |
| Analytics | PostHog |
| Hosting | Vercel |

### Existing APIs (Summer - can be reused)
| Endpoint | Purpose |
|----------|---------|
| `POST /api/memories` | Add memory |
| `GET /api/memories` | Search memories (vector/hybrid/keyword) |
| `DELETE /api/memories` | Delete memories |
| `POST /api/extract` | Extract memories from conversation |
| `POST /api/query` | Memory-augmented query |
| `POST /api/summarize` | Conversation summarization |
| `POST /api/extract/image` | Extract memories from images |

---

## Phase 1: MVP - Basic Chat (Q1 2026)

### 1.1 Authentication & User Management
- [ ] Spring-specific login/signup flow
- [ ] User profile with preferences (default model, theme)
- [ ] Session management for chat history
- [ ] OAuth integration (Google, GitHub)

### 1.2 Chat Interface
- [ ] **Chat UI Components**
  - Message bubble component (user/assistant)
  - Input area with send button
  - Typing indicator
  - Message timestamp
  - Copy/regenerate buttons

- [ ] **Conversation Management**
  - New chat creation
  - Chat history sidebar
  - Chat title auto-generation
  - Delete/archive conversations
  - Search within conversations

- [ ] **Streaming Responses**
  - Server-Sent Events (SSE) for real-time streaming
  - Token-by-token rendering
  - Cancel request mid-stream

### 1.3 Single Model Integration (Claude First)
- [ ] Claude API integration for chat
- [ ] System prompt configuration
- [ ] Context window management
- [ ] Error handling & retry logic

### 1.4 Basic Memory Integration
- [ ] Auto-extract memories from conversations
- [ ] Display relevant memories in chat
- [ ] Memory indicator in UI ("AI remembers...")
- [ ] Manual memory management (view/delete)

### 1.5 Database Schema Extensions
```sql
-- Spring-specific tables
CREATE TABLE spring_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  title TEXT,
  model TEXT DEFAULT 'claude',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE TABLE spring_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES spring_conversations(id),
  role TEXT CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT,
  model TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE spring_user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  default_model TEXT DEFAULT 'claude',
  theme TEXT DEFAULT 'light',
  auto_memory BOOLEAN DEFAULT TRUE,
  language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.6 API Endpoints (New)
```
POST /api/spring/chat          - Send message, get streaming response
GET  /api/spring/conversations - List user's conversations
POST /api/spring/conversations - Create new conversation
GET  /api/spring/conversations/:id - Get conversation with messages
DELETE /api/spring/conversations/:id - Delete conversation
PATCH /api/spring/conversations/:id - Update title/archive
```

---

## Phase 2: Multi-Model Support (Q2 2026)

### 2.1 Model Providers
| Provider | Models | Priority |
|----------|--------|----------|
| Anthropic | Claude Sonnet, Haiku, Opus | P0 |
| OpenAI | GPT-4o, GPT-4o-mini | P0 |
| Google | Gemini Pro, Gemini Flash | P1 |
| Meta | Llama 3.1 70B, 8B | P2 |
| Mistral | Mistral Large, Small | P2 |

### 2.2 Model Abstraction Layer
- [ ] Unified model interface
- [ ] Provider-specific adapters
- [ ] Automatic fallback on failure
- [ ] Model capability detection (vision, tools, etc.)

### 2.3 Model Switching UI
- [ ] Model selector dropdown in chat
- [ ] Model comparison view
- [ ] Per-message model indicator
- [ ] Switch model mid-conversation

### 2.4 Smart Model Routing
- [ ] Task-based model recommendation
- [ ] Cost optimization routing
- [ ] Speed vs quality toggle
- [ ] Custom model preferences

### 2.5 Provider Management
```typescript
// src/lib/providers/index.ts
interface ModelProvider {
  name: string;
  models: Model[];
  chat(messages: Message[], options: ChatOptions): AsyncIterable<string>;
  estimateTokens(text: string): number;
  getCapabilities(): Capabilities;
}

// Implement for each provider
class ClaudeProvider implements ModelProvider { ... }
class OpenAIProvider implements ModelProvider { ... }
class GeminiProvider implements ModelProvider { ... }
class LlamaProvider implements ModelProvider { ... }
class MistralProvider implements ModelProvider { ... }
```

---

## Phase 3: Advanced Memory (Q2-Q3 2026)

### 3.1 Memory Categories
- [ ] **Facts**: User info, preferences, technical skills
- [ ] **Relationships**: People, organizations, projects
- [ ] **Experiences**: Past events, achievements
- [ ] **Instructions**: How user wants to be treated

### 3.2 Memory UI
- [ ] Memory dashboard
- [ ] Memory timeline view
- [ ] Edit/correct memories
- [ ] Memory importance ranking
- [ ] Memory categories/tags

### 3.3 Cross-Model Memory
- [ ] Memory context injection per model
- [ ] Memory format optimization per provider
- [ ] Memory relevance scoring
- [ ] Memory deduplication

### 3.4 Privacy Controls
- [ ] Sensitive data detection
- [ ] Memory encryption option
- [ ] Selective memory sharing
- [ ] Memory export/import
- [ ] Complete memory wipe

---

## Phase 4: Pro Features (Q3 2026)

### 4.1 Usage & Billing
- [ ] Usage tracking (messages, tokens, models)
- [ ] Free tier limits (X messages/day or tokens/month)
- [ ] Pro subscription via LemonSqueezy
- [ ] Usage dashboard
- [ ] Billing portal

### 4.2 Pro Tier Features
| Feature | Free | Pro ($9.99/mo) |
|---------|------|----------------|
| Messages/month | 100 | Unlimited |
| Models | All | All |
| Memory storage | 1,000 | 50,000 |
| File uploads | No | Yes |
| Priority routing | No | Yes |
| API access | No | Yes |
| Custom instructions | Basic | Advanced |

### 4.3 Advanced Features
- [ ] Custom system prompts
- [ ] Conversation templates
- [ ] Keyboard shortcuts
- [ ] Dark/light theme
- [ ] Export conversations (MD, JSON, PDF)

---

## Phase 5: Multimodal & Extensions (Q4 2026)

### 5.1 Image Support
- [ ] Image upload in chat
- [ ] Image analysis (vision models)
- [ ] Image generation (DALL-E, Stable Diffusion)
- [ ] Screenshot capture
- [ ] Memory extraction from images

### 5.2 File Support
- [ ] PDF parsing
- [ ] Document Q&A
- [ ] Code file analysis
- [ ] Spreadsheet import

### 5.3 Voice
- [ ] Voice input (Whisper)
- [ ] Voice output (TTS)
- [ ] Conversation mode

### 5.4 Integrations
- [ ] Web search
- [ ] URL preview
- [ ] Code execution sandbox
- [ ] Browser extension

---

## Phase 6: Mobile & Desktop (2027)

### 6.1 Mobile Apps
- [ ] React Native / Flutter app
- [ ] iOS App Store
- [ ] Android Play Store
- [ ] Push notifications
- [ ] Offline mode (local LLMs)

### 6.2 Desktop Apps
- [ ] Electron app
- [ ] Global hotkey
- [ ] System tray
- [ ] Screenshot integration

---

## Technical Roadmap

### Architecture
```
┌─────────────────────────────────────────────────────────┐
│                     Spring Frontend                      │
│  (Next.js 15 + React 18 + Tailwind CSS + shadcn/ui)    │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    Spring API Layer                      │
│         /api/spring/* (Next.js API Routes)              │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Model Router  │   │ Memory Layer  │   │  User Layer   │
│  (Providers)  │   │  (Existing)   │   │   (Auth)      │
└───────────────┘   └───────────────┘   └───────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Claude      │   │   Supabase    │   │   NextAuth    │
│   OpenAI      │   │   (pgvector)  │   │   (Supabase)  │
│   Gemini      │   │   + Redis     │   │               │
│   Llama       │   │               │   │               │
│   Mistral     │   │               │   │               │
└───────────────┘   └───────────────┘   └───────────────┘
```

### Key Technical Decisions
1. **Streaming**: SSE for real-time responses (not WebSocket)
2. **State Management**: React hooks + Zustand for global state
3. **UI Components**: shadcn/ui for consistency
4. **Model Abstraction**: Adapter pattern for multi-provider support
5. **Memory Integration**: Reuse Summer's memory infrastructure

### Performance Targets
| Metric | Target |
|--------|--------|
| Time to First Token | < 500ms |
| Memory Retrieval | < 50ms |
| Chat Load Time | < 1s |
| Mobile LCP | < 2.5s |

---

## Milestones

### M1: Alpha (End of Q1 2026)
- [ ] Basic chat with Claude
- [ ] User auth & sessions
- [ ] Conversation history
- [ ] Basic memory integration
- [ ] Internal testing

### M2: Beta (Mid Q2 2026)
- [ ] Multi-model (Claude + GPT-4)
- [ ] Streaming responses
- [ ] Memory dashboard
- [ ] Waitlist invites
- [ ] Beta user feedback

### M3: Public Launch (End of Q2 2026)
- [ ] All 5 model providers
- [ ] Free + Pro tiers
- [ ] Production stability
- [ ] Marketing launch
- [ ] App Store (if mobile ready)

### M4: Growth (Q3-Q4 2026)
- [ ] Multimodal features
- [ ] Mobile apps
- [ ] 10,000 MAU target
- [ ] Revenue: $10K MRR

---

## File Structure (Proposed)

```
src/app/[locale]/spring/
├── page.tsx                 # Landing page (existing)
├── spring-client.tsx        # Landing client (existing)
├── chat/
│   ├── page.tsx             # Main chat interface
│   ├── chat-client.tsx      # Chat client component
│   ├── [id]/
│   │   └── page.tsx         # Specific conversation
│   └── layout.tsx           # Chat layout with sidebar
├── memories/
│   ├── page.tsx             # Memory dashboard
│   └── memories-client.tsx
├── settings/
│   ├── page.tsx             # User settings
│   └── settings-client.tsx
└── api/                     # Or in src/app/api/spring/
    ├── chat/route.ts
    ├── conversations/route.ts
    └── memories/route.ts

src/components/spring/
├── ChatMessage.tsx
├── ChatInput.tsx
├── ConversationList.tsx
├── ModelSelector.tsx
├── MemoryIndicator.tsx
└── StreamingText.tsx

src/lib/spring/
├── providers/
│   ├── index.ts
│   ├── claude.ts
│   ├── openai.ts
│   ├── gemini.ts
│   ├── llama.ts
│   └── mistral.ts
├── hooks/
│   ├── useChat.ts
│   ├── useConversations.ts
│   └── useMemories.ts
└── utils/
    ├── stream.ts
    └── tokens.ts
```

---

## Dependencies to Add

```json
{
  "dependencies": {
    "openai": "^4.x",
    "@google/generative-ai": "^0.x",
    "@huggingface/inference": "^2.x",
    "zustand": "^4.x",
    "eventsource-parser": "^1.x"
  },
  "devDependencies": {
    "@radix-ui/react-*": "shadcn/ui components"
  }
}
```

---

## Competitive Analysis

| Feature | Spring | ChatGPT | Claude.ai | Poe |
|---------|--------|---------|-----------|-----|
| Multi-model | Yes | No | No | Yes |
| Persistent Memory | Yes | Limited | No | No |
| Free Tier | Generous | Limited | Limited | Limited |
| API Access | Pro | No | No | Yes |
| Open Models | Yes | No | No | Yes |

**Spring's Differentiators:**
1. True persistent memory across all models
2. All major models in one interface
3. Cursor-level generous free tier
4. Developer-friendly (API access in Pro)

---

## Success Metrics

| Metric | M3 Target | M4 Target |
|--------|-----------|-----------|
| MAU | 1,000 | 10,000 |
| DAU/MAU | 30% | 40% |
| Pro Conversion | 5% | 8% |
| MRR | $500 | $10,000 |
| Messages/User/Day | 10 | 20 |
| Memory Usage | 50% | 70% |

---

## Open Questions

1. **Model Pricing Pass-through**: Should Pro users pay per-token for expensive models (GPT-4o, Claude Opus)?
2. **Memory Sync**: How to handle memory conflicts across models?
3. **Mobile First**: Should mobile app development start earlier?
4. **Enterprise**: Should there be a Spring Enterprise tier?
5. **Plugins/Extensions**: Allow third-party integrations?

---

## References

- [Summer API Documentation](./docs/api-reference)
- [Seizn Memory Infrastructure](./src/lib/ai.ts)
- [Design System](./src/components)
- [i18n Dictionaries](./src/i18n/dictionaries)

---

*Last Updated: January 2026*
*Author: Claude Code*
