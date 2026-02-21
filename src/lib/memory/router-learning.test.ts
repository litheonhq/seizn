import { describe, expect, it } from 'vitest';
import { classifyQueryBucket } from './router-learning';

describe('classifyQueryBucket', () => {
  it('classifies very short queries as short', () => {
    expect(classifyQueryBucket('api key')).toBe('short');
  });

  it('classifies question-like queries as question', () => {
    expect(classifyQueryBucket('what is my preferred language setting')).toBe('question');
  });

  it('classifies long queries as long', () => {
    expect(
      classifyQueryBucket(
        'Please analyze my recent memory search behavior and explain why the retrieval quality dropped over the last week in detail'
      )
    ).toBe('long');
  });
});
