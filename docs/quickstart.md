# Seizn - 5분 Quickstart

AI 애플리케이션을 위한 메모리 레이어. 5분 안에 시작하세요.

## 설치

```bash
# Node.js
npm install @seizn/memory-sdk

# Python
pip install seizn
```

## API 키 설정

```bash
# 환경변수 (권장)
export SEIZN_API_KEY=szn_your_api_key

# Windows
set SEIZN_API_KEY=szn_your_api_key
```

## 첫 메모리 저장

### TypeScript

```typescript
import { SeiznClient } from '@seizn/memory-sdk';

const seizn = new SeiznClient({
  apiKey: process.env.SEIZN_API_KEY!,
});

// 간단하게
await seizn.save('사용자가 한국어를 선호함');

// 상세하게
await seizn.save({
  content: '다크 모드와 컴팩트 레이아웃을 선호함',
  memoryType: 'preference',
  tags: ['ui', 'settings'],
});
```

### Python

```python
from seizn import SeiznClient

seizn = SeiznClient(api_key="szn_your_api_key")

# 간단하게
seizn.save("사용자가 한국어를 선호함")

# 상세하게
seizn.save(
    content="다크 모드와 컴팩트 레이아웃을 선호함",
    memory_type="preference",
    tags=["ui", "settings"]
)
```

## 메모리 검색

### TypeScript

```typescript
// 간단하게
const memories = await seizn.search('사용자 선호');

// 상세하게
const memories = await seizn.search({
  query: 'UI 설정',
  limit: 5,
  threshold: 0.7,
});

memories.forEach(m => console.log(m.content));
```

### Python

```python
# 간단하게
memories = seizn.search("사용자 선호")

# 상세하게
memories = seizn.search(
    query="UI 설정",
    limit=5,
    threshold=0.7
)

for m in memories:
    print(m.content)
```

## 메모리 타입

| Type | 용도 |
|------|------|
| `fact` | 객관적 사실 (기본값) |
| `preference` | 사용자 선호 |
| `experience` | 경험, 이벤트 |
| `instruction` | 규칙, 지시사항 |
| `conversation` | 대화 컨텍스트 |

## 전체 예제

```typescript
import { SeiznClient } from '@seizn/memory-sdk';

const seizn = new SeiznClient({
  apiKey: process.env.SEIZN_API_KEY!,
  namespace: 'my-app',
});

// 저장
await seizn.save({
  content: '프로젝트 마감일: 2025년 3월 15일',
  memoryType: 'fact',
  tags: ['project', 'deadline'],
});

// 검색
const results = await seizn.search({
  query: '프로젝트 일정',
  limit: 10,
});

// 삭제
await seizn.delete(results[0].id);
```

## 다음 단계

- [Spring SDK (Memory Layer)](./spring-sdk-quickstart.md) - 상세 메모리 관리
- [Summer SDK (RAG)](./summer-sdk-quickstart.md) - 문서 검색 및 RAG
- [API Reference](./openapi.yaml) - 전체 API 문서
- [Dashboard](https://seizn.com/dashboard) - API 키 발급

## 지원

- Docs: https://docs.seizn.com
- GitHub: https://github.com/seizn/sdk/issues
- Discord: https://discord.gg/seizn
