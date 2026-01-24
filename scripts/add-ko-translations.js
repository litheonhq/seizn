const fs = require('fs');
const path = 'src/i18n/dictionaries/ko.json';
const data = JSON.parse(fs.readFileSync(path, 'utf-8'));

// Add limits section
data.limits = {
  title: "한도 및 요금",
  subtitle: "플랜 한도, 할당량, 결제 정보를 확인하세요.",
  unlimited: "무제한",
  custom: "맞춤형",
  requestsPerSecond: "초당 요청",
  sidebar: {
    onThisPage: "이 페이지에서",
    quotas: "월간 할당량",
    rateLimits: "요청 제한",
    overage: "초과 시 동작",
    reset: "재설정 시간",
    headers: "응답 헤더"
  },
  table: {
    plan: "플랜",
    monthlyQuota: "월간 할당량",
    rps: "RPS 제한"
  },
  plans: {
    free: { name: "Free", overage: "제한 후 소프트 쓰로틀링" },
    plus: { name: "Plus", overage: "소프트 쓰로틀링, 이메일 알림" },
    pro: { name: "Pro", overage: "소프트 쓰로틀링, 우선 큐" },
    enterprise: { name: "Enterprise", overage: "맞춤 SLA, 쓰로틀링 없음" }
  },
  quotas: {
    title: "월간 할당량",
    description: "각 플랜에는 월간 API 호출 할당량이 포함됩니다. 할당량은 매월 1일 00:00 UTC에 재설정됩니다."
  },
  rateLimit: {
    title: "요청 제한 (RPS)",
    description: "요청 제한은 인프라를 보호하고 공정한 사용을 보장합니다. 제한은 API 키별로 적용됩니다."
  },
  overage: {
    title: "초과 시 동작",
    softThrottle: {
      title: "소프트 쓰로틀링 (할당량 초과)",
      description: "월간 할당량을 초과하면:",
      point1: "API 호출은 낮은 우선순위로 계속 처리",
      point2: "응답 시간이 2-5배 증가할 수 있음",
      point3: "80% 및 100% 사용 시 이메일 알림"
    },
    hard429: {
      title: "하드 429 (요청 제한)",
      description: "RPS 제한을 초과하면:",
      recommendation: "지수 백오프 (1초, 2초, 4초, 8초)와 지터를 사용하여 재시도하세요."
    }
  },
  reset: {
    title: "재설정 시간",
    monthly: {
      title: "월간 할당량 재설정",
      description: "할당량은 매월 첫날에 재설정됩니다.",
      time: "매월 1일, 00:00 UTC"
    },
    rateLimit: {
      title: "요청 제한 창",
      description: "요청 제한은 슬라이딩 창을 사용합니다.",
      time: "롤링 1초 창"
    }
  },
  headers: {
    limit: "창당 허용되는 최대 요청 수",
    remaining: "현재 창에서 남은 요청 수",
    reset: "창이 재설정되는 Unix 타임스탬프",
    quotaLimit: "월간 할당량 제한",
    quotaRemaining: "이번 달 남은 API 호출 수",
    quotaReset: "할당량이 재설정되는 ISO 8601 날짜"
  },
  headersSection: {
    title: "응답 헤더",
    description: "모든 API 응답에는 사용량과 제한을 추적할 수 있는 헤더가 포함됩니다.",
    header: "헤더",
    headerDescription: "설명",
    example: "예시 응답 헤더:"
  },
  upgrade: {
    title: "더 높은 제한이 필요하세요?",
    description: "플랜을 업그레이드하여 할당량 증가, 더 높은 요청 제한, 우선 지원을 받으세요.",
    viewPlans: "플랜 보기",
    contactSales: "영업팀 문의"
  }
};

// Add help section
data.help = {
  title: "도움말 허브",
  subtitle: "답변을 찾고, 지원을 받고, 리소스에 접근하세요.",
  search: { placeholder: "도움말 검색...", noResults: "결과를 찾을 수 없습니다" },
  sections: {
    support: {
      title: "지원 채널",
      description: "팀으로부터 도움을 받으세요",
      email: { title: "이메일 지원", description: "24시간 이내 이메일로 도움 받기", action: "support@seizn.com" },
      discord: { title: "Discord 커뮤니티", description: "실시간 도움을 위한 커뮤니티 참여", action: "Discord 참여" },
      github: { title: "GitHub Issues", description: "버그 신고 및 기능 요청", action: "이슈 열기" }
    },
    faq: { title: "자주 묻는 질문", description: "일반적인 질문에 대한 빠른 답변", viewAll: "모든 FAQ 보기" },
    status: {
      title: "시스템 상태",
      description: "현재 시스템 상태 및 인시던트 확인",
      viewStatus: "상태 페이지 보기",
      operational: "모든 시스템 정상",
      degraded: "성능 저하",
      outage: "서비스 중단"
    },
    billing: {
      title: "결제 및 플랜",
      description: "구독 및 결제 관리",
      items: { plans: "요금제 보기", usage: "사용량 확인", invoices: "영수증 다운로드", upgrade: "플랜 업그레이드" }
    },
    docs: {
      title: "문서",
      description: "인기 문서 바로가기",
      links: { quickstart: "빠른 시작 가이드", apiReference: "API 레퍼런스", sdks: "SDK 및 라이브러리", limits: "한도 및 요금", security: "보안" }
    }
  },
  contact: { title: "여전히 도움이 필요하세요?", description: "지원팀이 성공을 도와드립니다.", cta: "지원 문의" }
};

// Add status section
data.status = {
  title: "시스템 상태",
  subtitle: "실시간 시스템 상태 및 인시던트 기록",
  lastUpdated: "마지막 업데이트",
  overall: {
    operational: "모든 시스템 정상",
    degraded: "성능 저하",
    partialOutage: "부분 시스템 장애",
    majorOutage: "주요 시스템 장애"
  },
  uptime: { title: "가동 시간", "24h": "24시간", "7d": "7일", "30d": "30일", "90d": "90일" },
  services: { title: "서비스 상태", operational: "정상", degraded: "저하", down: "중단" },
  incidents: {
    active: "활성 인시던트",
    history: "인시던트 기록",
    noActive: "활성 인시던트 없음",
    noHistory: "과거 인시던트 없음",
    status: { investigating: "조사 중", identified: "원인 파악", monitoring: "모니터링 중", resolved: "해결됨" },
    severity: { minor: "경미", major: "주요", critical: "심각" },
    affected: "영향받은 서비스",
    timeline: "타임라인",
    started: "시작",
    resolved: "해결",
    duration: "지속 시간",
    viewDetails: "상세 보기"
  },
  subscribe: { title: "업데이트 구독", rss: "RSS 피드", email: "이메일 알림" }
};

fs.writeFileSync(path, JSON.stringify(data, null, 2));
console.log('Updated ko.json');
