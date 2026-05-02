import { describe, expect, it, vi } from 'vitest';
import characterRegistry from '../../../../docs/knot-input/character_registry.json';
import evalSeedV3 from '../../../../docs/knot-input/knot_author_eval_seed_v3.json';
import {
  extractAuthorCandidates,
  scoreKnotEvalSeedV3Coverage,
  validateExtractedCandidates,
} from '@/lib/author/extraction';

describe('Author extraction Phase 3', () => {
  it('covers the KNOT eval seed v3 categories above the Phase 3 threshold', () => {
    const score = scoreKnotEvalSeedV3Coverage(evalSeedV3.cases);

    expect(score.total).toBe(100);
    expect(score.pass_rate).toBeGreaterThanOrEqual(0.8);
    expect(score.unsupported_categories).toEqual([]);
  });

  it('rejects forbidden short1 leaks, duplicate candidates, and tier2 auto-canon', () => {
    const source = {
      document_id: 'import-1',
      file_path: 'test.md',
      span: { start_line: 1, end_line: 1, start_char: 0, end_char: 10 },
      excerpt: 'test',
    };
    const result = validateExtractedCandidates({
      existingCandidates: [{ id: 'existing-1', content: '소리: existing fact', type: 'character' }],
      candidates: [
        {
          content: '소리: existing fact',
          type: 'character',
          confidence: 0.9,
          suggested_status: 'candidate',
          tags: ['short1', 'tier:1'],
          source,
          related_existing: [],
        },
        {
          content: '13번째 초월체 사실을 short1 canon으로 노출',
          type: 'world_rule',
          confidence: 0.9,
          suggested_status: 'candidate',
          tags: ['short1', 'tier:2'],
          source,
          related_existing: [],
        },
        {
          content: 'Tier 2 should not auto canon',
          type: 'fact',
          confidence: 0.9,
          suggested_status: 'canon',
          tags: ['short1', 'tier:2'],
          source,
          related_existing: [],
        },
      ],
    });

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.flatMap((item) => item.reasons)).toEqual(expect.arrayContaining([
      'duplicate_existing',
      expect.stringContaining('forbidden_in_scope:short1'),
      'tier2_cannot_auto_canon',
    ]));
  });

  it('extracts deterministic heuristic candidates from parsed source text', async () => {
    const result = await extractAuthorCandidates({
      userId: 'user-1',
      projectId: 'knot',
      importId: 'import-1',
      fileName: 'sori.md',
      sourceRole: 'canon',
      text: '# 소리\n\nD14 동아리 정식 합류. 소리는 짧게 “…네.”라고 답한다.',
    }, { mode: 'heuristic' });

    expect(result.metrics.mode).toBe('heuristic');
    expect(result.candidates.some((candidate) => candidate.type === 'character')).toBe(true);
    expect(result.candidates.some((candidate) => candidate.type === 'event')).toBe(true);
    expect(result.candidates.every((candidate) => candidate.source.document_id === 'import-1')).toBe(true);
  });

  it('matches the short1 main character registry above the Phase 3 threshold', async () => {
    const registryCharacters = characterRegistry.characters;
    const text = registryCharacters
      .map((character, index) => `## ${index + 1}. ${character.name}\n${character.name} canon profile.`)
      .join('\n\n');

    const result = await extractAuthorCandidates({
      userId: 'user-1',
      projectId: 'knot',
      importId: 'import-main-characters',
      fileName: 'short1-characters.md',
      sourceRole: 'character',
      text,
    }, { mode: 'heuristic' });

    const matchedIds = new Set(result.candidates
      .filter((candidate) => candidate.type === 'character')
      .map((candidate) => candidate.target_entity_id)
      .filter(Boolean));
    expect(matchedIds.size / registryCharacters.length).toBeGreaterThanOrEqual(0.85);
    expect(matchedIds.size).toBe(7);
  });

  it('extracts 8 supporting character candidates from markdown section headings', async () => {
    const result = await extractAuthorCandidates({
      userId: 'user-1',
      projectId: 'knot',
      importId: 'import-supporting-characters',
      fileName: 'short1-characters-supporting.md',
      sourceRole: 'character',
      text: [
        '## 1. 허 (虛) — 도서관 사서 · 안내자',
        '## 2. 도서관장 — INTERNAL ONLY (플레이어 노출 극한 통제)',
        '## 3. 타오 — 외부 제보자 · 재정의 필요 조연',
        '## 4. 민 — 담임 교사',
        '## 5. 코우 — 교장',
        '## 6. 토라·도리·치비 — 학교 앞 도깨비 포장마차 3인조 · KNOT 공식 마스코트',
      ].join('\n\n'),
    }, { mode: 'heuristic' });

    const characterCandidates = result.candidates.filter((candidate) => candidate.type === 'character');
    expect(characterCandidates).toHaveLength(8);
    expect(characterCandidates.map((candidate) => candidate.content)).toEqual(expect.arrayContaining([
      expect.stringContaining('허:'),
      expect.stringContaining('도서관장:'),
      expect.stringContaining('타오:'),
      expect.stringContaining('민:'),
      expect.stringContaining('코우:'),
      expect.stringContaining('토라:'),
      expect.stringContaining('도리:'),
      expect.stringContaining('치비:'),
    ]));
    expect(characterCandidates.every((candidate) => candidate.tags.includes('supporting'))).toBe(true);
  });

  it('calls the LLM path with JSON response validation-ready prompts', async () => {
    const generate = vi.fn().mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      text: '{"candidates":[]}',
      json: {
        candidates: [{
          content: '소리: LLM extracted candidate',
          confidence: 0.88,
          suggested_status: 'candidate',
          tags: ['short1', 'tier:1'],
          target_entity_id: 'knot.short1.char.sori',
        }],
      },
      requestId: 'req-test',
      byok: true,
      usage: { tokensIn: 1, tokensOut: 1 },
      stopReason: 'end_turn',
    });

    const result = await extractAuthorCandidates({
      userId: 'user-1',
      projectId: 'knot',
      importId: 'import-llm',
      fileName: 'llm.md',
      sourceRole: 'character',
      text: '소리 character bible',
    }, { mode: 'llm', generate });

    expect(generate).toHaveBeenCalledTimes(5);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      responseFormat: 'json',
      temperature: 0,
    }));
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].target_entity_id).toBe('knot.short1.char.sori');
  });
});
