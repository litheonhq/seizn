export type PiiType =
  | 'email'
  | 'phone'
  | 'rrn'
  | 'credit_card'
  | 'ip_address';

export interface PiiDetection {
  type: PiiType;
  match: string;
  index: number;
}

const EMAIL_RE = /([a-zA-Z0-9._%+-]{1,64})@([a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,63})/g;
const PHONE_RE = /(?:\+?\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{4}/g;
// Korean RRN: 6 digits - 7 digits (very rough)
const RRN_RE = /\b\d{6}-?\d{7}\b/g;
// Credit card: 13-19 digits with optional spaces/dashes (rough)
const CARD_RE = /\b(?:\d[ -]*?){13,19}\b/g;
const IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;

function collect(re: RegExp, type: PiiType, text: string): PiiDetection[] {
  const out: PiiDetection[] = [];
  const regex = new RegExp(re.source, re.flags); // avoid shared state
  let m: RegExpExecArray | null = null;
  while ((m = regex.exec(text)) !== null) {
    out.push({ type, match: m[0], index: m.index });
  }
  return out;
}

export function detectPII(text: string): PiiDetection[] {
  if (!text) return [];
  return [
    ...collect(EMAIL_RE, 'email', text),
    ...collect(PHONE_RE, 'phone', text),
    ...collect(RRN_RE, 'rrn', text),
    ...collect(CARD_RE, 'credit_card', text),
    ...collect(IP_RE, 'ip_address', text),
  ].sort((a, b) => a.index - b.index);
}

function maskEmail(raw: string): string {
  const [local, domain] = raw.split('@');
  if (!domain) return '[EMAIL]';
  if (local.length <= 1) return `*@${domain}`;
  return `${local[0]}***@${domain}`;
}

function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return '[PHONE]';
  const head = digits.slice(0, Math.min(3, digits.length));
  const tail = digits.slice(-4);
  return `${head}-****-${tail}`;
}

function maskRRN(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 13) return '[RRN]';
  return `${digits.slice(0, 6)}-*******`;
}

function maskCard(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 13) return '[CARD]';
  return `****-****-****-${digits.slice(-4)}`;
}

function maskIp(raw: string): string {
  const parts = raw.split('.');
  if (parts.length !== 4) return '[IP]';
  return `${parts[0]}.${parts[1]}.***.***`;
}

export function maskPII(text: string): { maskedText: string; detections: PiiDetection[] } {
  const detections = detectPII(text);
  if (detections.length === 0) return { maskedText: text, detections };

  // Replace from end to start to keep indices valid
  let masked = text;
  const sorted = [...detections].sort((a, b) => b.index - a.index);

  for (const d of sorted) {
    let replacement = '[REDACTED]';
    if (d.type === 'email') replacement = maskEmail(d.match);
    if (d.type === 'phone') replacement = maskPhone(d.match);
    if (d.type === 'rrn') replacement = maskRRN(d.match);
    if (d.type === 'credit_card') replacement = maskCard(d.match);
    if (d.type === 'ip_address') replacement = maskIp(d.match);

    masked = masked.slice(0, d.index) + replacement + masked.slice(d.index + d.match.length);
  }

  return { maskedText: masked, detections };
}
