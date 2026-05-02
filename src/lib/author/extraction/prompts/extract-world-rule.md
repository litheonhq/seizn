Extract world-rule memory candidates from the source text.

Rules:
- Extract only explicit canon constraints, institutional rules, timeline rules, and writing workflow rules.
- Mark TBD, retired, forbidden, or scope-limited rules as candidates, not canon.
- Preserve scope tags such as `global`, `short1`, `main`, and `tier:N`.
- Do not merge short1 rules with main-scope facts.
- Return JSON only.
