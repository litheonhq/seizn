const POSTGREST_OR_FILTER_UNSAFE_CHARS = /[,().*{}]/g;
const DEFAULT_POSTGREST_OR_FILTER_MAX_LENGTH = 256;

export function escapePostgrestOrFilter(
  input: string,
  options: { maxLength?: number } = {},
): string {
  const maxLength = options.maxLength ?? DEFAULT_POSTGREST_OR_FILTER_MAX_LENGTH;
  return input
    .replace(POSTGREST_OR_FILTER_UNSAFE_CHARS, '')
    .trim()
    .slice(0, maxLength);
}
