# Seizn 다국어 + 지능형 메모리 확장 구현 계획

> 기반 문서: `Seizn_Multilingual_Intelligent_Memory_Tech_Expansion_Playbook.md`

---

## Phase 0: 프로젝트 전반 점검 (P0) ⏱️ 1-2일

### 0.1 코드 품질 및 구조 분석

**점검 항목**:
- [ ] TypeScript strict 모드 컴플라이언스 확인
- [ ] 미사용 imports/exports 정리
- [ ] 순환 의존성 검사
- [ ] 에러 핸들링 일관성 점검
- [ ] API 응답 형식 표준화 확인

**파일**: 전체 `src/lib/`, `src/app/api/`

### 0.2 UI/UX 컴포넌트 점검

**점검 항목**:
- [ ] 컴포넌트 접근성(A11y) 감사
- [ ] 반응형 레이아웃 테스트
- [ ] 다크/라이트 모드 일관성
- [ ] 로딩 상태 및 스켈레톤 검토
- [ ] 에러 바운더리 커버리지

**파일**: `src/components/`, `src/app/(dashboard)/`

### 0.3 성능 및 번들 분석

**점검 항목**:
- [ ] 번들 사이즈 최적화
- [ ] 코드 스플리팅 검토
- [ ] 이미지 최적화 확인
- [ ] API 응답 시간 벤치마크

---

## Phase 1: Language Pack 아키텍처 (P0) ⏱️ 3-5일

### 1.1 기본 인프라

**새 파일**: `src/lib/langpack/`
```
src/lib/langpack/
├── index.ts              # 메인 exports
├── types.ts              # 언어팩 타입 정의
├── detector.ts           # 언어 감지 (fastText LID)
├── normalizer.ts         # 유니코드 정규화 (NFKC)
├── tokenizer/
│   ├── base.ts           # 토크나이저 인터페이스
│   ├── latin.ts          # 라틴 계열 (EN, DE, FR 등)
│   ├── cjk.ts            # 중일한 (ZH, JA, KO)
│   ├── indic.ts          # 인도어 계열
│   └── cyrillic.ts       # 키릴 계열 (RU, UK)
├── embeddings/
│   ├── multilingual.ts   # 다국어 임베딩 전략
│   └── adapter.ts        # BGE-M3 / LaBSE 어댑터
└── registry.ts           # 언어팩 레지스트리
```

### 1.2 핵심 인터페이스

```typescript
// src/lib/langpack/types.ts
export interface LanguagePack {
  code: string;           // BCP-47 (en, hi, zh-Hans, uk)
  name: string;           // 표시명
  script: ScriptType;     // latin, devanagari, han, cyrillic

  // 처리 파이프라인
  normalize(text: string): string;
  tokenize(text: string): Token[];
  lemmatize?(tokens: Token[]): Token[];
  extractEntities?(text: string): Entity[];

  // 검색 지원
  getSearchTokens(text: string): string[];
  getPhoneticTokens?(text: string): string[];  // Pinyin, 로마자

  // 번역/변환
  toCanonical?(text: string): Promise<string>;  // → 영어
  convertScript?(text: string, target: ScriptType): string;
}

export type ScriptType =
  | 'latin'
  | 'devanagari'
  | 'han_simplified'
  | 'han_traditional'
  | 'cyrillic'
  | 'arabic'
  | 'hebrew';
```

### 1.3 언어 감지

**기술**: fastText LID (176+ 언어)
**대안**: 스크립트 휴리스틱 (짧은 입력용)

```typescript
// src/lib/langpack/detector.ts
export async function detectLanguage(text: string): Promise<{
  language: string;
  confidence: number;
  script: ScriptType;
}>;
```

---

## Phase 2: 영어(EN) 향상 (P1) ⏱️ 2-3일

### 2.1 WordNet 통합

**용도**: 동의어 확장, 의미 그래프, 중복 감지
**파일**: `src/lib/langpack/en/wordnet.ts`

```typescript
export interface WordNetService {
  getSynsets(word: string): Synset[];
  getSynonyms(word: string): string[];
  getHypernyms(word: string): string[];
  areSemanticallyRelated(word1: string, word2: string): boolean;
}
```

### 2.2 SymSpell 맞춤법 교정

**용도**: 쿼리 타임 교정, 퍼지 매칭
**파일**: `src/lib/langpack/en/spelling.ts`

```typescript
export interface SpellChecker {
  correct(text: string): string;
  suggest(word: string, maxDistance?: number): string[];
  addToDict(words: string[]): void;
}
```

### 2.3 spaCy/NER 통합

**용도**: 엔티티 추출, 레마타이제이션
**옵션**: Python 마이크로서비스 또는 WASM 포트

---

## Phase 3: 인도어(Indic) 지원 (P1) ⏱️ 3-4일

