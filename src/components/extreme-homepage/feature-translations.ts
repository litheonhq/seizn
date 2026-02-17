import type { Locale } from "@/i18n/config";

// =============================================================================
// Feature Showcase translations
// =============================================================================

export type FeatureKey =
  | "semantic-memory"
  | "policy-engine"
  | "observability"
  | "finops"
  | "compliance"
  | "one-sdk";

interface FeatureContent {
  title: string;
  desc: string;
  badge: string;
}

const FEATURE_I18N: Partial<Record<Locale, Record<FeatureKey, FeatureContent>>> = {
  en: {
    "semantic-memory": {
      title: "Semantic Memory & Context",
      desc: "Persistent agent memory with graph knowledge, multilingual hybrid search across 100+ languages, and automatic context reconciliation. Your agents remember everything and never hallucinate on stale data.",
      badge: "Graph + E2E",
    },
    "policy-engine": {
      title: "Policy Engine & Governance",
      desc: "OPA-powered policy enforcement, tool approval workflows, and agent registry with key management. Define what agents can and cannot do\u2014then enforce it automatically.",
      badge: "OPA-Powered",
    },
    observability: {
      title: "Observability & Eval",
      desc: "Every request traced by default. Production-grade evaluation pipelines, regression detection, and failure debugging without bolting on LangSmith or custom logging.",
      badge: "Traces On by Default",
    },
    finops: {
      title: "FinOps & Budget Control",
      desc: "Set token and model budgets, get cost alerts before you overshoot, and let Budget Autopilot pick the cheapest strategy that meets your SLO. Never a surprise bill.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act & Compliance",
      desc: "Built-in RTBF (right to be forgotten), EU AI Act transparency events, and ISO 42001-aligned audit trails. Produce evidence artifacts on demand for regulators and auditors.",
      badge: "Audit-Ready",
    },
    "one-sdk": {
      title: "One SDK, One Bill",
      desc: "Replace LangChain + Pinecone + LangSmith + custom PII filters + OPA sidecar + cost dashboards. Spring and Summer SDKs. One integration, one dashboard, one vendor.",
      badge: "Spring + Summer SDKs",
    },
  },
  ko: {
    "semantic-memory": {
      title: "시맨틱 메모리 & 컨텍스트",
      desc: "그래프 지식 기반의 영속적 에이전트 메모리, 100개 이상 언어를 지원하는 다국어 하이브리드 검색, 자동 컨텍스트 조정. 에이전트가 모든 것을 기억하고 오래된 데이터로 환각하지 않습니다.",
      badge: "그래프 + E2E",
    },
    "policy-engine": {
      title: "정책 엔진 & 거버넌스",
      desc: "OPA 기반 정책 실행, 도구 승인 워크플로우, 키 관리가 포함된 에이전트 레지스트리. 에이전트가 할 수 있는 것과 없는 것을 정의하고 자동으로 적용합니다.",
      badge: "OPA 기반",
    },
    observability: {
      title: "관측 & 평가",
      desc: "모든 요청이 기본적으로 트레이싱됩니다. 프로덕션급 평가 파이프라인, 회귀 감지, 장애 디버깅을 LangSmith나 커스텀 로깅 없이 제공합니다.",
      badge: "기본 트레이싱",
    },
    finops: {
      title: "FinOps & 예산 제어",
      desc: "토큰 및 모델 예산 설정, 초과 전 비용 알림, Budget Autopilot이 SLO를 충족하는 최저 비용 전략을 자동 선택합니다. 깜짝 청구서는 없습니다.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act & 컴플라이언스",
      desc: "기본 내장된 RTBF(잊힐 권리), EU AI Act 투명성 이벤트, ISO 42001 기반 감사 추적. 규제 기관과 감사인을 위한 증거 자료를 요청 즉시 생성합니다.",
      badge: "감사 대응 완료",
    },
    "one-sdk": {
      title: "하나의 SDK, 하나의 청구서",
      desc: "LangChain + Pinecone + LangSmith + PII 필터 + OPA 사이드카 + 비용 대시보드를 대체합니다. Spring과 Summer SDK. 하나의 통합, 하나의 대시보드, 하나의 벤더.",
      badge: "Spring + Summer SDK",
    },
  },
  ja: {
    "semantic-memory": {
      title: "セマンティックメモリ & コンテキスト",
      desc: "グラフ知識を備えた永続的エージェントメモリ、100以上の言語に対応する多言語ハイブリッド検索、自動コンテキスト調整。エージェントはすべてを記憶し、古いデータによる幻覚を起こしません。",
      badge: "グラフ + E2E",
    },
    "policy-engine": {
      title: "ポリシーエンジン & ガバナンス",
      desc: "OPA駆動のポリシー適用、ツール承認ワークフロー、キー管理付きエージェントレジストリ。エージェントの許可・禁止事項を定義し、自動で適用します。",
      badge: "OPA駆動",
    },
    observability: {
      title: "オブザーバビリティ & 評価",
      desc: "すべてのリクエストがデフォルトでトレースされます。本番グレードの評価パイプライン、回帰検出、障害デバッグをLangSmithやカスタムロギングなしで実現。",
      badge: "デフォルトでトレース",
    },
    finops: {
      title: "FinOps & 予算管理",
      desc: "トークンとモデルの予算を設定し、超過前にコストアラートを受け取り、Budget AutopilotがSLOを満たす最安戦略を自動選択。予想外の請求書はありません。",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act & コンプライアンス",
      desc: "RTBF（忘れられる権利）を標準搭載、EU AI Act透明性イベント、ISO 42001準拠の監査証跡。規制当局や監査人向けの証拠資料をオンデマンドで生成。",
      badge: "監査対応済み",
    },
    "one-sdk": {
      title: "ひとつのSDK、ひとつの請求書",
      desc: "LangChain + Pinecone + LangSmith + カスタムPIIフィルター + OPAサイドカー + コストダッシュボードを置き換えます。SpringとSummer SDK。統合もダッシュボードもベンダーもひとつ。",
      badge: "Spring + Summer SDK",
    },
  },
  "zh-hans": {
    "semantic-memory": {
      title: "语义记忆与上下文",
      desc: "基于图谱知识的持久化代理记忆，支持100多种语言的多语言混合搜索，以及自动上下文协调。您的代理记住一切，永远不会基于过时数据产生幻觉。",
      badge: "图谱 + E2E",
    },
    "policy-engine": {
      title: "策略引擎与治理",
      desc: "OPA驱动的策略执行、工具审批工作流和带密钥管理的代理注册表。定义代理能做什么、不能做什么，然后自动执行。",
      badge: "OPA驱动",
    },
    observability: {
      title: "可观测性与评估",
      desc: "默认追踪每个请求。生产级评估管道、回归检测和故障调试，无需集成LangSmith或自定义日志。",
      badge: "默认开启追踪",
    },
    finops: {
      title: "FinOps与预算控制",
      desc: "设置令牌和模型预算，在超支前获取成本告警，让Budget Autopilot自动选择满足SLO的最低成本策略。永远不会有意外账单。",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act与合规",
      desc: "内置RTBF（被遗忘权）、EU AI Act透明度事件和ISO 42001对齐的审计跟踪。按需为监管机构和审计师生成证据文件。",
      badge: "审计就绪",
    },
    "one-sdk": {
      title: "一个SDK，一张账单",
      desc: "替代LangChain + Pinecone + LangSmith + 自定义PII过滤器 + OPA边车 + 成本仪表盘。Spring和Summer SDK。一次集成，一个仪表盘，一个供应商。",
      badge: "Spring + Summer SDK",
    },
  },
  "zh-hant": {
    "semantic-memory": {
      title: "語義記憶與上下文",
      desc: "基於圖譜知識的持久化代理記憶，支援100多種語言的多語言混合搜尋，以及自動上下文協調。您的代理記住一切，永遠不會基於過時資料產生幻覺。",
      badge: "圖譜 + E2E",
    },
    "policy-engine": {
      title: "策略引擎與治理",
      desc: "OPA驅動的策略執行、工具審批工作流程和帶金鑰管理的代理註冊表。定義代理能做什麼、不能做什麼，然後自動執行。",
      badge: "OPA驅動",
    },
    observability: {
      title: "可觀測性與評估",
      desc: "預設追蹤每個請求。生產級評估管線、回歸偵測和故障除錯，無需整合LangSmith或自訂日誌。",
      badge: "預設開啟追蹤",
    },
    finops: {
      title: "FinOps與預算控制",
      desc: "設定令牌和模型預算，在超支前獲取成本警報，讓Budget Autopilot自動選擇滿足SLO的最低成本策略。永遠不會有意外帳單。",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act與合規",
      desc: "內建RTBF（被遺忘權）、EU AI Act透明度事件和ISO 42001對齊的稽核追蹤。按需為監管機構和稽核人員產生證據文件。",
      badge: "稽核就緒",
    },
    "one-sdk": {
      title: "一個SDK，一張帳單",
      desc: "取代LangChain + Pinecone + LangSmith + 自訂PII過濾器 + OPA邊車 + 成本儀表板。Spring和Summer SDK。一次整合，一個儀表板，一個供應商。",
      badge: "Spring + Summer SDK",
    },
  },
  es: {
    "semantic-memory": {
      title: "Memoria semántica y contexto",
      desc: "Memoria persistente de agentes con conocimiento en grafo, búsqueda híbrida multilingüe en más de 100 idiomas y reconciliación automática de contexto. Tus agentes recuerdan todo y nunca alucinan con datos obsoletos.",
      badge: "Grafo + E2E",
    },
    "policy-engine": {
      title: "Motor de políticas y gobernanza",
      desc: "Aplicación de políticas impulsada por OPA, flujos de aprobación de herramientas y registro de agentes con gestión de claves. Define lo que los agentes pueden y no pueden hacer, y aplícalo automáticamente.",
      badge: "Impulsado por OPA",
    },
    observability: {
      title: "Observabilidad y evaluación",
      desc: "Cada solicitud se traza por defecto. Pipelines de evaluación de nivel productivo, detección de regresiones y depuración de fallos sin necesidad de integrar LangSmith ni logging personalizado.",
      badge: "Trazas por defecto",
    },
    finops: {
      title: "FinOps y control de presupuesto",
      desc: "Establece presupuestos de tokens y modelos, recibe alertas de costos antes de excederte y deja que Budget Autopilot elija la estrategia más económica que cumpla tu SLO. Sin facturas sorpresa.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act y cumplimiento",
      desc: "RTBF (derecho al olvido) integrado, eventos de transparencia del EU AI Act y registros de auditoría alineados con ISO 42001. Genera evidencia bajo demanda para reguladores y auditores.",
      badge: "Listo para auditoría",
    },
    "one-sdk": {
      title: "Un SDK, una factura",
      desc: "Sustituye LangChain + Pinecone + LangSmith + filtros PII personalizados + sidecar OPA + dashboards de costos. SDKs Spring y Summer. Una integración, un dashboard, un proveedor.",
      badge: "Spring + Summer SDKs",
    },
  },
  ru: {
    "semantic-memory": {
      title: "Семантическая память и контекст",
      desc: "Постоянная память агентов с графом знаний, мультиязычный гибридный поиск на более чем 100 языках и автоматическое согласование контекста. Ваши агенты помнят всё и никогда не галлюцинируют на устаревших данных.",
      badge: "Граф + E2E",
    },
    "policy-engine": {
      title: "Движок политик и управление",
      desc: "Применение политик на базе OPA, процессы утверждения инструментов и реестр агентов с управлением ключами. Определите, что агенты могут и не могут делать — и применяйте это автоматически.",
      badge: "На базе OPA",
    },
    observability: {
      title: "Наблюдаемость и оценка",
      desc: "Каждый запрос трассируется по умолчанию. Конвейеры оценки промышленного уровня, обнаружение регрессий и отладка сбоев без подключения LangSmith или пользовательского логирования.",
      badge: "Трассировка по умолчанию",
    },
    finops: {
      title: "FinOps и контроль бюджета",
      desc: "Устанавливайте бюджеты на токены и модели, получайте оповещения о расходах до превышения, а Budget Autopilot выберет самую дешёвую стратегию, соответствующую вашему SLO. Никаких неожиданных счетов.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act и соответствие",
      desc: "Встроенное RTBF (право на забвение), события прозрачности EU AI Act и аудиторские журналы, соответствующие ISO 42001. Формирование доказательной документации по запросу для регуляторов и аудиторов.",
      badge: "Готов к аудиту",
    },
    "one-sdk": {
      title: "Один SDK, один счёт",
      desc: "Замените LangChain + Pinecone + LangSmith + пользовательские PII-фильтры + OPA-сайдкар + дашборды расходов. SDK Spring и Summer. Одна интеграция, один дашборд, один поставщик.",
      badge: "Spring + Summer SDK",
    },
  },
  uk: {
    "semantic-memory": {
      title: "Семантична пам'ять і контекст",
      desc: "Постійна пам'ять агентів із графом знань, мультимовний гібридний пошук понад 100 мовами та автоматичне узгодження контексту. Ваші агенти пам'ятають усе й ніколи не галюцинують на застарілих даних.",
      badge: "Граф + E2E",
    },
    "policy-engine": {
      title: "Движок політик і керування",
      desc: "Застосування політик на базі OPA, процеси затвердження інструментів і реєстр агентів із керуванням ключами. Визначте, що агенти можуть і не можуть робити — і застосовуйте це автоматично.",
      badge: "На базі OPA",
    },
    observability: {
      title: "Спостережуваність і оцінка",
      desc: "Кожен запит трасується за замовчуванням. Конвеєри оцінки промислового рівня, виявлення регресій і налагодження збоїв без підключення LangSmith або власного логування.",
      badge: "Трасування за замовчуванням",
    },
    finops: {
      title: "FinOps і контроль бюджету",
      desc: "Встановлюйте бюджети на токени й моделі, отримуйте сповіщення про витрати до перевищення, а Budget Autopilot обере найдешевшу стратегію, що відповідає вашому SLO. Жодних несподіваних рахунків.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act і відповідність",
      desc: "Вбудоване RTBF (право на забуття), події прозорості EU AI Act та аудиторські журнали відповідно до ISO 42001. Формування доказової документації на вимогу для регуляторів та аудиторів.",
      badge: "Готовий до аудиту",
    },
    "one-sdk": {
      title: "Один SDK, один рахунок",
      desc: "Замініть LangChain + Pinecone + LangSmith + власні PII-фільтри + OPA-сайдкар + дашборди витрат. SDK Spring і Summer. Одна інтеграція, один дашборд, один постачальник.",
      badge: "Spring + Summer SDK",
    },
  },
  he: {
    "semantic-memory": {
      title: "זיכרון סמנטי והקשר",
      desc: "זיכרון סוכן מתמשך עם ידע גרפי, חיפוש היברידי רב-לשוני ביותר מ-100 שפות, והתאמת הקשר אוטומטית. הסוכנים שלך זוכרים הכל ולעולם לא יוצרים הזיות מנתונים מיושנים.",
      badge: "גרף + E2E",
    },
    "policy-engine": {
      title: "מנוע מדיניות וממשל",
      desc: "אכיפת מדיניות מבוססת OPA, תהליכי אישור כלים ומרשם סוכנים עם ניהול מפתחות. הגדר מה סוכנים יכולים ולא יכולים לעשות — ואכוף זאת אוטומטית.",
      badge: "מבוסס OPA",
    },
    observability: {
      title: "ניטור והערכה",
      desc: "כל בקשה נמדדת כברירת מחדל. צינורות הערכה ברמת ייצור, זיהוי רגרסיות ואיתור תקלות ללא צורך ב-LangSmith או רישום מותאם אישית.",
      badge: "מעקב כברירת מחדל",
    },
    finops: {
      title: "FinOps ובקרת תקציב",
      desc: "הגדר תקציבי טוקנים ומודלים, קבל התראות עלות לפני חריגה, ו-Budget Autopilot יבחר את האסטרטגיה הזולה ביותר שעומדת ב-SLO שלך. בלי חשבוניות מפתיעות.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act ותאימות",
      desc: "RTBF מובנה (זכות להישכח), אירועי שקיפות של EU AI Act ומסלולי ביקורת בהתאמה ל-ISO 42001. הפקת תיעוד ראייתי לפי דרישה עבור רגולטורים ומבקרים.",
      badge: "מוכן לביקורת",
    },
    "one-sdk": {
      title: "SDK אחד, חשבונית אחת",
      desc: "החלף את LangChain + Pinecone + LangSmith + מסנני PII מותאמים + OPA sidecar + לוחות עלויות. SDK של Spring ו-Summer. אינטגרציה אחת, לוח בקרה אחד, ספק אחד.",
      badge: "Spring + Summer SDK",
    },
  },
  ar: {
    "semantic-memory": {
      title: "الذاكرة الدلالية والسياق",
      desc: "ذاكرة وكيل دائمة مع معرفة رسومية، بحث هجين متعدد اللغات عبر أكثر من 100 لغة، وتسوية سياق تلقائية. وكلاؤك يتذكرون كل شيء ولا يهلوسون أبداً ببيانات قديمة.",
      badge: "رسم بياني + E2E",
    },
    "policy-engine": {
      title: "محرك السياسات والحوكمة",
      desc: "تطبيق سياسات مدعوم بـ OPA، سير عمل الموافقة على الأدوات، وسجل الوكلاء مع إدارة المفاتيح. حدد ما يمكن للوكلاء فعله وما لا يمكنهم — ثم طبّقه تلقائياً.",
      badge: "مدعوم بـ OPA",
    },
    observability: {
      title: "المراقبة والتقييم",
      desc: "كل طلب يُتتبع افتراضياً. خطوط تقييم بمستوى الإنتاج، كشف الانحدار، وتصحيح الأعطال بدون الحاجة إلى LangSmith أو تسجيل مخصص.",
      badge: "تتبع افتراضي",
    },
    finops: {
      title: "FinOps والتحكم بالميزانية",
      desc: "حدد ميزانيات الرموز والنماذج، واحصل على تنبيهات التكلفة قبل التجاوز، ودع Budget Autopilot يختار أرخص استراتيجية تلبي SLO الخاص بك. لا فواتير مفاجئة أبداً.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act والامتثال",
      desc: "RTBF مدمج (الحق في النسيان)، أحداث شفافية EU AI Act، ومسارات تدقيق متوافقة مع ISO 42001. إنتاج وثائق إثبات عند الطلب للمنظمين والمدققين.",
      badge: "جاهز للتدقيق",
    },
    "one-sdk": {
      title: "SDK واحد، فاتورة واحدة",
      desc: "استبدل LangChain + Pinecone + LangSmith + فلاتر PII مخصصة + OPA sidecar + لوحات التكلفة. حزم Spring و Summer SDK. تكامل واحد، لوحة واحدة، مورد واحد.",
      badge: "Spring + Summer SDK",
    },
  },
  fr: {
    "semantic-memory": {
      title: "Mémoire sémantique et contexte",
      desc: "Mémoire d'agent persistante avec graphe de connaissances, recherche hybride multilingue dans plus de 100 langues et réconciliation automatique du contexte. Vos agents se souviennent de tout et n'hallucinent jamais sur des données obsolètes.",
      badge: "Graphe + E2E",
    },
    "policy-engine": {
      title: "Moteur de politiques et gouvernance",
      desc: "Application de politiques propulsée par OPA, workflows d'approbation d'outils et registre d'agents avec gestion des clés. Définissez ce que les agents peuvent et ne peuvent pas faire — puis appliquez-le automatiquement.",
      badge: "Propulsé par OPA",
    },
    observability: {
      title: "Observabilité et évaluation",
      desc: "Chaque requête est tracée par défaut. Pipelines d'évaluation de niveau production, détection de régressions et débogage des pannes sans intégrer LangSmith ni journalisation personnalisée.",
      badge: "Traces par défaut",
    },
    finops: {
      title: "FinOps et contrôle budgétaire",
      desc: "Définissez des budgets de tokens et de modèles, recevez des alertes de coûts avant dépassement et laissez Budget Autopilot choisir la stratégie la moins chère respectant votre SLO. Jamais de facture surprise.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act et conformité",
      desc: "RTBF intégré (droit à l'oubli), événements de transparence EU AI Act et pistes d'audit alignées sur ISO 42001. Production de preuves à la demande pour les régulateurs et auditeurs.",
      badge: "Prêt pour l'audit",
    },
    "one-sdk": {
      title: "Un SDK, une facture",
      desc: "Remplacez LangChain + Pinecone + LangSmith + filtres PII personnalisés + sidecar OPA + tableaux de bord des coûts. SDKs Spring et Summer. Une intégration, un tableau de bord, un fournisseur.",
      badge: "Spring + Summer SDKs",
    },
  },
  de: {
    "semantic-memory": {
      title: "Semantischer Speicher & Kontext",
      desc: "Persistenter Agentenspeicher mit Wissensgraph, mehrsprachige hybride Suche in über 100 Sprachen und automatische Kontextabstimmung. Ihre Agenten merken sich alles und halluzinieren nie mit veralteten Daten.",
      badge: "Graph + E2E",
    },
    "policy-engine": {
      title: "Richtlinien-Engine & Governance",
      desc: "OPA-gestützte Richtliniendurchsetzung, Tool-Genehmigungsworkflows und Agentenregistrierung mit Schlüsselverwaltung. Definieren Sie, was Agenten dürfen und nicht dürfen — und setzen Sie es automatisch durch.",
      badge: "OPA-gestützt",
    },
    observability: {
      title: "Observability & Evaluierung",
      desc: "Jede Anfrage wird standardmäßig verfolgt. Produktionsreife Evaluierungspipelines, Regressionserkennung und Fehlerbehebung ohne LangSmith oder benutzerdefiniertes Logging.",
      badge: "Standardmäßig verfolgt",
    },
    finops: {
      title: "FinOps & Budgetkontrolle",
      desc: "Setzen Sie Token- und Modellbudgets, erhalten Sie Kostenwarnungen vor Überschreitung und lassen Sie Budget Autopilot die günstigste Strategie wählen, die Ihr SLO erfüllt. Nie eine überraschende Rechnung.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act & Compliance",
      desc: "Integriertes RTBF (Recht auf Vergessenwerden), EU-AI-Act-Transparenzereignisse und ISO-42001-konforme Prüfpfade. Nachweisdokumente auf Abruf für Regulierungsbehörden und Prüfer.",
      badge: "Audit-bereit",
    },
    "one-sdk": {
      title: "Ein SDK, eine Rechnung",
      desc: "Ersetzen Sie LangChain + Pinecone + LangSmith + benutzerdefinierte PII-Filter + OPA-Sidecar + Kosten-Dashboards. Spring- und Summer-SDKs. Eine Integration, ein Dashboard, ein Anbieter.",
      badge: "Spring + Summer SDKs",
    },
  },
  it: {
    "semantic-memory": {
      title: "Memoria semantica e contesto",
      desc: "Memoria agente persistente con grafo della conoscenza, ricerca ibrida multilingue in oltre 100 lingue e riconciliazione automatica del contesto. I tuoi agenti ricordano tutto e non allucinano mai con dati obsoleti.",
      badge: "Grafo + E2E",
    },
    "policy-engine": {
      title: "Motore di policy e governance",
      desc: "Applicazione di policy basata su OPA, workflow di approvazione strumenti e registro agenti con gestione delle chiavi. Definisci cosa gli agenti possono e non possono fare — e applicalo automaticamente.",
      badge: "Basato su OPA",
    },
    observability: {
      title: "Osservabilità e valutazione",
      desc: "Ogni richiesta viene tracciata di default. Pipeline di valutazione a livello produttivo, rilevamento delle regressioni e debug dei guasti senza integrare LangSmith o logging personalizzato.",
      badge: "Tracce di default",
    },
    finops: {
      title: "FinOps e controllo del budget",
      desc: "Imposta budget per token e modelli, ricevi avvisi sui costi prima di sforare e lascia che Budget Autopilot scelga la strategia più economica che soddisfa il tuo SLO. Mai una fattura a sorpresa.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act e conformità",
      desc: "RTBF integrato (diritto all'oblio), eventi di trasparenza EU AI Act e audit trail allineati a ISO 42001. Produzione di documentazione probatoria su richiesta per regolatori e revisori.",
      badge: "Pronto per l'audit",
    },
    "one-sdk": {
      title: "Un SDK, una fattura",
      desc: "Sostituisci LangChain + Pinecone + LangSmith + filtri PII personalizzati + sidecar OPA + dashboard dei costi. SDK Spring e Summer. Un'integrazione, una dashboard, un fornitore.",
      badge: "Spring + Summer SDK",
    },
  },
  sv: {
    "semantic-memory": {
      title: "Semantiskt minne och kontext",
      desc: "Beständigt agentminne med kunskapsgraf, flerspråkig hybridsökning på över 100 språk och automatisk kontextavstämning. Dina agenter minns allt och hallucinerar aldrig på föråldrad data.",
      badge: "Graf + E2E",
    },
    "policy-engine": {
      title: "Policymotor och styrning",
      desc: "OPA-driven policyefterlevnad, arbetsflöden för verktygsgodkännande och agentregister med nyckelhantering. Definiera vad agenter får och inte får göra — och tillämpa det automatiskt.",
      badge: "OPA-driven",
    },
    observability: {
      title: "Observerbarhet och utvärdering",
      desc: "Varje begäran spåras som standard. Produktionsklara utvärderingspipelines, regressionsdetektering och felsökning utan att integrera LangSmith eller anpassad loggning.",
      badge: "Spårning som standard",
    },
    finops: {
      title: "FinOps och budgetkontroll",
      desc: "Ställ in token- och modellbudgetar, få kostnadsvarningar innan du överskrider och låt Budget Autopilot välja den billigaste strategin som uppfyller ditt SLO. Aldrig en överraskningsfaktura.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act och efterlevnad",
      desc: "Inbyggd RTBF (rätten att bli glömd), EU AI Act-transparenshändelser och revisionsspår i linje med ISO 42001. Producera bevisunderlag på begäran för tillsynsmyndigheter och revisorer.",
      badge: "Revisionsredo",
    },
    "one-sdk": {
      title: "Ett SDK, en faktura",
      desc: "Ersätt LangChain + Pinecone + LangSmith + anpassade PII-filter + OPA-sidecar + kostnadsdashboards. Spring- och Summer-SDK:er. En integration, en dashboard, en leverantör.",
      badge: "Spring + Summer SDK",
    },
  },
  nl: {
    "semantic-memory": {
      title: "Semantisch geheugen en context",
      desc: "Persistent agentgeheugen met kennisgraaf, meertalig hybride zoeken in meer dan 100 talen en automatische contextafstemming. Je agenten onthouden alles en hallucineren nooit op verouderde data.",
      badge: "Graaf + E2E",
    },
    "policy-engine": {
      title: "Beleidsengine en governance",
      desc: "OPA-gestuurde beleidshandhaving, goedkeuringsworkflows voor tools en agentenregister met sleutelbeheer. Definieer wat agenten wel en niet mogen doen — en handhaaf het automatisch.",
      badge: "OPA-gestuurd",
    },
    observability: {
      title: "Observeerbaarheid en evaluatie",
      desc: "Elk verzoek wordt standaard getraceerd. Productieklare evaluatiepipelines, regressiedetectie en foutopsporing zonder LangSmith of aangepaste logging.",
      badge: "Standaard getraceerd",
    },
    finops: {
      title: "FinOps en budgetbeheer",
      desc: "Stel token- en modelbudgetten in, ontvang kostenwaarschuwingen voordat je overschrijdt en laat Budget Autopilot de goedkoopste strategie kiezen die aan je SLO voldoet. Nooit een verrassingsfactuur.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act en compliance",
      desc: "Ingebouwde RTBF (recht op vergetelheid), EU AI Act-transparantiegebeurtenissen en audittrails afgestemd op ISO 42001. Produceer bewijsdocumenten op aanvraag voor toezichthouders en auditors.",
      badge: "Audit-gereed",
    },
    "one-sdk": {
      title: "Eén SDK, één factuur",
      desc: "Vervang LangChain + Pinecone + LangSmith + aangepaste PII-filters + OPA-sidecar + kostendashboards. Spring- en Summer-SDK's. Eén integratie, één dashboard, één leverancier.",
      badge: "Spring + Summer SDK's",
    },
  },
  pl: {
    "semantic-memory": {
      title: "Pamięć semantyczna i kontekst",
      desc: "Trwała pamięć agentów z grafem wiedzy, wielojęzyczne wyszukiwanie hybrydowe w ponad 100 językach i automatyczne uzgadnianie kontekstu. Twoi agenci pamiętają wszystko i nigdy nie halucynują na nieaktualnych danych.",
      badge: "Graf + E2E",
    },
    "policy-engine": {
      title: "Silnik polityk i zarządzanie",
      desc: "Egzekwowanie polityk oparte na OPA, procesy zatwierdzania narzędzi i rejestr agentów z zarządzaniem kluczami. Zdefiniuj, co agenci mogą, a czego nie mogą robić — i egzekwuj to automatycznie.",
      badge: "Oparty na OPA",
    },
    observability: {
      title: "Obserwowalność i ewaluacja",
      desc: "Każde żądanie jest domyślnie śledzone. Potoki ewaluacji klasy produkcyjnej, wykrywanie regresji i debugowanie awarii bez integrowania LangSmith czy niestandardowego logowania.",
      badge: "Śledzenie domyślnie",
    },
    finops: {
      title: "FinOps i kontrola budżetu",
      desc: "Ustaw budżety tokenów i modeli, otrzymuj alerty kosztowe przed przekroczeniem, a Budget Autopilot wybierze najtańszą strategię spełniającą Twoje SLO. Nigdy żadnych niespodziewanych rachunków.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act i zgodność",
      desc: "Wbudowane RTBF (prawo do bycia zapomnianym), zdarzenia przejrzystości EU AI Act i ścieżki audytu zgodne z ISO 42001. Generowanie dokumentacji dowodowej na żądanie dla regulatorów i audytorów.",
      badge: "Gotowy do audytu",
    },
    "one-sdk": {
      title: "Jeden SDK, jeden rachunek",
      desc: "Zastąp LangChain + Pinecone + LangSmith + niestandardowe filtry PII + OPA sidecar + dashboardy kosztów. SDK Spring i Summer. Jedna integracja, jeden dashboard, jeden dostawca.",
      badge: "Spring + Summer SDK",
    },
  },
  hi: {
    "semantic-memory": {
      title: "सिमैंटिक मेमोरी और संदर्भ",
      desc: "ग्राफ नॉलेज के साथ स्थायी एजेंट मेमोरी, 100+ भाषाओं में बहुभाषी हाइब्रिड सर्च, और स्वचालित संदर्भ समायोजन। आपके एजेंट सब कुछ याद रखते हैं और पुराने डेटा पर कभी भ्रमित नहीं होते।",
      badge: "ग्राफ + E2E",
    },
    "policy-engine": {
      title: "पॉलिसी इंजन और गवर्नेंस",
      desc: "OPA-संचालित पॉलिसी प्रवर्तन, टूल अनुमोदन वर्कफ़्लो, और कुंजी प्रबंधन के साथ एजेंट रजिस्ट्री। परिभाषित करें कि एजेंट क्या कर सकते हैं और क्या नहीं — फिर इसे स्वचालित रूप से लागू करें।",
      badge: "OPA-संचालित",
    },
    observability: {
      title: "ऑब्ज़र्वेबिलिटी और मूल्यांकन",
      desc: "हर अनुरोध डिफ़ॉल्ट रूप से ट्रेस होता है। प्रोडक्शन-ग्रेड मूल्यांकन पाइपलाइन, रिग्रेशन डिटेक्शन, और विफलता डीबगिंग — LangSmith या कस्टम लॉगिंग की ज़रूरत नहीं।",
      badge: "डिफ़ॉल्ट ट्रेसिंग",
    },
    finops: {
      title: "FinOps और बजट नियंत्रण",
      desc: "टोकन और मॉडल बजट सेट करें, ओवरशूट से पहले लागत अलर्ट पाएं, और Budget Autopilot को अपने SLO को पूरा करने वाली सबसे सस्ती रणनीति चुनने दें। कभी कोई अप्रत्याशित बिल नहीं।",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act और अनुपालन",
      desc: "अंतर्निहित RTBF (भूल जाने का अधिकार), EU AI Act पारदर्शिता इवेंट, और ISO 42001 के अनुरूप ऑडिट ट्रेल। नियामकों और ऑडिटरों के लिए मांग पर साक्ष्य दस्तावेज़ तैयार करें।",
      badge: "ऑडिट-तैयार",
    },
    "one-sdk": {
      title: "एक SDK, एक बिल",
      desc: "LangChain + Pinecone + LangSmith + कस्टम PII फ़िल्टर + OPA साइडकार + लागत डैशबोर्ड को बदलें। Spring और Summer SDK। एक इंटीग्रेशन, एक डैशबोर्ड, एक वेंडर।",
      badge: "Spring + Summer SDK",
    },
  },
  th: {
    "semantic-memory": {
      title: "หน่วยความจำเชิงความหมายและบริบท",
      desc: "หน่วยความจำเอเจนต์แบบถาวรพร้อมกราฟความรู้ การค้นหาแบบไฮบริดหลายภาษาในกว่า 100 ภาษา และการปรับบริบทอัตโนมัติ เอเจนต์ของคุณจดจำทุกอย่างและไม่มีวันเกิดภาพหลอนจากข้อมูลเก่า",
      badge: "กราฟ + E2E",
    },
    "policy-engine": {
      title: "เอนจินนโยบายและธรรมาภิบาล",
      desc: "การบังคับใช้นโยบายด้วย OPA เวิร์กโฟลว์อนุมัติเครื่องมือ และรีจิสทรีเอเจนต์พร้อมการจัดการคีย์ กำหนดสิ่งที่เอเจนต์ทำได้และทำไม่ได้ แล้วบังคับใช้โดยอัตโนมัติ",
      badge: "ขับเคลื่อนด้วย OPA",
    },
    observability: {
      title: "การสังเกตการณ์และการประเมิน",
      desc: "ทุกคำขอถูกติดตามตั้งแต่ต้น ไปป์ไลน์ประเมินระดับโปรดักชัน การตรวจจับรีเกรสชัน และการดีบักข้อผิดพลาด โดยไม่ต้องติดตั้ง LangSmith หรือระบบล็อกแบบกำหนดเอง",
      badge: "ติดตามตั้งแต่ต้น",
    },
    finops: {
      title: "FinOps และการควบคุมงบประมาณ",
      desc: "ตั้งงบประมาณโทเค็นและโมเดล รับการแจ้งเตือนค่าใช้จ่ายก่อนเกิน และให้ Budget Autopilot เลือกกลยุทธ์ที่ถูกที่สุดที่ตรงตาม SLO ของคุณ ไม่มีบิลเซอร์ไพรส์",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act และการปฏิบัติตามกฎ",
      desc: "RTBF ในตัว (สิทธิ์ที่จะถูกลืม) เหตุการณ์ความโปร่งใส EU AI Act และเส้นทางการตรวจสอบตาม ISO 42001 สร้างเอกสารหลักฐานตามต้องการสำหรับหน่วยงานกำกับดูแลและผู้ตรวจสอบ",
      badge: "พร้อมตรวจสอบ",
    },
    "one-sdk": {
      title: "SDK เดียว บิลเดียว",
      desc: "แทนที่ LangChain + Pinecone + LangSmith + ฟิลเตอร์ PII แบบกำหนดเอง + OPA sidecar + แดชบอร์ดค่าใช้จ่าย SDK Spring และ Summer การรวมครั้งเดียว แดชบอร์ดเดียว ผู้ให้บริการเดียว",
      badge: "Spring + Summer SDK",
    },
  },
  id: {
    "semantic-memory": {
      title: "Memori Semantik & Konteks",
      desc: "Memori agen persisten dengan graf pengetahuan, pencarian hibrida multibahasa di lebih dari 100 bahasa, dan rekonsiliasi konteks otomatis. Agen Anda mengingat segalanya dan tidak pernah berhalusinasi dengan data usang.",
      badge: "Graf + E2E",
    },
    "policy-engine": {
      title: "Mesin Kebijakan & Tata Kelola",
      desc: "Penegakan kebijakan berbasis OPA, alur persetujuan alat, dan registri agen dengan manajemen kunci. Tentukan apa yang agen bisa dan tidak bisa lakukan — lalu terapkan secara otomatis.",
      badge: "Berbasis OPA",
    },
    observability: {
      title: "Observabilitas & Evaluasi",
      desc: "Setiap permintaan dilacak secara default. Pipeline evaluasi tingkat produksi, deteksi regresi, dan debugging kegagalan tanpa mengintegrasikan LangSmith atau logging kustom.",
      badge: "Pelacakan Default",
    },
    finops: {
      title: "FinOps & Kontrol Anggaran",
      desc: "Tetapkan anggaran token dan model, dapatkan peringatan biaya sebelum melebihi batas, dan biarkan Budget Autopilot memilih strategi termurah yang memenuhi SLO Anda. Tidak ada tagihan mengejutkan.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act & Kepatuhan",
      desc: "RTBF bawaan (hak untuk dilupakan), peristiwa transparansi EU AI Act, dan jejak audit yang selaras dengan ISO 42001. Hasilkan dokumen bukti sesuai permintaan untuk regulator dan auditor.",
      badge: "Siap Audit",
    },
    "one-sdk": {
      title: "Satu SDK, Satu Tagihan",
      desc: "Gantikan LangChain + Pinecone + LangSmith + filter PII kustom + OPA sidecar + dashboard biaya. SDK Spring dan Summer. Satu integrasi, satu dashboard, satu vendor.",
      badge: "Spring + Summer SDK",
    },
  },
  vi: {
    "semantic-memory": {
      title: "Bộ nhớ ngữ nghĩa & Ngữ cảnh",
      desc: "Bộ nhớ tác nhân bền vững với đồ thị tri thức, tìm kiếm kết hợp đa ngôn ngữ trên hơn 100 ngôn ngữ, và đối chiếu ngữ cảnh tự động. Tác nhân của bạn ghi nhớ mọi thứ và không bao giờ ảo giác với dữ liệu cũ.",
      badge: "Đồ thị + E2E",
    },
    "policy-engine": {
      title: "Công cụ chính sách & Quản trị",
      desc: "Thực thi chính sách dựa trên OPA, quy trình phê duyệt công cụ, và sổ đăng ký tác nhân với quản lý khóa. Xác định những gì tác nhân có thể và không thể làm — rồi tự động thực thi.",
      badge: "Dựa trên OPA",
    },
    observability: {
      title: "Khả năng quan sát & Đánh giá",
      desc: "Mọi yêu cầu được truy vết mặc định. Pipeline đánh giá cấp production, phát hiện hồi quy, và gỡ lỗi sự cố mà không cần tích hợp LangSmith hay ghi log tùy chỉnh.",
      badge: "Truy vết mặc định",
    },
    finops: {
      title: "FinOps & Kiểm soát ngân sách",
      desc: "Đặt ngân sách token và mô hình, nhận cảnh báo chi phí trước khi vượt mức, và để Budget Autopilot chọn chiến lược rẻ nhất đáp ứng SLO của bạn. Không bao giờ có hóa đơn bất ngờ.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act & Tuân thủ",
      desc: "RTBF tích hợp (quyền được quên), sự kiện minh bạch EU AI Act, và nhật ký kiểm toán phù hợp ISO 42001. Tạo tài liệu chứng cứ theo yêu cầu cho cơ quan quản lý và kiểm toán viên.",
      badge: "Sẵn sàng kiểm toán",
    },
    "one-sdk": {
      title: "Một SDK, một hóa đơn",
      desc: "Thay thế LangChain + Pinecone + LangSmith + bộ lọc PII tùy chỉnh + OPA sidecar + bảng điều khiển chi phí. SDK Spring và Summer. Một tích hợp, một bảng điều khiển, một nhà cung cấp.",
      badge: "Spring + Summer SDK",
    },
  },
  "pt-BR": {
    "semantic-memory": {
      title: "Memória semântica e contexto",
      desc: "Memória de agente persistente com grafo de conhecimento, busca híbrida multilíngue em mais de 100 idiomas e reconciliação automática de contexto. Seus agentes lembram de tudo e nunca alucinam com dados desatualizados.",
      badge: "Grafo + E2E",
    },
    "policy-engine": {
      title: "Motor de políticas e governança",
      desc: "Aplicação de políticas com OPA, fluxos de aprovação de ferramentas e registro de agentes com gerenciamento de chaves. Defina o que os agentes podem e não podem fazer — e aplique automaticamente.",
      badge: "Baseado em OPA",
    },
    observability: {
      title: "Observabilidade e avaliação",
      desc: "Cada requisição é rastreada por padrão. Pipelines de avaliação de nível produtivo, detecção de regressões e depuração de falhas sem integrar LangSmith ou logging personalizado.",
      badge: "Rastreio por padrão",
    },
    finops: {
      title: "FinOps e controle de orçamento",
      desc: "Defina orçamentos de tokens e modelos, receba alertas de custo antes de estourar e deixe o Budget Autopilot escolher a estratégia mais barata que atenda seu SLO. Nunca uma fatura surpresa.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act e conformidade",
      desc: "RTBF integrado (direito ao esquecimento), eventos de transparência do EU AI Act e trilhas de auditoria alinhadas à ISO 42001. Gere evidências sob demanda para reguladores e auditores.",
      badge: "Pronto para auditoria",
    },
    "one-sdk": {
      title: "Um SDK, uma fatura",
      desc: "Substitua LangChain + Pinecone + LangSmith + filtros PII personalizados + sidecar OPA + dashboards de custos. SDKs Spring e Summer. Uma integração, um dashboard, um fornecedor.",
      badge: "Spring + Summer SDKs",
    },
  },
  "pt-PT": {
    "semantic-memory": {
      title: "Memória semântica e contexto",
      desc: "Memória de agente persistente com grafo de conhecimento, pesquisa híbrida multilingue em mais de 100 idiomas e reconciliação automática de contexto. Os seus agentes recordam tudo e nunca alucinam com dados desatualizados.",
      badge: "Grafo + E2E",
    },
    "policy-engine": {
      title: "Motor de políticas e governação",
      desc: "Aplicação de políticas com OPA, fluxos de aprovação de ferramentas e registo de agentes com gestão de chaves. Defina o que os agentes podem e não podem fazer — e aplique automaticamente.",
      badge: "Baseado em OPA",
    },
    observability: {
      title: "Observabilidade e avaliação",
      desc: "Cada pedido é rastreado por defeito. Pipelines de avaliação de nível produtivo, deteção de regressões e depuração de falhas sem integrar LangSmith ou registo personalizado.",
      badge: "Rastreio por defeito",
    },
    finops: {
      title: "FinOps e controlo de orçamento",
      desc: "Defina orçamentos de tokens e modelos, receba alertas de custo antes de exceder e deixe o Budget Autopilot escolher a estratégia mais barata que cumpra o seu SLO. Nunca uma fatura surpresa.",
      badge: "Budget Autopilot",
    },
    compliance: {
      title: "EU AI Act e conformidade",
      desc: "RTBF integrado (direito ao esquecimento), eventos de transparência do EU AI Act e trilhos de auditoria alinhados com a ISO 42001. Produza evidências a pedido para reguladores e auditores.",
      badge: "Pronto para auditoria",
    },
    "one-sdk": {
      title: "Um SDK, uma fatura",
      desc: "Substitua LangChain + Pinecone + LangSmith + filtros PII personalizados + sidecar OPA + dashboards de custos. SDKs Spring e Summer. Uma integração, um dashboard, um fornecedor.",
      badge: "Spring + Summer SDKs",
    },
  },
};

