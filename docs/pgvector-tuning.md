# pgvector HNSW Tuning Guide

> Spring Memory v4 벡터 검색 최적화 가이드

## 개요

이 문서는 Seizn의 Spring Memory 시스템에서 pgvector HNSW 인덱스를 최적화하는 방법을 설명합니다.

## HNSW vs IVFFlat

| 특성 | HNSW | IVFFlat |
|------|------|---------|
| 빌드 시간 | 느림 | 빠름 |
| 쿼리 속도 | 빠름 | 보통 |
| Recall | 높음 | 보통 |
| 동적 삽입 | 좋음 | 재학습 필요 |
| 메모리 사용량 | 높음 | 낮음 |

**결론**: 실시간 쿼리와 동적 삽입이 많은 Memory 시스템에는 HNSW가 적합합니다.

## HNSW 파라미터

### 인덱스 생성 시 (고정)

```sql
CREATE INDEX idx_spring_notes_embedding_hnsw
  ON spring_memory_notes
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 24, ef_construction = 100)
  WHERE status = 'active' AND embedding IS NOT NULL;
```

| 파라미터 | 기본값 | 권장값 | 설명 |
|---------|--------|--------|------|
| `m` | 16 | 24 | 노드당 연결 수 (높을수록 recall↑, 메모리↑) |
| `ef_construction` | 64 | 100 | 빌드 품질 (높을수록 품질↑, 빌드 시간↑) |

### 쿼리 시 (동적)

```sql
-- 세션 레벨 설정
SET hnsw.ef_search = 100;

-- 함수 내 설정
PERFORM set_config('hnsw.ef_search', '100', true);
```

| 파라미터 | 범위 | 기본값 | 설명 |
|---------|------|--------|------|
| `ef_search` | 16-400 | 100 | 검색 품질 (높을수록 recall↑, 속도↓) |

## ef_search 튜닝 가이드

### Recall Mode별 권장값

```typescript
const HNSW_PRESETS = {
  fast: {
    efSearch: 40,
    oversampleFactor: 2,
    useIterativeScan: false,
  },
  balanced: {
    efSearch: 100,
    oversampleFactor: 3,
    useIterativeScan: true,
  },
  high_recall: {
    efSearch: 200,
    oversampleFactor: 5,
    useIterativeScan: true,
  },
};
```

### 동적 계산 공식

```typescript
function calculateEfSearch(
  topK: number,
  vectorCount: number,
  hasFilters: boolean,
  recallMode: RecallMode
): number {
  // Base: 4x topK minimum
  let efSearch = Math.max(40, topK * 4);

  // 컬렉션 크기 조정
  if (vectorCount > 100000) {
    efSearch = Math.round(efSearch * 1.5);
  } else if (vectorCount > 10000) {
    efSearch = Math.round(efSearch * 1.25);
  }

  // 필터 사용 시 더 많은 후보 필요
  if (hasFilters) {
    efSearch = Math.round(efSearch * 1.5);
  }

  // 모드 배율 적용
  const multipliers = { fast: 0.6, balanced: 1.0, high_recall: 2.0 };
  efSearch = Math.round(efSearch * multipliers[recallMode]);

  return Math.max(16, Math.min(400, efSearch));
}
```

## Iterative Scan (pgvector 0.8.0+)

### 활성화 조건

- pgvector 버전 0.8.0 이상
- 필터가 있는 쿼리
- HNSW 인덱스 사용

### 설정 방법

```sql
-- relaxed_order: 정확한 순서 보장 안함 (빠름)
SET hnsw.iterative_scan = 'relaxed_order';

-- strict_order: 정확한 순서 보장 (느림)
SET hnsw.iterative_scan = 'strict_order';
```

### 사용 예시

```sql
-- 필터가 있는 쿼리에서 자동 활성화
SELECT id, content, 1 - (embedding <=> query_embedding) AS similarity
FROM spring_memory_notes
WHERE user_id = 'user-123'
  AND scope = 'user'
  AND note_type = 'fact'
ORDER BY embedding <=> query_embedding
LIMIT 10;
```

## 2-Stage Query Pattern

필터가 있는 벡터 검색에서 recall을 높이기 위한 패턴입니다.

### 원리

1. **Stage 1 (Oversample)**: 필터 없이 더 많은 후보 검색 (3-5x topK)
2. **Stage 2 (Filter)**: 결과에 필터 적용 후 최종 topK 반환

### SQL 구현

