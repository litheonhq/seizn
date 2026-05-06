/**
 * Track 2 (API + MCP, USD) pricing copy — 4 base locales.
 *
 * Mirrors the 4-locale pattern in pricing-copy.ts (en / ko / ja / zh-hans).
 * Tier identifiers (Free / Indie / Pro / Studio / Studio Managed / Enterprise),
 * USD prices, scope codes, and product metadata stay universal — only the
 * marketing prose around them localises. The 17 secondary locales fall back to
 * EN at render time (same pattern the dashboard uses).
 */

export type Track2PricingLocale = "en" | "ko" | "ja" | "zh-hans";

export interface Track2TierCopy {
  /** Per-tier extra explanation (1-2 sentences). */
  notes: string;
  /** CTA button label. */
  cta: string;
}

export interface Track2PricingCopy {
  eyebrow: string;
  title: string;
  subtitle: string;
  hostLlmCallout: {
    /** First strong-tagged half ("Already on Claude Pro / Max…") */
    head: string;
    /** Remainder. <code> markers for `recall` / `check` / `timeline` baked in by the consumer. */
    body: string;
  };
  badges: {
    startHere: string;
  };
  table: {
    quota: string;
    rate: string;
    scopes: string;
  };
  tiers: {
    free: Track2TierCopy;
    indie: Track2TierCopy;
    pro: Track2TierCopy;
    studio: Track2TierCopy;
    studioManaged: Track2TierCopy;
    enterprise: Track2TierCopy;
  };
  footnote: {
    body: string;
    apiDocs: string;
    openApi: string;
    npm: string;
  };
}

