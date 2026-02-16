import type { Locale } from "@/i18n/config";

export interface LocalizedUpdateCard {
  title: string;
  description: string;
  cta: string;
}

export interface ReliabilityDashboardCopy {
  heading: string;
  subtitle: string;
  docsCta: string;
  cards: [LocalizedUpdateCard, LocalizedUpdateCard, LocalizedUpdateCard, LocalizedUpdateCard];
}

export interface ReliabilitySecurityCopy {
  sectionTitle: string;
  workflowTitle: string;
  workflowNote: string;
}

export interface ReliabilityUpdatesCopy {
  dashboard: ReliabilityDashboardCopy;
  security: ReliabilitySecurityCopy;
}

const COPY: Record<Locale, ReliabilityUpdatesCopy> = {
  en: {
    dashboard: {
      heading: "Security & Reliability Updates",
      subtitle: "Recently completed hardening work and operational checkpoints",
      docsCta: "Docs",
      cards: [
        {
          title: "Tenant policy enforcement",
          description: "Ingest caps and fallback behavior are now locked for production-safe defaults.",
          cta: "Review enterprise",
        },
        {
          title: "Webhook idempotency hardening",
          description: "Retry and duplicate events now follow a lock-claim-finalize path.",
          cta: "Review webhooks",
        },
        {
          title: "E2E encryption verification",
          description: "Post-migration verification now catches RPC and overload regressions.",
          cta: "Read security docs",
        },
        {
          title: "FNA readiness",
          description: "Failure Notification & Analysis guidance has been added for operations.",
          cta: "View FNA notes",
        },
      ],
    },
    security: {
      sectionTitle: "Recent Hardening (2026 Q1)",
      workflowTitle: "Recommended migration workflow:",
      workflowNote:
        "`run-migration-file.mjs` triggers `verify:e2e-encryption-db` by default and fails fast on overload or RPC regressions. Use `SKIP_E2E_VERIFY=1` only for emergency bypass scenarios.",
    },
  },
  ko: {
    dashboard: {
      heading: "보안 및 신뢰성 업데이트",
      subtitle: "최근 완료된 하드닝 작업과 운영 체크포인트",
      docsCta: "문서 보기",
      cards: [
        {
          title: "Tenant 정책 강제 강화",
          description: "인제스트 상한과 폴백 동작이 프로덕션 안전 기본값으로 고정되었습니다.",
          cta: "Enterprise 확인",
        },
        {
          title: "Webhook 멱등성 강화",
          description: "재시도 및 중복 이벤트가 lock-claim-finalize 경로로 처리됩니다.",
          cta: "Webhook 확인",
        },
        {
          title: "E2E 암호화 검증 자동화",
          description: "마이그레이션 이후 검증으로 RPC 및 오버로드 회귀를 탐지합니다.",
          cta: "보안 문서 보기",
        },
        {
          title: "FNA 준비 상태",
          description: "Failure Notification & Analysis 운영 가이드를 추가했습니다.",
          cta: "FNA 보기",
        },
      ],
    },
    security: {
      sectionTitle: "최근 보안 하드닝 (2026 Q1)",
      workflowTitle: "권장 마이그레이션 워크플로우:",
      workflowNote:
        "`run-migration-file.mjs`는 기본적으로 `verify:e2e-encryption-db`를 실행하며, 오버로드 또는 RPC 회귀를 빠르게 실패 처리합니다. `SKIP_E2E_VERIFY=1`은 긴급 우회가 필요한 경우에만 사용하세요.",
    },
  },
  ja: {
    dashboard: {
      heading: "セキュリティと信頼性の更新",
      subtitle: "最近完了したハードニング作業と運用チェックポイント",
      docsCta: "ドキュメント",
      cards: [
        {
          title: "テナントポリシー強制",
          description: "インジェスト上限とフォールバック動作を本番向けの安全な既定値に固定しました。",
          cta: "Enterprise を確認",
        },
        {
          title: "Webhook 冪等性強化",
          description: "再試行と重複イベントは lock-claim-finalize フローで処理されます。",
          cta: "Webhook を確認",
        },
        {
          title: "E2E 暗号化検証",
          description: "マイグレーション後の検証で RPC と過負荷の回帰を検出します。",
          cta: "セキュリティ文書",
        },
        {
          title: "FNA 準備状況",
          description: "Failure Notification & Analysis の運用ガイドを追加しました。",
          cta: "FNA ノート",
        },
      ],
    },
    security: {
      sectionTitle: "最近のハードニング (2026 Q1)",
      workflowTitle: "推奨マイグレーションワークフロー:",
      workflowNote:
        "`run-migration-file.mjs` は既定で `verify:e2e-encryption-db` を実行し、過負荷または RPC 回帰で即時に失敗します。`SKIP_E2E_VERIFY=1` は緊急回避時のみ使用してください。",
    },
  },
  "zh-hans": {
    dashboard: {
      heading: "安全与可靠性更新",
      subtitle: "近期完成的加固工作和运营检查点",
      docsCta: "文档",
      cards: [
        {
          title: "租户策略强制",
          description: "写入上限和回退行为已锁定为生产安全默认值。",
          cta: "查看 Enterprise",
        },
        {
          title: "Webhook 幂等性加固",
          description: "重试和重复事件现在走 lock-claim-finalize 流程。",
          cta: "查看 Webhook",
        },
        {
          title: "E2E 加密校验",
          description: "迁移后的校验会捕获 RPC 和过载回归。",
          cta: "查看安全文档",
        },
        {
          title: "FNA 就绪状态",
          description: "已补充 Failure Notification & Analysis 运营指南。",
          cta: "查看 FNA 说明",
        },
      ],
    },
    security: {
      sectionTitle: "近期加固更新 (2026 Q1)",
      workflowTitle: "推荐的迁移工作流:",
      workflowNote:
        "`run-migration-file.mjs` 默认会触发 `verify:e2e-encryption-db`，并在过载或 RPC 回归时快速失败。仅在紧急绕过场景下使用 `SKIP_E2E_VERIFY=1`。",
    },
  },
  "zh-hant": {
    dashboard: {
      heading: "安全與可靠性更新",
      subtitle: "近期完成的加固工作與營運檢查點",
      docsCta: "文件",
      cards: [
        {
          title: "租戶政策強制",
          description: "寫入上限與回退行為已鎖定為生產安全預設值。",
          cta: "查看 Enterprise",
        },
        {
          title: "Webhook 冪等性強化",
          description: "重試與重複事件現在走 lock-claim-finalize 流程。",
          cta: "查看 Webhook",
        },
        {
          title: "E2E 加密驗證",
          description: "遷移後驗證可捕捉 RPC 與過載回歸。",
          cta: "查看安全文件",
        },
        {
          title: "FNA 就緒狀態",
          description: "已新增 Failure Notification & Analysis 營運指南。",
          cta: "查看 FNA 說明",
        },
      ],
    },
    security: {
      sectionTitle: "近期加固更新 (2026 Q1)",
      workflowTitle: "建議的遷移流程:",
      workflowNote:
        "`run-migration-file.mjs` 預設會觸發 `verify:e2e-encryption-db`，並在過載或 RPC 回歸時快速失敗。僅在緊急繞過情境下使用 `SKIP_E2E_VERIFY=1`。",
    },
  },
  es: {
    dashboard: {
      heading: "Actualizaciones de seguridad y confiabilidad",
      subtitle: "Trabajos de endurecimiento recientes y puntos de control operativos",
      docsCta: "Documentación",
      cards: [
        {
          title: "Aplicación de políticas de tenant",
          description: "Los límites de ingesta y el comportamiento de fallback quedaron fijados con valores seguros para producción.",
          cta: "Revisar enterprise",
        },
        {
          title: "Endurecimiento de idempotencia de webhooks",
          description: "Reintentos y eventos duplicados siguen ahora la ruta lock-claim-finalize.",
          cta: "Revisar webhooks",
        },
        {
          title: "Verificación de cifrado E2E",
          description: "La verificación posterior a migración detecta regresiones de RPC y sobrecarga.",
          cta: "Ver documentación de seguridad",
        },
        {
          title: "Estado de preparación FNA",
          description: "Se añadió una guía operativa de Failure Notification & Analysis.",
          cta: "Ver notas FNA",
        },
      ],
    },
    security: {
      sectionTitle: "Endurecimiento reciente (2026 Q1)",
      workflowTitle: "Flujo de migración recomendado:",
      workflowNote:
        "`run-migration-file.mjs` ejecuta `verify:e2e-encryption-db` por defecto y falla rápido ante regresiones de sobrecarga o RPC. Use `SKIP_E2E_VERIFY=1` solo en escenarios de bypass de emergencia.",
    },
  },
  ru: {
    dashboard: {
      heading: "Обновления безопасности и надежности",
      subtitle: "Недавно завершенные меры усиления и операционные контрольные точки",
      docsCta: "Документация",
      cards: [
        {
          title: "Принудительное применение tenant-политик",
          description: "Лимиты ingest и поведение fallback зафиксированы на безопасных продакшен-значениях.",
          cta: "Проверить Enterprise",
        },
        {
          title: "Усиление идемпотентности webhook",
          description: "Повторы и дубликаты событий теперь обрабатываются по пути lock-claim-finalize.",
          cta: "Проверить Webhook",
        },
        {
          title: "Проверка E2E-шифрования",
          description: "Постмиграционная проверка выявляет регрессии RPC и перегрузки.",
          cta: "Открыть раздел безопасности",
        },
        {
          title: "Готовность FNA",
          description: "Добавлено операционное руководство по Failure Notification & Analysis.",
          cta: "Открыть заметки FNA",
        },
      ],
    },
    security: {
      sectionTitle: "Недавнее усиление (2026 Q1)",
      workflowTitle: "Рекомендуемый процесс миграции:",
      workflowNote:
        "`run-migration-file.mjs` по умолчанию запускает `verify:e2e-encryption-db` и быстро завершает выполнение при регрессиях перегрузки или RPC. Используйте `SKIP_E2E_VERIFY=1` только для аварийного обхода.",
    },
  },
  uk: {
    dashboard: {
      heading: "Оновлення безпеки та надійності",
      subtitle: "Нещодавно завершені роботи з hardening та операційні контрольні точки",
      docsCta: "Документація",
      cards: [
        {
          title: "Примусове застосування tenant-політик",
          description: "Ліміти ingest і fallback-поведінка зафіксовані на безпечних продакшен-значеннях.",
          cta: "Переглянути Enterprise",
        },
        {
          title: "Посилення ідемпотентності webhook",
          description: "Повторні та дубльовані події тепер проходять шлях lock-claim-finalize.",
          cta: "Переглянути Webhook",
        },
        {
          title: "Перевірка E2E-шифрування",
          description: "Післяміграційна перевірка виявляє регресії RPC і перевантаження.",
          cta: "Відкрити доки безпеки",
        },
        {
          title: "Готовність FNA",
          description: "Додано операційний гайд для Failure Notification & Analysis.",
          cta: "Переглянути нотатки FNA",
        },
      ],
    },
    security: {
      sectionTitle: "Останні hardening-оновлення (2026 Q1)",
      workflowTitle: "Рекомендований процес міграції:",
      workflowNote:
        "`run-migration-file.mjs` за замовчуванням запускає `verify:e2e-encryption-db` та швидко завершується при регресіях перевантаження або RPC. `SKIP_E2E_VERIFY=1` використовуйте лише для аварійного обходу.",
    },
  },
  he: {
    dashboard: {
      heading: "עדכוני אבטחה ואמינות",
      subtitle: "הקשחות שהושלמו לאחרונה ונקודות בדיקה תפעוליות",
      docsCta: "תיעוד",
      cards: [
        {
          title: "אכיפת מדיניות Tenant",
          description: "מכסות ingest והתנהגות fallback ננעלו לברירות מחדל בטוחות לפרודקשן.",
          cta: "בדיקת Enterprise",
        },
        {
          title: "הקשחת אידמפוטנטיות Webhook",
          description: "ניסיונות חוזרים ואירועים כפולים מטופלים כעת בנתיב lock-claim-finalize.",
          cta: "בדיקת Webhook",
        },
        {
          title: "אימות הצפנת E2E",
          description: "אימות לאחר מיגרציה מזהה נסיגות RPC ועומס יתר.",
          cta: "תיעוד אבטחה",
        },
        {
          title: "מוכנות FNA",
          description: "נוספה הנחיית תפעול עבור Failure Notification & Analysis.",
          cta: "הערות FNA",
        },
      ],
    },
    security: {
      sectionTitle: "הקשחות אחרונות (2026 Q1)",
      workflowTitle: "תהליך מיגרציה מומלץ:",
      workflowNote:
        "`run-migration-file.mjs` מפעיל כברירת מחדל את `verify:e2e-encryption-db` ונכשל מהר בזיהוי רגרסיות עומס או RPC. השתמשו ב-`SKIP_E2E_VERIFY=1` רק לעקיפה במצב חירום.",
    },
  },
  ar: {
    dashboard: {
      heading: "تحديثات الأمان والموثوقية",
      subtitle: "أعمال التقوية المكتملة حديثا ونقاط الفحص التشغيلية",
      docsCta: "الوثائق",
      cards: [
        {
          title: "فرض سياسات المستأجر",
          description: "تم تثبيت حدود الإدخال وسلوك الرجوع إلى إعدادات افتراضية آمنة للإنتاج.",
          cta: "مراجعة Enterprise",
        },
        {
          title: "تعزيز عدم التكرار للويب هوك",
          description: "إعادات المحاولة والأحداث المكررة تمر الآن بمسار lock-claim-finalize.",
          cta: "مراجعة Webhook",
        },
        {
          title: "التحقق من تشفير E2E",
          description: "التحقق بعد الترحيل يلتقط تراجعات RPC والتحميل الزائد.",
          cta: "عرض وثائق الأمان",
        },
        {
          title: "جاهزية FNA",
          description: "تمت إضافة دليل تشغيل Failure Notification & Analysis.",
          cta: "عرض ملاحظات FNA",
        },
      ],
    },
    security: {
      sectionTitle: "تقوية حديثة (الربع الأول 2026)",
      workflowTitle: "مسار ترحيل موصى به:",
      workflowNote:
        "يقوم `run-migration-file.mjs` بتشغيل `verify:e2e-encryption-db` تلقائيا ويفشل بسرعة عند اكتشاف تراجعات التحميل الزائد أو RPC. استخدم `SKIP_E2E_VERIFY=1` فقط في حالات تجاوز الطوارئ.",
    },
  },
  fr: {
    dashboard: {
      heading: "Mises à jour sécurité et fiabilité",
      subtitle: "Renforcements récemment finalisés et points de contrôle opérationnels",
      docsCta: "Documentation",
      cards: [
        {
          title: "Application des politiques tenant",
          description: "Les plafonds d ingestion et le comportement de repli sont verrouillés sur des valeurs sûres pour la production.",
          cta: "Vérifier Enterprise",
        },
        {
          title: "Renforcement de l idempotence des webhooks",
          description: "Les retries et doublons suivent désormais le flux lock-claim-finalize.",
          cta: "Vérifier les webhooks",
        },
        {
          title: "Vérification du chiffrement E2E",
          description: "La vérification post-migration détecte les régressions RPC et surcharge.",
          cta: "Lire la doc sécurité",
        },
        {
          title: "Niveau de préparation FNA",
          description: "Le guide opérationnel Failure Notification & Analysis a été ajouté.",
          cta: "Voir les notes FNA",
        },
      ],
    },
    security: {
      sectionTitle: "Renforcements récents (2026 T1)",
      workflowTitle: "Workflow de migration recommandé :",
      workflowNote:
        "`run-migration-file.mjs` lance `verify:e2e-encryption-db` par défaut et échoue rapidement en cas de régression de surcharge ou RPC. Utilisez `SKIP_E2E_VERIFY=1` uniquement pour un contournement d urgence.",
    },
  },
  de: {
    dashboard: {
      heading: "Sicherheits- und Zuverlässigkeitsupdates",
      subtitle: "Kürzlich abgeschlossene Härtungen und operative Prüfpunkte",
      docsCta: "Dokumentation",
      cards: [
        {
          title: "Durchsetzung von Tenant-Richtlinien",
          description: "Ingest-Limits und Fallback-Verhalten sind auf produktionssichere Standardwerte fixiert.",
          cta: "Enterprise prüfen",
        },
        {
          title: "Webhook-Idempotenz gehärtet",
          description: "Retries und doppelte Events folgen jetzt dem lock-claim-finalize-Pfad.",
          cta: "Webhooks prüfen",
        },
        {
          title: "E2E-Verschlüsselung prüfen",
          description: "Die Prüfung nach Migration erkennt RPC- und Overload-Regressionen.",
          cta: "Sicherheitsdoku lesen",
        },
        {
          title: "FNA-Bereitschaft",
          description: "Eine Betriebsanleitung für Failure Notification & Analysis wurde ergänzt.",
          cta: "FNA-Hinweise",
        },
      ],
    },
    security: {
      sectionTitle: "Aktuelle Härtungen (2026 Q1)",
      workflowTitle: "Empfohlener Migrationsablauf:",
      workflowNote:
        "`run-migration-file.mjs` startet standardmäßig `verify:e2e-encryption-db` und bricht bei Overload- oder RPC-Regressionen schnell ab. `SKIP_E2E_VERIFY=1` nur für Notfall-Bypass verwenden.",
    },
  },
  it: {
    dashboard: {
      heading: "Aggiornamenti su sicurezza e affidabilità",
      subtitle: "Hardening completato di recente e checkpoint operativi",
      docsCta: "Documentazione",
      cards: [
        {
          title: "Applicazione policy tenant",
          description: "I limiti di ingestione e il fallback sono stati fissati su valori sicuri per la produzione.",
          cta: "Controlla Enterprise",
        },
        {
          title: "Hardening idempotenza webhook",
          description: "Retry ed eventi duplicati seguono ora il flusso lock-claim-finalize.",
          cta: "Controlla webhook",
        },
        {
          title: "Verifica crittografia E2E",
          description: "La verifica post-migrazione intercetta regressioni RPC e sovraccarico.",
          cta: "Leggi doc sicurezza",
        },
        {
          title: "Prontezza FNA",
          description: "Aggiunta guida operativa su Failure Notification & Analysis.",
          cta: "Vedi note FNA",
        },
      ],
    },
    security: {
      sectionTitle: "Hardening recente (2026 Q1)",
      workflowTitle: "Flusso di migrazione consigliato:",
      workflowNote:
        "`run-migration-file.mjs` attiva `verify:e2e-encryption-db` per default e fallisce rapidamente in caso di regressioni di sovraccarico o RPC. Usa `SKIP_E2E_VERIFY=1` solo per bypass di emergenza.",
    },
  },
  sv: {
    dashboard: {
      heading: "Säkerhets- och tillförlitlighetsuppdateringar",
      subtitle: "Nyligen slutförda härdningar och operativa kontrollpunkter",
      docsCta: "Dokumentation",
      cards: [
        {
          title: "Efterlevnad av tenant-policy",
          description: "Ingest-gränser och fallback-beteende är nu låsta till produktionssäkra standardvärden.",
          cta: "Granska Enterprise",
        },
        {
          title: "Webhook-idempotens härdad",
          description: "Retries och duplicerade händelser följer nu lock-claim-finalize-flödet.",
          cta: "Granska webhooks",
        },
        {
          title: "Verifiering av E2E-kryptering",
          description: "Verifiering efter migrering fångar RPC- och överbelastningsregressioner.",
          cta: "Läs säkerhetsdokumentation",
        },
        {
          title: "FNA-beredskap",
          description: "Driftsguide för Failure Notification & Analysis har lagts till.",
          cta: "Visa FNA-noter",
        },
      ],
    },
    security: {
      sectionTitle: "Nylig härdning (2026 Q1)",
      workflowTitle: "Rekommenderat migreringsflöde:",
      workflowNote:
        "`run-migration-file.mjs` kör `verify:e2e-encryption-db` som standard och avbryter snabbt vid överbelastnings- eller RPC-regressioner. Använd `SKIP_E2E_VERIFY=1` endast för akut bypass.",
    },
  },
  nl: {
    dashboard: {
      heading: "Beveiligings- en betrouwbaarheidsupdates",
      subtitle: "Recent afgeronde hardening en operationele controlepunten",
      docsCta: "Documentatie",
      cards: [
        {
          title: "Tenantbeleid afdwingen",
          description: "Ingest-limieten en fallback-gedrag zijn vastgezet op productie-veilige standaardwaarden.",
          cta: "Enterprise bekijken",
        },
        {
          title: "Webhook-idempotentie versterkt",
          description: "Retries en dubbele events volgen nu het lock-claim-finalize-pad.",
          cta: "Webhooks bekijken",
        },
        {
          title: "E2E-encryptieverificatie",
          description: "Verificatie na migratie detecteert RPC- en overload-regressies.",
          cta: "Beveiligingsdocs lezen",
        },
        {
          title: "FNA-gereedheid",
          description: "Handleiding voor Failure Notification & Analysis is toegevoegd.",
          cta: "FNA-notities",
        },
      ],
    },
    security: {
      sectionTitle: "Recente hardening (2026 Q1)",
      workflowTitle: "Aanbevolen migratieworkflow:",
      workflowNote:
        "`run-migration-file.mjs` triggert standaard `verify:e2e-encryption-db` en faalt snel bij overload- of RPC-regressies. Gebruik `SKIP_E2E_VERIFY=1` alleen voor noodbypass.",
    },
  },
  pl: {
    dashboard: {
      heading: "Aktualizacje bezpieczeństwa i niezawodności",
      subtitle: "Niedawno zakończone utwardzenia i operacyjne punkty kontrolne",
      docsCta: "Dokumentacja",
      cards: [
        {
          title: "Wymuszanie polityk tenant",
          description: "Limity ingest i zachowanie fallback zostały zablokowane na bezpiecznych wartościach produkcyjnych.",
          cta: "Sprawdź Enterprise",
        },
        {
          title: "Wzmocniona idempotencja webhooków",
          description: "Ponowienia i duplikaty zdarzeń przechodzą teraz ścieżkę lock-claim-finalize.",
          cta: "Sprawdź webhooki",
        },
        {
          title: "Weryfikacja szyfrowania E2E",
          description: "Weryfikacja po migracji wykrywa regresje RPC i przeciążenia.",
          cta: "Czytaj dokumentację bezpieczeństwa",
        },
        {
          title: "Gotowość FNA",
          description: "Dodano przewodnik operacyjny Failure Notification & Analysis.",
          cta: "Zobacz notatki FNA",
        },
      ],
    },
    security: {
      sectionTitle: "Najnowsze utwardzenia (2026 Q1)",
      workflowTitle: "Zalecany workflow migracji:",
      workflowNote:
        "`run-migration-file.mjs` domyślnie uruchamia `verify:e2e-encryption-db` i szybko kończy się błędem przy regresjach przeciążenia lub RPC. `SKIP_E2E_VERIFY=1` używaj tylko do awaryjnego obejścia.",
    },
  },
  hi: {
    dashboard: {
      heading: "सुरक्षा और विश्वसनीयता अपडेट",
      subtitle: "हाल में पूरी हुई हार्डनिंग और ऑपरेशनल चेकपॉइंट्स",
      docsCta: "डॉक्स",
      cards: [
        {
          title: "Tenant नीति लागूकरण",
          description: "Ingest सीमाएं और fallback व्यवहार अब प्रोडक्शन-सुरक्षित डिफॉल्ट पर लॉक हैं।",
          cta: "Enterprise देखें",
        },
        {
          title: "Webhook idempotency हार्डनिंग",
          description: "Retry और duplicate इवेंट अब lock-claim-finalize पथ से गुजरते हैं।",
          cta: "Webhook देखें",
        },
        {
          title: "E2E एन्क्रिप्शन सत्यापन",
          description: "Migration के बाद सत्यापन RPC और overload regressions पकड़ता है।",
          cta: "सुरक्षा डॉक्स पढ़ें",
        },
        {
          title: "FNA तैयारी स्थिति",
          description: "Failure Notification & Analysis के लिए ऑपरेशंस गाइड जोड़ा गया है।",
          cta: "FNA नोट्स देखें",
        },
      ],
    },
    security: {
      sectionTitle: "हाल की हार्डनिंग (2026 Q1)",
      workflowTitle: "अनुशंसित माइग्रेशन वर्कफ़्लो:",
      workflowNote:
        "`run-migration-file.mjs` डिफॉल्ट रूप से `verify:e2e-encryption-db` चलाता है और overload या RPC regression होने पर तुरंत fail करता है। `SKIP_E2E_VERIFY=1` केवल emergency bypass के लिए इस्तेमाल करें।",
    },
  },
  th: {
    dashboard: {
      heading: "อัปเดตความปลอดภัยและความเชื่อถือได้",
      subtitle: "งาน hardening ที่เสร็จล่าสุดและจุดตรวจเชิงปฏิบัติการ",
      docsCta: "เอกสาร",
      cards: [
        {
          title: "บังคับใช้นโยบาย Tenant",
          description: "ขีดจำกัด ingest และพฤติกรรม fallback ถูกล็อกเป็นค่าเริ่มต้นที่ปลอดภัยสำหรับโปรดักชันแล้ว",
          cta: "ดู Enterprise",
        },
        {
          title: "เสริมความเป็นเอกฐานของ Webhook",
          description: "การ retry และเหตุการณ์ซ้ำจะผ่านเส้นทาง lock-claim-finalize แล้ว",
          cta: "ดู Webhook",
        },
        {
          title: "ตรวจสอบการเข้ารหัส E2E",
          description: "การตรวจสอบหลัง migration จับ regression ของ RPC และ overload ได้",
          cta: "อ่านเอกสารความปลอดภัย",
        },
        {
          title: "ความพร้อม FNA",
          description: "เพิ่มคู่มือปฏิบัติการสำหรับ Failure Notification & Analysis แล้ว",
          cta: "ดูบันทึก FNA",
        },
      ],
    },
    security: {
      sectionTitle: "การเสริมความปลอดภัยล่าสุด (2026 Q1)",
      workflowTitle: "เวิร์กโฟลว์การย้ายข้อมูลที่แนะนำ:",
      workflowNote:
        "`run-migration-file.mjs` จะเรียก `verify:e2e-encryption-db` โดยค่าเริ่มต้น และหยุดแบบ fail-fast เมื่อพบ regression ของ overload หรือ RPC ใช้ `SKIP_E2E_VERIFY=1` เฉพาะกรณี bypass ฉุกเฉินเท่านั้น",
    },
  },
  id: {
    dashboard: {
      heading: "Pembaruan Keamanan dan Keandalan",
      subtitle: "Hardening yang baru selesai dan checkpoint operasional",
      docsCta: "Dokumen",
      cards: [
        {
          title: "Penegakan kebijakan tenant",
          description: "Batas ingest dan perilaku fallback kini dikunci ke default aman untuk produksi.",
          cta: "Tinjau Enterprise",
        },
        {
          title: "Penguatan idempotensi webhook",
          description: "Retry dan event duplikat kini mengikuti jalur lock-claim-finalize.",
          cta: "Tinjau webhook",
        },
        {
          title: "Verifikasi enkripsi E2E",
          description: "Verifikasi pasca-migrasi menangkap regresi RPC dan overload.",
          cta: "Baca dokumen keamanan",
        },
        {
          title: "Kesiapan FNA",
          description: "Panduan operasi Failure Notification & Analysis telah ditambahkan.",
          cta: "Lihat catatan FNA",
        },
      ],
    },
    security: {
      sectionTitle: "Hardening terbaru (2026 Q1)",
      workflowTitle: "Alur migrasi yang direkomendasikan:",
      workflowNote:
        "`run-migration-file.mjs` secara default memicu `verify:e2e-encryption-db` dan gagal cepat saat ada regresi overload atau RPC. Gunakan `SKIP_E2E_VERIFY=1` hanya untuk bypass darurat.",
    },
  },
  vi: {
    dashboard: {
      heading: "Cập nhật bảo mật và độ tin cậy",
      subtitle: "Các hạng mục hardening mới hoàn tất và các điểm kiểm vận hành",
      docsCta: "Tài liệu",
      cards: [
        {
          title: "Thực thi chính sách tenant",
          description: "Giới hạn ingest và cơ chế fallback đã được khóa ở mặc định an toàn cho production.",
          cta: "Xem Enterprise",
        },
        {
          title: "Tăng cường idempotency webhook",
          description: "Retry và sự kiện trùng lặp hiện đi theo luồng lock-claim-finalize.",
          cta: "Xem webhook",
        },
        {
          title: "Xác minh mã hóa E2E",
          description: "Xác minh sau migration phát hiện hồi quy RPC và quá tải.",
          cta: "Đọc tài liệu bảo mật",
        },
        {
          title: "Mức sẵn sàng FNA",
          description: "Đã bổ sung hướng dẫn vận hành cho Failure Notification & Analysis.",
          cta: "Xem ghi chú FNA",
        },
      ],
    },
    security: {
      sectionTitle: "Hardening gần đây (2026 Q1)",
      workflowTitle: "Quy trình migration được khuyến nghị:",
      workflowNote:
        "`run-migration-file.mjs` mặc định chạy `verify:e2e-encryption-db` và fail-fast khi có hồi quy overload hoặc RPC. Chỉ dùng `SKIP_E2E_VERIFY=1` cho tình huống bypass khẩn cấp.",
    },
  },
  "pt-BR": {
    dashboard: {
      heading: "Atualizações de Segurança e Confiabilidade",
      subtitle: "Hardening concluído recentemente e checkpoints operacionais",
      docsCta: "Documentação",
      cards: [
        {
          title: "Aplicação de política de tenant",
          description: "Limites de ingestão e comportamento de fallback agora estão travados em padrões seguros para produção.",
          cta: "Revisar Enterprise",
        },
        {
          title: "Hardening de idempotência de webhook",
          description: "Retries e eventos duplicados agora seguem o fluxo lock-claim-finalize.",
          cta: "Revisar webhooks",
        },
        {
          title: "Verificação de criptografia E2E",
          description: "A verificação pós-migração detecta regressões de RPC e sobrecarga.",
          cta: "Ler documentação de segurança",
        },
        {
          title: "Prontidão FNA",
          description: "Foi adicionada orientação operacional de Failure Notification & Analysis.",
          cta: "Ver notas FNA",
        },
      ],
    },
    security: {
      sectionTitle: "Hardening recente (2026 T1)",
      workflowTitle: "Fluxo de migração recomendado:",
      workflowNote:
        "`run-migration-file.mjs` aciona `verify:e2e-encryption-db` por padrão e falha rápido em regressões de sobrecarga ou RPC. Use `SKIP_E2E_VERIFY=1` apenas em bypass de emergência.",
    },
  },
  "pt-PT": {
    dashboard: {
      heading: "Atualizações de Segurança e Fiabilidade",
      subtitle: "Hardening concluído recentemente e pontos de controlo operacionais",
      docsCta: "Documentação",
      cards: [
        {
          title: "Aplicação de política de tenant",
          description: "Os limites de ingestão e o comportamento de fallback estão agora fixos em predefinições seguras para produção.",
          cta: "Rever Enterprise",
        },
        {
          title: "Hardening de idempotência de webhook",
          description: "Retries e eventos duplicados seguem agora o fluxo lock-claim-finalize.",
          cta: "Rever webhooks",
        },
        {
          title: "Verificação de encriptação E2E",
          description: "A verificação pós-migração deteta regressões de RPC e sobrecarga.",
          cta: "Ler documentação de segurança",
        },
        {
          title: "Prontidão FNA",
          description: "Foi adicionada orientação operacional de Failure Notification & Analysis.",
          cta: "Ver notas FNA",
        },
      ],
    },
    security: {
      sectionTitle: "Hardening recente (2026 T1)",
      workflowTitle: "Fluxo de migração recomendado:",
      workflowNote:
        "`run-migration-file.mjs` executa `verify:e2e-encryption-db` por predefinição e falha rapidamente em regressões de sobrecarga ou RPC. Use `SKIP_E2E_VERIFY=1` apenas para bypass de emergência.",
    },
  },
};

export function getReliabilityUpdatesCopy(locale: string): ReliabilityUpdatesCopy {
  return COPY[(locale as Locale)] ?? COPY.en;
}
