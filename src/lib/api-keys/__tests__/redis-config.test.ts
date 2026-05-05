import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  TRACK_2_REDIS_PRODUCTION_ERROR,
  assertTrack2RedisConfiguredForProduction,
} from '../redis-config';

describe('Track 2 Redis production startup guard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when NODE_ENV=production and both UPSTASH vars missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(() => assertTrack2RedisConfiguredForProduction()).toThrow(
      TRACK_2_REDIS_PRODUCTION_ERROR,
    );
  });

  it('throws when NODE_ENV=production and UPSTASH_REDIS_REST_URL missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.UPSTASH_REDIS_REST_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    expect(() => assertTrack2RedisConfiguredForProduction()).toThrow();
  });

  it('throws when NODE_ENV=production and UPSTASH_REDIS_REST_TOKEN missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(() => assertTrack2RedisConfiguredForProduction()).toThrow();
  });

  it('throws when UPSTASH vars are empty strings (PowerShell $env:VAR= syntax)', () => {
    process.env.NODE_ENV = 'production';
    process.env.UPSTASH_REDIS_REST_URL = '';
    process.env.UPSTASH_REDIS_REST_TOKEN = '';
    expect(() => assertTrack2RedisConfiguredForProduction()).toThrow();
  });

  it('does not throw when NODE_ENV=development regardless of UPSTASH vars', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(() => assertTrack2RedisConfiguredForProduction()).not.toThrow();
  });

  it('does not throw when NODE_ENV=test regardless of UPSTASH vars', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(() => assertTrack2RedisConfiguredForProduction()).not.toThrow();
  });

  it('does not throw when NODE_ENV=production and both UPSTASH vars present', () => {
    process.env.NODE_ENV = 'production';
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    expect(() => assertTrack2RedisConfiguredForProduction()).not.toThrow();
  });
});