export function getFeatureContent(locale: Locale, key: FeatureKey): FeatureContent {
  return FEATURE_I18N[locale]?.[key] ?? FEATURE_I18N.en![key];
}

// =============================================================================
// MCP & Developer Tools translations
// =============================================================================

export type MCPFeatureKey = "mcp-server" | "config-sync" | "oauth-device" | "auto-context";

interface MCPFeatureContent {
  title: string;
  desc: string;
}

const MCP_FEATURE_I18N: Partial<Record<Locale, Record<MCPFeatureKey, MCPFeatureContent>>> = {
  en: {
    "mcp-server": {
      title: "MCP Server for 8 Editors",
      desc: "Native MCP support for Claude Code, Cursor, Windsurf, Cline. Config file sync for Copilot, Aider, Codex. One memory, every editor.",
    },
    "config-sync": {
      title: "Config Sync Across Tools",
      desc: "Auto-generate CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules, and more from your Seizn memories. Push or pull \u2014 your preferences follow you.",
    },
    "oauth-device": {
      title: "OAuth Device Flow",
      desc: "Browser-based auth for CLI tools. No API key copying. Just approve a code like ABCD-1234 in your browser \u2014 token saved automatically.",
    },
    "auto-context": {
      title: "Auto Context & Webhooks",
      desc: "Auto-detect projects from package.json/pyproject.toml/Cargo.toml. Get webhook notifications on memory changes. MCP Resources for read-only access.",
    },
  },
  ko: {
    "mcp-server": {
      title: "8개 에디터를 위한 MCP 서버",
      desc: "Claude Code, Cursor, Windsurf, Cline 네이티브 MCP 지원. Copilot, Aider, Codex 설정 파일 동기화. 하나의 메모리, 모든 에디터.",
    },
    "config-sync": {
      title: "도구 간 설정 동기화",
      desc: "Seizn 메모리에서 CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules 등을 자동 생성합니다. Push 또는 Pull — 설정이 항상 따라다닙니다.",
    },
    "oauth-device": {
      title: "OAuth 디바이스 플로우",
      desc: "CLI 도구를 위한 브라우저 기반 인증. API 키 복사 불필요. 브라우저에서 ABCD-1234 같은 코드를 승인하면 토큰이 자동 저장됩니다.",
    },
    "auto-context": {
      title: "자동 컨텍스트 & 웹훅",
      desc: "package.json/pyproject.toml/Cargo.toml에서 프로젝트 자동 감지. 메모리 변경 시 웹훅 알림. 읽기 전용 MCP Resources 지원.",
    },
  },
  ja: {
    "mcp-server": {
      title: "8エディター対応MCPサーバー",
      desc: "Claude Code、Cursor、Windsurf、ClineのネイティブMCPサポート。Copilot、Aider、Codexの設定ファイル同期。ひとつのメモリ、すべてのエディター。",
    },
    "config-sync": {
      title: "ツール間の設定同期",
      desc: "SeizンメモリからCLAUDE.md、AGENTS.md、.cursorrules、.windsurfrules などを自動生成。PushでもPullでも、設定があなたについてきます。",
    },
    "oauth-device": {
      title: "OAuthデバイスフロー",
      desc: "CLIツール向けのブラウザベース認証。APIキーのコピーは不要。ブラウザでABCD-1234のようなコードを承認するだけでトークンが自動保存されます。",
    },
    "auto-context": {
      title: "自動コンテキスト & Webhook",
      desc: "package.json/pyproject.toml/Cargo.tomlからプロジェクトを自動検出。メモリ変更時のWebhook通知。読み取り専用のMCP Resources対応。",
    },
  },
  "zh-hans": {
    "mcp-server": {
      title: "支持8个编辑器的MCP服务器",
      desc: "原生MCP支持 Claude Code、Cursor、Windsurf、Cline。配置文件同步支持 Copilot、Aider、Codex。一份记忆，每个编辑器。",
    },
    "config-sync": {
      title: "跨工具配置同步",
      desc: "从Seizn记忆自动生成CLAUDE.md、AGENTS.md、.cursorrules、.windsurfrules等。推送或拉取——您的偏好始终跟随。",
    },
    "oauth-device": {
      title: "OAuth设备流",
      desc: "CLI工具的基于浏览器认证。无需复制API密钥。只需在浏览器中批准类似ABCD-1234的代码——令牌自动保存。",
    },
    "auto-context": {
      title: "自动上下文与Webhook",
      desc: "从package.json/pyproject.toml/Cargo.toml自动检测项目。记忆变更时获取Webhook通知。MCP Resources提供只读访问。",
    },
  },
  "zh-hant": {
    "mcp-server": {
      title: "支援8個編輯器的MCP伺服器",
      desc: "原生MCP支援 Claude Code、Cursor、Windsurf、Cline。設定檔同步支援 Copilot、Aider、Codex。一份記憶，每個編輯器。",
    },
    "config-sync": {
      title: "跨工具設定同步",
      desc: "從Seizn記憶自動產生CLAUDE.md、AGENTS.md、.cursorrules、.windsurfrules等。推送或拉取——您的偏好始終跟隨。",
    },
    "oauth-device": {
      title: "OAuth裝置流程",
      desc: "CLI工具的瀏覽器認證。無需複製API金鑰。只需在瀏覽器中批准類似ABCD-1234的代碼——令牌自動儲存。",
    },
    "auto-context": {
      title: "自動上下文與Webhook",
      desc: "從package.json/pyproject.toml/Cargo.toml自動偵測專案。記憶變更時獲取Webhook通知。MCP Resources提供唯讀存取。",
    },
  },
  es: {
    "mcp-server": {
      title: "Servidor MCP para 8 editores",
      desc: "Soporte MCP nativo para Claude Code, Cursor, Windsurf, Cline. Sincronización de archivos de configuración para Copilot, Aider, Codex. Una memoria, cada editor.",
    },
    "config-sync": {
      title: "Sincronización de configuración entre herramientas",
      desc: "Genera automáticamente CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules y más desde tus memorias Seizn. Push o pull: tus preferencias te siguen.",
    },
    "oauth-device": {
      title: "Flujo OAuth de dispositivo",
      desc: "Autenticación basada en navegador para herramientas CLI. Sin copiar claves API. Solo aprueba un código como ABCD-1234 en tu navegador — token guardado automáticamente.",
    },
    "auto-context": {
      title: "Contexto automático y webhooks",
      desc: "Detección automática de proyectos desde package.json/pyproject.toml/Cargo.toml. Notificaciones webhook ante cambios de memoria. MCP Resources para acceso de solo lectura.",
    },
  },
  ru: {
    "mcp-server": {
      title: "MCP-сервер для 8 редакторов",
      desc: "Нативная поддержка MCP для Claude Code, Cursor, Windsurf, Cline. Синхронизация файлов конфигурации для Copilot, Aider, Codex. Одна память, каждый редактор.",
    },
    "config-sync": {
      title: "Синхронизация настроек между инструментами",
      desc: "Автоматическая генерация CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules и других файлов из памяти Seizn. Push или Pull — ваши настройки следуют за вами.",
    },
    "oauth-device": {
      title: "OAuth Device Flow",
      desc: "Аутентификация через браузер для CLI-инструментов. Без копирования API-ключей. Просто подтвердите код вроде ABCD-1234 в браузере — токен сохранится автоматически.",
    },
    "auto-context": {
      title: "Автоконтекст и вебхуки",
      desc: "Автоматическое обнаружение проектов из package.json/pyproject.toml/Cargo.toml. Webhook-уведомления при изменении памяти. MCP Resources для доступа только на чтение.",
    },
  },
  uk: {
    "mcp-server": {
      title: "MCP-сервер для 8 редакторів",
      desc: "Нативна підтримка MCP для Claude Code, Cursor, Windsurf, Cline. Синхронізація файлів конфігурації для Copilot, Aider, Codex. Одна пам'ять, кожен редактор.",
    },
    "config-sync": {
      title: "Синхронізація налаштувань між інструментами",
      desc: "Автоматична генерація CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules та інших з пам'яті Seizn. Push або Pull — ваші налаштування слідують за вами.",
    },
    "oauth-device": {
      title: "OAuth Device Flow",
      desc: "Автентифікація через браузер для CLI-інструментів. Без копіювання API-ключів. Просто підтвердіть код на кшталт ABCD-1234 у браузері — токен збережеться автоматично.",
    },
    "auto-context": {
      title: "Автоконтекст та вебхуки",
      desc: "Автоматичне виявлення проєктів з package.json/pyproject.toml/Cargo.toml. Webhook-сповіщення при зміні пам'яті. MCP Resources для доступу лише на читання.",
    },
  },
  he: {
    "mcp-server": {
      title: "שרת MCP ל-8 עורכים",
      desc: "תמיכת MCP מקורית ב-Claude Code, Cursor, Windsurf, Cline. סנכרון קבצי הגדרות עבור Copilot, Aider, Codex. זיכרון אחד, כל עורך.",
    },
    "config-sync": {
      title: "סנכרון הגדרות בין כלים",
      desc: "יצירה אוטומטית של CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules ועוד מזיכרונות Seizn שלך. Push או Pull — ההעדפות שלך עוקבות אחריך.",
    },
    "oauth-device": {
      title: "OAuth Device Flow",
      desc: "אימות מבוסס דפדפן עבור כלי CLI. ללא העתקת מפתחות API. פשוט אשר קוד כמו ABCD-1234 בדפדפן — הטוקן נשמר אוטומטית.",
    },
    "auto-context": {
      title: "הקשר אוטומטי ו-Webhooks",
      desc: "זיהוי אוטומטי של פרויקטים מ-package.json/pyproject.toml/Cargo.toml. קבלת התראות webhook בשינויי זיכרון. MCP Resources לגישת קריאה בלבד.",
    },
  },
  ar: {
    "mcp-server": {
      title: "خادم MCP لـ 8 محررات",
      desc: "دعم MCP أصلي لـ Claude Code و Cursor و Windsurf و Cline. مزامنة ملفات التكوين لـ Copilot و Aider و Codex. ذاكرة واحدة، كل محرر.",
    },
    "config-sync": {
      title: "مزامنة الإعدادات عبر الأدوات",
      desc: "إنشاء تلقائي لـ CLAUDE.md و AGENTS.md و .cursorrules و .windsurfrules والمزيد من ذاكرات Seizn. ادفع أو اسحب — تفضيلاتك تتبعك.",
    },
    "oauth-device": {
      title: "تدفق جهاز OAuth",
      desc: "مصادقة عبر المتصفح لأدوات CLI. بدون نسخ مفاتيح API. فقط وافق على رمز مثل ABCD-1234 في متصفحك — يُحفظ الرمز تلقائياً.",
    },
    "auto-context": {
      title: "سياق تلقائي وWebhooks",
      desc: "اكتشاف تلقائي للمشاريع من package.json/pyproject.toml/Cargo.toml. إشعارات webhook عند تغيير الذاكرة. MCP Resources للوصول للقراءة فقط.",
    },
  },
  fr: {
    "mcp-server": {
      title: "Serveur MCP pour 8 éditeurs",
      desc: "Support MCP natif pour Claude Code, Cursor, Windsurf, Cline. Synchronisation des fichiers de config pour Copilot, Aider, Codex. Une mémoire, chaque éditeur.",
    },
    "config-sync": {
      title: "Synchronisation de config entre outils",
      desc: "Génération automatique de CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules et plus depuis vos mémoires Seizn. Push ou pull — vos préférences vous suivent.",
    },
    "oauth-device": {
      title: "Flux OAuth Device",
      desc: "Authentification par navigateur pour les outils CLI. Sans copier de clé API. Approuvez simplement un code comme ABCD-1234 dans votre navigateur — jeton sauvegardé automatiquement.",
    },
    "auto-context": {
      title: "Contexte automatique et webhooks",
      desc: "Détection automatique des projets depuis package.json/pyproject.toml/Cargo.toml. Notifications webhook sur les changements de mémoire. MCP Resources pour l'accès en lecture seule.",
    },
  },
  de: {
    "mcp-server": {
      title: "MCP-Server für 8 Editoren",
      desc: "Native MCP-Unterstützung für Claude Code, Cursor, Windsurf, Cline. Config-Datei-Sync für Copilot, Aider, Codex. Ein Gedächtnis, jeder Editor.",
    },
    "config-sync": {
      title: "Konfigurationssync über Tools hinweg",
      desc: "Automatische Generierung von CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules und mehr aus Ihren Seizn-Erinnerungen. Push oder Pull — Ihre Einstellungen folgen Ihnen.",
    },
    "oauth-device": {
      title: "OAuth Device Flow",
      desc: "Browserbasierte Authentifizierung für CLI-Tools. Kein API-Key-Kopieren. Bestätigen Sie einfach einen Code wie ABCD-1234 im Browser — Token wird automatisch gespeichert.",
    },
    "auto-context": {
      title: "Auto-Kontext & Webhooks",
      desc: "Automatische Projekterkennung aus package.json/pyproject.toml/Cargo.toml. Webhook-Benachrichtigungen bei Gedächtnisänderungen. MCP Resources für Lesezugriff.",
    },
  },
  it: {
    "mcp-server": {
      title: "Server MCP per 8 editor",
      desc: "Supporto MCP nativo per Claude Code, Cursor, Windsurf, Cline. Sincronizzazione file di configurazione per Copilot, Aider, Codex. Una memoria, ogni editor.",
    },
    "config-sync": {
      title: "Sincronizzazione config tra strumenti",
      desc: "Generazione automatica di CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules e altro dalle tue memorie Seizn. Push o pull — le tue preferenze ti seguono.",
    },
    "oauth-device": {
      title: "OAuth Device Flow",
      desc: "Autenticazione basata su browser per strumenti CLI. Nessuna copia di chiavi API. Approva semplicemente un codice come ABCD-1234 nel browser — token salvato automaticamente.",
    },
    "auto-context": {
      title: "Contesto automatico e webhook",
      desc: "Rilevamento automatico dei progetti da package.json/pyproject.toml/Cargo.toml. Notifiche webhook sulle modifiche della memoria. MCP Resources per accesso in sola lettura.",
    },
  },
  sv: {
    "mcp-server": {
      title: "MCP-server för 8 editorer",
      desc: "Inbyggt MCP-stöd för Claude Code, Cursor, Windsurf, Cline. Konfigfilsynkronisering för Copilot, Aider, Codex. Ett minne, varje editor.",
    },
    "config-sync": {
      title: "Konfigsynk mellan verktyg",
      desc: "Autogenerera CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules med mera från dina Seizn-minnen. Push eller pull — dina inställningar följer dig.",
    },
    "oauth-device": {
      title: "OAuth Device Flow",
      desc: "Webbläsarbaserad autentisering för CLI-verktyg. Ingen API-nyckelkopiering. Godkänn bara en kod som ABCD-1234 i webbläsaren — token sparas automatiskt.",
    },
    "auto-context": {
      title: "Autokontext och webhooks",
      desc: "Automatisk projektdetektering från package.json/pyproject.toml/Cargo.toml. Webhook-aviseringar vid minnesändringar. MCP Resources för skrivskyddad åtkomst.",
    },
  },
  nl: {
    "mcp-server": {
      title: "MCP-server voor 8 editors",
      desc: "Native MCP-ondersteuning voor Claude Code, Cursor, Windsurf, Cline. Configbestandsynchronisatie voor Copilot, Aider, Codex. Eén geheugen, elke editor.",
    },
    "config-sync": {
      title: "Configuratiesync tussen tools",
      desc: "Automatisch CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules en meer genereren vanuit je Seizn-herinneringen. Push of pull — je voorkeuren volgen je.",
    },
    "oauth-device": {
      title: "OAuth Device Flow",
      desc: "Browsergebaseerde authenticatie voor CLI-tools. Geen API-sleutel kopiëren. Keur gewoon een code goed zoals ABCD-1234 in je browser — token automatisch opgeslagen.",
    },
    "auto-context": {
      title: "Autocontext en webhooks",
      desc: "Automatische projectdetectie vanuit package.json/pyproject.toml/Cargo.toml. Webhook-meldingen bij geheugenwijzigingen. MCP Resources voor alleen-lezen toegang.",
    },
  },
  pl: {
    "mcp-server": {
      title: "Serwer MCP dla 8 edytorów",
      desc: "Natywne wsparcie MCP dla Claude Code, Cursor, Windsurf, Cline. Synchronizacja plików konfiguracyjnych dla Copilot, Aider, Codex. Jedna pamięć, każdy edytor.",
    },
    "config-sync": {
      title: "Synchronizacja konfiguracji między narzędziami",
      desc: "Automatyczne generowanie CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules i więcej z pamięci Seizn. Push lub pull — Twoje preferencje podążają za Tobą.",
    },
    "oauth-device": {
      title: "OAuth Device Flow",
      desc: "Uwierzytelnianie przez przeglądarkę dla narzędzi CLI. Bez kopiowania kluczy API. Po prostu zatwierdź kod taki jak ABCD-1234 w przeglądarce — token zapisany automatycznie.",
    },
    "auto-context": {
      title: "Automatyczny kontekst i webhooki",
      desc: "Automatyczne wykrywanie projektów z package.json/pyproject.toml/Cargo.toml. Powiadomienia webhook przy zmianach pamięci. MCP Resources dla dostępu tylko do odczytu.",
    },
  },
  hi: {
    "mcp-server": {
      title: "8 एडिटर्स के लिए MCP सर्वर",
      desc: "Claude Code, Cursor, Windsurf, Cline के लिए नेटिव MCP सपोर्ट। Copilot, Aider, Codex के लिए कॉन्फ़िग फ़ाइल सिंक। एक मेमोरी, हर एडिटर।",
    },
    "config-sync": {
      title: "टूल्स में कॉन्फ़िग सिंक",
      desc: "अपनी Seizn मेमोरी से CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules और अन्य स्वचालित रूप से जनरेट करें। Push या Pull — आपकी प्राथमिकताएं आपके साथ चलती हैं।",
    },
    "oauth-device": {
      title: "OAuth डिवाइस फ़्लो",
      desc: "CLI टूल्स के लिए ब्राउज़र-आधारित प्रमाणीकरण। API कुंजी कॉपी करने की ज़रूरत नहीं। बस अपने ब्राउज़र में ABCD-1234 जैसा कोड स्वीकृत करें — टोकन स्वचालित रूप से सेव हो जाएगा।",
    },
    "auto-context": {
      title: "ऑटो कॉन्टेक्स्ट और वेबहुक",
      desc: "package.json/pyproject.toml/Cargo.toml से प्रोजेक्ट्स की स्वचालित पहचान। मेमोरी परिवर्तन पर वेबहुक सूचनाएं। रीड-ओनली एक्सेस के लिए MCP Resources।",
    },
  },
  th: {
    "mcp-server": {
      title: "เซิร์ฟเวอร์ MCP สำหรับ 8 เอดิเตอร์",
      desc: "รองรับ MCP แบบเนทีฟสำหรับ Claude Code, Cursor, Windsurf, Cline ซิงค์ไฟล์คอนฟิกสำหรับ Copilot, Aider, Codex หน่วยความจำเดียว ทุกเอดิเตอร์",
    },
    "config-sync": {
      title: "ซิงค์การตั้งค่าข้ามเครื่องมือ",
      desc: "สร้าง CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules และอื่นๆ อัตโนมัติจากหน่วยความจำ Seizn ของคุณ Push หรือ Pull — การตั้งค่าของคุณตามคุณไป",
    },
    "oauth-device": {
      title: "OAuth Device Flow",
      desc: "การยืนยันตัวตนผ่านเบราว์เซอร์สำหรับเครื่องมือ CLI ไม่ต้องคัดลอก API key แค่อนุมัติรหัสเช่น ABCD-1234 ในเบราว์เซอร์ — โทเค็นบันทึกอัตโนมัติ",
    },
    "auto-context": {
      title: "บริบทอัตโนมัติและ Webhooks",
      desc: "ตรวจจับโปรเจกต์อัตโนมัติจาก package.json/pyproject.toml/Cargo.toml รับการแจ้งเตือน webhook เมื่อหน่วยความจำเปลี่ยนแปลง MCP Resources สำหรับการเข้าถึงแบบอ่านอย่างเดียว",
    },
  },
  id: {
    "mcp-server": {
      title: "Server MCP untuk 8 Editor",
      desc: "Dukungan MCP native untuk Claude Code, Cursor, Windsurf, Cline. Sinkronisasi file konfigurasi untuk Copilot, Aider, Codex. Satu memori, setiap editor.",
    },
    "config-sync": {
      title: "Sinkronisasi Konfigurasi Lintas Alat",
      desc: "Buat otomatis CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules, dan lainnya dari memori Seizn Anda. Push atau pull — preferensi Anda mengikuti Anda.",
    },
    "oauth-device": {
      title: "OAuth Device Flow",
      desc: "Autentikasi berbasis browser untuk alat CLI. Tanpa menyalin kunci API. Cukup setujui kode seperti ABCD-1234 di browser Anda — token tersimpan otomatis.",
    },
    "auto-context": {
      title: "Konteks Otomatis & Webhooks",
      desc: "Deteksi proyek otomatis dari package.json/pyproject.toml/Cargo.toml. Notifikasi webhook saat memori berubah. MCP Resources untuk akses baca-saja.",
    },
  },
  vi: {
    "mcp-server": {
      title: "Máy chủ MCP cho 8 trình soạn thảo",
      desc: "Hỗ trợ MCP gốc cho Claude Code, Cursor, Windsurf, Cline. Đồng bộ tệp cấu hình cho Copilot, Aider, Codex. Một bộ nhớ, mọi trình soạn thảo.",
    },
    "config-sync": {
      title: "Đồng bộ cấu hình giữa các công cụ",
      desc: "Tự động tạo CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules và nhiều hơn từ bộ nhớ Seizn của bạn. Push hoặc pull — tùy chọn của bạn luôn đi theo.",
    },
    "oauth-device": {
      title: "OAuth Device Flow",
      desc: "Xác thực qua trình duyệt cho công cụ CLI. Không cần sao chép khóa API. Chỉ cần phê duyệt mã như ABCD-1234 trong trình duyệt — token được lưu tự động.",
    },
    "auto-context": {
      title: "Ngữ cảnh tự động & Webhooks",
      desc: "Tự động phát hiện dự án từ package.json/pyproject.toml/Cargo.toml. Nhận thông báo webhook khi bộ nhớ thay đổi. MCP Resources cho quyền truy cập chỉ đọc.",
    },
  },
  "pt-BR": {
    "mcp-server": {
      title: "Servidor MCP para 8 editores",
      desc: "Suporte MCP nativo para Claude Code, Cursor, Windsurf, Cline. Sincronização de arquivos de configuração para Copilot, Aider, Codex. Uma memória, cada editor.",
    },
    "config-sync": {
      title: "Sincronização de config entre ferramentas",
      desc: "Gere automaticamente CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules e mais a partir das suas memórias Seizn. Push ou pull — suas preferências seguem você.",
    },
    "oauth-device": {
      title: "OAuth Device Flow",
      desc: "Autenticação pelo navegador para ferramentas CLI. Sem copiar chaves de API. Apenas aprove um código como ABCD-1234 no navegador — token salvo automaticamente.",
    },
    "auto-context": {
      title: "Contexto automático e webhooks",
      desc: "Detecção automática de projetos a partir de package.json/pyproject.toml/Cargo.toml. Notificações via webhook em mudanças de memória. MCP Resources para acesso somente leitura.",
    },
  },
  "pt-PT": {
    "mcp-server": {
      title: "Servidor MCP para 8 editores",
      desc: "Suporte MCP nativo para Claude Code, Cursor, Windsurf, Cline. Sincronização de ficheiros de configuração para Copilot, Aider, Codex. Uma memória, cada editor.",
    },
    "config-sync": {
      title: "Sincronização de config entre ferramentas",
      desc: "Gere automaticamente CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules e mais a partir das suas memórias Seizn. Push ou pull — as suas preferências seguem-no.",
    },
    "oauth-device": {
      title: "OAuth Device Flow",
      desc: "Autenticação pelo navegador para ferramentas CLI. Sem copiar chaves de API. Apenas aprove um código como ABCD-1234 no navegador — token guardado automaticamente.",
    },
    "auto-context": {
      title: "Contexto automático e webhooks",
      desc: "Deteção automática de projetos a partir de package.json/pyproject.toml/Cargo.toml. Notificações via webhook em alterações de memória. MCP Resources para acesso apenas de leitura.",
    },
  },
};

