# Anti-Cliche Reference (condensed)

Distilled from PAI WriteStory `AntiCliche.md` (MIT — Daniel Miessler). See `LICENSE-attribution.md`.

Cliche is the first thing that comes to mind. Fresh prose requires going past the obvious to find the specific, the unexpected, the true.

## Banned categories

| Category | What it covers |
| --- | --- |
| `opening` | Movie-trailer voice-over openings, fairy-tale openings, "little did they know"-style POV breaks. |
| `emotional` | Dead-metaphor body responses ("chill ran down", "heart skipped a beat"). Replace with specific behavior. |
| `description` | Generic appearance shorthand ("piercing blue eyes", "chiseled features"). Replace with character-revealing specifics. |
| `action` | Vague chaos and tension shortcuts ("all hell broke loose", "with lightning speed"). Replace with concrete cause-and-effect. |
| `dialogue` | TV-drama and sitcom shorthand ("we need to talk", "it's not what it looks like"). Replace with what the character actually says. |
| `ai_specific` | **Highest priority.** AI-generated prose patterns ("a tapestry of", "the weight of", "navigate the complexities", "and so it was that"). |

## Freshness Rules

1. **Specificity.** If you could say it about any character in any story, replace it with something only this character would notice.
2. **Sensory replacement.** Emotional abstractions → physical specifics. The reader's brain reconstructs the emotion.
3. **Action over telling.** Characters reveal emotion through what they do, not what they feel.
4. **Comparison kill.** If a simile has appeared in more than 100 published books, find a new one tied to the story's specific world.
5. **Verb test.** Strong verbs beat adjective + weak verb.
6. **Dialogue voice.** Every character's dialogue should be identifiable without attribution.

## Programmatic audit

`auditText(text)` performs a deterministic literal-substring scan over the banned-phrase table (lower-cases input once, then `indexOf` per phrase — no dynamic regex, no ReDoS surface) and returns one `AntiClicheFinding` per match (category, reason, fresh-alternative pattern, index in source). Variants (pronouns, optional punctuation) are expanded into explicit entries. Use it as a cheap pre-screen before any LLM-based revision pass.
