import Link from "next/link";
import { CheckoutButton } from "@/components/checkout-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  AUTHOR_BILLING_TIERS,
  type AuthorBillingTier,
} from "@/lib/stripe-config";
import {
  getArray,
  getString,
  type SaebyeokDemoData,
} from "@/lib/sample-ip-demo";
import type { Locale } from "@/i18n/config";
import type { CheckoutLegalCopy } from "@/lib/checkout-copy";

type LaunchLocale = "en" | "ko" | "ja" | "zh-hans";

interface LandingCopy {
  localeLabel: string;
  nav: {
    demo: string;
    workflow: string;
    pricing: string;
    docs: string;
    signIn: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
    graphLabel: string;
    reviewLabel: string;
    simulationLabel: string;
  };
  demo: {
    label: string;
    title: string;
    body: string;
    openDemo: string;
    stats: {
      characters: string;
      rules: string;
      events: string;
      cases: string;
    };
  };
  workflow: {
    title: string;
    steps: Array<{ title: string; body: string }>;
  };
  inputs: {
    title: string;
    modes: Array<{ name: string; body: string }>;
  };
  conflicts: {
    title: string;
    body: string;
    cards: Array<{ severity: string; title: string; body: string }>;
  };
  simulation: {
    title: string;
    body: string;
    safeLabel: string;
    riskLabel: string;
  };
  trust: {
    title: string;
    items: Array<{ title: string; body: string }>;
  };
  pricing: {
    eyebrow: string;
    title: string;
    subtitle: string;
    cadence: string;
    start: string;
    contact: string;
    yearlyNote: string;
    overage: string;
    byok: string;
    features: Record<AuthorBillingTier, string[]>;
  };
  faq: {
    title: string;
    items: Array<{ q: string; a: string }>;
  };
  footer: {
    tagline: string;
    product: string;
    resources: string;
    legal: string;
    privacy: string;
    terms: string;
    beta: string;
    engine: string;
    contact: string;
  };
  checkout: CheckoutLegalCopy;
}

