export class ApiKeyError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400
  ) {
    super(message);
    this.name = 'ApiKeyError';
  }
}

export class InvalidApiKeyError extends ApiKeyError {
  constructor(message = 'Invalid or inactive API key') {
    super(message, 'invalid_api_key', 401);
    this.name = 'InvalidApiKeyError';
  }
}

export class ScopeDeniedError extends ApiKeyError {
  constructor(scope: string) {
    super(`API key is missing required scope: ${scope}`, 'scope_denied', 403);
    this.name = 'ScopeDeniedError';
  }
}

export class RateLimitExceededError extends ApiKeyError {
  constructor(readonly retryAfterSeconds: number) {
    super('API key rate limit exceeded', 'rate_limited', 429);
    this.name = 'RateLimitExceededError';
  }
}

export class QuotaExceededError extends ApiKeyError {
  constructor(readonly period: 'day' | 'month') {
    super(`API key ${period} quota exceeded`, 'quota_exceeded', 402);
    this.name = 'QuotaExceededError';
  }
}