export function getMCPFeatureContent(locale: Locale, key: MCPFeatureKey): MCPFeatureContent {
  return MCP_FEATURE_I18N[locale]?.[key] ?? MCP_FEATURE_I18N.en![key];
}

// =============================================================================
// Trust & Compliance translations
// =============================================================================

export type TrustKey =
  | "rls"
  | "owasp"
  | "rate-limits"
  | "audit"
  | "eu-ai-act"
  | "gdpr"
  | "soc2"
  | "iso42001";

interface TrustContent {
  title: string;
  desc: string;
}

const TRUST_I18N: Partial<Record<Locale, Record<TrustKey, TrustContent>>> = {
  en: {
    rls: { title: "RLS + Key Hashing", desc: "Tenant isolation by default" },
    owasp: { title: "OWASP LLM Top 10", desc: "Prompt injection & data leakage protections" },
    "rate-limits": { title: "Rate Limits + Alerts", desc: "Per-agent, per-model throttling" },
    audit: { title: "Full Audit Trails", desc: "Every decision, every token logged" },
    "eu-ai-act": { title: "EU AI Act Ready", desc: "Transparency events for high-risk AI" },
    gdpr: { title: "GDPR / RTBF", desc: "Right to be forgotten, verified" },
    soc2: { title: "SOC 2 Type II Path", desc: "Controls mapped, audit-ready" },
    iso42001: { title: "ISO 42001 Aligned", desc: "AI management system standard" },
  },
  ko: {
    rls: { title: "RLS + 키 해싱", desc: "기본 테넌트 격리" },
    owasp: { title: "OWASP LLM Top 10", desc: "프롬프트 인젝션 & 데이터 유출 방지" },
    "rate-limits": { title: "속도 제한 + 알림", desc: "에이전트별, 모델별 스로틀링" },
    audit: { title: "전체 감사 추적", desc: "모든 결정, 모든 토큰 기록" },
    "eu-ai-act": { title: "EU AI Act 준비 완료", desc: "고위험 AI를 위한 투명성 이벤트" },
    gdpr: { title: "GDPR / RTBF", desc: "잊힐 권리, 검증 완료" },
    soc2: { title: "SOC 2 Type II 경로", desc: "통제 매핑 완료, 감사 대응 준비" },
    iso42001: { title: "ISO 42001 정렬", desc: "AI 관리 시스템 표준" },
  },
  ja: {
    rls: { title: "RLS + キーハッシュ", desc: "デフォルトでテナント分離" },
    owasp: { title: "OWASP LLM Top 10", desc: "プロンプトインジェクション＆データ漏洩対策" },
    "rate-limits": { title: "レート制限 + アラート", desc: "エージェント別・モデル別のスロットリング" },
    audit: { title: "完全な監査証跡", desc: "すべての決定、すべてのトークンを記録" },
    "eu-ai-act": { title: "EU AI Act対応", desc: "高リスクAIのための透明性イベント" },
    gdpr: { title: "GDPR / RTBF", desc: "忘れられる権利、検証済み" },
    soc2: { title: "SOC 2 Type IIパス", desc: "コントロールマッピング済み、監査対応" },
    iso42001: { title: "ISO 42001準拠", desc: "AI管理システム規格" },
  },
  "zh-hans": {
    rls: { title: "RLS + 密钥哈希", desc: "默认租户隔离" },
    owasp: { title: "OWASP LLM Top 10", desc: "提示注入和数据泄露防护" },
    "rate-limits": { title: "速率限制 + 告警", desc: "按代理、按模型限流" },
    audit: { title: "完整审计跟踪", desc: "每个决策、每个令牌均有记录" },
    "eu-ai-act": { title: "EU AI Act就绪", desc: "高风险AI的透明度事件" },
    gdpr: { title: "GDPR / RTBF", desc: "被遗忘权，已验证" },
    soc2: { title: "SOC 2 Type II路径", desc: "控制已映射，审计就绪" },
    iso42001: { title: "ISO 42001对齐", desc: "AI管理体系标准" },
  },
  "zh-hant": {
    rls: { title: "RLS + 金鑰雜湊", desc: "預設租戶隔離" },
    owasp: { title: "OWASP LLM Top 10", desc: "提示注入與資料洩漏防護" },
    "rate-limits": { title: "速率限制 + 警報", desc: "按代理、按模型限流" },
    audit: { title: "完整稽核追蹤", desc: "每個決策、每個令牌均有記錄" },
    "eu-ai-act": { title: "EU AI Act就緒", desc: "高風險AI的透明度事件" },
    gdpr: { title: "GDPR / RTBF", desc: "被遺忘權，已驗證" },
    soc2: { title: "SOC 2 Type II路徑", desc: "控制已映射，稽核就緒" },
    iso42001: { title: "ISO 42001對齊", desc: "AI管理體系標準" },
  },
  es: {
    rls: { title: "RLS + Hashing de claves", desc: "Aislamiento de inquilinos por defecto" },
    owasp: { title: "OWASP LLM Top 10", desc: "Protección contra inyección de prompts y fuga de datos" },
    "rate-limits": { title: "Límites de tasa + Alertas", desc: "Limitación por agente y por modelo" },
    audit: { title: "Auditoría completa", desc: "Cada decisión, cada token registrado" },
    "eu-ai-act": { title: "EU AI Act listo", desc: "Eventos de transparencia para IA de alto riesgo" },
    gdpr: { title: "GDPR / RTBF", desc: "Derecho al olvido, verificado" },
    soc2: { title: "Ruta SOC 2 Type II", desc: "Controles mapeados, listo para auditoría" },
    iso42001: { title: "ISO 42001 alineado", desc: "Estándar de gestión de IA" },
  },
  ru: {
    rls: { title: "RLS + Хэширование ключей", desc: "Изоляция арендаторов по умолчанию" },
    owasp: { title: "OWASP LLM Top 10", desc: "Защита от инъекций промптов и утечки данных" },
    "rate-limits": { title: "Лимиты + Оповещения", desc: "Ограничение по агентам и моделям" },
    audit: { title: "Полные аудиторские журналы", desc: "Каждое решение, каждый токен зафиксирован" },
    "eu-ai-act": { title: "EU AI Act готов", desc: "События прозрачности для высокорисковой ИИ" },
    gdpr: { title: "GDPR / RTBF", desc: "Право на забвение, подтверждено" },
    soc2: { title: "Путь к SOC 2 Type II", desc: "Контроли сопоставлены, готов к аудиту" },
    iso42001: { title: "ISO 42001 соответствие", desc: "Стандарт системы управления ИИ" },
  },
  uk: {
    rls: { title: "RLS + Хешування ключів", desc: "Ізоляція орендарів за замовчуванням" },
    owasp: { title: "OWASP LLM Top 10", desc: "Захист від ін'єкцій промптів та витоку даних" },
    "rate-limits": { title: "Ліміти + Сповіщення", desc: "Обмеження за агентами та моделями" },
    audit: { title: "Повні аудиторські журнали", desc: "Кожне рішення, кожен токен зафіксовано" },
    "eu-ai-act": { title: "EU AI Act готовий", desc: "Події прозорості для високоризикового ШІ" },
    gdpr: { title: "GDPR / RTBF", desc: "Право на забуття, підтверджено" },
    soc2: { title: "Шлях до SOC 2 Type II", desc: "Контролі зіставлені, готовий до аудиту" },
    iso42001: { title: "ISO 42001 відповідність", desc: "Стандарт системи управління ШІ" },
  },
  he: {
    rls: { title: "RLS + גיבוב מפתחות", desc: "בידוד דיירים כברירת מחדל" },
    owasp: { title: "OWASP LLM Top 10", desc: "הגנה מפני הזרקת פרומפט ודליפת נתונים" },
    "rate-limits": { title: "מגבלות קצב + התראות", desc: "חניקה לפי סוכן ולפי מודל" },
    audit: { title: "מסלולי ביקורת מלאים", desc: "כל החלטה, כל טוקן מתועד" },
    "eu-ai-act": { title: "EU AI Act מוכן", desc: "אירועי שקיפות עבור AI בסיכון גבוה" },
    gdpr: { title: "GDPR / RTBF", desc: "זכות להישכח, מאומתת" },
    soc2: { title: "מסלול SOC 2 Type II", desc: "בקרות ממופות, מוכן לביקורת" },
    iso42001: { title: "ISO 42001 מיושר", desc: "תקן מערכת ניהול AI" },
  },
  ar: {
    rls: { title: "RLS + تجزئة المفاتيح", desc: "عزل المستأجرين افتراضياً" },
    owasp: { title: "OWASP LLM Top 10", desc: "حماية من حقن الأوامر وتسرب البيانات" },
    "rate-limits": { title: "حدود المعدل + تنبيهات", desc: "تقييد لكل وكيل ولكل نموذج" },
    audit: { title: "مسارات تدقيق كاملة", desc: "كل قرار، كل رمز مسجل" },
    "eu-ai-act": { title: "EU AI Act جاهز", desc: "أحداث شفافية للذكاء الاصطناعي عالي المخاطر" },
    gdpr: { title: "GDPR / RTBF", desc: "الحق في النسيان، تم التحقق" },
    soc2: { title: "مسار SOC 2 Type II", desc: "الضوابط مُعيَّنة، جاهز للتدقيق" },
    iso42001: { title: "ISO 42001 متوافق", desc: "معيار نظام إدارة الذكاء الاصطناعي" },
  },
  fr: {
    rls: { title: "RLS + Hachage de clés", desc: "Isolation des locataires par défaut" },
    owasp: { title: "OWASP LLM Top 10", desc: "Protection contre l'injection de prompts et fuite de données" },
    "rate-limits": { title: "Limites de taux + Alertes", desc: "Limitation par agent et par modèle" },
    audit: { title: "Pistes d'audit complètes", desc: "Chaque décision, chaque token enregistré" },
    "eu-ai-act": { title: "EU AI Act prêt", desc: "Événements de transparence pour l'IA à haut risque" },
    gdpr: { title: "GDPR / RTBF", desc: "Droit à l'oubli, vérifié" },
    soc2: { title: "Parcours SOC 2 Type II", desc: "Contrôles cartographiés, prêt pour l'audit" },
    iso42001: { title: "ISO 42001 aligné", desc: "Norme de système de gestion de l'IA" },
  },
  de: {
    rls: { title: "RLS + Schlüssel-Hashing", desc: "Mandantenisolierung standardmäßig" },
    owasp: { title: "OWASP LLM Top 10", desc: "Schutz vor Prompt-Injection und Datenlecks" },
    "rate-limits": { title: "Ratenlimits + Warnungen", desc: "Drosselung pro Agent und pro Modell" },
    audit: { title: "Vollständige Prüfpfade", desc: "Jede Entscheidung, jeder Token protokolliert" },
    "eu-ai-act": { title: "EU AI Act bereit", desc: "Transparenzereignisse für Hochrisiko-KI" },
    gdpr: { title: "GDPR / RTBF", desc: "Recht auf Vergessenwerden, verifiziert" },
    soc2: { title: "SOC 2 Type II Pfad", desc: "Kontrollen zugeordnet, audit-bereit" },
    iso42001: { title: "ISO 42001 konform", desc: "KI-Managementsystem-Standard" },
  },
  it: {
    rls: { title: "RLS + Hashing chiavi", desc: "Isolamento tenant di default" },
    owasp: { title: "OWASP LLM Top 10", desc: "Protezione da iniezione prompt e fuga dati" },
    "rate-limits": { title: "Limiti di frequenza + Avvisi", desc: "Limitazione per agente e per modello" },
    audit: { title: "Audit trail completi", desc: "Ogni decisione, ogni token registrato" },
    "eu-ai-act": { title: "EU AI Act pronto", desc: "Eventi di trasparenza per AI ad alto rischio" },
    gdpr: { title: "GDPR / RTBF", desc: "Diritto all'oblio, verificato" },
    soc2: { title: "Percorso SOC 2 Type II", desc: "Controlli mappati, pronto per l'audit" },
    iso42001: { title: "ISO 42001 allineato", desc: "Standard sistema di gestione AI" },
  },
  sv: {
    rls: { title: "RLS + Nyckelhashning", desc: "Hyresgästisolering som standard" },
    owasp: { title: "OWASP LLM Top 10", desc: "Skydd mot promptinjektion och dataläckage" },
    "rate-limits": { title: "Hastighetsbegränsningar + Varningar", desc: "Strypning per agent och per modell" },
    audit: { title: "Fullständiga revisionsloggar", desc: "Varje beslut, varje token loggad" },
    "eu-ai-act": { title: "EU AI Act redo", desc: "Transparenshändelser för högrisk-AI" },
    gdpr: { title: "GDPR / RTBF", desc: "Rätten att bli glömd, verifierad" },
    soc2: { title: "SOC 2 Type II väg", desc: "Kontroller kartlagda, revisionsredo" },
    iso42001: { title: "ISO 42001 anpassad", desc: "AI-ledningssystemstandard" },
  },
  nl: {
    rls: { title: "RLS + Sleutelhashing", desc: "Tenantisolatie standaard" },
    owasp: { title: "OWASP LLM Top 10", desc: "Bescherming tegen promptinjectie en datalek" },
    "rate-limits": { title: "Snelheidslimieten + Waarschuwingen", desc: "Beperking per agent en per model" },
    audit: { title: "Volledige audittrails", desc: "Elke beslissing, elke token gelogd" },
    "eu-ai-act": { title: "EU AI Act gereed", desc: "Transparantiegebeurtenissen voor hoog-risico AI" },
    gdpr: { title: "GDPR / RTBF", desc: "Recht op vergetelheid, geverifieerd" },
    soc2: { title: "SOC 2 Type II pad", desc: "Controls in kaart gebracht, audit-gereed" },
    iso42001: { title: "ISO 42001 afgestemd", desc: "AI-managementsysteemstandaard" },
  },
  pl: {
    rls: { title: "RLS + Hashowanie kluczy", desc: "Izolacja najemców domyślnie" },
    owasp: { title: "OWASP LLM Top 10", desc: "Ochrona przed wstrzyknięciem promptów i wyciekiem danych" },
    "rate-limits": { title: "Limity + Alerty", desc: "Ograniczanie na agenta i na model" },
    audit: { title: "Pełne ścieżki audytu", desc: "Każda decyzja, każdy token zarejestrowany" },
    "eu-ai-act": { title: "EU AI Act gotowy", desc: "Zdarzenia przejrzystości dla AI wysokiego ryzyka" },
    gdpr: { title: "GDPR / RTBF", desc: "Prawo do bycia zapomnianym, zweryfikowane" },
    soc2: { title: "Ścieżka SOC 2 Type II", desc: "Kontrole zmapowane, gotowy do audytu" },
    iso42001: { title: "ISO 42001 zgodny", desc: "Standard systemu zarządzania AI" },
  },
  hi: {
    rls: { title: "RLS + कुंजी हैशिंग", desc: "डिफ़ॉल्ट रूप से टेनेंट अलगाव" },
    owasp: { title: "OWASP LLM Top 10", desc: "प्रॉम्प्ट इंजेक्शन और डेटा लीकेज सुरक्षा" },
    "rate-limits": { title: "दर सीमा + अलर्ट", desc: "प्रति-एजेंट, प्रति-मॉडल थ्रॉटलिंग" },
    audit: { title: "पूर्ण ऑडिट ट्रेल", desc: "हर निर्णय, हर टोकन लॉग" },
    "eu-ai-act": { title: "EU AI Act तैयार", desc: "उच्च-जोखिम AI के लिए पारदर्शिता इवेंट" },
    gdpr: { title: "GDPR / RTBF", desc: "भूल जाने का अधिकार, सत्यापित" },
    soc2: { title: "SOC 2 Type II पथ", desc: "नियंत्रण मैप किए गए, ऑडिट-तैयार" },
    iso42001: { title: "ISO 42001 संरेखित", desc: "AI प्रबंधन प्रणाली मानक" },
  },
  th: {
    rls: { title: "RLS + การแฮชคีย์", desc: "การแยกผู้เช่าตั้งแต่ต้น" },
    owasp: { title: "OWASP LLM Top 10", desc: "การป้องกันการฉีดพรอมต์และการรั่วไหลของข้อมูล" },
    "rate-limits": { title: "ขีดจำกัดอัตรา + การแจ้งเตือน", desc: "การจำกัดตามเอเจนต์และตามโมเดล" },
    audit: { title: "เส้นทางการตรวจสอบครบถ้วน", desc: "ทุกการตัดสินใจ ทุกโทเค็นถูกบันทึก" },
    "eu-ai-act": { title: "EU AI Act พร้อม", desc: "เหตุการณ์ความโปร่งใสสำหรับ AI ความเสี่ยงสูง" },
    gdpr: { title: "GDPR / RTBF", desc: "สิทธิ์ที่จะถูกลืม ยืนยันแล้ว" },
    soc2: { title: "เส้นทาง SOC 2 Type II", desc: "การควบคุมแมปแล้ว พร้อมตรวจสอบ" },
    iso42001: { title: "ISO 42001 สอดคล้อง", desc: "มาตรฐานระบบจัดการ AI" },
  },
  id: {
    rls: { title: "RLS + Hashing Kunci", desc: "Isolasi tenant secara default" },
    owasp: { title: "OWASP LLM Top 10", desc: "Perlindungan injeksi prompt & kebocoran data" },
    "rate-limits": { title: "Batas Laju + Peringatan", desc: "Pembatasan per agen, per model" },
    audit: { title: "Jejak Audit Lengkap", desc: "Setiap keputusan, setiap token dicatat" },
    "eu-ai-act": { title: "EU AI Act Siap", desc: "Event transparansi untuk AI berisiko tinggi" },
    gdpr: { title: "GDPR / RTBF", desc: "Hak untuk dilupakan, terverifikasi" },
    soc2: { title: "Jalur SOC 2 Type II", desc: "Kontrol dipetakan, siap audit" },
    iso42001: { title: "ISO 42001 Selaras", desc: "Standar sistem manajemen AI" },
  },
  vi: {
    rls: { title: "RLS + Băm khóa", desc: "Cách ly tenant mặc định" },
    owasp: { title: "OWASP LLM Top 10", desc: "Bảo vệ chống tiêm prompt và rò rỉ dữ liệu" },
    "rate-limits": { title: "Giới hạn tốc độ + Cảnh báo", desc: "Điều tiết theo tác nhân, theo mô hình" },
    audit: { title: "Nhật ký kiểm toán đầy đủ", desc: "Mọi quyết định, mọi token được ghi lại" },
    "eu-ai-act": { title: "EU AI Act sẵn sàng", desc: "Sự kiện minh bạch cho AI rủi ro cao" },
    gdpr: { title: "GDPR / RTBF", desc: "Quyền được quên, đã xác minh" },
    soc2: { title: "Lộ trình SOC 2 Type II", desc: "Kiểm soát đã ánh xạ, sẵn sàng kiểm toán" },
    iso42001: { title: "ISO 42001 phù hợp", desc: "Tiêu chuẩn hệ thống quản lý AI" },
  },
  "pt-BR": {
    rls: { title: "RLS + Hashing de chaves", desc: "Isolamento de tenant por padrão" },
    owasp: { title: "OWASP LLM Top 10", desc: "Proteção contra injeção de prompt e vazamento de dados" },
    "rate-limits": { title: "Limites de taxa + Alertas", desc: "Limitação por agente e por modelo" },
    audit: { title: "Trilhas de auditoria completas", desc: "Cada decisão, cada token registrado" },
    "eu-ai-act": { title: "EU AI Act pronto", desc: "Eventos de transparência para IA de alto risco" },
    gdpr: { title: "GDPR / RTBF", desc: "Direito ao esquecimento, verificado" },
    soc2: { title: "Caminho SOC 2 Type II", desc: "Controles mapeados, pronto para auditoria" },
    iso42001: { title: "ISO 42001 alinhado", desc: "Padrão de sistema de gestão de IA" },
  },
  "pt-PT": {
    rls: { title: "RLS + Hashing de chaves", desc: "Isolamento de tenant por defeito" },
    owasp: { title: "OWASP LLM Top 10", desc: "Proteção contra injeção de prompt e fuga de dados" },
    "rate-limits": { title: "Limites de taxa + Alertas", desc: "Limitação por agente e por modelo" },
    audit: { title: "Trilhos de auditoria completos", desc: "Cada decisão, cada token registado" },
    "eu-ai-act": { title: "EU AI Act pronto", desc: "Eventos de transparência para IA de alto risco" },
    gdpr: { title: "GDPR / RTBF", desc: "Direito ao esquecimento, verificado" },
    soc2: { title: "Caminho SOC 2 Type II", desc: "Controlos mapeados, pronto para auditoria" },
    iso42001: { title: "ISO 42001 alinhado", desc: "Padrão de sistema de gestão de IA" },
  },
};