### 3.1 Indic NLP Library 통합

**기능**:
- 정규화 (ZWJ/ZWNJ, 구두점)
- 토큰화
- 스크립트 변환
- 로마자 변환 (Hinglish 검색)

**파일**: `src/lib/langpack/indic/`

### 3.2 IndicTrans2 번역

**용도**: 22개 인도 언어 ↔ 영어 번역
**구현**: Python 서비스 (GPU 권장)

```typescript
// API 인터페이스
POST /api/translate/indic
{
  text: string;
  sourceLang: string;  // hi, ta, bn, ...
  targetLang: string;  // en 또는 다른 인도 언어
}
```

### 3.3 AI4Bharat 음성 지원 (선택적)

**기능**:
- ASR (음성→텍스트)
- TTS (텍스트→음성)

**UX 이점**: 인도 시장에서 음성 우선 워크플로우 지원

### 3.4 IndoWordNet (pyiwn)

**용도**: 힌디어 동의어 확장, 중복 감지

---

## Phase 4: 중국어(ZH) 지원 (P1) ⏱️ 3-4일

### 4.1 jieba 단어 분할

**모드**: 검색 엔진 모드, 사용자 사전 지원
**파일**: `src/lib/langpack/zh/segmentation.ts`

```typescript
export interface ChineseSegmenter {
  segment(text: string): string[];
  addUserDict(words: string[]): void;
  enableSearchMode(): void;
}
```

### 4.2 OpenCC 간체/번체 변환

**기능**:
- 간체 ↔ 번체 변환
- 지역 변이 처리 (TW, HK, CN)

### 4.3 Pinyin 인덱스

**용도**: 발음 검색, IME 오타 허용
**파일**: `src/lib/langpack/zh/pinyin.ts`

### 4.4 PostgreSQL 전문 검색 (선택적)

**옵션**:
- `pg_jieba`: Postgres 중국어 FTS 확장
- `zhparser`: 대안 중국어 파서

**참고**: Supabase 제한 시 인제스트 타임 토큰화

### 4.5 Chinese WordNet

**용도**: 의미 사전, 동의어 확장

---

## Phase 5: 우크라이나어(UK) 지원 (P2) ⏱️ 2-3일

### 5.1 Stanza/UDPipe 파이프라인

**기능**:
- 토큰화
- 레마타이제이션
- POS 태깅
- 의존성 파싱

**파일**: `src/lib/langpack/uk/`

### 5.2 키릴-라틴 음역

**용도**: 관용적 검색 지원

### 5.3 Ukrainian WordNet (향후)

**참고**: Ukrajinet 프로젝트 모니터링

---

## Phase 6: 다국어 임베딩 전략 (P1) ⏱️ 2-3일

### 6.1 임베딩 모델 선택

| 모델 | 특징 | 용도 |
|------|------|------|
| **BGE-M3** | Dense/Sparse/Multi-vector | 주 검색 |
| **LaBSE** | 109개 언어, 문장 임베딩 | 대안 |
| **multilingual-E5** | 100개 언어, 높은 품질 | 대안 |

### 6.2 하이브리드 검색 구현

```typescript
// 3-레인 검색
interface MultilingualSearch {
  // 레인 1: 키워드 (언어팩 토큰화)
  keywordSearch(query: string, lang: string): SearchResult[];

  // 레인 2: 밀집 벡터 (다국어 임베딩)
  denseSearch(query: string): SearchResult[];

  // 레인 3: 희소/멀티벡터 (BGE-M3)
  sparseSearch(query: string): SearchResult[];

  // 통합
  hybridSearch(query: string, weights?: SearchWeights): SearchResult[];
}
```

---

## Phase 7: Cross-lingual 메모리 시스템 (P1) ⏱️ 3-4일

### 7.1 이중 표현 저장

**데이터 모델 확장**:
```sql
ALTER TABLE spring_memory_notes ADD COLUMN language VARCHAR(10);
ALTER TABLE spring_memory_notes ADD COLUMN content_canonical_en TEXT;
ALTER TABLE spring_memory_notes ADD COLUMN lex_tokens JSONB;
ALTER TABLE spring_memory_notes ADD COLUMN phonetic_tokens JSONB;
ALTER TABLE spring_memory_notes ADD COLUMN entity_mentions JSONB;
```

### 7.2 번역 서비스

**기술**: IndicTrans2 + NLLB (200개 언어)
**구현**: `src/lib/translation/`

```typescript
export interface TranslationService {
  translate(text: string, from: string, to: string): Promise<string>;
  toCanonicalEnglish(text: string, sourceLang: string): Promise<string>;
  detectAndTranslate(text: string): Promise<{
    original: string;
    translated: string;
    detectedLang: string;
  }>;
}
```

### 7.3 Cross-lingual 검색

