import { describe, expect, it } from 'vitest';
import {
  calculateDialogueEntropy,
  extractActFromPayload,
  extractTraceIdFromPayload,
  summarizeReplayText,
} from './metrics';

describe('story health metrics helpers', () => {
  it('extracts explicit act identifiers before scene fallbacks', () => {
    expect(
      extractActFromPayload({
        scene: 'market prologue',
        metadata: { act_id: 'Act II' },
      })
    ).toBe('Act II');
  });

  it('uses scene-like metadata when act is not present', () => {
    expect(
      extractActFromPayload({
        request: { scenario: 'Harbor chase' },
      })
    ).toBe('Harbor chase');
  });

  it('extracts replay trace identifiers from nested payloads', () => {
    expect(
      extractTraceIdFromPayload({
        result: { replay_trace_id: '2a33d3b8-6a5d-4bb4-8f2d-1e7f4d3dce53' },
      })
    ).toBe('2a33d3b8-6a5d-4bb4-8f2d-1e7f4d3dce53');
  });

  it('computes dialogue diversity from unique bigrams', () => {
    const repetitive = calculateDialogueEntropy(['yes yes yes yes yes']);
    const varied = calculateDialogueEntropy(['north gate opens while rain hits the copper roof']);

    expect(varied).toBeGreaterThan(repetitive);
    expect(varied).toBeGreaterThan(0);
  });

  it('summarizes replay text without treating UUID-only values as dialogue', () => {
    const summary = summarizeReplayText({
      trace_id: '2a33d3b8-6a5d-4bb4-8f2d-1e7f4d3dce53',
      response: { content: 'The guard remembers the stolen lantern.' },
    });

    expect(summary).toContain('stolen lantern');
    expect(summary).not.toContain('2a33d3b8');
  });
});