```sql
WITH oversample AS (
  -- Stage 1: 느슨한 필터로 오버샘플링
  SELECT id, content, 1 - (embedding <=> query_embedding) AS similarity
  FROM spring_memory_notes
  WHERE user_id = p_user_id
    AND status = 'active'
    AND embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT p_limit * 3  -- 3x 오버샘플
)
-- Stage 2: 엄격한 필터 적용
SELECT *
FROM oversample
WHERE (p_scope IS NULL OR scope = p_scope)
  AND (p_note_type IS NULL OR note_type = p_note_type)
ORDER BY similarity DESC
LIMIT p_limit;
```

### TypeScript 구현

```typescript
const hnswConfig = await this.getHNSWConfig(userId, topK, filters, recallMode);

const { data } = await supabase.rpc('search_spring_memory_notes_v4', {
  p_user_id: userId,
  p_query_embedding: embedding,
  p_match_count: topK,
  p_ef_search: hnswConfig.efSearch,
  p_oversample_factor: hnswConfig.oversampleFactor,
  p_use_iterative_scan: hnswConfig.useIterativeScan,
});
```

## 모니터링

### 인덱스 상태 확인

```sql
SELECT * FROM spring_hnsw_index_health;
```

| 컬럼 | 설명 |
|------|------|
| `index_name` | 인덱스 이름 |
| `status` | healthy, needs_vacuum, unused |
| `index_size` | 인덱스 크기 |
| `total_scans` | 총 스캔 횟수 |
| `fetch_efficiency_pct` | 페치 효율 (높을수록 좋음) |

### 검색 통계 수집

```sql
INSERT INTO spring_vector_search_stats (
  user_id, query_type, ef_search, top_k,
  had_scope_filter, results_count, avg_similarity,
  execution_time_ms, used_iterative_scan
) VALUES (...);
```

### 분석 쿼리

```sql
-- 평균 검색 시간 by ef_search
SELECT ef_search, AVG(execution_time_ms) as avg_time
FROM spring_vector_search_stats
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY ef_search
ORDER BY ef_search;

-- 필터 사용 시 성능 비교
SELECT
  used_iterative_scan,
  AVG(results_count) as avg_results,
  AVG(execution_time_ms) as avg_time
FROM spring_vector_search_stats
WHERE had_scope_filter = true
GROUP BY used_iterative_scan;
```

## 트러블슈팅

### 낮은 Recall

1. ef_search 증가 (100 → 200)
2. Oversample factor 증가 (3 → 5)
3. m 값 높은 인덱스 재생성 (16 → 24)

### 느린 쿼리

1. ef_search 감소 (100 → 60)
2. 필터 순서 최적화 (선택성 높은 필터 먼저)
3. Partial index 활용

### 메모리 부족

1. m 값 감소 (24 → 16)
2. Partial index로 인덱스 크기 축소
3. 오래된 메모리 아카이브

## 마이그레이션 파일

관련 SQL 마이그레이션:

- `20260205_spring_memory_hnsw_optimization.sql` - HNSW 인덱스 생성
- `20260205_spring_memory_search_v4_fix.sql` - 검색 함수 최적화

## API 사용 예시

### TypeScript

```typescript
import { createSearchServiceV3, type RecallMode } from '@/lib/spring/memory-v4';

const searchService = createSearchServiceV3(supabase);

// 기본 검색 (balanced mode)
const results = await searchService.search(userId, {
  query: 'AI 프로젝트 관련 메모리',
  topK: 10,
});

// 고정밀 검색 (high_recall mode)
const preciseResults = await searchService.search(userId, {
  query: 'AI 프로젝트 관련 메모리',
  topK: 10,
  recallMode: 'high_recall',
  filters: {
    types: ['fact', 'procedure'],
    namespace: 'work',
  },
});

// 그래프 확장 검색
const expandedResults = await searchService.searchWithGraphExpansion(userId, 'AI 프로젝트', {
  limit: 10,
  expandHops: 2,
  edgeTypes: ['relates_to', 'supports'],
});
```

### SQL (직접 호출)

```sql
-- 기본 검색
SELECT * FROM search_spring_memory_notes_v4(
  p_query_embedding := $1,
  p_user_id := 'user-123',
  p_match_count := 10,
  p_ef_search := 100
);

-- 통합 검색 (옵션 JSONB)
SELECT * FROM search_spring_memories_unified(
  p_user_id := 'user-123',
  p_query_embedding := $1,
  p_options := '{"scope": "work", "limit": 10, "mode": "hybrid"}'::jsonb
);
```

## 참고 자료

- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [HNSW Paper](https://arxiv.org/abs/1603.09320)
- [Supabase Vector Docs](https://supabase.com/docs/guides/ai/vector-columns)
