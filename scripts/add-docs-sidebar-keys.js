const fs = require('fs');
const path = require('path');

const dictionariesDir = path.join(__dirname, '../src/i18n/dictionaries');

// New sidebar keys with translations
const newSidebarKeys = {
  en: {
    overview: "Overview",
    whenToUse: "When to Use",
    concepts: "Concepts",
    memoryObject: "Memory Object",
    namespaceScope: "Namespace & Scope",
    bestPractices: "Best Practices",
    faq: "FAQ"
  },
  ko: {
    overview: "개요",
    whenToUse: "사용 시기",
    concepts: "핵심 개념",
    memoryObject: "메모리 객체",
    namespaceScope: "네임스페이스 & 스코프",
    bestPractices: "모범 사례",
    faq: "FAQ"
  },
  ja: {
    overview: "概要",
    whenToUse: "使用タイミング",
    concepts: "コンセプト",
    memoryObject: "メモリオブジェクト",
    namespaceScope: "ネームスペース & スコープ",
    bestPractices: "ベストプラクティス",
    faq: "FAQ"
  },
  "zh-hans": {
    overview: "概述",
    whenToUse: "使用场景",
    concepts: "核心概念",
    memoryObject: "内存对象",
    namespaceScope: "命名空间 & 作用域",
    bestPractices: "最佳实践",
    faq: "FAQ"
  },
  "zh-hant": {
    overview: "概述",
    whenToUse: "使用時機",
    concepts: "核心概念",
    memoryObject: "記憶體物件",
    namespaceScope: "命名空間 & 作用域",
    bestPractices: "最佳實踐",
    faq: "FAQ"
  },
  es: {
    overview: "Visión general",
    whenToUse: "Cuándo usar",
    concepts: "Conceptos",
    memoryObject: "Objeto de memoria",
    namespaceScope: "Namespace y Scope",
    bestPractices: "Mejores prácticas",
    faq: "FAQ"
  },
  fr: {
    overview: "Aperçu",
    whenToUse: "Quand utiliser",
    concepts: "Concepts",
    memoryObject: "Objet mémoire",
    namespaceScope: "Namespace & Scope",
    bestPractices: "Meilleures pratiques",
    faq: "FAQ"
  },
  de: {
    overview: "Überblick",
    whenToUse: "Wann verwenden",
    concepts: "Konzepte",
    memoryObject: "Speicherobjekt",
    namespaceScope: "Namespace & Scope",
    bestPractices: "Best Practices",
    faq: "FAQ"
  },
  ru: {
    overview: "Обзор",
    whenToUse: "Когда использовать",
    concepts: "Концепции",
    memoryObject: "Объект памяти",
    namespaceScope: "Namespace и Scope",
    bestPractices: "Лучшие практики",
    faq: "FAQ"
  }
};

// Get all language files
const files = fs.readdirSync(dictionariesDir).filter(f => f.endsWith('.json'));

files.forEach(file => {
  const filePath = path.join(dictionariesDir, file);
  const lang = file.replace('.json', '');

  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Get translations for this language (fallback to English)
    const translations = newSidebarKeys[lang] || newSidebarKeys.en;

    // Add new keys to docs.sidebar if it exists
    if (content.docs && content.docs.sidebar) {
      // Add new keys at appropriate positions
      const newSidebar = {
        overview: translations.overview,
        gettingStarted: content.docs.sidebar.gettingStarted,
        whenToUse: translations.whenToUse,
        quickStart: content.docs.sidebar.quickStart,
        authentication: content.docs.sidebar.authentication,
        concepts: translations.concepts,
        memoryObject: translations.memoryObject,
        namespaceScope: translations.namespaceScope,
        bestPractices: translations.bestPractices,
        apiReference: content.docs.sidebar.apiReference,
        endpoints: content.docs.sidebar.endpoints,
        rateLimits: content.docs.sidebar.rateLimits,
        errorCodes: content.docs.sidebar.errorCodes,
        resources: content.docs.sidebar.resources,
        security: content.docs.sidebar.security,
        sdks: content.docs.sidebar.sdks,
        faq: translations.faq
      };

      content.docs.sidebar = newSidebar;

      // Write back
      fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
      console.log(`Updated: ${file}`);
    } else {
      console.log(`Skipped (no docs.sidebar): ${file}`);
    }
  } catch (err) {
    console.error(`Error processing ${file}:`, err.message);
  }
});

console.log('\nDone!');