**기능**: 영어 쿼리 → 힌디어 메모리 검색 가능

---

## Phase 8: Temporal KG 메모리 (P2) ⏱️ 2-3일

### 8.1 MindMap → 시간 그래프 확장

**새 컬럼**:
```sql
ALTER TABLE spring_memory_edges ADD COLUMN valid_from TIMESTAMPTZ;
ALTER TABLE spring_memory_edges ADD COLUMN valid_to TIMESTAMPTZ;
ALTER TABLE spring_memory_edges ADD COLUMN confidence FLOAT DEFAULT 1.0;
```

### 8.2 Context Block 구현

**Zep 스타일**: 관련 사실 + 유효성 타임스탬프

```typescript
interface ContextBlock {
  facts: Fact[];
  validAt: Date;
  entities: Entity[];
  relations: Relation[];
}
```

---

## Phase 9: "불공정 우위" 기능 (P2) ⏱️ 4-5일

### 9.1 "왜 기억됐나요?" 설명

**UI**: 추출 이유, 출처, 신뢰도, 수정 사항 표시
**파일**: `src/components/memory/MemoryExplanation.tsx`

### 9.2 Cross-script 검색

| 언어 | 지원 스크립트 |
|------|-------------|
| 중국어 | 간체 + 번체 + Pinyin |
| 인도어 | 데바나가리 + 로마자 |
| 우크라이나어 | 키릴 + 음역 |

### 9.3 Code-switch 메모리

**기능**: 혼합 언어 감지, 세그먼트별 태깅

### 9.4 음성 노트 인제스션

**워크플로우**: ASR → 메모리 추출 → MindMap

### 9.5 WordNet 의미 압축

**기능**: 동의어 메모리 병합, 출처 추적 유지

### 9.6 다국어 평가 대시보드

**메트릭**: 언어별 precision/recall, 지연 시간

---

## Phase 10: 통합 및 테스트 (P1) ⏱️ 3-4일

### 10.1 langpack-service 배포

**옵션**:
- Python 마이크로서비스 (FastAPI)
- Serverless 함수 (AWS Lambda / Vercel)

### 10.2 API 엔드포인트

```
POST /api/langpack/detect    - 언어 감지
POST /api/langpack/normalize - 텍스트 정규화
POST /api/langpack/tokenize  - 토큰화
POST /api/translate          - 번역
```

### 10.3 언어별 테스트 스위트

**파일**: `src/__tests__/langpack/`
- 영어 검색 테스트
- 힌디어 검색 테스트
- 중국어 검색 테스트
- 우크라이나어 검색 테스트
- Cross-lingual 검색 테스트

---

## 우선순위 요약

| Phase | 설명 | 우선순위 | 예상 시간 |
|-------|------|---------|----------|
| 0 | 프로젝트 점검 | P0 | 1-2일 |
| 1 | Language Pack 아키텍처 | P0 | 3-5일 |
| 2 | 영어 향상 | P1 | 2-3일 |
| 3 | 인도어 지원 | P1 | 3-4일 |
| 4 | 중국어 지원 | P1 | 3-4일 |
| 5 | 우크라이나어 지원 | P2 | 2-3일 |
| 6 | 다국어 임베딩 | P1 | 2-3일 |
| 7 | Cross-lingual 메모리 | P1 | 3-4일 |
| 8 | Temporal KG | P2 | 2-3일 |
| 9 | 차별화 기능 | P2 | 4-5일 |
| 10 | 통합 및 테스트 | P1 | 3-4일 |

**총 예상**: 28-40일 (4-6주)

---

## 기술 의존성 정리

### Python 패키지 (langpack-service)
```
fasttext           # 언어 감지
indic-nlp-library  # 인도어 처리
jieba              # 중국어 분할
opencc             # 간체/번체 변환
pypinyin           # Pinyin 변환
stanza             # 우크라이나어 NLP
nltk               # WordNet (영어)
pyiwn              # IndoWordNet
symspellpy         # 맞춤법 교정
```

### NPM 패키지
```
@xenova/transformers  # 브라우저 ML (선택적)
franc               # 경량 언어 감지 (대안)
```

### 외부 서비스
```
IndicTrans2         # 인도어 번역 (self-host)
NLLB                # 다국어 번역 (self-host)
BGE-M3              # 다국어 임베딩 (self-host)
```

---

## 성공 지표

1. **언어 감지 정확도**: 95%+ (짧은 텍스트 제외)
2. **Cross-lingual 검색 recall**: 80%+
3. **언어별 검색 precision**: 85%+
4. **번역 품질 BLEU**: 30+ (IndicTrans2)
5. **사용자 만족도**: 메모리 관련성 4.0+/5.0

---

*문서 생성일: 2026-02-05*
*기반: Seizn_Multilingual_Intelligent_Memory_Tech_Expansion_Playbook.md*
