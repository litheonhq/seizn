import type { Locale } from "@/i18n/config";

// =============================================================================
// Trust & Compliance translations
// =============================================================================

export type TrustKey =
  | "rls"
  | "rate-limits"
  | "audit"
  | "soc2";

interface TrustContent {
  title: string;
  desc: string;
}

const TRUST_I18N: Partial<Record<Locale, Record<TrustKey, TrustContent>>> = {
  en: {
    rls: { title: "RLS + Key Hashing", desc: "Tenant isolation by default" },
    "rate-limits": { title: "Rate Limits + Alerts", desc: "Per-agent, per-model throttling" },
    audit: { title: "Full Audit Trails", desc: "Every decision, every token logged" },
    soc2: { title: "SOC 2 Type II Path", desc: "Controls mapped, audit-ready" },
  },
  ko: {
    rls: { title: "RLS + 키 해싱", desc: "기본 테넌트 격리" },
    "rate-limits": { title: "속도 제한 + 알림", desc: "에이전트별, 모델별 스로틀링" },
    audit: { title: "전체 감사 추적", desc: "모든 결정, 모든 토큰 기록" },
    soc2: { title: "SOC 2 Type II 경로", desc: "통제 매핑 완료, 감사 대응 준비" },
  },
  ja: {
    rls: { title: "RLS + キーハッシュ", desc: "デフォルトでテナント分離" },
    "rate-limits": { title: "レート制限 + アラート", desc: "エージェント別・モデル別のスロットリング" },
    audit: { title: "完全な監査証跡", desc: "すべての決定、すべてのトークンを記録" },
    soc2: { title: "SOC 2 Type IIパス", desc: "コントロールマッピング済み、監査対応" },
  },
  "zh-hans": {
    rls: { title: "RLS + 密钥哈希", desc: "默认租户隔离" },
    "rate-limits": { title: "速率限制 + 告警", desc: "按代理、按模型限流" },
    audit: { title: "完整审计跟踪", desc: "每个决策、每个令牌均有记录" },
    soc2: { title: "SOC 2 Type II路径", desc: "控制已映射，审计就绪" },
  },
  "zh-hant": {
    rls: { title: "RLS + 金鑰雜湊", desc: "預設租戶隔離" },
    "rate-limits": { title: "速率限制 + 警報", desc: "按代理、按模型限流" },
    audit: { title: "完整稽核追蹤", desc: "每個決策、每個令牌均有記錄" },
    soc2: { title: "SOC 2 Type II路徑", desc: "控制已映射，稽核就緒" },
  },
  es: {
    rls: { title: "RLS + Hashing de claves", desc: "Aislamiento de inquilinos por defecto" },
    "rate-limits": { title: "Límites de tasa + Alertas", desc: "Limitación por agente y por modelo" },
    audit: { title: "Auditoría completa", desc: "Cada decisión, cada token registrado" },
    soc2: { title: "Ruta SOC 2 Type II", desc: "Controles mapeados, listo para auditoría" },
  },
  ru: {
    rls: { title: "RLS + Хэширование ключей", desc: "Изоляция арендаторов по умолчанию" },
    "rate-limits": { title: "Лимиты + Оповещения", desc: "Ограничение по агентам и моделям" },
    audit: { title: "Полные аудиторские журналы", desc: "Каждое решение, каждый токен зафиксирован" },
    soc2: { title: "Путь к SOC 2 Type II", desc: "Контроли сопоставлены, готов к аудиту" },
  },
  uk: {
    rls: { title: "RLS + Хешування ключів", desc: "Ізоляція орендарів за замовчуванням" },
    "rate-limits": { title: "Ліміти + Сповіщення", desc: "Обмеження за агентами та моделями" },
    audit: { title: "Повні аудиторські журнали", desc: "Кожне рішення, кожен токен зафіксовано" },
    soc2: { title: "Шлях до SOC 2 Type II", desc: "Контролі зіставлені, готовий до аудиту" },
  },
  he: {
    rls: { title: "RLS + גיבוב מפתחות", desc: "בידוד דיירים כברירת מחדל" },
    "rate-limits": { title: "מגבלות קצב + התראות", desc: "חניקה לפי סוכן ולפי מודל" },
    audit: { title: "מסלולי ביקורת מלאים", desc: "כל החלטה, כל טוקן מתועד" },
    soc2: { title: "מסלול SOC 2 Type II", desc: "בקרות ממופות, מוכן לביקורת" },
  },
  ar: {
    rls: { title: "RLS + تجزئة المفاتيح", desc: "عزل المستأجرين افتراضياً" },
    "rate-limits": { title: "حدود المعدل + تنبيهات", desc: "تقييد لكل وكيل ولكل نموذج" },
    audit: { title: "مسارات تدقيق كاملة", desc: "كل قرار، كل رمز مسجل" },
    soc2: { title: "مسار SOC 2 Type II", desc: "الضوابط مُعيَّنة، جاهز للتدقيق" },
  },
  fr: {
    rls: { title: "RLS + Hachage de clés", desc: "Isolation des locataires par défaut" },
    "rate-limits": { title: "Limites de taux + Alertes", desc: "Limitation par agent et par modèle" },
    audit: { title: "Pistes d'audit complètes", desc: "Chaque décision, chaque token enregistré" },
    soc2: { title: "Parcours SOC 2 Type II", desc: "Contrôles cartographiés, prêt pour l'audit" },
  },
  de: {
    rls: { title: "RLS + Schlüssel-Hashing", desc: "Mandantenisolierung standardmäßig" },
    "rate-limits": { title: "Ratenlimits + Warnungen", desc: "Drosselung pro Agent und pro Modell" },
    audit: { title: "Vollständige Prüfpfade", desc: "Jede Entscheidung, jeder Token protokolliert" },
    soc2: { title: "SOC 2 Type II Pfad", desc: "Kontrollen zugeordnet, audit-bereit" },
  },
  it: {
    rls: { title: "RLS + Hashing chiavi", desc: "Isolamento tenant di default" },
    "rate-limits": { title: "Limiti di frequenza + Avvisi", desc: "Limitazione per agente e per modello" },
    audit: { title: "Audit trail completi", desc: "Ogni decisione, ogni token registrato" },
    soc2: { title: "Percorso SOC 2 Type II", desc: "Controlli mappati, pronto per l'audit" },
  },
  sv: {
    rls: { title: "RLS + Nyckelhashning", desc: "Hyresgästisolering som standard" },
    "rate-limits": { title: "Hastighetsbegränsningar + Varningar", desc: "Strypning per agent och per modell" },
    audit: { title: "Fullständiga revisionsloggar", desc: "Varje beslut, varje token loggad" },
    soc2: { title: "SOC 2 Type II väg", desc: "Kontroller kartlagda, revisionsredo" },
  },
  nl: {
    rls: { title: "RLS + Sleutelhashing", desc: "Tenantisolatie standaard" },
    "rate-limits": { title: "Snelheidslimieten + Waarschuwingen", desc: "Beperking per agent en per model" },
    audit: { title: "Volledige audittrails", desc: "Elke beslissing, elke token gelogd" },
    soc2: { title: "SOC 2 Type II pad", desc: "Controls in kaart gebracht, audit-gereed" },
  },
  pl: {
    rls: { title: "RLS + Hashowanie kluczy", desc: "Izolacja najemców domyślnie" },
    "rate-limits": { title: "Limity + Alerty", desc: "Ograniczanie na agenta i na model" },
    audit: { title: "Pełne ścieżki audytu", desc: "Każda decyzja, każdy token zarejestrowany" },
    soc2: { title: "Ścieżka SOC 2 Type II", desc: "Kontrole zmapowane, gotowy do audytu" },
  },
  hi: {
    rls: { title: "RLS + कुंजी हैशिंग", desc: "डिफ़ॉल्ट रूप से टेनेंट अलगाव" },
    "rate-limits": { title: "दर सीमा + अलर्ट", desc: "प्रति-एजेंट, प्रति-मॉडल थ्रॉटलिंग" },
    audit: { title: "पूर्ण ऑडिट ट्रेल", desc: "हर निर्णय, हर टोकन लॉग" },
    soc2: { title: "SOC 2 Type II पथ", desc: "नियंत्रण मैप किए गए, ऑडिट-तैयार" },
  },
  th: {
    rls: { title: "RLS + การแฮชคีย์", desc: "การแยกผู้เช่าตั้งแต่ต้น" },
    "rate-limits": { title: "ขีดจำกัดอัตรา + การแจ้งเตือน", desc: "การจำกัดตามเอเจนต์และตามโมเดล" },
    audit: { title: "เส้นทางการตรวจสอบครบถ้วน", desc: "ทุกการตัดสินใจ ทุกโทเค็นถูกบันทึก" },
    soc2: { title: "เส้นทาง SOC 2 Type II", desc: "การควบคุมแมปแล้ว พร้อมตรวจสอบ" },
  },
  id: {
    rls: { title: "RLS + Hashing Kunci", desc: "Isolasi tenant secara default" },
    "rate-limits": { title: "Batas Laju + Peringatan", desc: "Pembatasan per agen, per model" },
    audit: { title: "Jejak Audit Lengkap", desc: "Setiap keputusan, setiap token dicatat" },
    soc2: { title: "Jalur SOC 2 Type II", desc: "Kontrol dipetakan, siap audit" },
  },
  vi: {
    rls: { title: "RLS + Băm khóa", desc: "Cách ly tenant mặc định" },
    "rate-limits": { title: "Giới hạn tốc độ + Cảnh báo", desc: "Điều tiết theo tác nhân, theo mô hình" },
    audit: { title: "Nhật ký kiểm toán đầy đủ", desc: "Mọi quyết định, mọi token được ghi lại" },
    soc2: { title: "Lộ trình SOC 2 Type II", desc: "Kiểm soát đã ánh xạ, sẵn sàng kiểm toán" },
  },
  "pt-BR": {
    rls: { title: "RLS + Hashing de chaves", desc: "Isolamento de tenant por padrão" },
    "rate-limits": { title: "Limites de taxa + Alertas", desc: "Limitação por agente e por modelo" },
    audit: { title: "Trilhas de auditoria completas", desc: "Cada decisão, cada token registrado" },
    soc2: { title: "Caminho SOC 2 Type II", desc: "Controles mapeados, pronto para auditoria" },
  },
  "pt-PT": {
    rls: { title: "RLS + Hashing de chaves", desc: "Isolamento de tenant por defeito" },
    "rate-limits": { title: "Limites de taxa + Alertas", desc: "Limitação por agente e por modelo" },
    audit: { title: "Trilhos de auditoria completos", desc: "Cada decisão, cada token registado" },
    soc2: { title: "Caminho SOC 2 Type II", desc: "Controlos mapeados, pronto para auditoria" },
  },
};

export function getTrustContent(locale: Locale, key: TrustKey): TrustContent {
  return TRUST_I18N[locale]?.[key] ?? TRUST_I18N.en![key];
}

// =============================================================================
// Section copy translations (extends SECTION_COPY to all locales)
// =============================================================================

export interface SectionCopy {
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

export function addTrustLocale(
  locale: Locale,
  items: Record<TrustKey, TrustContent>,
) {
  TRUST_I18N[locale] = items;
}

export function addSectionLocale(locale: Locale, copy: SectionCopy) {
  SECTION_I18N[locale] = copy;
}
