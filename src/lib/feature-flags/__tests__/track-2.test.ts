import { describe, expect, it } from 'vitest';
import { TRACK_2_DISABLED_PROBLEM, isTrack2ApiEnabled } from '../track-2';

describe('isTrack2ApiEnabled', () => {
  it('defaults to false when the env is missing', () => {
    expect(isTrack2ApiEnabled({})).toBe(false);
  });

  it('is true for case-insensitive truthy strings', () => {
    expect(isTrack2ApiEnabled({ TRACK_2_API_ENABLED: 'true' })).toBe(true);
    expect(isTrack2ApiEnabled({ TRACK_2_API_ENABLED: 'TRUE' })).toBe(true);
    expect(isTrack2ApiEnabled({ TRACK_2_API_ENABLED: '1' })).toBe(true);
    expect(isTrack2ApiEnabled({ TRACK_2_API_ENABLED: 'yes' })).toBe(true);
  });

  it('is false for any other value', () => {
    expect(isTrack2ApiEnabled({ TRACK_2_API_ENABLED: 'false' })).toBe(false);
    expect(isTrack2ApiEnabled({ TRACK_2_API_ENABLED: '0' })).toBe(false);
    expect(isTrack2ApiEnabled({ TRACK_2_API_ENABLED: '' })).toBe(false);
    expect(isTrack2ApiEnabled({ TRACK_2_API_ENABLED: 'maybe' })).toBe(false);
  });
});

describe('TRACK_2_DISABLED_PROBLEM', () => {
  it('matches the RFC 7807 contract used by the middleware', () => {
    expect(TRACK_2_DISABLED_PROBLEM.status).toBe(503);
    expect(TRACK_2_DISABLED_PROBLEM.code).toBe('feature_disabled');
    expect(TRACK_2_DISABLED_PROBLEM.type).toMatch(/^https:\/\//);
  });
});