export const TRACK2_PRICING_COPY: Record<Track2PricingLocale, Track2PricingCopy> = {
  en: {
    eyebrow: "Track 2 — API + MCP · USD · Live since 2026-05-06",
    title: "Plug Seizn into your own AI tool.",
    subtitle:
      "REST API + MCP server for fiction writers. Recall canon, run conflict checks, explore timeline + graph from inside Claude Desktop, Claude Code, Cursor, Cline, Continue, and (when MCP support lands) ChatGPT.",
    hostLlmCallout: {
      head: "Already on Claude Pro / Max, Cursor Pro, or ChatGPT Plus?",
      body: "The four read tools (recall, remember, graph, search) work on the Free tier with no extra LLM key — your host AI handles chat, Seizn handles canon. Only check and timeline need a separate Anthropic / OpenAI key (BYOK) or Studio Managed.",
    },
    badges: { startHere: "Start here" },
    table: { quota: "Quota", rate: "Rate", scopes: "Scopes" },
    tiers: {
      free: {
        notes: "No LLM key needed. Works on Claude Desktop / Code / Cursor / Cline / Continue out of the box.",
        cta: "Get a Free key",
      },
      indie: {
        notes: "Adds AI-enhanced conflict checks and timeline beats. BYOK any provider.",
        cta: "Choose Indie",
      },
      pro: {
        notes: "Multi-project workflows, project-level writes, BYOK required for AI tools.",
        cta: "Choose Pro",
      },
      studio: {
        notes: "Studio teams: shared canon, audit log access, multi-key rotation. BYOK required.",
        cta: "Choose Studio",
      },
      studioManaged: {
        notes: "We host the LLM. Includes 500 Opus calls; $0.15 / call metered overage. No BYOK setup.",
        cta: "Choose Studio Managed",
      },
      enterprise: {
        notes: "SOC 2 / SSO / VPC, custom quotas, audit log streaming, named CSM.",
        cta: "Talk to sales",
      },
    },
    footnote: {
      body: "Track 2 (API + MCP) is billed in USD on a separate Stripe subscription from the Track 1 web plans above. Host-LLM cost (Claude / GPT chat subscription) is always separate — Seizn doesn't double-charge.",
      apiDocs: "Read the API docs",
      openApi: "OpenAPI spec",
      npm: "npm",
    },
  },
  ko: {
    eyebrow: "트랙 2 — API + MCP · USD · 2026-05-06 출시",
    title: "쓰던 AI 도구에 시즌을 붙이세요.",
    subtitle:
      "소설 작가용 REST API + MCP 서버. Claude Desktop · Claude Code · Cursor · Cline · Continue, 그리고 ChatGPT(MCP 지원 시) 안에서 캐논을 불러오고, 충돌을 검사하고, 타임라인과 관계 그래프를 탐색합니다.",
    hostLlmCallout: {
      head: "Claude Pro / Max, Cursor Pro, ChatGPT Plus를 이미 쓰시나요?",
      body: "네 가지 읽기 도구(recall · remember · graph · search)는 Free 등급에서 별도 LLM 키 없이 동작합니다. 호스트 AI가 대화를, 시즌이 캐논을 담당합니다. check와 timeline만 별도 Anthropic · OpenAI 키(BYOK) 또는 Studio Managed가 필요합니다.",
    },
    badges: { startHere: "여기서 시작" },
    table: { quota: "쿼터", rate: "분당 한도", scopes: "스코프" },
    tiers: {
      free: {
        notes: "LLM 키 불필요. Claude Desktop · Code · Cursor · Cline · Continue에서 바로 동작합니다.",
        cta: "무료 키 받기",
      },
      indie: {
        notes: "AI 기반 충돌 검사와 타임라인 비트가 추가됩니다. 어떤 공급자든 BYOK 가능.",
        cta: "Indie 선택",
      },
      pro: {
        notes: "여러 프로젝트 워크플로우와 project-level 쓰기. AI 도구는 BYOK 필요.",
        cta: "Pro 선택",
      },
      studio: {
        notes: "스튜디오 팀용: 공유 캐논, 감사 로그 접근, 멀티 키 로테이션. BYOK 필요.",
        cta: "Studio 선택",
      },
      studioManaged: {
        notes: "LLM을 시즌이 호스팅합니다. 월 500회 Opus 호출 포함, 초과분은 회당 $0.15 메터링. BYOK 설정 불필요.",
        cta: "Studio Managed 선택",
      },
      enterprise: {
        notes: "SOC 2 / SSO / VPC, 맞춤 쿼터, 감사 로그 스트리밍, 전담 CSM 제공.",
        cta: "영업팀 문의",
      },
    },
    footnote: {
      body: "트랙 2(API + MCP)는 위의 트랙 1 웹 요금과 별도의 Stripe 구독으로 USD 청구됩니다. 호스트 LLM 비용(Claude · GPT 채팅 구독)은 언제나 별개 — 시즌이 이중 과금하지 않습니다.",
      apiDocs: "API 문서 보기",
      openApi: "OpenAPI 스펙",
      npm: "npm",
    },
  },
  ja: {
    eyebrow: "トラック 2 — API + MCP · USD · 2026-05-06 ローンチ",
    title: "お使いの AI ツールに Seizn を接続。",
    subtitle:
      "小説家向けの REST API と MCP サーバー。Claude Desktop · Claude Code · Cursor · Cline · Continue、そして ChatGPT（MCP 対応後）から、正典の参照・矛盾チェック・タイムラインや関係グラフの探索ができます。",
    hostLlmCallout: {
      head: "すでに Claude Pro / Max、Cursor Pro、ChatGPT Plus をお使いですか?",
      body: "4 つの読み取りツール（recall・remember・graph・search）は Free プランで追加の LLM キーなしに動作します。ホスト AI がチャットを、Seizn が正典を担当します。check と timeline のみ、別途 Anthropic · OpenAI キー（BYOK）または Studio Managed が必要です。",
    },
    badges: { startHere: "ここから" },
    table: { quota: "クォータ", rate: "レート", scopes: "スコープ" },
    tiers: {
      free: {
        notes: "LLM キーは不要。Claude Desktop · Code · Cursor · Cline · Continue でそのまま動きます。",
        cta: "無料キーを取得",
      },
      indie: {
        notes: "AI による矛盾チェックとタイムライン抽出が加わります。任意のプロバイダで BYOK。",
        cta: "Indie を選ぶ",
      },
      pro: {
        notes: "複数プロジェクト運用と project-level 書き込み。AI ツールには BYOK が必要。",
        cta: "Pro を選ぶ",
      },
      studio: {
        notes: "スタジオチーム向け: 共有正典、監査ログアクセス、マルチキーのローテーション。BYOK 必要。",
        cta: "Studio を選ぶ",
      },
      studioManaged: {
        notes: "LLM を Seizn 側でホストします。月 500 回の Opus 呼び出しを含み、超過は 1 回 $0.15 のメータリング課金。BYOK 設定は不要です。",
        cta: "Studio Managed を選ぶ",
      },
      enterprise: {
        notes: "SOC 2 / SSO / VPC、カスタムクォータ、監査ログのストリーミング、専任 CSM。",
        cta: "営業に問い合わせ",
      },
    },
    footnote: {
      body: "トラック 2（API + MCP）は、上のトラック 1 ウェブプランとは別の Stripe サブスクリプションで USD 請求です。ホスト LLM のコスト（Claude · GPT チャットサブスク）は常に別建て — Seizn が二重課金することはありません。",
      apiDocs: "API ドキュメント",
      openApi: "OpenAPI 仕様",
      npm: "npm",
    },
  },
  "zh-hans": {
    eyebrow: "Track 2 — API + MCP · USD · 2026-05-06 上线",
    title: "把 Seizn 接入你已在用的 AI 工具。",
    subtitle:
      "面向小说创作者的 REST API 与 MCP 服务器。在 Claude Desktop、Claude Code、Cursor、Cline、Continue 以及（MCP 接入后的）ChatGPT 中,直接调用 Seizn 的正典回忆、冲突检查、时间线与关系图谱。",
    hostLlmCallout: {
      head: "已经订阅 Claude Pro / Max、Cursor Pro 或 ChatGPT Plus?",
      body: "四个只读工具(recall · remember · graph · search)在 Free 层即可使用,无需额外 LLM 密钥 —— 宿主 AI 负责对话,Seizn 负责正典。仅 check 与 timeline 需要单独的 Anthropic · OpenAI 密钥(BYOK)或 Studio Managed。",
    },
    badges: { startHere: "从这里开始" },
    table: { quota: "配额", rate: "每分钟限速", scopes: "权限范围" },
    tiers: {
      free: {
        notes: "无需 LLM 密钥。Claude Desktop · Code · Cursor · Cline · Continue 开箱即用。",
        cta: "获取免费密钥",
      },
      indie: {
        notes: "新增 AI 辅助的冲突检查与时间线节奏分析,任意供应商均可 BYOK。",
        cta: "选择 Indie",
      },
      pro: {
        notes: "多项目工作流、项目级写入,AI 工具需要 BYOK。",
        cta: "选择 Pro",
      },
      studio: {
        notes: "面向工作室团队:共享正典、审计日志访问、多密钥轮换,需要 BYOK。",
        cta: "选择 Studio",
      },
      studioManaged: {
        notes: "由 Seizn 托管 LLM。每月含 500 次 Opus 调用,超额按每次 $0.15 计费,无需 BYOK 配置。",
        cta: "选择 Studio Managed",
      },
      enterprise: {
        notes: "SOC 2 / SSO / VPC、定制配额、审计日志流式输出、专属客户成功经理。",
        cta: "联系销售",
      },
    },
    footnote: {
      body: "Track 2(API + MCP)以 USD 单独计费,是与上方 Track 1 网页版套餐相互独立的 Stripe 订阅。宿主 LLM 费用(Claude · GPT 聊天订阅)始终独立 —— Seizn 不会重复收费。",
      apiDocs: "查看 API 文档",
      openApi: "OpenAPI 规范",
      npm: "npm",
    },
  },
};

export function getTrack2PricingCopy(locale: string): Track2PricingCopy {
  if (locale === "ko" || locale === "ja" || locale === "zh-hans") {
    return TRACK2_PRICING_COPY[locale];
  }
  return TRACK2_PRICING_COPY.en;
}
