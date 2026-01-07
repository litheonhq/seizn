# Seizn - AI Memory Server

## 프로젝트 개요
- **브랜드명**: Seizn (시즌)
- **슬로건**: "Seize your memories"
- **도메인**: seizn.com
- **설명**: mem0 스타일 AI 메모리 SaaS 서비스

## 기술 스택
- **Frontend**: Next.js 15, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (서버리스)
- **Database**: Neon (PostgreSQL + pgvector)
- **Cache**: Upstash Redis
- **Auth**: NextAuth.js
- **LLM**: Claude Haiku/Sonnet (메모리 추출)
- **Embedding**: Voyage AI

## 타겟 시장
- 한국, 영어권, 일본 (3개국)

## 가격 정책
| 플랜 | 가격 | AI 엔진 | 메모리 | API 호출 |
|-----|------|---------|--------|---------|
| Free | $0 | Haiku | 10,000 | 1,000/월 |
| Plus | $7 | Sonnet | 50,000 | 10,000/월 |
| Pro | $19 | Sonnet | 200,000 | 50,000/월 |
| Enterprise | 문의 | Sonnet+Opus | 무제한 | 무제한 |

## 폴더 구조
```
src/
├── app/              # Next.js App Router
│   ├── api/          # API Routes
│   ├── (auth)/       # 인증 관련 페이지
│   ├── (dashboard)/  # 대시보드
│   └── (marketing)/  # 랜딩/마케팅 페이지
├── components/       # React 컴포넌트
│   ├── ui/           # 기본 UI 컴포넌트
│   └── features/     # 기능별 컴포넌트
├── lib/              # 유틸리티 함수
├── hooks/            # Custom React Hooks
├── types/            # TypeScript 타입
└── styles/           # 글로벌 스타일
```

## 환경 변수
- `.env.local` 파일 참조
- 절대 커밋하지 말 것

## 개발 명령어
```bash
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run start    # 프로덕션 서버
npm run lint     # ESLint 검사
```

## 참고 문서
- 기획/조사: `C:\Users\admin\Dendron\notes\사업\기타-프로젝트\AI-Memory-Server-Research.md`
