const fs = require('fs');
const path = require('path');

const translations = {
  ko: {
    docs: {
      nav: { dashboard: "대시보드", getStarted: "시작하기" },
      sidebar: { gettingStarted: "시작하기", quickStart: "빠른 시작", authentication: "인증", apiReference: "API 참조", endpoints: "엔드포인트", rateLimits: "요청 제한", errorCodes: "오류 코드", resources: "리소스", security: "보안", sdks: "SDK" },
      hero: { title: "API 문서", subtitle: "Seizn을 애플리케이션에 통합하는 데 필요한 모든 것. 몇 줄의 코드로 AI에 영구 메모리를 추가하세요." },
      quickStart: { title: "빠른 시작", description: "대시보드에서 API 키를 받은 후", dashboardLink: "대시보드", then: "요청을 시작하세요:" },
      authentication: { title: "인증", description: "모든 API 요청에는", header: "x-api-key", headerSuffix: "헤더에 API 키가 필요합니다.", securityTitle: "보안:", securityText: "API 키를 안전하게 보관하세요. 클라이언트 측 코드에 노출하지 마세요. 환경 변수나 백엔드 프록시를 사용하세요." },
      endpoints: {
        title: "API 엔드포인트", requestBody: "요청 본문", queryParams: "쿼리 매개변수", response: "응답",
        postMemories: { description: "사용자의 메모리 저장소에 새 메모리를 추가합니다.", content: "string (필수) - 메모리 내용", memoryType: "string - 유형: fact, preference, experience, relationship, instruction", tags: "string[] - 분류용 태그", namespace: "string - 조직용 네임스페이스 (기본값: \"default\")", scope: "string - 범위: user, session, agent", sessionId: "string - 세션 범위 메모리용 세션 ID", agentId: "string - 에이전트 범위 메모리용 에이전트 ID" },
        getMemories: { description: "의미적 유사성을 사용하여 메모리를 검색합니다.", query: "string (필수) - 검색 쿼리", limit: "number - 최대 결과 수 (기본값: 10, 최대: 100)", threshold: "number - 유사도 임계값 0-1 (기본값: 0.7)", namespace: "string - 네임스페이스로 필터링" },
        deleteMemories: { description: "ID로 메모리를 삭제합니다.", ids: "string (필수) - 쉼표로 구분된 메모리 ID" },
        extract: { description: "AI를 사용하여 대화에서 메모리를 추출하고 저장합니다.", conversation: "string (필수) - 메모리를 추출할 대화 텍스트", model: "string - AI 모델: haiku (빠름) 또는 sonnet (더 좋음) (기본값: haiku)", autoStore: "boolean - 추출된 메모리 자동 저장 (기본값: true)", namespace: "string - 저장된 메모리의 네임스페이스 (기본값: \"default\")" },
        query: { description: "관련 메모리를 컨텍스트로 사용하여 AI 생성 응답을 받습니다 (RAG).", queryParam: "string (필수) - 사용자의 질문 또는 프롬프트", model: "string - AI 모델: haiku 또는 sonnet (기본값: haiku)", topK: "number - 컨텍스트로 사용할 메모리 수 (기본값: 5)", namespace: "string - 네임스페이스로 메모리 필터링", includeMemories: "boolean - 응답에 사용된 메모리 포함 (기본값: true)" }
      },
      rateLimits: { title: "요청 제한", plan: "플랜", dailyApiCalls: "일일 API 호출", maxMemories: "최대 메모리", apiKeys: "API 키", free: "무료", plus: "플러스", pro: "프로", enterprise: "엔터프라이즈", unlimited: "무제한", exceeded: "요청 제한을 초과하면 API가", response: "응답을 반환합니다." },
      errors: { title: "오류 코드", code: "코드", description: "설명", success: "성공", badRequest: "잘못된 요청 - 매개변수 누락 또는 유효하지 않음", unauthorized: "권한 없음 - API 키가 유효하지 않거나 누락됨", tooManyRequests: "요청 과다 - 요청 제한 초과", serverError: "내부 서버 오류 - 문제가 발생했습니다" },
      security: { title: "보안 및 거버넌스", dataSecurityTitle: "데이터 보안", encryptionAtRest: "저장 시 암호화:", encryptionAtRestDesc: "모든 데이터 AES-256으로 암호화", encryptionInTransit: "전송 중 암호화:", encryptionInTransitDesc: "모든 연결에 TLS 1.3", tenantIsolation: "테넌트 격리:", tenantIsolationDesc: "계정 간 완전한 데이터 분리", apiKeyManagement: "API 키 관리", keyRotation: "키 순환:", keyRotationDesc: "대시보드에서 언제든지 키 순환", keyExpiration: "키 만료:", keyExpirationDesc: "90일 후 자동 만료 (설정 가능)", usageTracking: "사용량 추적:", usageTrackingDesc: "키별 사용량 실시간 모니터링", dataRetention: "데이터 보존 및 삭제", export: "내보내기:", exportDesc: "API 또는 대시보드를 통해 언제든지 모든 데이터 내보내기", deletion: "삭제:", deletionDesc: "30일 후 보존 없이 영구 삭제", compliance: "GDPR/CCPA:", complianceDesc: "데이터 주체 권리 완전 준수" },
      sdks: { title: "SDK", python: "Python", javascript: "JavaScript" },
      footer: { copyright: "© {year} Seizn. All rights reserved." }
    }
  },
  ja: {
    docs: {
      nav: { dashboard: "ダッシュボード", getStarted: "始める" },
      sidebar: { gettingStarted: "はじめに", quickStart: "クイックスタート", authentication: "認証", apiReference: "APIリファレンス", endpoints: "エンドポイント", rateLimits: "レート制限", errorCodes: "エラーコード", resources: "リソース", security: "セキュリティ", sdks: "SDK" },
      hero: { title: "APIドキュメント", subtitle: "Seiznをアプリケーションに統合するために必要なすべて。数行のコードでAIに永続メモリを追加できます。" },
      quickStart: { title: "クイックスタート", description: "ダッシュボードからAPIキーを取得し", dashboardLink: "ダッシュボード", then: "、リクエストを開始してください:" },
      authentication: { title: "認証", description: "すべてのAPIリクエストには", header: "x-api-key", headerSuffix: "ヘッダーにAPIキーが必要です。", securityTitle: "セキュリティ:", securityText: "APIキーを安全に保管してください。クライアント側のコードに公開しないでください。環境変数またはバックエンドプロキシを使用してください。" },
      endpoints: {
        title: "APIエンドポイント", requestBody: "リクエストボディ", queryParams: "クエリパラメータ", response: "レスポンス",
        postMemories: { description: "ユーザーのメモリストアに新しいメモリを追加します。", content: "string (必須) - メモリの内容", memoryType: "string - タイプ: fact, preference, experience, relationship, instruction", tags: "string[] - 分類用タグ", namespace: "string - 整理用の名前空間 (デフォルト: \"default\")", scope: "string - スコープ: user, session, agent", sessionId: "string - セッションスコープメモリ用のセッションID", agentId: "string - エージェントスコープメモリ用のエージェントID" },
        getMemories: { description: "意味的類似性を使用してメモリを検索します。", query: "string (必須) - 検索クエリ", limit: "number - 最大結果数 (デフォルト: 10, 最大: 100)", threshold: "number - 類似度しきい値 0-1 (デフォルト: 0.7)", namespace: "string - 名前空間でフィルター" },
        deleteMemories: { description: "IDでメモリを削除します。", ids: "string (必須) - カンマ区切りのメモリID" },
        extract: { description: "AIを使用して会話からメモリを抽出して保存します。", conversation: "string (必須) - メモリを抽出する会話テキスト", model: "string - AIモデル: haiku (高速) または sonnet (高品質) (デフォルト: haiku)", autoStore: "boolean - 抽出されたメモリを自動保存 (デフォルト: true)", namespace: "string - 保存されたメモリの名前空間 (デフォルト: \"default\")" },
        query: { description: "関連するメモリをコンテキストとして使用してAI生成の応答を取得します (RAG)。", queryParam: "string (必須) - ユーザーの質問またはプロンプト", model: "string - AIモデル: haiku または sonnet (デフォルト: haiku)", topK: "number - コンテキストとして使用するメモリ数 (デフォルト: 5)", namespace: "string - 名前空間でメモリをフィルター", includeMemories: "boolean - 使用されたメモリをレスポンスに含める (デフォルト: true)" }
      },
      rateLimits: { title: "レート制限", plan: "プラン", dailyApiCalls: "日次API呼び出し", maxMemories: "最大メモリ", apiKeys: "APIキー", free: "無料", plus: "プラス", pro: "プロ", enterprise: "エンタープライズ", unlimited: "無制限", exceeded: "レート制限を超えると、APIは", response: "レスポンスを返します。" },
      errors: { title: "エラーコード", code: "コード", description: "説明", success: "成功", badRequest: "不正なリクエスト - パラメータが不足または無効", unauthorized: "認証エラー - APIキーが無効または不足", tooManyRequests: "リクエスト過多 - レート制限超過", serverError: "内部サーバーエラー - 問題が発生しました" },
      security: { title: "セキュリティとガバナンス", dataSecurityTitle: "データセキュリティ", encryptionAtRest: "保存時の暗号化:", encryptionAtRestDesc: "すべてのデータをAES-256で暗号化", encryptionInTransit: "転送中の暗号化:", encryptionInTransitDesc: "すべての接続にTLS 1.3", tenantIsolation: "テナント分離:", tenantIsolationDesc: "アカウント間の完全なデータ分離", apiKeyManagement: "APIキー管理", keyRotation: "キーローテーション:", keyRotationDesc: "ダッシュボードからいつでもキーをローテーション", keyExpiration: "キーの有効期限:", keyExpirationDesc: "90日後に自動期限切れ (設定可能)", usageTracking: "使用状況追跡:", usageTrackingDesc: "キーごとの使用状況をリアルタイムで監視", dataRetention: "データ保持と削除", export: "エクスポート:", exportDesc: "APIまたはダッシュボードを通じていつでもすべてのデータをエクスポート", deletion: "削除:", deletionDesc: "30日後に保持なしで完全削除", compliance: "GDPR/CCPA:", complianceDesc: "データ主体の権利に完全準拠" },
      sdks: { title: "SDK", python: "Python", javascript: "JavaScript" },
      footer: { copyright: "© {year} Seizn. All rights reserved." }
    }
  },
  "zh-hans": {
    docs: {
      nav: { dashboard: "仪表板", getStarted: "开始使用" },
      sidebar: { gettingStarted: "开始使用", quickStart: "快速入门", authentication: "认证", apiReference: "API参考", endpoints: "端点", rateLimits: "速率限制", errorCodes: "错误代码", resources: "资源", security: "安全", sdks: "SDK" },
      hero: { title: "API文档", subtitle: "将Seizn集成到您的应用程序所需的一切。只需几行代码即可为您的AI添加持久记忆。" },
      quickStart: { title: "快速入门", description: "从仪表板获取您的API密钥", dashboardLink: "仪表板", then: "，然后开始发送请求：" },
      authentication: { title: "认证", description: "所有API请求都需要在", header: "x-api-key", headerSuffix: "标头中传递API密钥。", securityTitle: "安全：", securityText: "请妥善保管您的API密钥。不要在客户端代码中暴露它们。使用环境变量或后端代理。" },
      endpoints: {
        title: "API端点", requestBody: "请求体", queryParams: "查询参数", response: "响应",
        postMemories: { description: "向用户的记忆存储添加新记忆。", content: "string (必需) - 记忆内容", memoryType: "string - 类型：fact、preference、experience、relationship、instruction", tags: "string[] - 用于分类的标签", namespace: "string - 用于组织的命名空间（默认：\"default\"）", scope: "string - 范围：user、session、agent", sessionId: "string - 会话范围记忆的会话ID", agentId: "string - 代理范围记忆的代理ID" },
        getMemories: { description: "使用语义相似性搜索记忆。", query: "string (必需) - 搜索查询", limit: "number - 最大结果数（默认：10，最大：100）", threshold: "number - 相似度阈值 0-1（默认：0.7）", namespace: "string - 按命名空间筛选" },
        deleteMemories: { description: "按ID删除记忆。", ids: "string (必需) - 逗号分隔的记忆ID" },
        extract: { description: "使用AI从对话中提取并存储记忆。", conversation: "string (必需) - 要提取记忆的对话文本", model: "string - AI模型：haiku（更快）或sonnet（更好）（默认：haiku）", autoStore: "boolean - 自动存储提取的记忆（默认：true）", namespace: "string - 存储记忆的命名空间（默认：\"default\"）" },
        query: { description: "使用相关记忆作为上下文获取AI生成的响应（RAG）。", queryParam: "string (必需) - 用户的问题或提示", model: "string - AI模型：haiku或sonnet（默认：haiku）", topK: "number - 用作上下文的记忆数量（默认：5）", namespace: "string - 按命名空间筛选记忆", includeMemories: "boolean - 在响应中包含使用的记忆（默认：true）" }
      },
      rateLimits: { title: "速率限制", plan: "计划", dailyApiCalls: "每日API调用", maxMemories: "最大记忆数", apiKeys: "API密钥", free: "免费", plus: "Plus", pro: "Pro", enterprise: "企业版", unlimited: "无限", exceeded: "当您超过速率限制时，API将返回", response: "响应。" },
      errors: { title: "错误代码", code: "代码", description: "描述", success: "成功", badRequest: "错误请求 - 缺少参数或参数无效", unauthorized: "未授权 - API密钥无效或缺失", tooManyRequests: "请求过多 - 超过速率限制", serverError: "内部服务器错误 - 出现问题" },
      security: { title: "安全与治理", dataSecurityTitle: "数据安全", encryptionAtRest: "静态加密：", encryptionAtRestDesc: "所有数据使用AES-256加密", encryptionInTransit: "传输加密：", encryptionInTransitDesc: "所有连接使用TLS 1.3", tenantIsolation: "租户隔离：", tenantIsolationDesc: "账户间完全数据隔离", apiKeyManagement: "API密钥管理", keyRotation: "密钥轮换：", keyRotationDesc: "随时从仪表板轮换密钥", keyExpiration: "密钥过期：", keyExpirationDesc: "90天后自动过期（可配置）", usageTracking: "使用跟踪：", usageTrackingDesc: "实时监控每个密钥的使用情况", dataRetention: "数据保留与删除", export: "导出：", exportDesc: "随时通过API或仪表板导出所有数据", deletion: "删除：", deletionDesc: "30天后永久删除，不保留", compliance: "GDPR/CCPA：", complianceDesc: "完全符合数据主体权利" },
      sdks: { title: "SDK", python: "Python", javascript: "JavaScript" },
      footer: { copyright: "© {year} Seizn. 保留所有权利。" }
    }
  },
  "zh-hant": {
    docs: {
      nav: { dashboard: "儀表板", getStarted: "開始使用" },
      sidebar: { gettingStarted: "開始使用", quickStart: "快速入門", authentication: "認證", apiReference: "API參考", endpoints: "端點", rateLimits: "速率限制", errorCodes: "錯誤代碼", resources: "資源", security: "安全", sdks: "SDK" },
      hero: { title: "API文檔", subtitle: "將Seizn整合到您的應用程式所需的一切。只需幾行程式碼即可為您的AI添加持久記憶。" },
      quickStart: { title: "快速入門", description: "從儀表板獲取您的API密鑰", dashboardLink: "儀表板", then: "，然後開始發送請求：" },
      authentication: { title: "認證", description: "所有API請求都需要在", header: "x-api-key", headerSuffix: "標頭中傳遞API密鑰。", securityTitle: "安全：", securityText: "請妥善保管您的API密鑰。不要在客戶端程式碼中暴露它們。使用環境變數或後端代理。" },
      endpoints: {
        title: "API端點", requestBody: "請求體", queryParams: "查詢參數", response: "回應",
        postMemories: { description: "向用戶的記憶儲存添加新記憶。", content: "string (必需) - 記憶內容", memoryType: "string - 類型：fact、preference、experience、relationship、instruction", tags: "string[] - 用於分類的標籤", namespace: "string - 用於組織的命名空間（預設：\"default\"）", scope: "string - 範圍：user、session、agent", sessionId: "string - 會話範圍記憶的會話ID", agentId: "string - 代理範圍記憶的代理ID" },
        getMemories: { description: "使用語義相似性搜索記憶。", query: "string (必需) - 搜索查詢", limit: "number - 最大結果數（預設：10，最大：100）", threshold: "number - 相似度閾值 0-1（預設：0.7）", namespace: "string - 按命名空間篩選" },
        deleteMemories: { description: "按ID刪除記憶。", ids: "string (必需) - 逗號分隔的記憶ID" },
        extract: { description: "使用AI從對話中提取並儲存記憶。", conversation: "string (必需) - 要提取記憶的對話文本", model: "string - AI模型：haiku（更快）或sonnet（更好）（預設：haiku）", autoStore: "boolean - 自動儲存提取的記憶（預設：true）", namespace: "string - 儲存記憶的命名空間（預設：\"default\"）" },
        query: { description: "使用相關記憶作為上下文獲取AI生成的回應（RAG）。", queryParam: "string (必需) - 用戶的問題或提示", model: "string - AI模型：haiku或sonnet（預設：haiku）", topK: "number - 用作上下文的記憶數量（預設：5）", namespace: "string - 按命名空間篩選記憶", includeMemories: "boolean - 在回應中包含使用的記憶（預設：true）" }
      },
      rateLimits: { title: "速率限制", plan: "方案", dailyApiCalls: "每日API呼叫", maxMemories: "最大記憶數", apiKeys: "API密鑰", free: "免費", plus: "Plus", pro: "Pro", enterprise: "企業版", unlimited: "無限", exceeded: "當您超過速率限制時，API將返回", response: "回應。" },
      errors: { title: "錯誤代碼", code: "代碼", description: "描述", success: "成功", badRequest: "錯誤請求 - 缺少參數或參數無效", unauthorized: "未授權 - API密鑰無效或缺失", tooManyRequests: "請求過多 - 超過速率限制", serverError: "內部伺服器錯誤 - 出現問題" },
      security: { title: "安全與治理", dataSecurityTitle: "數據安全", encryptionAtRest: "靜態加密：", encryptionAtRestDesc: "所有數據使用AES-256加密", encryptionInTransit: "傳輸加密：", encryptionInTransitDesc: "所有連接使用TLS 1.3", tenantIsolation: "租戶隔離：", tenantIsolationDesc: "帳戶間完全數據隔離", apiKeyManagement: "API密鑰管理", keyRotation: "密鑰輪換：", keyRotationDesc: "隨時從儀表板輪換密鑰", keyExpiration: "密鑰過期：", keyExpirationDesc: "90天後自動過期（可配置）", usageTracking: "使用追蹤：", usageTrackingDesc: "即時監控每個密鑰的使用情況", dataRetention: "數據保留與刪除", export: "導出：", exportDesc: "隨時通過API或儀表板導出所有數據", deletion: "刪除：", deletionDesc: "30天後永久刪除，不保留", compliance: "GDPR/CCPA：", complianceDesc: "完全符合數據主體權利" },
      sdks: { title: "SDK", python: "Python", javascript: "JavaScript" },
      footer: { copyright: "© {year} Seizn. 保留所有權利。" }
    }
  },
  es: {
    docs: {
      nav: { dashboard: "Panel", getStarted: "Comenzar" },
      sidebar: { gettingStarted: "Primeros pasos", quickStart: "Inicio rápido", authentication: "Autenticación", apiReference: "Referencia API", endpoints: "Endpoints", rateLimits: "Límites de tasa", errorCodes: "Códigos de error", resources: "Recursos", security: "Seguridad", sdks: "SDKs" },
      hero: { title: "Documentación API", subtitle: "Todo lo que necesitas para integrar Seizn en tus aplicaciones. Añade memoria persistente a tu IA con solo unas líneas de código." },
      quickStart: { title: "Inicio Rápido", description: "Obtén tu clave API desde el", dashboardLink: "panel", then: ", luego comienza a hacer solicitudes:" },
      authentication: { title: "Autenticación", description: "Todas las solicitudes API requieren una clave API pasada en el encabezado", header: "x-api-key", headerSuffix: ".", securityTitle: "Seguridad:", securityText: "Mantén tus claves API secretas. Nunca las expongas en código del lado del cliente. Usa variables de entorno o un proxy backend." },
      endpoints: { title: "Endpoints API", requestBody: "Cuerpo de solicitud", queryParams: "Parámetros de consulta", response: "Respuesta", postMemories: { description: "Añade un nuevo recuerdo al almacén de memoria del usuario." }, getMemories: { description: "Busca recuerdos usando similitud semántica." }, deleteMemories: { description: "Elimina recuerdos por sus IDs." }, extract: { description: "Extrae y almacena recuerdos de una conversación usando IA." }, query: { description: "Obtén respuestas generadas por IA usando recuerdos relevantes como contexto (RAG)." } },
      rateLimits: { title: "Límites de Tasa", plan: "Plan", dailyApiCalls: "Llamadas API diarias", maxMemories: "Memorias máximas", apiKeys: "Claves API", free: "Gratis", plus: "Plus", pro: "Pro", enterprise: "Empresarial", unlimited: "Ilimitado", exceeded: "Cuando excedes tu límite de tasa, la API devuelve una respuesta", response: "." },
      errors: { title: "Códigos de Error", code: "Código", description: "Descripción", success: "Éxito", badRequest: "Solicitud incorrecta - Parámetros faltantes o inválidos", unauthorized: "No autorizado - Clave API inválida o faltante", tooManyRequests: "Demasiadas solicitudes - Límite de tasa excedido", serverError: "Error interno del servidor - Algo salió mal" },
      security: { title: "Seguridad y Gobernanza", dataSecurityTitle: "Seguridad de datos", encryptionAtRest: "Cifrado en reposo:", encryptionAtRestDesc: "Todos los datos cifrados con AES-256", encryptionInTransit: "Cifrado en tránsito:", encryptionInTransitDesc: "TLS 1.3 para todas las conexiones", tenantIsolation: "Aislamiento de inquilinos:", tenantIsolationDesc: "Separación completa de datos entre cuentas", apiKeyManagement: "Gestión de claves API", keyRotation: "Rotación de claves:", keyRotationDesc: "Rota las claves en cualquier momento desde el panel", keyExpiration: "Expiración de claves:", keyExpirationDesc: "Expiración automática después de 90 días (configurable)", usageTracking: "Seguimiento de uso:", usageTrackingDesc: "Monitorea el uso por clave en tiempo real", dataRetention: "Retención y eliminación de datos", export: "Exportar:", exportDesc: "Exporta todos tus datos en cualquier momento vía API o panel", deletion: "Eliminación:", deletionDesc: "Eliminación permanente sin retención después de 30 días", compliance: "GDPR/CCPA:", complianceDesc: "Cumplimiento total con los derechos del sujeto de datos" },
      sdks: { title: "SDKs", python: "Python", javascript: "JavaScript" },
      footer: { copyright: "© {year} Seizn. Todos los derechos reservados." }
    }
  },
  fr: {
    docs: {
      nav: { dashboard: "Tableau de bord", getStarted: "Commencer" },
      sidebar: { gettingStarted: "Pour commencer", quickStart: "Démarrage rapide", authentication: "Authentification", apiReference: "Référence API", endpoints: "Points de terminaison", rateLimits: "Limites de taux", errorCodes: "Codes d'erreur", resources: "Ressources", security: "Sécurité", sdks: "SDKs" },
      hero: { title: "Documentation API", subtitle: "Tout ce dont vous avez besoin pour intégrer Seizn dans vos applications. Ajoutez une mémoire persistante à votre IA en quelques lignes de code." },
      quickStart: { title: "Démarrage Rapide", description: "Obtenez votre clé API depuis le", dashboardLink: "tableau de bord", then: ", puis commencez à faire des requêtes:" },
      authentication: { title: "Authentification", description: "Toutes les requêtes API nécessitent une clé API passée dans l'en-tête", header: "x-api-key", headerSuffix: ".", securityTitle: "Sécurité:", securityText: "Gardez vos clés API secrètes. Ne les exposez jamais dans le code côté client. Utilisez des variables d'environnement ou un proxy backend." },
      endpoints: { title: "Points de terminaison API", requestBody: "Corps de la requête", queryParams: "Paramètres de requête", response: "Réponse", postMemories: { description: "Ajoute un nouveau souvenir au magasin de mémoire de l'utilisateur." }, getMemories: { description: "Recherche des souvenirs en utilisant la similarité sémantique." }, deleteMemories: { description: "Supprime des souvenirs par leurs IDs." }, extract: { description: "Extrait et stocke des souvenirs d'une conversation en utilisant l'IA." }, query: { description: "Obtient des réponses générées par IA en utilisant les souvenirs pertinents comme contexte (RAG)." } },
      rateLimits: { title: "Limites de Taux", plan: "Plan", dailyApiCalls: "Appels API quotidiens", maxMemories: "Mémoires max", apiKeys: "Clés API", free: "Gratuit", plus: "Plus", pro: "Pro", enterprise: "Entreprise", unlimited: "Illimité", exceeded: "Lorsque vous dépassez votre limite de taux, l'API renvoie une réponse", response: "." },
      errors: { title: "Codes d'Erreur", code: "Code", description: "Description", success: "Succès", badRequest: "Mauvaise requête - Paramètres manquants ou invalides", unauthorized: "Non autorisé - Clé API invalide ou manquante", tooManyRequests: "Trop de requêtes - Limite de taux dépassée", serverError: "Erreur serveur interne - Quelque chose s'est mal passé" },
      security: { title: "Sécurité et Gouvernance", dataSecurityTitle: "Sécurité des données", encryptionAtRest: "Chiffrement au repos:", encryptionAtRestDesc: "Toutes les données chiffrées avec AES-256", encryptionInTransit: "Chiffrement en transit:", encryptionInTransitDesc: "TLS 1.3 pour toutes les connexions", tenantIsolation: "Isolation des locataires:", tenantIsolationDesc: "Séparation complète des données entre les comptes", apiKeyManagement: "Gestion des clés API", keyRotation: "Rotation des clés:", keyRotationDesc: "Faites pivoter les clés à tout moment depuis le tableau de bord", keyExpiration: "Expiration des clés:", keyExpirationDesc: "Expiration automatique après 90 jours (configurable)", usageTracking: "Suivi de l'utilisation:", usageTrackingDesc: "Surveillez l'utilisation par clé en temps réel", dataRetention: "Rétention et suppression des données", export: "Export:", exportDesc: "Exportez toutes vos données à tout moment via l'API ou le tableau de bord", deletion: "Suppression:", deletionDesc: "Suppression définitive sans rétention après 30 jours", compliance: "RGPD/CCPA:", complianceDesc: "Conformité totale aux droits des personnes concernées" },
      sdks: { title: "SDKs", python: "Python", javascript: "JavaScript" },
      footer: { copyright: "© {year} Seizn. Tous droits réservés." }
    }
  },
  de: {
    docs: {
      nav: { dashboard: "Dashboard", getStarted: "Loslegen" },
      sidebar: { gettingStarted: "Erste Schritte", quickStart: "Schnellstart", authentication: "Authentifizierung", apiReference: "API-Referenz", endpoints: "Endpunkte", rateLimits: "Rate-Limits", errorCodes: "Fehlercodes", resources: "Ressourcen", security: "Sicherheit", sdks: "SDKs" },
      hero: { title: "API-Dokumentation", subtitle: "Alles, was Sie brauchen, um Seizn in Ihre Anwendungen zu integrieren. Fügen Sie Ihrer KI mit nur wenigen Codezeilen persistenten Speicher hinzu." },
      quickStart: { title: "Schnellstart", description: "Holen Sie sich Ihren API-Schlüssel vom", dashboardLink: "Dashboard", then: ", dann beginnen Sie mit den Anfragen:" },
      authentication: { title: "Authentifizierung", description: "Alle API-Anfragen erfordern einen API-Schlüssel im Header", header: "x-api-key", headerSuffix: ".", securityTitle: "Sicherheit:", securityText: "Halten Sie Ihre API-Schlüssel geheim. Setzen Sie sie niemals in clientseitigem Code aus. Verwenden Sie Umgebungsvariablen oder einen Backend-Proxy." },
      endpoints: { title: "API-Endpunkte", requestBody: "Anfragekörper", queryParams: "Abfrageparameter", response: "Antwort", postMemories: { description: "Fügt dem Speicher des Benutzers eine neue Erinnerung hinzu." }, getMemories: { description: "Sucht Erinnerungen anhand semantischer Ähnlichkeit." }, deleteMemories: { description: "Löscht Erinnerungen anhand ihrer IDs." }, extract: { description: "Extrahiert und speichert Erinnerungen aus einem Gespräch mithilfe von KI." }, query: { description: "Erhält KI-generierte Antworten unter Verwendung relevanter Erinnerungen als Kontext (RAG)." } },
      rateLimits: { title: "Rate-Limits", plan: "Plan", dailyApiCalls: "Tägliche API-Aufrufe", maxMemories: "Max. Erinnerungen", apiKeys: "API-Schlüssel", free: "Kostenlos", plus: "Plus", pro: "Pro", enterprise: "Enterprise", unlimited: "Unbegrenzt", exceeded: "Wenn Sie Ihr Rate-Limit überschreiten, gibt die API eine Antwort zurück", response: "." },
      errors: { title: "Fehlercodes", code: "Code", description: "Beschreibung", success: "Erfolg", badRequest: "Ungültige Anfrage - Fehlende oder ungültige Parameter", unauthorized: "Nicht autorisiert - Ungültiger oder fehlender API-Schlüssel", tooManyRequests: "Zu viele Anfragen - Rate-Limit überschritten", serverError: "Interner Serverfehler - Etwas ist schief gelaufen" },
      security: { title: "Sicherheit & Governance", dataSecurityTitle: "Datensicherheit", encryptionAtRest: "Verschlüsselung im Ruhezustand:", encryptionAtRestDesc: "Alle Daten mit AES-256 verschlüsselt", encryptionInTransit: "Verschlüsselung bei Übertragung:", encryptionInTransitDesc: "TLS 1.3 für alle Verbindungen", tenantIsolation: "Mandantenisolierung:", tenantIsolationDesc: "Vollständige Datentrennung zwischen Konten", apiKeyManagement: "API-Schlüsselverwaltung", keyRotation: "Schlüsselrotation:", keyRotationDesc: "Schlüssel jederzeit vom Dashboard aus rotieren", keyExpiration: "Schlüsselablauf:", keyExpirationDesc: "Automatischer Ablauf nach 90 Tagen (konfigurierbar)", usageTracking: "Nutzungsverfolgung:", usageTrackingDesc: "Nutzung pro Schlüssel in Echtzeit überwachen", dataRetention: "Datenaufbewahrung & Löschung", export: "Export:", exportDesc: "Alle Daten jederzeit über API oder Dashboard exportieren", deletion: "Löschung:", deletionDesc: "Endgültige Löschung ohne Aufbewahrung nach 30 Tagen", compliance: "DSGVO/CCPA:", complianceDesc: "Volle Compliance mit Betroffenenrechten" },
      sdks: { title: "SDKs", python: "Python", javascript: "JavaScript" },
      footer: { copyright: "© {year} Seizn. Alle Rechte vorbehalten." }
    }
  }
};

