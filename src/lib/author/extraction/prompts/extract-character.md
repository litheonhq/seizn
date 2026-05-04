Extract character memory candidates from the source text.

Rules:
- Extract only explicit character identity, persona, voice, appearance, knowledge-state, and role evidence.
- Preserve scope and uncertainty. Use `candidate` unless the source is clearly authoritative.
- Do not infer author-only secrets from hints.
- Do not leak Tier 2 facts into short1 canon.
- Return JSON only.
