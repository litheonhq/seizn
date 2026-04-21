export interface SeiznClientOptions {
  apiKey?: string;
  baseUrl?: string;
}

export interface SeiznRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
}

export class SeiznApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown
  ) {
    super(message);
    this.name = "SeiznApiError";
  }
}

function normalizeBaseUrl(value: string | undefined) {
  const raw = value?.trim() || "https://www.seizn.com";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

function extractErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
    const code = (error as Record<string, unknown>).code;
    if (typeof code === "string") return code;
  }
  return fallback;
}

export class SeiznApiClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(options: SeiznClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.SEIZN_API_KEY;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.SEIZN_API_URL);
  }

  async request<T = unknown>(path: string, options: SeiznRequestOptions = {}): Promise<T> {
    if (!this.apiKey) {
      throw new Error("SEIZN_API_KEY is required. Export it in the environment before starting @seizn/mcp.");
    }

    const url = new URL(path.replace(/^\//, ""), this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== null && value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "@seizn/mcp/0.1.0",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const text = await response.text();
    let payload: unknown = text;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    } else {
      payload = null;
    }

    if (!response.ok) {
      throw new SeiznApiError(
        extractErrorMessage(payload, `Seizn API request failed with HTTP ${response.status}`),
        response.status,
        payload
      );
    }

    return payload as T;
  }
}