const COPY: Record<LaunchLocale, LandingCopy> = {
  en: {
    localeLabel: "English",
    nav: {
      demo: "Demo",
      workflow: "Workflow",
      pricing: "Pricing",
      docs: "Docs",
      signIn: "Sign in",
    },
    hero: {
      eyebrow: "01 / Author Memory",
      title: "Your story, remembered exactly as you wrote it.",
      subtitle:
        "Bring your worldbuilding, characters, and scenes together. Seizn catches canon conflicts automatically. Your review becomes the source of truth.",
      primaryCta: "Start 30-day free trial",
      secondaryCta: "See it work",
      graphLabel: "Canon graph",
      reviewLabel: "Review queue",
      simulationLabel: "Scene simulation",
    },
    demo: {
      label: "Sample IP - Synthetic Demo Data",
      title: "Saebyeok sample IP, rendered as an author workflow.",
      body:
        "The public demo uses a synthetic 30-day school SF mystery, separated from internal dogfood material and loaded from the Phase C sample files.",
      openDemo: "Open full demo",
      stats: {
        characters: "characters",
        rules: "world rules",
        events: "timeline events",
        cases: "review cases",
      },
    },
    workflow: {
      title: "From drafts to canon in three reviewable moves.",
      steps: [
        {
          title: "Import your material",
          body: "Bring Word drafts, notes, pasted scenes, or structured records into one author workspace.",
        },
        {
          title: "Review extracted facts",
          body: "Approve, reject, merge, or split character, rule, event, relationship, and voice candidates.",
        },
        {
          title: "Write with canon memory",
          body: "Conflict checks and simulation outputs use the decisions you approved, not hidden model guesses.",
        },
      ],
    },
    inputs: {
      title: "Input modes for real author habits.",
      modes: [
        { name: "Native UI", body: "Add characters, rules, events, and relationships directly." },
        { name: "DOCX upload", body: "Extract facts from manuscript and worldbuilding documents." },
        { name: "Plain text", body: "Paste scenes or upload text from web fiction platforms." },
        { name: "Google Docs", body: "Prepare OAuth sync for collaborative author rooms." },
      ],
    },
    conflicts: {
      title: "Canon conflicts are review work, not surprise rewrites.",
      body:
        "Seizn flags contradictions, scope leaks, and timeline drift as author decisions with source context.",
      cards: [
        {
          severity: "critical",
          title: "Role contradiction",
          body: "The same teacher is assigned two departments across different days.",
        },
        {
          severity: "high",
          title: "Timeline drift",
          body: "A day label and calendar date no longer line up after a revision.",
        },
        {
          severity: "medium",
          title: "Scope leak",
          body: "A short-story scene tries to reveal long-form author-only information.",
        },
      ],
    },
    simulation: {
      title: "Scene simulation respects who knows what.",
      body:
        "Candidates are separated into low-risk lines and leak-risk lines so author-only facts do not slip into character perspective.",
      safeLabel: "safe candidates",
      riskLabel: "leak risk",
    },
    trust: {
      title: "Built for authors who need control over memory.",
      items: [
        { title: "Author-only protection", body: "Keep private facts out of character-visible outputs." },
        { title: "Audit replay", body: "Reproduce review decisions and source evidence." },
        { title: "Data residency", body: "Prepare Seoul, Tokyo, and EU-aware storage choices." },
        { title: "BYOK option", body: "Use your own model key for unlimited tokens and plan discounts." },
      ],
    },
    pricing: {
      eyebrow: "v7 launch pricing",
      title: "Four plans, 30-day trial, no card required.",
      subtitle: "Monthly checkout is available here. Yearly checkout lives on the full pricing page.",
      cadence: "monthly",
      start: "Start",
      contact: "Contact sales",
      yearlyNote: "Yearly saves about 15 percent on the pricing page.",
      overage: "Overage applies only above the managed token cap.",
      byok: "BYOK in Settings gives 50 percent off and unlimited tokens.",
      features: {
        indie: ["1 IP workspace", "1M managed tokens", "Solo author workflow"],
        pro: ["Multi-IP workflow", "5M managed tokens", "Simulation and audit replay"],
        studio: ["5 collaborators", "20M managed tokens", "Studio review operations"],
        enterprise: ["Unlimited scale", "BYOK required", "Custom security and SLA"],
      },
    },
    faq: {
      title: "Author launch FAQ",
      items: [
        { q: "Who owns my work?", a: "You do. Seizn processes your material only to provide the author service." },
        { q: "Can I use my own Anthropic key?", a: "Yes. BYOK is managed in Settings and keeps model usage billed directly to you." },
        { q: "What happens above the token cap?", a: "Managed usage uses metered overage for the exceeded portion, or you can upgrade or use BYOK." },
      ],
    },
    footer: {
      tagline: "AI memory for authors, canon review, and scene simulation.",
      product: "Product",
      resources: "Resources",
      legal: "Legal",
      privacy: "Privacy",
      terms: "Terms",
      beta: "Beta Disclosure",
      engine: "NPC engine",
      contact: "Contact",
    },
    checkout: {
      prefix: "I agree to the",
      terms: "Terms of Service",
      connector: "and",
      privacy: "Privacy Policy",
      suffix: ".",
      loading: "Opening Stripe...",
      error: "Checkout could not start.",
    },
  },
  ko: {
    localeLabel: "한국어",
    nav: {
      demo: "데모",
      workflow: "흐름",
      pricing: "가격",
      docs: "문서",
      signIn: "로그인",
    },
    hero: {
      eyebrow: "01 / 작가 메모리",
      title: "작품의 기억을, 흩어지지 않게.",
      subtitle:
        "세계관, 캐릭터, 장면을 한곳에 모으고 캐논 충돌을 자동으로 잡아냅니다. 작가의 검수가 곧 작품의 기준이 됩니다.",
      primaryCta: "30일 무료로 시작",
      secondaryCta: "작동 보기",
      graphLabel: "캐논 그래프",
      reviewLabel: "검수 큐",
      simulationLabel: "장면 시뮬레이션",
    },
    demo: {
      label: "Sample IP - 합성 데모 데이터",
      title: "새벽 샘플 IP를 작가 작업 흐름으로 보여줍니다.",
      body:
        "공개 데모는 내부 자료와 분리된 합성 30일 학원 SF 미스터리 데이터를 사용하며 Phase C 샘플 파일에서 직접 불러옵니다.",
      openDemo: "전체 데모 열기",
      stats: {
        characters: "캐릭터",
        rules: "세계관 룰",
        events: "타임라인 사건",
        cases: "검수 케이스",
      },
    },
    workflow: {
      title: "초안에서 캐논까지, 검수 가능한 세 단계.",
      steps: [
        { title: "자료 가져오기", body: "원고, 노트, 붙여넣은 장면, 구조화 기록을 한 작업 공간에 모읍니다." },
        { title: "추출 후보 검수", body: "캐릭터, 룰, 사건, 관계, 말투 후보를 승인, 거부, 병합, 분리합니다." },
        { title: "캐논 메모리로 쓰기", body: "충돌 검출과 시뮬레이션은 숨은 추측이 아니라 작가가 승인한 결정을 사용합니다." },
      ],
    },
    inputs: {
      title: "실제 작가 습관에 맞춘 입력 방식.",
      modes: [
        { name: "직접 입력", body: "캐릭터, 룰, 사건, 관계를 화면에서 바로 추가합니다." },
        { name: "DOCX 업로드", body: "원고와 설정 문서에서 사실 후보를 추출합니다." },
        { name: "일반 텍스트", body: "웹소설 플랫폼의 장면을 붙여넣거나 텍스트로 올립니다." },
        { name: "Google Docs", body: "협업 작가방을 위한 동기화 흐름을 준비합니다." },
      ],
    },
    conflicts: {
      title: "캐논 충돌은 몰래 고치는 일이 아니라 검수 작업입니다.",
      body: "Seizn은 모순, 범위 누수, 시간선 흔들림을 출처와 함께 작가 결정으로 올립니다.",
      cards: [
        { severity: "critical", title: "직책 모순", body: "같은 선생님이 서로 다른 날짜에 두 담당 과목으로 등장합니다." },
        { severity: "high", title: "시간선 오류", body: "수정 뒤 Day 표기와 실제 날짜가 더는 맞지 않습니다." },
        { severity: "medium", title: "범위 누수", body: "단편 장면이 장편용 작가 전용 정보를 드러내려 합니다." },
      ],
    },
    simulation: {
      title: "장면 시뮬레이션은 누가 무엇을 아는지 지킵니다.",
      body: "후보 문장을 안전 후보와 누수 위험 후보로 나누어 작가 전용 정보가 캐릭터 시점에 섞이지 않게 합니다.",
      safeLabel: "안전 후보",
      riskLabel: "누수 위험",
    },
    trust: {
      title: "작가가 메모리를 통제해야 할 때를 위해 만들었습니다.",
      items: [
        { title: "작가 전용 보호", body: "비공개 사실이 캐릭터 가시 출력에 섞이지 않게 합니다." },
        { title: "검수 재현", body: "검수 결정과 출처 근거를 다시 확인할 수 있습니다." },
        { title: "데이터 리전", body: "서울, 도쿄, 유럽 기준 저장 선택을 준비합니다." },
        { title: "BYOK 선택", body: "본인 모델 키로 무제한 토큰과 요금 할인을 사용할 수 있습니다." },
      ],
    },
    pricing: {
      eyebrow: "v7 출시 가격",
      title: "네 가지 플랜, 30일 체험, 카드 등록 없음.",
      subtitle: "여기서는 월간 결제를 시작할 수 있습니다. 연간 결제는 전체 가격 페이지에서 제공합니다.",
      cadence: "월간",
      start: "시작",
      contact: "영업 문의",
      yearlyNote: "연간 결제는 가격 페이지에서 약 15% 절약됩니다.",
      overage: "초과 과금은 관리형 토큰 한도를 넘은 부분에만 적용됩니다.",
      byok: "설정의 BYOK를 쓰면 50% 할인과 무제한 토큰을 사용할 수 있습니다.",
      features: {
        indie: ["IP 작업 공간 1개", "관리형 토큰 100만", "개인 작가 흐름"],
        pro: ["다중 IP 작업", "관리형 토큰 500만", "시뮬레이션과 검수 재현"],
        studio: ["협업자 5명", "관리형 토큰 2천만", "스튜디오 검수 운영"],
        enterprise: ["무제한 규모", "BYOK 필수", "맞춤 보안과 SLA"],
      },
    },
    faq: {
      title: "작가 출시 FAQ",
      items: [
        { q: "작품 소유권은 누구에게 있나요?", a: "작가에게 있습니다. Seizn은 작가 서비스를 제공하기 위해서만 자료를 처리합니다." },
        { q: "제 Anthropic 키를 쓸 수 있나요?", a: "가능합니다. BYOK는 설정에서 관리하며 모델 사용료는 직접 결제됩니다." },
        { q: "토큰 한도를 넘으면 어떻게 되나요?", a: "초과분만 미터 과금되며, 상위 플랜이나 BYOK로 전환할 수 있습니다." },
      ],
    },
    footer: {
      tagline: "작가를 위한 AI 메모리, 캐논 검수, 장면 시뮬레이션.",
      product: "제품",
      resources: "자료",
      legal: "법적 고지",
      privacy: "개인정보",
      terms: "이용약관",
      beta: "베타 고지",
      engine: "NPC 엔진",
      contact: "문의",
    },
    checkout: {
      prefix: "",
      terms: "이용약관",
      connector: "및",
      privacy: "개인정보 처리방침",
      suffix: "에 동의합니다.",
      loading: "Stripe를 여는 중...",
      error: "체크아웃을 시작할 수 없습니다.",
    },
  },
  ja: {
    localeLabel: "日本語",
    nav: {
      demo: "デモ",
      workflow: "流れ",
      pricing: "料金",
      docs: "ドキュメント",
      signIn: "ログイン",
    },
    hero: {
      eyebrow: "01 / 作家メモリー",
      title: "物語の記憶を、書いた通りに保つ。",
      subtitle:
        "世界設定、人物、シーンを一つにまとめます。Seizn はカノンの矛盾を検出し、作家のレビューを正本にします。",
      primaryCta: "30日無料で始める",
      secondaryCta: "動作を見る",
      graphLabel: "カノングラフ",
      reviewLabel: "レビューキュー",
      simulationLabel: "シーンシミュレーション",
    },
    demo: {
      label: "Sample IP - 合成デモデータ",
      title: "Saebyeok サンプル IP を作家ワークフローとして表示します。",
      body:
        "公開デモは内部素材から分離された合成の30日学園SFミステリーを使い、Phase C のサンプルファイルから読み込みます。",
      openDemo: "完全なデモを開く",
      stats: {
        characters: "人物",
        rules: "世界ルール",
        events: "時系列イベント",
        cases: "レビューケース",
      },
    },
    workflow: {
      title: "下書きからカノンまで、レビューできる三段階。",
      steps: [
        { title: "素材を取り込む", body: "原稿、メモ、貼り付けたシーン、構造化データを一つの作家空間に集めます。" },
        { title: "抽出候補を確認", body: "人物、ルール、事件、関係、声の候補を承認、却下、統合、分割します。" },
        { title: "カノンメモリーで書く", body: "矛盾検出とシミュレーションは隠れた推測ではなく、承認済みの決定を使います。" },
      ],
    },
    inputs: {
      title: "実際の執筆習慣に合う入力方式。",
      modes: [
        { name: "直接入力", body: "人物、ルール、事件、関係を画面で追加します。" },
        { name: "DOCX アップロード", body: "原稿や設定資料から事実候補を抽出します。" },
        { name: "プレーンテキスト", body: "投稿サイトの本文を貼り付けるかテキストで渡します。" },
        { name: "Google Docs", body: "共同執筆向けの同期フローを準備します。" },
      ],
    },
    conflicts: {
      title: "カノン矛盾は勝手な書き換えではなくレビュー作業です。",
      body: "Seizn は矛盾、スコープ漏れ、時系列のずれを出典つきの作家判断として提示します。",
      cards: [
        { severity: "critical", title: "役割の矛盾", body: "同じ教師が別の日に二つの担当教科で登場します。" },
        { severity: "high", title: "時系列のずれ", body: "修正後に Day 表記と実際の日付が合わなくなります。" },
        { severity: "medium", title: "スコープ漏れ", body: "短編シーンが長編用の作家専用情報を明かそうとします。" },
      ],
    },
    simulation: {
      title: "シーンシミュレーションは誰が何を知るかを守ります。",
      body: "候補を安全な文と漏えいリスクのある文に分け、作家専用情報が人物視点に混ざるのを防ぎます。",
      safeLabel: "安全候補",
      riskLabel: "漏えいリスク",
    },
    trust: {
      title: "記憶を制御したい作家のために作りました。",
      items: [
        { title: "作家専用保護", body: "非公開情報を人物に見える出力から分離します。" },
        { title: "監査リプレイ", body: "レビュー判断と出典を再確認できます。" },
        { title: "データリージョン", body: "ソウル、東京、EU を意識した保存選択を準備します。" },
        { title: "BYOK 選択", body: "自分のモデルキーで無制限トークンと割引を使えます。" },
      ],
    },
    pricing: {
      eyebrow: "v7 ローンチ料金",
      title: "4つのプラン、30日トライアル、カード不要。",
      subtitle: "このページでは月額チェックアウトを開始できます。年額は料金ページで利用できます。",
      cadence: "月額",
      start: "開始",
      contact: "営業に相談",
      yearlyNote: "年額は料金ページで約15%お得です。",
      overage: "超過課金は管理トークン上限を超えた部分だけに適用されます。",
      byok: "設定の BYOK で50%割引と無制限トークンを利用できます。",
      features: {
        indie: ["1 IP ワークスペース", "管理トークン100万", "個人作家フロー"],
        pro: ["複数 IP ワークフロー", "管理トークン500万", "シミュレーションと監査リプレイ"],
        studio: ["共同作業者5名", "管理トークン2000万", "スタジオレビュー運用"],
        enterprise: ["無制限スケール", "BYOK 必須", "カスタムセキュリティと SLA"],
      },
    },
    faq: {
      title: "作家ローンチ FAQ",
      items: [
        { q: "作品の所有権は誰にありますか？", a: "作家にあります。Seizn はサービス提供のためだけに素材を処理します。" },
        { q: "自分の Anthropic キーを使えますか？", a: "使えます。BYOK は設定で管理し、モデル利用料は直接請求されます。" },
        { q: "トークン上限を超えたら？", a: "超過分だけメーター課金され、上位プランや BYOK へ切り替えられます。" },
      ],
    },
    footer: {
      tagline: "作家のための AI メモリー、カノンレビュー、シーンシミュレーション。",
      product: "製品",
      resources: "リソース",
      legal: "法務",
      privacy: "プライバシー",
      terms: "利用規約",
      beta: "ベータ開示",
      engine: "NPC エンジン",
      contact: "問い合わせ",
    },
    checkout: {
      prefix: "",
      terms: "利用規約",
      connector: "および",
      privacy: "プライバシーポリシー",
      suffix: "に同意します。",
      loading: "Stripe を開いています...",
      error: "チェックアウトを開始できませんでした。",
    },
  },
  "zh-hans": {
    localeLabel: "简体中文",
    nav: {
      demo: "演示",
      workflow: "流程",
      pricing: "价格",
      docs: "文档",
      signIn: "登录",
    },
    hero: {
      eyebrow: "01 / 作者记忆",
      title: "让故事记忆，保持你写下的样子。",
      subtitle:
        "把世界观、角色和场景放在一起。Seizn 自动发现设定冲突，让作者审核成为作品的准绳。",
      primaryCta: "开始 30 天免费试用",
      secondaryCta: "查看效果",
      graphLabel: "设定图谱",
      reviewLabel: "审核队列",
      simulationLabel: "场景模拟",
    },
    demo: {
      label: "Sample IP - 合成演示数据",
      title: "以作者工作流展示 Saebyeok 样本 IP。",
      body:
        "公开演示使用与内部材料隔离的合成 30 天校园科幻悬疑数据，并直接读取 Phase C 样本文件。",
      openDemo: "打开完整演示",
      stats: {
        characters: "角色",
        rules: "世界规则",
        events: "时间线事件",
        cases: "审核案例",
      },
    },
    workflow: {
      title: "从草稿到设定正本，三步都可审核。",
      steps: [
        { title: "导入资料", body: "把稿件、笔记、粘贴场景和结构化记录放进同一个作者工作区。" },
        { title: "审核抽取结果", body: "批准、拒绝、合并或拆分角色、规则、事件、关系和语气候选。" },
        { title: "用设定记忆写作", body: "冲突检测和模拟输出使用你批准的决定，而不是隐藏猜测。" },
      ],
    },
    inputs: {
      title: "适合真实写作习惯的输入方式。",
      modes: [
        { name: "原生输入", body: "直接添加角色、规则、事件和关系。" },
        { name: "DOCX 上传", body: "从稿件和设定文档中抽取事实候选。" },
        { name: "纯文本", body: "粘贴网文平台场景或上传文本。" },
        { name: "Google Docs", body: "为协作作者空间准备同步流程。" },
      ],
    },
    conflicts: {
      title: "设定冲突是审核任务，不是突然改写。",
      body: "Seizn 把矛盾、范围泄漏和时间线漂移连同来源一起交给作者判断。",
      cards: [
        { severity: "critical", title: "角色职责冲突", body: "同一位老师在不同日期出现为两个科目负责人。" },
        { severity: "high", title: "时间线漂移", body: "修订后 Day 标记与真实日期不再一致。" },
        { severity: "medium", title: "范围泄漏", body: "短篇场景试图透露长篇作者专用信息。" },
      ],
    },
    simulation: {
      title: "场景模拟会守住谁知道什么。",
      body: "候选句被分为安全候选和泄漏风险候选，避免作者专用信息进入角色视角。",
      safeLabel: "安全候选",
      riskLabel: "泄漏风险",
    },
    trust: {
      title: "为需要控制记忆的作者而建。",
      items: [
        { title: "作者专用保护", body: "把非公开事实从角色可见输出中隔离。" },
        { title: "审核回放", body: "重新查看审核决定和来源证据。" },
        { title: "数据区域", body: "准备首尔、东京和欧盟感知的存储选择。" },
        { title: "BYOK 选项", body: "使用自己的模型密钥获得无限 token 和价格折扣。" },
      ],
    },
    pricing: {
      eyebrow: "v7 发布价格",
      title: "四个方案，30 天试用，无需信用卡。",
      subtitle: "这里可开始月付 checkout。年付 checkout 位于完整价格页面。",
      cadence: "月付",
      start: "开始",
      contact: "联系销售",
      yearlyNote: "年付在价格页面约省 15%。",
      overage: "超额计费只适用于超过托管 token 上限的部分。",
      byok: "在设置中使用 BYOK 可获得 50% 折扣和无限 token。",
      features: {
        indie: ["1 个 IP 工作区", "100 万托管 token", "个人作者流程"],
        pro: ["多 IP 工作流", "500 万托管 token", "模拟和审核回放"],
        studio: ["5 名协作者", "2000 万托管 token", "工作室审核运营"],
        enterprise: ["无限规模", "必须 BYOK", "自定义安全与 SLA"],
      },
    },
    faq: {
      title: "作者发布 FAQ",
      items: [
        { q: "作品归谁所有？", a: "归作者所有。Seizn 只为提供作者服务而处理你的资料。" },
        { q: "可以使用自己的 Anthropic key 吗？", a: "可以。BYOK 在设置中管理，模型费用由你直接支付。" },
        { q: "超过 token 上限怎么办？", a: "只对超出部分按表计费，也可以升级方案或切换到 BYOK。" },
      ],
    },
    footer: {
      tagline: "面向作者的 AI 记忆、设定审核和场景模拟。",
      product: "产品",
      resources: "资源",
      legal: "法律",
      privacy: "隐私",
      terms: "条款",
      beta: "Beta 披露",
      engine: "NPC 引擎",
      contact: "联系",
    },
    checkout: {
      prefix: "我同意",
      terms: "服务条款",
      connector: "和",
      privacy: "隐私政策",
      suffix: "。",
      loading: "正在打开 Stripe...",
      error: "无法开始 checkout。",
    },
  },
};