export function getTrustContent(locale: Locale, key: TrustKey): TrustContent {
  return TRUST_I18N[locale]?.[key] ?? TRUST_I18N.en![key];
}

// =============================================================================
// Section copy translations (extends SECTION_COPY to all locales)
// =============================================================================

export interface SectionCopy {
  platformCapabilities: string;
  platformTitle: string;
  platformSubtitle: string;
  mcpTools: string;
  mcpTitle: string;
  mcpSubtitle: string;
  setupMcp: string;
  mcpHint: string;
  trustTitle: string;
  trustSubtitle: string;
  pricingTitle: string;
  pricingSubtitle: string;
  footerTagline: string;
  productLabel: string;
  resourcesLabel: string;
  legalLabel: string;
  compareLabel: string;
  mcpServerLabel: string;
  githubLabel: string;
}

const SECTION_I18N: Partial<Record<Locale, SectionCopy>> = {
  en: {
    platformCapabilities: "Platform Capabilities",
    platformTitle: "Everything agents need to run in production",
    platformSubtitle: "One platform for memory, governance, observability, cost control, and compliance - so your team ships faster with fewer moving parts.",
    mcpTools: "MCP & Developer Tools",
    mcpTitle: "Your AI memories, in every editor",
    mcpSubtitle: "One MCP server bridges Seizn to 8 AI coding assistants. Auto-sync preferences, instructions, and context - no manual config files.",
    setupMcp: "Set up MCP Server",
    mcpHint: "npx seizn-mcp@latest - works in 30 seconds",
    trustTitle: "Enterprise-grade trust, built in",
    trustSubtitle: "Every layer designed for regulated industries and security-conscious teams.",
    pricingTitle: "From first API call to enterprise rollout",
    pricingSubtitle: "Free tier to start building. Predictable per-query pricing as you scale. Custom plans for teams with compliance and SLA requirements.",
    footerTagline: "Built for agents, governed by design.",
    productLabel: "Product",
    resourcesLabel: "Resources",
    legalLabel: "Legal",
    compareLabel: "Compare",
    mcpServerLabel: "MCP Server",
    githubLabel: "GitHub",
  },
  ko: {
    platformCapabilities: "플랫폼 기능",
    platformTitle: "에이전트 운영에 필요한 모든 기능",
    platformSubtitle: "메모리, 거버넌스, 관측, 비용 제어, 컴플라이언스를 하나의 플랫폼에서 제공합니다.",
    mcpTools: "MCP 및 개발자 도구",
    mcpTitle: "어떤 에디터에서든 같은 AI 메모리",
    mcpSubtitle: "하나의 MCP 서버로 8개 AI 코딩 도구에 Seizn 컨텍스트를 연결합니다. 수동 설정 파일 없이 동작합니다.",
    setupMcp: "MCP 서버 설정하기",
    mcpHint: "npx seizn-mcp@latest - 30초 내 설정",
    trustTitle: "엔터프라이즈 신뢰 기능 내장",
    trustSubtitle: "규제가 필요한 환경에서도 바로 사용할 수 있도록 설계했습니다.",
    pricingTitle: "첫 API 호출부터 엔터프라이즈 배포까지",
    pricingSubtitle: "무료로 시작하고 규모에 맞춰 예측 가능한 과금으로 확장하세요.",
    footerTagline: "에이전트를 위한 설계, 거버넌스를 기본으로.",
    productLabel: "제품",
    resourcesLabel: "리소스",
    legalLabel: "법적 고지",
    compareLabel: "비교",
    mcpServerLabel: "MCP 서버",
    githubLabel: "GitHub",
  },
  ja: {
    platformCapabilities: "プラットフォーム機能",
    platformTitle: "エージェント運用に必要なすべて",
    platformSubtitle: "メモリ、ガバナンス、オブザーバビリティ、コスト管理、コンプライアンスをひとつのプラットフォームで。少ない構成要素で速くリリース。",
    mcpTools: "MCP & 開発者ツール",
    mcpTitle: "すべてのエディターで同じAIメモリ",
    mcpSubtitle: "ひとつのMCPサーバーでSeizнを8つのAIコーディングアシスタントに接続。設定・指示・コンテキストを自動同期。手動設定ファイル不要。",
    setupMcp: "MCPサーバーをセットアップ",
    mcpHint: "npx seizn-mcp@latest - 30秒で完了",
    trustTitle: "エンタープライズグレードの信頼性を標準搭載",
    trustSubtitle: "規制産業やセキュリティ重視のチーム向けに設計された全レイヤー。",
    pricingTitle: "最初のAPIコールからエンタープライズ展開まで",
    pricingSubtitle: "無料枠で構築を始め、スケールに合わせた予測可能なクエリ単価で。コンプライアンスとSLA要件のあるチーム向けカスタムプランも。",
    footerTagline: "エージェントのために構築、ガバナンスを設計に。",
    productLabel: "製品",
    resourcesLabel: "リソース",
    legalLabel: "法的情報",
    compareLabel: "比較",
    mcpServerLabel: "MCPサーバー",
    githubLabel: "GitHub",
  },
  "zh-hans": {
    platformCapabilities: "平台功能",
    platformTitle: "代理生产运行所需的一切",
    platformSubtitle: "一个平台提供记忆、治理、可观测性、成本控制和合规——让团队更快交付，减少活动部件。",
    mcpTools: "MCP 和开发者工具",
    mcpTitle: "在每个编辑器中使用相同的AI记忆",
    mcpSubtitle: "一个MCP服务器将Seizn连接到8个AI编码助手。自动同步偏好、指令和上下文——无需手动配置文件。",
    setupMcp: "设置MCP服务器",
    mcpHint: "npx seizn-mcp@latest - 30秒完成",
    trustTitle: "内置企业级信任",
    trustSubtitle: "每一层都为受监管行业和注重安全的团队设计。",
    pricingTitle: "从首次API调用到企业部署",
    pricingSubtitle: "免费层开始构建。随规模增长按查询可预测定价。为有合规和SLA需求的团队提供定制方案。",
    footerTagline: "为代理而建，治理融入设计。",
    productLabel: "产品",
    resourcesLabel: "资源",
    legalLabel: "法律",
    compareLabel: "对比",
    mcpServerLabel: "MCP 服务器",
    githubLabel: "GitHub",
  },
  "zh-hant": {
    platformCapabilities: "平台功能",
    platformTitle: "代理生產運行所需的一切",
    platformSubtitle: "一個平台提供記憶、治理、可觀測性、成本控制和合規——讓團隊更快交付，減少活動部件。",
    mcpTools: "MCP 和開發者工具",
    mcpTitle: "在每個編輯器中使用相同的AI記憶",
    mcpSubtitle: "一個MCP伺服器將Seizn連接到8個AI程式設計助手。自動同步偏好、指令和上下文——無需手動設定檔。",
    setupMcp: "設定MCP伺服器",
    mcpHint: "npx seizn-mcp@latest - 30秒完成",
    trustTitle: "內建企業級信任",
    trustSubtitle: "每一層都為受監管產業和注重安全的團隊設計。",
    pricingTitle: "從首次API呼叫到企業部署",
    pricingSubtitle: "免費層開始建構。隨規模成長按查詢可預測定價。為有合規和SLA需求的團隊提供訂製方案。",
    footerTagline: "為代理而建，治理融入設計。",
    productLabel: "產品",
    resourcesLabel: "資源",
    legalLabel: "法律",
    compareLabel: "比較",
    mcpServerLabel: "MCP 伺服器",
    githubLabel: "GitHub",
  },
  es: {
    platformCapabilities: "Capacidades de la plataforma",
    platformTitle: "Todo lo que los agentes necesitan en producción",
    platformSubtitle: "Una plataforma para memoria, gobernanza, observabilidad, control de costos y cumplimiento — para que tu equipo lance más rápido con menos piezas móviles.",
    mcpTools: "MCP y herramientas para desarrolladores",
    mcpTitle: "Tus memorias de IA, en cada editor",
    mcpSubtitle: "Un servidor MCP conecta Seizn a 8 asistentes de código AI. Sincronización automática de preferencias, instrucciones y contexto — sin archivos de configuración manuales.",
    setupMcp: "Configurar servidor MCP",
    mcpHint: "npx seizn-mcp@latest - funciona en 30 segundos",
    trustTitle: "Confianza empresarial, integrada",
    trustSubtitle: "Cada capa diseñada para industrias reguladas y equipos conscientes de la seguridad.",
    pricingTitle: "Desde la primera llamada API hasta el despliegue empresarial",
    pricingSubtitle: "Nivel gratuito para empezar. Precios predecibles por consulta al escalar. Planes personalizados para equipos con requisitos de cumplimiento y SLA.",
    footerTagline: "Construido para agentes, gobernado por diseño.",
    productLabel: "Producto",
    resourcesLabel: "Recursos",
    legalLabel: "Legal",
    compareLabel: "Comparar",
    mcpServerLabel: "Servidor MCP",
    githubLabel: "GitHub",
  },
  ru: {
    platformCapabilities: "Возможности платформы",
    platformTitle: "Всё необходимое для агентов в продакшене",
    platformSubtitle: "Одна платформа для памяти, управления, наблюдаемости, контроля затрат и соответствия — чтобы ваша команда выпускала быстрее с меньшим числом компонентов.",
    mcpTools: "MCP и инструменты разработчика",
    mcpTitle: "Ваша AI-память в каждом редакторе",
    mcpSubtitle: "Один MCP-сервер связывает Seizn с 8 AI-ассистентами для кодинга. Автосинхронизация настроек, инструкций и контекста — без ручных файлов конфигурации.",
    setupMcp: "Настроить MCP-сервер",
    mcpHint: "npx seizn-mcp@latest - работает за 30 секунд",
    trustTitle: "Корпоративное доверие встроено",
    trustSubtitle: "Каждый уровень спроектирован для регулируемых отраслей и команд, ориентированных на безопасность.",
    pricingTitle: "От первого API-вызова до корпоративного развертывания",
    pricingSubtitle: "Бесплатный уровень для старта. Предсказуемые цены за запрос по мере масштабирования. Индивидуальные планы для команд с требованиями соответствия и SLA.",
    footerTagline: "Создано для агентов, управление по замыслу.",
    productLabel: "Продукт",
    resourcesLabel: "Ресурсы",
    legalLabel: "Правовая информация",
    compareLabel: "Сравнить",
    mcpServerLabel: "MCP-сервер",
    githubLabel: "GitHub",
  },
  uk: {
    platformCapabilities: "Можливості платформи",
    platformTitle: "Усе необхідне для агентів у продакшені",
    platformSubtitle: "Одна платформа для пам'яті, керування, спостережуваності, контролю витрат і відповідності — щоб ваша команда випускала швидше з меншою кількістю компонентів.",
    mcpTools: "MCP та інструменти розробника",
    mcpTitle: "Ваша AI-пам'ять у кожному редакторі",
    mcpSubtitle: "Один MCP-сервер з'єднує Seizn із 8 AI-помічниками для кодування. Автосинхронізація налаштувань, інструкцій і контексту — без ручних файлів конфігурації.",
    setupMcp: "Налаштувати MCP-сервер",
    mcpHint: "npx seizn-mcp@latest - працює за 30 секунд",
    trustTitle: "Корпоративна довіра вбудована",
    trustSubtitle: "Кожен рівень спроєктований для регульованих галузей і команд, орієнтованих на безпеку.",
    pricingTitle: "Від першого API-виклику до корпоративного розгортання",
    pricingSubtitle: "Безкоштовний рівень для старту. Передбачувані ціни за запит при масштабуванні. Індивідуальні плани для команд із вимогами відповідності та SLA.",
    footerTagline: "Створено для агентів, керування за задумом.",
    productLabel: "Продукт",
    resourcesLabel: "Ресурси",
    legalLabel: "Правова інформація",
    compareLabel: "Порівняти",
    mcpServerLabel: "MCP-сервер",
    githubLabel: "GitHub",
  },
  he: {
    platformCapabilities: "יכולות הפלטפורמה",
    platformTitle: "כל מה שסוכנים צריכים לריצה בייצור",
    platformSubtitle: "פלטפורמה אחת לזיכרון, ממשל, ניטור, בקרת עלויות ותאימות — כדי שהצוות שלך ישחרר מהר יותר עם פחות חלקים נעים.",
    mcpTools: "MCP וכלי פיתוח",
    mcpTitle: "זיכרונות ה-AI שלך, בכל עורך",
    mcpSubtitle: "שרת MCP אחד מחבר את Seizn ל-8 עוזרי קוד AI. סנכרון אוטומטי של העדפות, הוראות והקשר — ללא קבצי הגדרות ידניים.",
    setupMcp: "הגדרת שרת MCP",
    mcpHint: "npx seizn-mcp@latest - עובד תוך 30 שניות",
    trustTitle: "אמון ברמה ארגונית, מובנה",
    trustSubtitle: "כל שכבה מתוכננת עבור תעשיות מוסדרות וצוותים מודעי אבטחה.",
    pricingTitle: "מקריאת API ראשונה ועד פריסה ארגונית",
    pricingSubtitle: "רמה חינמית להתחיל. תמחור צפוי לפי שאילתה בהתרחבות. תוכניות מותאמות לצוותים עם דרישות תאימות ו-SLA.",
    footerTagline: "נבנה עבור סוכנים, ממשל בעיצוב.",
    productLabel: "מוצר",
    resourcesLabel: "משאבים",
    legalLabel: "משפטי",
    compareLabel: "השוואה",
    mcpServerLabel: "שרת MCP",
    githubLabel: "GitHub",
  },
  ar: {
    platformCapabilities: "قدرات المنصة",
    platformTitle: "كل ما تحتاجه الوكلاء للعمل في الإنتاج",
    platformSubtitle: "منصة واحدة للذاكرة والحوكمة والمراقبة والتحكم بالتكاليف والامتثال — ليطلق فريقك أسرع مع أجزاء متحركة أقل.",
    mcpTools: "MCP وأدوات المطورين",
    mcpTitle: "ذاكرات AI الخاصة بك، في كل محرر",
    mcpSubtitle: "خادم MCP واحد يربط Seizn بـ 8 مساعدات برمجة AI. مزامنة تلقائية للتفضيلات والتعليمات والسياق — بدون ملفات تكوين يدوية.",
    setupMcp: "إعداد خادم MCP",
    mcpHint: "npx seizn-mcp@latest - يعمل في 30 ثانية",
    trustTitle: "ثقة مؤسسية، مدمجة",
    trustSubtitle: "كل طبقة مصممة للصناعات المنظمة والفرق الحريصة على الأمان.",
    pricingTitle: "من أول استدعاء API إلى النشر المؤسسي",
    pricingSubtitle: "طبقة مجانية للبدء. تسعير متوقع لكل استعلام مع التوسع. خطط مخصصة للفرق ذات متطلبات الامتثال و SLA.",
    footerTagline: "بُني للوكلاء، محكوم بالتصميم.",
    productLabel: "المنتج",
    resourcesLabel: "الموارد",
    legalLabel: "قانوني",
    compareLabel: "مقارنة",
    mcpServerLabel: "خادم MCP",
    githubLabel: "GitHub",
  },
  fr: {
    platformCapabilities: "Capacités de la plateforme",
    platformTitle: "Tout ce dont les agents ont besoin en production",
    platformSubtitle: "Une plateforme pour la mémoire, la gouvernance, l'observabilité, le contrôle des coûts et la conformité — pour que votre équipe livre plus vite avec moins de pièces mobiles.",
    mcpTools: "MCP et outils développeurs",
    mcpTitle: "Vos mémoires IA, dans chaque éditeur",
    mcpSubtitle: "Un serveur MCP relie Seizn à 8 assistants de code IA. Synchronisation automatique des préférences, instructions et contexte — sans fichiers de config manuels.",
    setupMcp: "Configurer le serveur MCP",
    mcpHint: "npx seizn-mcp@latest - fonctionne en 30 secondes",
    trustTitle: "Confiance entreprise, intégrée",
    trustSubtitle: "Chaque couche conçue pour les industries réglementées et les équipes soucieuses de la sécurité.",
    pricingTitle: "Du premier appel API au déploiement entreprise",
    pricingSubtitle: "Niveau gratuit pour commencer. Tarification prévisible par requête en évoluant. Plans personnalisés pour les équipes avec des exigences de conformité et SLA.",
    footerTagline: "Conçu pour les agents, gouverné par conception.",
    productLabel: "Produit",
    resourcesLabel: "Ressources",
    legalLabel: "Mentions légales",
    compareLabel: "Comparer",
    mcpServerLabel: "Serveur MCP",
    githubLabel: "GitHub",
  },
  de: {
    platformCapabilities: "Plattformfähigkeiten",
    platformTitle: "Alles, was Agenten für den Produktionsbetrieb brauchen",
    platformSubtitle: "Eine Plattform für Speicher, Governance, Observability, Kostenkontrolle und Compliance — damit Ihr Team schneller liefert mit weniger beweglichen Teilen.",
    mcpTools: "MCP & Entwicklertools",
    mcpTitle: "Ihre KI-Erinnerungen, in jedem Editor",
    mcpSubtitle: "Ein MCP-Server verbindet Seizn mit 8 KI-Codierassistenten. Automatische Synchronisierung von Einstellungen, Anweisungen und Kontext — ohne manuelle Konfigurationsdateien.",
    setupMcp: "MCP-Server einrichten",
    mcpHint: "npx seizn-mcp@latest - funktioniert in 30 Sekunden",
    trustTitle: "Enterprise-Vertrauen, eingebaut",
    trustSubtitle: "Jede Schicht für regulierte Branchen und sicherheitsbewusste Teams konzipiert.",
    pricingTitle: "Vom ersten API-Aufruf bis zum Enterprise-Rollout",
    pricingSubtitle: "Kostenloser Tarif zum Starten. Vorhersagbare Abrechnung pro Anfrage beim Skalieren. Individuelle Pläne für Teams mit Compliance- und SLA-Anforderungen.",
    footerTagline: "Für Agenten gebaut, Governance von Grund auf.",
    productLabel: "Produkt",
    resourcesLabel: "Ressourcen",
    legalLabel: "Rechtliches",
    compareLabel: "Vergleichen",
    mcpServerLabel: "MCP-Server",
    githubLabel: "GitHub",
  },
  it: {
    platformCapabilities: "Funzionalità della piattaforma",
    platformTitle: "Tutto ciò che gli agenti necessitano in produzione",
    platformSubtitle: "Una piattaforma per memoria, governance, osservabilità, controllo costi e conformità — il tuo team rilascia più veloce con meno parti in movimento.",
    mcpTools: "MCP e strumenti per sviluppatori",
    mcpTitle: "Le tue memorie AI, in ogni editor",
    mcpSubtitle: "Un server MCP collega Seizn a 8 assistenti AI per il codice. Sincronizzazione automatica di preferenze, istruzioni e contesto — senza file di configurazione manuali.",
    setupMcp: "Configura server MCP",
    mcpHint: "npx seizn-mcp@latest - funziona in 30 secondi",
    trustTitle: "Fiducia enterprise, integrata",
    trustSubtitle: "Ogni livello progettato per industrie regolamentate e team attenti alla sicurezza.",
    pricingTitle: "Dalla prima chiamata API al rollout enterprise",
    pricingSubtitle: "Livello gratuito per iniziare. Prezzi prevedibili per query in fase di crescita. Piani personalizzati per team con requisiti di conformità e SLA.",
    footerTagline: "Costruito per agenti, governance by design.",
    productLabel: "Prodotto",
    resourcesLabel: "Risorse",
    legalLabel: "Legale",
    compareLabel: "Confronta",
    mcpServerLabel: "Server MCP",
    githubLabel: "GitHub",
  },
  sv: {
    platformCapabilities: "Plattformsfunktioner",
    platformTitle: "Allt agenter behöver i produktion",
    platformSubtitle: "En plattform för minne, styrning, observerbarhet, kostnadskontroll och efterlevnad — så att ditt team levererar snabbare med färre rörliga delar.",
    mcpTools: "MCP och utvecklarverktyg",
    mcpTitle: "Dina AI-minnen, i varje editor",
    mcpSubtitle: "En MCP-server kopplar Seizn till 8 AI-kodningsassistenter. Autosynk av inställningar, instruktioner och kontext — inga manuella konfigfiler.",
    setupMcp: "Konfigurera MCP-server",
    mcpHint: "npx seizn-mcp@latest - fungerar på 30 sekunder",
    trustTitle: "Företagstillit, inbyggd",
    trustSubtitle: "Varje lager designat för reglerade branscher och säkerhetsmedvetna team.",
    pricingTitle: "Från första API-anropet till enterprise-utrullning",
    pricingSubtitle: "Gratisnivå för att börja bygga. Förutsägbar prissättning per förfrågan när du skalar. Anpassade planer för team med efterlevnads- och SLA-krav.",
    footerTagline: "Byggt för agenter, styrt genom design.",
    productLabel: "Produkt",
    resourcesLabel: "Resurser",
    legalLabel: "Juridiskt",
    compareLabel: "Jämför",
    mcpServerLabel: "MCP-server",
    githubLabel: "GitHub",
  },
  nl: {
    platformCapabilities: "Platformcapaciteiten",
    platformTitle: "Alles wat agenten nodig hebben in productie",
    platformSubtitle: "Eén platform voor geheugen, governance, observeerbaarheid, kostenbeheer en compliance — zodat je team sneller levert met minder bewegende delen.",
    mcpTools: "MCP & ontwikkelaarstools",
    mcpTitle: "Je AI-herinneringen, in elke editor",
    mcpSubtitle: "Eén MCP-server verbindt Seizn met 8 AI-codeerassistenten. Automatische sync van voorkeuren, instructies en context — geen handmatige configbestanden.",
    setupMcp: "MCP-server instellen",
    mcpHint: "npx seizn-mcp@latest - werkt binnen 30 seconden",
    trustTitle: "Enterprise-vertrouwen, ingebouwd",
    trustSubtitle: "Elke laag ontworpen voor gereguleerde industrieën en beveiligingsbewuste teams.",
    pricingTitle: "Van eerste API-aanroep tot enterprise-uitrol",
    pricingSubtitle: "Gratis tier om te beginnen. Voorspelbare prijzen per query bij opschaling. Op maat gemaakte plannen voor teams met compliance- en SLA-vereisten.",
    footerTagline: "Gebouwd voor agenten, governance by design.",
    productLabel: "Product",
    resourcesLabel: "Bronnen",
    legalLabel: "Juridisch",
    compareLabel: "Vergelijken",
    mcpServerLabel: "MCP-server",
    githubLabel: "GitHub",
  },
  pl: {
    platformCapabilities: "Możliwości platformy",
    platformTitle: "Wszystko, czego agenci potrzebują w produkcji",
    platformSubtitle: "Jedna platforma do pamięci, zarządzania, obserwowalności, kontroli kosztów i zgodności — aby Twój zespół dostarczał szybciej z mniejszą liczbą ruchomych części.",
    mcpTools: "MCP i narzędzia programistyczne",
    mcpTitle: "Twoje wspomnienia AI, w każdym edytorze",
    mcpSubtitle: "Jeden serwer MCP łączy Seizn z 8 asystentami kodowania AI. Automatyczna synchronizacja preferencji, instrukcji i kontekstu — bez ręcznych plików konfiguracyjnych.",
    setupMcp: "Skonfiguruj serwer MCP",
    mcpHint: "npx seizn-mcp@latest - działa w 30 sekund",
    trustTitle: "Zaufanie klasy enterprise, wbudowane",
    trustSubtitle: "Każda warstwa zaprojektowana dla regulowanych branż i zespołów dbających o bezpieczeństwo.",
    pricingTitle: "Od pierwszego wywołania API do wdrożenia enterprise",
    pricingSubtitle: "Darmowy tier na start. Przewidywalne ceny za zapytanie podczas skalowania. Plany dostosowane dla zespołów z wymogami zgodności i SLA.",
    footerTagline: "Zbudowane dla agentów, zarządzanie w projekcie.",
    productLabel: "Produkt",
    resourcesLabel: "Zasoby",
    legalLabel: "Prawne",
    compareLabel: "Porównaj",
    mcpServerLabel: "Serwer MCP",
    githubLabel: "GitHub",
  },
  hi: {
    platformCapabilities: "प्लेटफ़ॉर्म क्षमताएं",
    platformTitle: "प्रोडक्शन में एजेंट्स को जो कुछ भी चाहिए",
    platformSubtitle: "मेमोरी, गवर्नेंस, ऑब्ज़र्वेबिलिटी, लागत नियंत्रण और अनुपालन के लिए एक प्लेटफ़ॉर्म — ताकि आपकी टीम कम हिस्सों के साथ तेज़ी से शिप करे।",
    mcpTools: "MCP और डेवलपर टूल्स",
    mcpTitle: "आपकी AI मेमोरी, हर एडिटर में",
    mcpSubtitle: "एक MCP सर्वर Seizn को 8 AI कोडिंग असिस्टेंट्स से जोड़ता है। प्राथमिकताओं, निर्देशों और संदर्भ की स्वचालित सिंक — कोई मैनुअल कॉन्फ़िग फ़ाइल नहीं।",
    setupMcp: "MCP सर्वर सेटअप करें",
    mcpHint: "npx seizn-mcp@latest - 30 सेकंड में काम करता है",
    trustTitle: "एंटरप्राइज़-ग्रेड विश्वास, अंतर्निहित",
    trustSubtitle: "नियामित उद्योगों और सुरक्षा-सचेत टीमों के लिए डिज़ाइन की गई हर परत।",
    pricingTitle: "पहली API कॉल से एंटरप्राइज़ रोलआउट तक",
    pricingSubtitle: "निर्माण शुरू करने के लिए मुफ़्त टियर। स्केल करते समय अनुमानित प्रति-क्वेरी मूल्य निर्धारण। अनुपालन और SLA आवश्यकताओं वाली टीमों के लिए कस्टम प्लान।",
    footerTagline: "एजेंट्स के लिए बनाया गया, डिज़ाइन से शासित।",
    productLabel: "उत्पाद",
    resourcesLabel: "संसाधन",
    legalLabel: "कानूनी",
    compareLabel: "तुलना",
    mcpServerLabel: "MCP सर्वर",
    githubLabel: "GitHub",
  },
  th: {
    platformCapabilities: "ความสามารถของแพลตฟอร์ม",
    platformTitle: "ทุกสิ่งที่เอเจนต์ต้องการในโปรดักชัน",
    platformSubtitle: "แพลตฟอร์มเดียวสำหรับหน่วยความจำ ธรรมาภิบาล การสังเกตการณ์ การควบคุมต้นทุน และการปฏิบัติตามกฎ — ทีมของคุณส่งมอบเร็วขึ้นด้วยส่วนเคลื่อนไหวน้อยลง",
    mcpTools: "MCP และเครื่องมือนักพัฒนา",
    mcpTitle: "หน่วยความจำ AI ของคุณ ในทุกเอดิเตอร์",
    mcpSubtitle: "เซิร์ฟเวอร์ MCP เดียวเชื่อม Seizn กับผู้ช่วยเขียนโค้ด AI 8 ตัว ซิงค์การตั้งค่า คำสั่ง และบริบทอัตโนมัติ — ไม่ต้องตั้งค่าด้วยตนเอง",
    setupMcp: "ตั้งค่าเซิร์ฟเวอร์ MCP",
    mcpHint: "npx seizn-mcp@latest - ใช้เวลา 30 วินาที",
    trustTitle: "ความไว้วางใจระดับองค์กร ในตัว",
    trustSubtitle: "ทุกชั้นออกแบบมาสำหรับอุตสาหกรรมที่มีกฎระเบียบและทีมที่ใส่ใจความปลอดภัย",
    pricingTitle: "จาก API call แรกสู่การปรับใช้ระดับองค์กร",
    pricingSubtitle: "เริ่มต้นฟรี ราคาต่อคำค้นที่คาดเดาได้เมื่อขยาย แผนกำหนดเองสำหรับทีมที่มีข้อกำหนดด้านการปฏิบัติตามกฎและ SLA",
    footerTagline: "สร้างเพื่อเอเจนต์ กำกับดูแลโดยการออกแบบ",
    productLabel: "ผลิตภัณฑ์",
    resourcesLabel: "ทรัพยากร",
    legalLabel: "กฎหมาย",
    compareLabel: "เปรียบเทียบ",
    mcpServerLabel: "เซิร์ฟเวอร์ MCP",
    githubLabel: "GitHub",
  },
  id: {
    platformCapabilities: "Kemampuan Platform",
    platformTitle: "Semua yang dibutuhkan agen di produksi",
    platformSubtitle: "Satu platform untuk memori, tata kelola, observabilitas, kontrol biaya, dan kepatuhan — agar tim Anda mengirim lebih cepat dengan lebih sedikit komponen.",
    mcpTools: "MCP & Alat Developer",
    mcpTitle: "Memori AI Anda, di setiap editor",
    mcpSubtitle: "Satu server MCP menghubungkan Seizn ke 8 asisten coding AI. Sinkronisasi otomatis preferensi, instruksi, dan konteks — tanpa file konfigurasi manual.",
    setupMcp: "Atur Server MCP",
    mcpHint: "npx seizn-mcp@latest - berfungsi dalam 30 detik",
    trustTitle: "Kepercayaan tingkat enterprise, bawaan",
    trustSubtitle: "Setiap lapisan dirancang untuk industri teregulasi dan tim yang sadar keamanan.",
    pricingTitle: "Dari panggilan API pertama hingga rollout enterprise",
    pricingSubtitle: "Tier gratis untuk mulai membangun. Harga per kueri yang dapat diprediksi saat berkembang. Paket khusus untuk tim dengan persyaratan kepatuhan dan SLA.",
    footerTagline: "Dibangun untuk agen, diatur oleh desain.",
    productLabel: "Produk",
    resourcesLabel: "Sumber Daya",
    legalLabel: "Hukum",
    compareLabel: "Bandingkan",
    mcpServerLabel: "Server MCP",
    githubLabel: "GitHub",
  },
  vi: {
    platformCapabilities: "Khả năng nền tảng",
    platformTitle: "Mọi thứ tác nhân cần để chạy trong sản xuất",
    platformSubtitle: "Một nền tảng cho bộ nhớ, quản trị, khả năng quan sát, kiểm soát chi phí và tuân thủ — để đội của bạn phát hành nhanh hơn với ít thành phần chuyển động hơn.",
    mcpTools: "MCP & Công cụ nhà phát triển",
    mcpTitle: "Bộ nhớ AI của bạn, trong mọi trình soạn thảo",
    mcpSubtitle: "Một máy chủ MCP kết nối Seizn với 8 trợ lý lập trình AI. Tự động đồng bộ tùy chọn, hướng dẫn và ngữ cảnh — không cần tệp cấu hình thủ công.",
    setupMcp: "Thiết lập máy chủ MCP",
    mcpHint: "npx seizn-mcp@latest - hoạt động trong 30 giây",
    trustTitle: "Tin cậy cấp doanh nghiệp, tích hợp sẵn",
    trustSubtitle: "Mọi lớp được thiết kế cho ngành công nghiệp có quy định và đội ngũ chú trọng bảo mật.",
    pricingTitle: "Từ lệnh gọi API đầu tiên đến triển khai doanh nghiệp",
    pricingSubtitle: "Gói miễn phí để bắt đầu xây dựng. Giá dự đoán được theo truy vấn khi mở rộng. Gói tùy chỉnh cho đội ngũ có yêu cầu tuân thủ và SLA.",
    footerTagline: "Xây dựng cho tác nhân, quản trị theo thiết kế.",
    productLabel: "Sản phẩm",
    resourcesLabel: "Tài nguyên",
    legalLabel: "Pháp lý",
    compareLabel: "So sánh",
    mcpServerLabel: "Máy chủ MCP",
    githubLabel: "GitHub",
  },
  "pt-BR": {
    platformCapabilities: "Capacidades da plataforma",
    platformTitle: "Tudo que agentes precisam em produção",
    platformSubtitle: "Uma plataforma para memória, governança, observabilidade, controle de custos e conformidade — para que sua equipe entregue mais rápido com menos peças móveis.",
    mcpTools: "MCP e ferramentas para desenvolvedores",
    mcpTitle: "Suas memórias de IA, em cada editor",
    mcpSubtitle: "Um servidor MCP conecta o Seizn a 8 assistentes de código AI. Sincronização automática de preferências, instruções e contexto — sem arquivos de configuração manuais.",
    setupMcp: "Configurar servidor MCP",
    mcpHint: "npx seizn-mcp@latest - funciona em 30 segundos",
    trustTitle: "Confiança empresarial, integrada",
    trustSubtitle: "Cada camada projetada para indústrias regulamentadas e equipes conscientes de segurança.",
    pricingTitle: "Da primeira chamada de API ao rollout empresarial",
    pricingSubtitle: "Nível gratuito para começar. Preços previsíveis por consulta ao escalar. Planos personalizados para equipes com requisitos de conformidade e SLA.",
    footerTagline: "Construído para agentes, governança por design.",
    productLabel: "Produto",
    resourcesLabel: "Recursos",
    legalLabel: "Jurídico",
    compareLabel: "Comparar",
    mcpServerLabel: "Servidor MCP",
    githubLabel: "GitHub",
  },
  "pt-PT": {
    platformCapabilities: "Capacidades da plataforma",
    platformTitle: "Tudo o que os agentes precisam em produção",
    platformSubtitle: "Uma plataforma para memória, governação, observabilidade, controlo de custos e conformidade — para que a sua equipa entregue mais rápido com menos peças móveis.",
    mcpTools: "MCP e ferramentas para programadores",
    mcpTitle: "As suas memórias de IA, em cada editor",
    mcpSubtitle: "Um servidor MCP liga o Seizn a 8 assistentes de código AI. Sincronização automática de preferências, instruções e contexto — sem ficheiros de configuração manuais.",
    setupMcp: "Configurar servidor MCP",
    mcpHint: "npx seizn-mcp@latest - funciona em 30 segundos",
    trustTitle: "Confiança empresarial, integrada",
    trustSubtitle: "Cada camada concebida para indústrias regulamentadas e equipas conscientes da segurança.",
    pricingTitle: "Da primeira chamada de API à implementação empresarial",
    pricingSubtitle: "Nível gratuito para começar. Preços previsíveis por consulta ao escalar. Planos personalizados para equipas com requisitos de conformidade e SLA.",
    footerTagline: "Construído para agentes, governação por design.",
    productLabel: "Produto",
    resourcesLabel: "Recursos",
    legalLabel: "Jurídico",
    compareLabel: "Comparar",
    mcpServerLabel: "Servidor MCP",
    githubLabel: "GitHub",
  },
};

export function getSectionContent(locale: Locale): SectionCopy {
  return SECTION_I18N[locale] ?? SECTION_I18N.en!;
}

// =============================================================================
// Batch setter for adding locale translations at runtime
// =============================================================================

export function addFeatureLocale(
  locale: Locale,
  features: Record<FeatureKey, FeatureContent>,
) {
  FEATURE_I18N[locale] = features;
}

export function addMCPFeatureLocale(
  locale: Locale,
  features: Record<MCPFeatureKey, MCPFeatureContent>,
) {
  MCP_FEATURE_I18N[locale] = features;
}

export function addTrustLocale(
  locale: Locale,
  items: Record<TrustKey, TrustContent>,
) {
  TRUST_I18N[locale] = items;
}

export function addSectionLocale(locale: Locale, copy: SectionCopy) {
  SECTION_I18N[locale] = copy;
}
