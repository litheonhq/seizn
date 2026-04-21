import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const DEFAULT_BASE_URL = "https://www.seizn.com";
export const PROJECT_CONFIG_FILE = "seizn.config.json";

export interface SeiznCredentials {
  token: string;
  baseUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface SeiznProjectConfig {
  baseUrl?: string;
  project?: string;
  defaultNamespace?: string;
}

export function credentialsPath() {
  return path.join(homedir(), ".config", "seizn", "credentials.json");
}

export function projectConfigPath(cwd = process.cwd()) {
  return path.join(cwd, PROJECT_CONFIG_FILE);
}

export function normalizeBaseUrl(value?: string | null) {
  const input = (value || DEFAULT_BASE_URL).trim();
  if (!input) return DEFAULT_BASE_URL;
  const url = new URL(input);
  return url.toString().replace(/\/$/, "");
}

export async function fileExists(filePath: string) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function loadCredentials(): Promise<SeiznCredentials | null> {
  const filePath = credentialsPath();
  if (!(await fileExists(filePath))) return null;

  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<SeiznCredentials>;
  if (!parsed.token || !parsed.baseUrl) return null;

  return {
    token: parsed.token,
    baseUrl: normalizeBaseUrl(parsed.baseUrl),
    createdAt: parsed.createdAt || parsed.updatedAt || new Date().toISOString(),
    updatedAt: parsed.updatedAt || new Date().toISOString(),
  };
}

export async function saveCredentials(input: { token: string; baseUrl: string }) {
  const filePath = credentialsPath();
  const now = new Date().toISOString();
  const existing = await loadCredentials();
  const payload: SeiznCredentials = {
    token: input.token.trim(),
    baseUrl: normalizeBaseUrl(input.baseUrl),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(filePath, 0o600).catch(() => undefined);
  return filePath;
}

export async function readProjectConfig(cwd = process.cwd()): Promise<SeiznProjectConfig | null> {
  const filePath = projectConfigPath(cwd);
  if (!(await fileExists(filePath))) return null;
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as SeiznProjectConfig;
}

export async function writeProjectConfig(config: SeiznProjectConfig, cwd = process.cwd()) {
  const filePath = projectConfigPath(cwd);
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return filePath;
}

export async function resolveBaseUrl(explicit?: string) {
  const projectConfig = await readProjectConfig();
  const credentials = await loadCredentials();
  return normalizeBaseUrl(
    explicit ||
      process.env.SEIZN_BASE_URL ||
      projectConfig?.baseUrl ||
      credentials?.baseUrl ||
      DEFAULT_BASE_URL
  );
}

export async function resolveToken(explicit?: string) {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.SEIZN_API_KEY?.trim()) return process.env.SEIZN_API_KEY.trim();
  const credentials = await loadCredentials();
  return credentials?.token || null;
}

export async function requireToken(explicit?: string) {
  const token = await resolveToken(explicit);
  if (!token) {
    throw new Error("Missing API key. Run `seizn login` or set SEIZN_API_KEY.");
  }
  return token;
}
