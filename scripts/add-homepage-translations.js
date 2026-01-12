const fs = require('fs');
const path = require('path');

// New extremeHome translations to add
const newExtremeHomeTranslations = {
  en: {
    requestBuilder: {
      title: "Request Builder",
      query: "Query",
      queryPlaceholder: "Enter your search query...",
      tryExamples: "Try examples",
      dataset: "Dataset",
      latencyBudget: "Latency Budget",
      fast: "fast",
      thorough: "thorough",
      topK: "Top K",
      results: "results",
      features: "Features",
      hybridSearch: "Hybrid Search",
      hybridSearchDesc: "Combine vector + keyword",
      rerank: "Rerank",
      rerankDesc: "Re-score with cross-encoder",
      answerContract: "Answer Contract",
      answerContractDesc: "Validate answer quality",
      running: "Running...",
      runQuery: "Run Query",
      datasets: {
        techDocs: "Tech Documentation",
        legalContracts: "Legal Contracts",
        researchPapers: "Research Papers"
      }
    },
    resultsPanel: {
      searching: "Searching...",
      noResults: "Run a query to see results",
      score: "Score"
    },
    tracePanel: {
      tracing: "Tracing pipeline...",
      noTrace: "Run a query to see the trace",
      latency: "Latency",
      cost: "Cost",
      tokens: "Tokens",
      vectorOps: "Vector Ops",
      cached: "cached",
      model: "Model",
      input: "Input",
      output: "Output"
    },
    tabs: {
      results: "Results",
      trace: "Trace"
    }
  },
  ko: {
    requestBuilder: {
      title: "요청 빌더",
      query: "쿼리",
      queryPlaceholder: "검색어를 입력하세요...",
      tryExamples: "예시 보기",
      dataset: "데이터셋",
      latencyBudget: "지연 시간 예산",
      fast: "빠름",
      thorough: "정밀",
      topK: "상위 K",
      results: "개 결과",
      features: "기능",
      hybridSearch: "하이브리드 검색",
      hybridSearchDesc: "벡터 + 키워드 결합",
      rerank: "재순위",
      rerankDesc: "크로스 인코더로 재점수화",
      answerContract: "답변 계약",
      answerContractDesc: "답변 품질 검증",
      running: "실행 중...",
      runQuery: "쿼리 실행",
      datasets: {
        techDocs: "기술 문서",
        legalContracts: "법률 계약서",
        researchPapers: "연구 논문"
      }
    },
    resultsPanel: {
      searching: "검색 중...",
      noResults: "쿼리를 실행하여 결과 확인",
      score: "점수"
    },
    tracePanel: {
      tracing: "파이프라인 추적 중...",
      noTrace: "쿼리를 실행하여 트레이스 확인",
      latency: "지연 시간",
      cost: "비용",
      tokens: "토큰",
      vectorOps: "벡터 연산",
      cached: "캐시됨",
      model: "모델",
      input: "입력",
      output: "출력"
    },
    tabs: {
      results: "결과",
      trace: "트레이스"
    }
  },
  ja: {
    requestBuilder: {
      title: "リクエストビルダー",
      query: "クエリ",
      queryPlaceholder: "検索クエリを入力...",
      tryExamples: "例を試す",
      dataset: "データセット",
      latencyBudget: "レイテンシ予算",
      fast: "高速",
      thorough: "詳細",
      topK: "上位K",
      results: "件",
      features: "機能",
      hybridSearch: "ハイブリッド検索",
      hybridSearchDesc: "ベクトル+キーワード結合",
      rerank: "再ランキング",
      rerankDesc: "クロスエンコーダで再スコア",
      answerContract: "回答契約",
      answerContractDesc: "回答品質の検証",
      running: "実行中...",
      runQuery: "クエリ実行",
      datasets: {
        techDocs: "技術ドキュメント",
        legalContracts: "法的契約書",
        researchPapers: "研究論文"
      }
    },
    resultsPanel: {
      searching: "検索中...",
      noResults: "クエリを実行して結果を表示",
      score: "スコア"
    },
    tracePanel: {
      tracing: "パイプライン追跡中...",
      noTrace: "クエリを実行してトレースを表示",
      latency: "レイテンシ",
      cost: "コスト",
      tokens: "トークン",
      vectorOps: "ベクター操作",
      cached: "キャッシュ",
      model: "モデル",
      input: "入力",
      output: "出力"
    },
    tabs: {
      results: "結果",
      trace: "トレース"
    }
  },
  "zh-hans": {
    requestBuilder: {
      title: "请求构建器",
      query: "查询",
      queryPlaceholder: "输入搜索查询...",
      tryExamples: "试试示例",
      dataset: "数据集",
      latencyBudget: "延迟预算",
      fast: "快速",
      thorough: "详细",
      topK: "前K个",
      results: "个结果",
      features: "功能",
      hybridSearch: "混合搜索",
      hybridSearchDesc: "向量+关键词结合",
      rerank: "重新排序",
      rerankDesc: "交叉编码器重新评分",
      answerContract: "答案契约",
      answerContractDesc: "验证答案质量",
      running: "运行中...",
      runQuery: "执行查询",
      datasets: {
        techDocs: "技术文档",
        legalContracts: "法律合同",
        researchPapers: "研究论文"
      }
    },
    resultsPanel: {
      searching: "搜索中...",
      noResults: "运行查询以查看结果",
      score: "得分"
    },
    tracePanel: {
      tracing: "追踪管道中...",
      noTrace: "运行查询以查看追踪",
      latency: "延迟",
      cost: "成本",
      tokens: "令牌",
      vectorOps: "向量操作",
      cached: "已缓存",
      model: "模型",
      input: "输入",
      output: "输出"
    },
    tabs: {
      results: "结果",
      trace: "追踪"
    }
  },
  "zh-hant": {
    requestBuilder: {
      title: "請求建構器",
      query: "查詢",
      queryPlaceholder: "輸入搜尋查詢...",
      tryExamples: "試試範例",
      dataset: "資料集",
      latencyBudget: "延遲預算",
      fast: "快速",
      thorough: "詳細",
      topK: "前K個",
      results: "個結果",
      features: "功能",
      hybridSearch: "混合搜尋",
      hybridSearchDesc: "向量+關鍵字結合",
      rerank: "重新排序",
      rerankDesc: "交叉編碼器重新評分",
      answerContract: "答案契約",
      answerContractDesc: "驗證答案品質",
      running: "執行中...",
      runQuery: "執行查詢",
      datasets: {
        techDocs: "技術文件",
        legalContracts: "法律合約",
        researchPapers: "研究論文"
      }
    },
    resultsPanel: {
      searching: "搜尋中...",
      noResults: "執行查詢以查看結果",
      score: "得分"
    },
    tracePanel: {
      tracing: "追蹤管道中...",
      noTrace: "執行查詢以查看追蹤",
      latency: "延遲",
      cost: "成本",
      tokens: "權杖",
      vectorOps: "向量操作",
      cached: "已快取",
      model: "模型",
      input: "輸入",
      output: "輸出"
    },
    tabs: {
      results: "結果",
      trace: "追蹤"
    }
  },
  es: {
    requestBuilder: {
      title: "Constructor de Solicitudes",
      query: "Consulta",
      queryPlaceholder: "Ingrese su consulta de búsqueda...",
      tryExamples: "Ver ejemplos",
      dataset: "Conjunto de datos",
      latencyBudget: "Presupuesto de latencia",
      fast: "rápido",
      thorough: "detallado",
      topK: "Top K",
      results: "resultados",
      features: "Características",
      hybridSearch: "Búsqueda Híbrida",
      hybridSearchDesc: "Combinar vector + palabra clave",
      rerank: "Reordenar",
      rerankDesc: "Re-puntuar con cross-encoder",
      answerContract: "Contrato de Respuesta",
      answerContractDesc: "Validar calidad de respuesta",
      running: "Ejecutando...",
      runQuery: "Ejecutar Consulta",
      datasets: {
        techDocs: "Documentación Técnica",
        legalContracts: "Contratos Legales",
        researchPapers: "Artículos de Investigación"
      }
    },
    resultsPanel: {
      searching: "Buscando...",
      noResults: "Ejecute una consulta para ver resultados",
      score: "Puntuación"
    },
    tracePanel: {
      tracing: "Rastreando pipeline...",
      noTrace: "Ejecute una consulta para ver el rastreo",
      latency: "Latencia",
      cost: "Costo",
      tokens: "Tokens",
      vectorOps: "Ops Vectoriales",
      cached: "en caché",
      model: "Modelo",
      input: "Entrada",
      output: "Salida"
    },
    tabs: {
      results: "Resultados",
      trace: "Rastreo"
    }
  },
  fr: {
    requestBuilder: {
      title: "Constructeur de Requêtes",
      query: "Requête",
      queryPlaceholder: "Entrez votre requête de recherche...",
      tryExamples: "Voir exemples",
      dataset: "Jeu de données",
      latencyBudget: "Budget de latence",
      fast: "rapide",
      thorough: "approfondi",
      topK: "Top K",
      results: "résultats",
      features: "Fonctionnalités",
      hybridSearch: "Recherche Hybride",
      hybridSearchDesc: "Combiner vecteur + mot-clé",
      rerank: "Reclasser",
      rerankDesc: "Re-scorer avec cross-encoder",
      answerContract: "Contrat de Réponse",
      answerContractDesc: "Valider la qualité de réponse",
      running: "Exécution...",
      runQuery: "Exécuter Requête",
      datasets: {
        techDocs: "Documentation Technique",
        legalContracts: "Contrats Juridiques",
        researchPapers: "Articles de Recherche"
      }
    },
    resultsPanel: {
      searching: "Recherche...",
      noResults: "Exécutez une requête pour voir les résultats",
      score: "Score"
    },
    tracePanel: {
      tracing: "Traçage du pipeline...",
      noTrace: "Exécutez une requête pour voir le tracé",
      latency: "Latence",
      cost: "Coût",
      tokens: "Jetons",
      vectorOps: "Ops Vectorielles",
      cached: "en cache",
      model: "Modèle",
      input: "Entrée",
      output: "Sortie"
    },
    tabs: {
      results: "Résultats",
      trace: "Tracé"
    }
  },
  de: {
    requestBuilder: {
      title: "Anfrage-Builder",
      query: "Abfrage",
      queryPlaceholder: "Suchanfrage eingeben...",
      tryExamples: "Beispiele",
      dataset: "Datensatz",
      latencyBudget: "Latenz-Budget",
      fast: "schnell",
      thorough: "gründlich",
      topK: "Top K",
      results: "Ergebnisse",
      features: "Funktionen",
      hybridSearch: "Hybrid-Suche",
      hybridSearchDesc: "Vektor + Stichwort kombinieren",
      rerank: "Neuordnung",
      rerankDesc: "Mit Cross-Encoder neu bewerten",
      answerContract: "Antwort-Vertrag",
      answerContractDesc: "Antwortqualität validieren",
      running: "Läuft...",
      runQuery: "Abfrage ausführen",
      datasets: {
        techDocs: "Technische Dokumentation",
        legalContracts: "Rechtsverträge",
        researchPapers: "Forschungsarbeiten"
      }
    },
    resultsPanel: {
      searching: "Suche...",
      noResults: "Führen Sie eine Abfrage aus",
      score: "Punktzahl"
    },
    tracePanel: {
      tracing: "Pipeline verfolgen...",
      noTrace: "Führen Sie eine Abfrage aus um Trace zu sehen",
      latency: "Latenz",
      cost: "Kosten",
      tokens: "Token",
      vectorOps: "Vektor-Ops",
      cached: "gecacht",
      model: "Modell",
      input: "Eingabe",
      output: "Ausgabe"
    },
    tabs: {
      results: "Ergebnisse",
      trace: "Trace"
    }
  },
  ru: {
    requestBuilder: {
      title: "Конструктор Запросов",
      query: "Запрос",
      queryPlaceholder: "Введите поисковый запрос...",
      tryExamples: "Примеры",
      dataset: "Набор данных",
      latencyBudget: "Бюджет задержки",
      fast: "быстро",
      thorough: "тщательно",
      topK: "Топ K",
      results: "результатов",
      features: "Функции",
      hybridSearch: "Гибридный поиск",
      hybridSearchDesc: "Вектор + ключевое слово",
      rerank: "Переранжирование",
      rerankDesc: "Переоценка с cross-encoder",
      answerContract: "Контракт ответа",
      answerContractDesc: "Проверка качества ответа",
      running: "Выполнение...",
      runQuery: "Выполнить запрос",
      datasets: {
        techDocs: "Техническая документация",
        legalContracts: "Юридические договоры",
        researchPapers: "Научные статьи"
      }
    },
    resultsPanel: {
      searching: "Поиск...",
      noResults: "Выполните запрос для просмотра",
      score: "Оценка"
    },
    tracePanel: {
      tracing: "Трассировка...",
      noTrace: "Выполните запрос для трассировки",
      latency: "Задержка",
      cost: "Стоимость",
      tokens: "Токены",
      vectorOps: "Вект. операции",
      cached: "кэш",
      model: "Модель",
      input: "Вход",
      output: "Выход"
    },
    tabs: {
      results: "Результаты",
      trace: "Трассировка"
    }
  }
};

// Language mapping for remaining languages (use English as fallback)
const defaultTranslation = newExtremeHomeTranslations.en;

const dictPath = path.join(__dirname, '../src/i18n/dictionaries');
const files = fs.readdirSync(dictPath).filter(f => f.endsWith('.json'));

files.forEach(file => {
  const lang = file.replace('.json', '');
  const filePath = path.join(dictPath, file);

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Get language-specific translations or use English as fallback
    const translations = newExtremeHomeTranslations[lang] || defaultTranslation;

    if (data.extremeHome) {
      // Update extremeHome with new translations
      data.extremeHome.requestBuilder = translations.requestBuilder;
      data.extremeHome.resultsPanel = translations.resultsPanel;
      data.extremeHome.tracePanel = translations.tracePanel;
      data.extremeHome.tabs = translations.tabs;

      // Remove old simple string keys if they exist
      delete data.extremeHome.results;
      delete data.extremeHome.trace;
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Updated ${file}`);
  } catch (err) {
    console.error(`Error updating ${file}:`, err.message);
  }
});

console.log('Done!');