const LAUNCH_LOCALES = new Set<Locale>(["en", "ko", "ja", "zh-hans"]);
const TIERS = ["indie", "pro", "studio", "enterprise"] as const;
const NODE_POSITIONS = [
  "left-[12%] top-[18%]",
  "left-[42%] top-[10%]",
  "right-[16%] top-[24%]",
  "left-[22%] bottom-[22%]",
  "right-[26%] bottom-[14%]",
  "left-[54%] bottom-[34%]",
] as const;

export function getAuthorLandingCopy(locale: Locale): LandingCopy {
  return COPY[toLaunchLocale(locale)];
}

function toLaunchLocale(locale: Locale): LaunchLocale {
  if (LAUNCH_LOCALES.has(locale)) return locale as LaunchLocale;
  if (locale === "zh-hant") return "zh-hans";
  return "en";
}

export function AuthorFlagshipLanding({
  locale,
  data,
}: {
  locale: Locale;
  data: SaebyeokDemoData;
}) {
  const copy = getAuthorLandingCopy(locale);
  const launchLocale = toLaunchLocale(locale);
  const legalBase = `/${locale}/legal`;

  return (
    <div className="min-h-screen bg-[#f8fbff] text-slate-950">
      <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur" aria-label="Main navigation">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-950 text-sm font-semibold text-white">
              S
            </span>
            <span className="text-base font-semibold tracking-normal">Seizn Author</span>
          </Link>
          <div className="hidden items-center gap-5 md:flex">
            <a href="#workflow" className="text-sm text-slate-600 hover:text-slate-950">{copy.nav.workflow}</a>
            <Link href={`/${locale}/demo`} className="text-sm text-slate-600 hover:text-slate-950">{copy.nav.demo}</Link>
            <Link href={`/${locale}/pricing`} className="text-sm text-slate-600 hover:text-slate-950">{copy.nav.pricing}</Link>
            <Link href={`/${locale}/docs`} className="text-sm text-slate-600 hover:text-slate-950">{copy.nav.docs}</Link>
            <a href="https://engine.seizn.com" className="text-sm text-slate-600 hover:text-slate-950" rel="noopener noreferrer">
              {copy.footer.engine}
            </a>
            <LanguageSwitcher currentLocale={locale} />
            <Link href="/login" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100">
              {copy.nav.signIn}
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="relative isolate overflow-hidden border-b border-slate-200 bg-slate-950 text-white">
          <HeroGraphBackdrop data={data} copy={copy} />
          <div className="relative mx-auto flex min-h-[760px] max-w-7xl flex-col justify-center px-4 py-24 sm:px-6 lg:py-28">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">{copy.hero.eyebrow}</p>
              <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-normal text-white sm:text-6xl lg:text-7xl">
                {copy.hero.title}
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200 sm:text-xl">
                {copy.hero.subtitle}
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`/${locale}/pricing`}
                  className="inline-flex min-h-12 items-center justify-center rounded-md bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200"
                >
                  {copy.hero.primaryCta}
                </Link>
                <Link
                  href={`/${locale}/demo`}
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                >
                  {copy.hero.secondaryCta}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="demo" className="border-b border-slate-200 bg-white px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">{copy.demo.label}</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">{copy.demo.title}</h2>
              <p className="mt-4 text-base leading-7 text-slate-600">{copy.demo.body}</p>
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat value={data.summary.characters} label={copy.demo.stats.characters} />
                <Stat value={data.summary.worldRules} label={copy.demo.stats.rules} />
                <Stat value={data.summary.timelineEvents} label={copy.demo.stats.events} />
                <Stat value={data.summary.reviewCases} label={copy.demo.stats.cases} />
              </div>
              <Link
                href={`/${locale}/demo`}
                className="mt-8 inline-flex min-h-11 items-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {copy.demo.openDemo}
              </Link>
            </div>
            <DemoWidget data={data} copy={copy} />
          </div>
        </section>

        <section id="workflow" className="bg-[#f3f8fb] px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className="max-w-3xl text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">{copy.workflow.title}</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {copy.workflow.steps.map((step, index) => (
                <article key={step.title} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-semibold text-cyan-700">0{index + 1}</p>
                  <h3 className="mt-3 text-lg font-semibold text-slate-950">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 className="text-3xl font-semibold tracking-normal text-slate-950">{copy.inputs.title}</h2>
              <p className="mt-4 text-sm leading-6 text-slate-600">{copy.pricing.yearlyNote}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {copy.inputs.modes.map((mode) => (
                <article key={mode.name} className="rounded-md border border-slate-200 bg-[#fbfdff] p-5">
                  <h3 className="text-base font-semibold text-slate-950">{mode.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{mode.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-950 px-4 py-16 text-white sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <h2 className="text-3xl font-semibold tracking-normal sm:text-4xl">{copy.conflicts.title}</h2>
              <p className="mt-4 text-base leading-7 text-slate-300">{copy.conflicts.body}</p>
            </div>
            <div className="grid gap-4">
              {copy.conflicts.cards.map((card) => (
                <article key={card.title} className="rounded-md border border-white/10 bg-white/8 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-200">{card.severity}</p>
                  <h3 className="mt-2 text-lg font-semibold">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{card.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2 lg:items-center">
            <SimulationPanel data={data} copy={copy} />
            <div>
              <h2 className="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">{copy.simulation.title}</h2>
              <p className="mt-4 text-base leading-7 text-slate-600">{copy.simulation.body}</p>
            </div>
          </div>
        </section>

        <section className="bg-[#f3f8fb] px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-3xl font-semibold tracking-normal text-slate-950">{copy.trust.title}</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {copy.trust.items.map((item) => (
                <article key={item.title} className="rounded-md border border-slate-200 bg-white p-5">
                  <h3 className="text-base font-semibold text-slate-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="bg-white px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">{copy.pricing.eyebrow}</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">{copy.pricing.title}</h2>
              <p className="mt-4 text-base leading-7 text-slate-600">{copy.pricing.subtitle}</p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {TIERS.map((tier) => (
                <LandingPricingCard
                  key={tier}
                  tier={tier}
                  locale={locale}
                  copy={copy}
                  legalBase={legalBase}
                />
              ))}
            </div>
            <div className="mt-6 grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-2">
              <p>{copy.pricing.overage}</p>
              <p>{copy.pricing.byok}</p>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-[#f3f8fb] px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-3xl font-semibold tracking-normal text-slate-950">{copy.faq.title}</h2>
            <div className="mt-6 space-y-3">
              {copy.faq.items.map((item) => (
                <details key={item.q} className="rounded-md border border-slate-200 bg-white p-4">
                  <summary className="cursor-pointer text-base font-semibold text-slate-950">{item.q}</summary>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-slate-950 px-4 py-12 text-slate-300 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <div>
            <Link href={`/${locale}`} className="flex items-center gap-2 text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-300 text-sm font-semibold text-slate-950">S</span>
              <span className="font-semibold">Seizn Author</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">{copy.footer.tagline}</p>
          </div>
          <FooterColumn title={copy.footer.product} links={[
            { label: copy.nav.demo, href: `/${locale}/demo` },
            { label: copy.nav.pricing, href: `/${locale}/pricing` },
            { label: copy.nav.docs, href: `/${locale}/docs` },
          ]} />
          <FooterColumn title={copy.footer.resources} links={[
            { label: copy.footer.engine, href: "https://engine.seizn.com", external: true },
            { label: copy.footer.contact, href: `/${locale}/docs/faq` },
          ]} />
          <FooterColumn title={copy.footer.legal} links={[
            { label: copy.footer.privacy, href: `${legalBase}/privacy` },
            { label: copy.footer.terms, href: `${legalBase}/terms` },
            { label: copy.footer.beta, href: `${legalBase}/beta-disclosure` },
          ]} />
        </div>
        <div className="mx-auto mt-10 max-w-7xl border-t border-white/10 pt-6 text-sm text-slate-400">
          © 2026 Seizn. {copy.localeLabel}
          <span className="sr-only"> launch locale {launchLocale}</span>
        </div>
      </footer>
    </div>
  );
}

function HeroGraphBackdrop({ data, copy }: { data: SaebyeokDemoData; copy: LandingCopy }) {
  const characters = getArray(data.canon, "characters").slice(0, 6);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_18%,rgba(34,211,238,0.34),transparent_28%),radial-gradient(circle_at_15%_80%,rgba(244,63,94,0.22),transparent_24%)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950 to-transparent" />
      <div className="absolute right-8 top-24 hidden h-[560px] w-[560px] rounded-[40px] border border-white/10 bg-white/[0.06] shadow-2xl lg:block xl:w-[640px]">
        <div className="absolute inset-8 rounded-[32px] border border-white/10 bg-slate-900/50" />
        <div className="absolute left-14 top-12 rounded-md border border-cyan-200/30 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100">
          {copy.hero.graphLabel} · D30
        </div>
        {characters.map((character, index) => (
          <div
            key={getString(character, "id", `node-${index}`)}
            className={`absolute ${NODE_POSITIONS[index]} flex h-24 w-24 items-center justify-center rounded-full border border-cyan-200/40 bg-slate-950/80 p-3 text-center text-xs font-semibold leading-4 text-cyan-50 shadow-lg shadow-cyan-950/40`}
          >
            {getString(character, "name_romanized", getString(character, "name", `Node ${index + 1}`))}
          </div>
        ))}
        <div className="absolute bottom-14 left-14 grid w-72 gap-2 rounded-md border border-white/10 bg-slate-950/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-200">{copy.hero.reviewLabel}</p>
          <div className="h-2 rounded-full bg-white/10">
            <div className="h-2 w-4/5 rounded-full bg-cyan-300" />
          </div>
          <p className="text-xs text-slate-300">{data.summary.reviewCases} review cases · {data.summary.relationships} relationships</p>
        </div>
        <div className="absolute bottom-16 right-16 rounded-md border border-white/10 bg-slate-950/80 p-4 text-sm text-slate-200">
          {copy.hero.simulationLabel}
          <div className="mt-2 text-xs text-slate-400">{data.summary.simulations} sample scenes</div>
        </div>
      </div>
    </div>
  );
}

function DemoWidget({ data, copy }: { data: SaebyeokDemoData; copy: LandingCopy }) {
  const characters = getArray(data.canon, "characters").slice(0, 4);
  const events = getArray(data.timeline, "events").slice(0, 4);
  const reviewCases = getArray(data.reviewCases, "cases").slice(0, 3);

  return (
    <div className="rounded-md border border-slate-200 bg-[#fbfdff] p-4 shadow-lg shadow-slate-200/60">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">{copy.demo.label}</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{data.readme.title}</h3>
        </div>
        <span className="rounded-md bg-slate-950 px-3 py-1 text-xs font-semibold text-white">read-only</span>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-slate-950">{copy.hero.graphLabel}</h4>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {characters.map((character, index) => (
              <div key={getString(character, "id", `character-${index}`)} className="rounded-md bg-slate-100 p-3">
                <p className="text-sm font-semibold text-slate-900">
                  {getString(character, "name_romanized", `Character ${index + 1}`)}
                </p>
                <p className="mt-1 text-xs text-slate-700">{getString(character, "story_role", "sample role")}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-slate-950">{copy.hero.reviewLabel}</h4>
          <div className="mt-3 space-y-2">
            {reviewCases.map((item, index) => (
              <div key={getString(item, "case_id", `case-${index}`)} className="rounded-md bg-slate-100 p-3">
                <p className="text-xs font-semibold text-cyan-700">{getString(item, "category", "review")}</p>
                <p className="mt-1 text-xs text-slate-600">{getString(item, "case_id", `case-${index + 1}`)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-slate-950">Timeline</h4>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {events.map((event, index) => (
            <div key={getString(event, "id", `event-${index}`)} className="rounded-md bg-cyan-50 p-3">
              <p className="text-sm font-semibold text-cyan-900">{getString(event, "day", `D${index + 1}`)}</p>
              <p className="mt-1 text-xs text-cyan-800">{getString(event, "scene_status", "draft")}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SimulationPanel({ data, copy }: { data: SaebyeokDemoData; copy: LandingCopy }) {
  const firstSimulation = getArray(data.simulations, "simulations")[0];
  const candidates = getArray(firstSimulation, "candidates").slice(0, 5);
  const safeCount = candidates.filter((candidate) => getString(candidate, "risk_level") === "low").length;
  const riskCount = candidates.length - safeCount;

  return (
    <div className="rounded-md border border-slate-200 bg-[#fbfdff] p-5 shadow-lg shadow-slate-200/60">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-950">{copy.hero.simulationLabel}</h3>
        <span className="rounded-md bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-900">
          {getString(firstSimulation, "id", "sample simulation")}
        </span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-emerald-50 p-4">
          <p className="text-3xl font-semibold text-emerald-900">{safeCount}</p>
          <p className="mt-1 text-sm text-emerald-800">{copy.simulation.safeLabel}</p>
        </div>
        <div className="rounded-md bg-rose-50 p-4">
          <p className="text-3xl font-semibold text-rose-900">{riskCount}</p>
          <p className="mt-1 text-sm text-rose-800">{copy.simulation.riskLabel}</p>
        </div>
      </div>
      <div className="mt-5 space-y-2">
        {candidates.slice(0, 3).map((candidate, index) => (
          <div key={getString(candidate, "id", `candidate-${index}`)} className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3">
            <span className="text-sm font-medium text-slate-900">{getString(candidate, "id", `candidate ${index + 1}`)}</span>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{getString(candidate, "risk_level", "low")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LandingPricingCard({
  tier,
  locale,
  copy,
  legalBase,
}: {
  tier: AuthorBillingTier;
  locale: Locale;
  copy: LandingCopy;
  legalBase: string;
}) {
  const plan = AUTHOR_BILLING_TIERS[tier];
  const features = copy.pricing.features[tier];
  const buttonText = tier === "enterprise"
    ? copy.pricing.contact
    : `${copy.pricing.start} ${plan.label}`;

  return (
    <article className={`flex h-full flex-col rounded-md border bg-white p-5 shadow-sm ${
      plan.recommended ? "border-cyan-500" : "border-slate-200"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-950">{plan.label}</h3>
        {plan.recommended ? (
          <span className="rounded-md bg-cyan-100 px-2 py-1 text-xs font-semibold text-cyan-900">popular</span>
        ) : null}
      </div>
      <div className="mt-5">
        <p className="text-4xl font-semibold text-slate-950">${formatUsd(plan.monthlyUsd)}</p>
        <p className="mt-1 text-sm text-slate-500">{copy.pricing.cadence}</p>
      </div>
      <ul className="mt-5 flex-1 space-y-2">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2 text-sm leading-6 text-slate-600">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-cyan-500" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <CheckoutButton
        tier={tier}
        cadence="monthly"
        successUrl="/dashboard/billing?success=true"
        cancelUrl={`/${locale}/pricing`}
        privacyHref={`${legalBase}/privacy`}
        termsHref={`${legalBase}/terms`}
        legalCopy={copy.checkout}
        className={`mt-5 w-full rounded-md px-4 py-3 text-sm font-semibold transition-colors ${
          plan.recommended
            ? "bg-cyan-600 text-white hover:bg-cyan-700 disabled:bg-cyan-600/50"
            : "border border-slate-300 text-slate-900 hover:bg-slate-100 disabled:opacity-50"
        }`}
      >
        {buttonText}
      </CheckoutButton>
    </article>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-[#fbfdff] p-4">
      <p className="text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{label}</p>
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string; external?: boolean }>;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="text-sm text-slate-400 hover:text-white"
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}