// Copy remaining languages with English fallback for non-translated languages
const fallbackLangs = ['ru', 'uk', 'he', 'ar', 'sv', 'nl', 'vi', 'pl', 'pt-BR', 'pt-PT'];

// Read English docs as base for fallback
const enDocs = {
  docs: {
    nav: { dashboard: "Dashboard", getStarted: "Get Started" },
    sidebar: { gettingStarted: "Getting Started", quickStart: "Quick Start", authentication: "Authentication", apiReference: "API Reference", endpoints: "Endpoints", rateLimits: "Rate Limits", errorCodes: "Error Codes", resources: "Resources", security: "Security", sdks: "SDKs" },
    hero: { title: "API Documentation", subtitle: "Everything you need to integrate Seizn into your applications. Add persistent memory to your AI with just a few lines of code." },
    quickStart: { title: "Quick Start", description: "Get your API key from the", dashboardLink: "dashboard", then: ", then start making requests:" },
    authentication: { title: "Authentication", description: "All API requests require an API key passed in the", header: "x-api-key", headerSuffix: "header.", securityTitle: "Security:", securityText: "Keep your API keys secret. Never expose them in client-side code. Use environment variables or a backend proxy." },
    endpoints: { title: "API Endpoints", requestBody: "Request Body", queryParams: "Query Parameters", response: "Response", postMemories: { description: "Add a new memory to the user's memory store." }, getMemories: { description: "Search memories using semantic similarity." }, deleteMemories: { description: "Delete memories by their IDs." }, extract: { description: "Extract and store memories from a conversation using AI." }, query: { description: "Get AI-generated responses using relevant memories as context (RAG)." } },
    rateLimits: { title: "Rate Limits", plan: "Plan", dailyApiCalls: "Daily API Calls", maxMemories: "Max Memories", apiKeys: "API Keys", free: "Free", plus: "Plus", pro: "Pro", enterprise: "Enterprise", unlimited: "Unlimited", exceeded: "When you exceed your rate limit, the API returns a", response: "response." },
    errors: { title: "Error Codes", code: "Code", description: "Description", success: "Success", badRequest: "Bad Request - Missing or invalid parameters", unauthorized: "Unauthorized - Invalid or missing API key", tooManyRequests: "Too Many Requests - Rate limit exceeded", serverError: "Internal Server Error - Something went wrong" },
    security: { title: "Security & Governance", dataSecurityTitle: "Data Security", encryptionAtRest: "Encryption at rest:", encryptionAtRestDesc: "All data encrypted with AES-256", encryptionInTransit: "Encryption in transit:", encryptionInTransitDesc: "TLS 1.3 for all connections", tenantIsolation: "Tenant isolation:", tenantIsolationDesc: "Complete data separation between accounts", apiKeyManagement: "API Key Management", keyRotation: "Key rotation:", keyRotationDesc: "Rotate keys anytime from the dashboard", keyExpiration: "Key expiration:", keyExpirationDesc: "Auto-expire keys after 90 days (configurable)", usageTracking: "Usage tracking:", usageTrackingDesc: "Monitor per-key usage in real-time", dataRetention: "Data Retention & Deletion", export: "Export:", exportDesc: "Export all your data anytime via API or dashboard", deletion: "Deletion:", deletionDesc: "Hard delete with no retention after 30 days", compliance: "GDPR/CCPA:", complianceDesc: "Full compliance with data subject rights" },
    sdks: { title: "SDKs", python: "Python", javascript: "JavaScript" },
    footer: { copyright: "© {year} Seizn. All rights reserved." }
  }
};

fallbackLangs.forEach(lang => {
  translations[lang] = enDocs;
});

// Update all dictionary files
const dictPath = path.join(__dirname, '../src/i18n/dictionaries');

Object.entries(translations).forEach(([lang, content]) => {
  const filePath = path.join(dictPath, `${lang}.json`);
  try {
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const merged = { ...existing, ...content };
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
    console.log(`Updated ${lang}.json`);
  } catch (err) {
    console.error(`Error updating ${lang}.json:`, err.message);
  }
});

console.log('Done!');
