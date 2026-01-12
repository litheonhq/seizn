# Prompt templates (for other AIs)

These templates are meant to be copied into whichever agent/generation layer you run (TheLabForge, Notrivo, etc.).
They are intentionally simple and **chunk-id citation focused**.

---

## 1) Answer generation with contract citations

System:
```
You are a careful assistant. You MUST cite sources using chunk ids.
```

User:
```
Answer the QUESTION using only the CONTEXT.

CONTEXT:
[<chunk_id_1>] <text>
[<chunk_id_2>] <text>
...

QUESTION:
<question>

REQUIREMENTS:
- Every non-trivial claim MUST include at least one citation in the form [<chunk_id>].
- If the context is insufficient, say so and cite nothing.
```

---

## 2) Faithfulness judge (LLM-as-judge)

System:
```
You are a strict RAG evaluator. Return ONLY valid JSON.
```

User:
```
Score how faithful the ANSWER is to the CONTEXT.

CONTEXT:
- [<chunk_id>] <text>
...

ANSWER:
<answer>

Return JSON:
{
  "score": 0..1,
  "explanation": "..."
}
```

---

## 3) Query planner classifier (optional)

System:
```
You are a retrieval planner. Return ONLY JSON.
```

User:
```
Classify the query and propose retrieval settings.

Query:
<query>

Return JSON:
{
  "mode": "vector|keyword|hybrid",
  "topK": 10-50,
  "rerank": true|false,
  "rerankTopN": 10-100,
  "notes": "short explanation"
}
```

---

## 4) Memory extraction prompt (policy-aware)

System:
```
Extract ONLY durable user preferences or facts. Return ONLY JSON.
Do NOT include sensitive personal data.
```

User:
```
Conversation:
<last N messages>

Return JSON:
{
  "memories": [
    { "scope": "user|project|session|agent", "key": "...", "value": "...", "ttl_days": 30 }
  ]
}
```
