/**
 * Assisted detection of personal data and credentials in OCR words. Heuristic: it proposes
 * spans for a person to review and never hides, masks or removes anything by itself. A miss
 * is possible (OCR errors, unusual formats) and so is a false positive.
 */

export type SensitiveKind = "email" | "phone" | "cpf" | "cnpj" | "credential";
export const SENSITIVE_KINDS: readonly SensitiveKind[] = Object.freeze([
  "cnpj",
  "cpf",
  "email",
  "credential",
  "phone",
]);

export interface SensitiveBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SensitiveWord extends SensitiveBox {
  text: string;
  line: number;
}

export interface SensitiveMatch {
  kind: SensitiveKind;
  /** Matched text as read by OCR. */
  text: string;
  /** OCR line id. Matches never cross lines. */
  line: number;
  /** Indices of the input words touched by the match, in order. */
  words: number[];
  /**
   * Whole boxes of those words. A match covering part of a word (for example the value of
   * `senha:abc`) returns the whole word: masking more is the safe side.
   */
  boxes: SensitiveBox[];
  bounds: SensitiveBox;
  /** `high` when a check digit or a known token format confirms it. */
  confidence: "high" | "medium";
  reason: string;
}

export interface SensitiveOptions {
  kinds?: readonly SensitiveKind[];
  /** Upper bound on returned matches. Default 10 000. */
  maxMatches?: number;
}

interface Candidate {
  kind: SensitiveKind;
  start: number;
  end: number;
  confidence: "high" | "medium";
  reason: string;
}

const digitsOf = (value: string) => value.replace(/\D/g, "");

/** CPF check digits (mod 11). Repeated digits such as 111.111.111-11 are rejected. */
export function isValidCpf(value: string): boolean {
  const digits = digitsOf(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const numbers = [...digits].map(Number);
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += (numbers[i] ?? 0) * (length + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== numbers[length]) return false;
  }
  return true;
}

/**
 * CNPJ check digits (mod 11), including the alphanumeric CNPJ of the Receita Federal: each
 * character counts as its ASCII code minus 48, the two check digits stay numeric.
 */
export function isValidCnpj(value: string): boolean {
  const characters = value.toUpperCase().replace(/[.\-/\s]/g, "");
  if (!/^[A-Z0-9]{12}\d{2}$/.test(characters) || /^(.)\1{13}$/.test(characters)) return false;
  const values = [...characters].map((char) => char.charCodeAt(0) - 48);
  for (const length of [12, 13]) {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < length; i++) sum += (values[i] ?? 0) * (weights[i] ?? 0);
    const remainder = sum % 11;
    if ((remainder < 2 ? 0 : 11 - remainder) !== values[length]) return false;
  }
  return true;
}

/** Area codes (DDD) in use in Brazil. */
const DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** Brazilian phone: DDD + 8 (landline 2–5) or 9 digits (mobile, leading 9), optional +55. */
export function brazilianPhone(value: string): "high" | "medium" | undefined {
  let digits = digitsOf(value);
  if (/^\+\s?55/.test(value.trim()) && digits.length >= 12) digits = digits.slice(2);
  const first = Number(digits[2]);
  if (digits.length === 10 || digits.length === 11) {
    if (!DDD.has(Number(digits.slice(0, 2)))) return undefined;
    if (digits.length === 11 && first !== 9) return undefined;
    if (digits.length === 10 && (first < 2 || first > 5)) return undefined;
    return "high";
  }
  // Without area code only a hyphenated number is a plausible phone.
  if (!/\d-\d/.test(value)) return undefined;
  if (digits.length === 9 && digits[0] === "9") return "medium";
  if (digits.length === 8 && Number(digits[0]) >= 2 && Number(digits[0]) <= 5) return "medium";
  return undefined;
}

function entropy(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

const CNPJ =
  /(?<![\p{L}\p{N}])[A-Z0-9]{2}\.?[A-Z0-9]{3}\.?[A-Z0-9]{3}\/?[A-Z0-9]{4}-?\d{2}(?![\p{L}\p{N}])/gu;
const CPF = /(?<![\p{L}\p{N}.\-/])\d{3}[.\s]?\d{3}[.\s]?\d{3}\s?[-.\s]?\s?\d{2}(?![\p{L}\p{N}])/gu;
const EMAIL =
  /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+\s?@\s?[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
const PHONE =
  /(?<![\p{L}\p{N}])(?:\+\s?55[\s.-]?)?(?:\(\s?\d{2}\s?\)\s?|\d{2}[\s.-]?)?\d{4,5}[\s.-]?\d{4}(?![\p{L}\p{N}])/gu;
const LABELED =
  /(?<![\p{L}\p{N}])(?:senha|password|passwd|pwd|pass|passcode|pin|token|secret|segredo|api[\s_-]?key|apikey|access[\s_-]?key|client[\s_-]?secret|chave(?:\s+(?:de\s+)?(?:api|acesso))?)\s*[:=]\s*(\S+)/giu;
const KNOWN_TOKEN =
  /(?<![A-Za-z0-9_-])(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g;
const OPAQUE_TOKEN = /(?<![A-Za-z0-9_\-+/=])[A-Za-z0-9_\-+/=]{24,}(?![A-Za-z0-9_\-+/=])/g;

function candidates(text: string, kinds: ReadonlySet<SensitiveKind>): Candidate[] {
  const found: Candidate[] = [];
  const each = (pattern: RegExp, visit: (match: RegExpExecArray) => void) => {
    for (const match of text.matchAll(pattern)) visit(match);
  };
  if (kinds.has("cnpj"))
    each(CNPJ, (match) => {
      const value = match[0];
      if (/[A-Z]/.test(value) && !/[./]/.test(value)) return;
      if (isValidCnpj(value))
        found.push({
          kind: "cnpj",
          start: match.index,
          end: match.index + value.length,
          confidence: "high",
          reason: "CNPJ com dígitos verificadores válidos",
        });
    });
  if (kinds.has("cpf"))
    each(CPF, (match) => {
      if (isValidCpf(match[0]))
        found.push({
          kind: "cpf",
          start: match.index,
          end: match.index + match[0].length,
          confidence: "high",
          reason: "CPF com dígitos verificadores válidos",
        });
    });
  if (kinds.has("email"))
    each(EMAIL, (match) =>
      found.push({
        kind: "email",
        start: match.index,
        end: match.index + match[0].length,
        confidence: "high",
        reason: "Endereço de e-mail",
      }),
    );
  if (kinds.has("credential")) {
    each(LABELED, (match) => {
      const value = match[1] ?? "";
      if (!value) return;
      const end = match.index + match[0].length;
      found.push({
        kind: "credential",
        start: end - value.length,
        end,
        confidence: "medium",
        reason: "Valor rotulado como senha, token ou chave",
      });
    });
    each(KNOWN_TOKEN, (match) =>
      found.push({
        kind: "credential",
        start: match.index,
        end: match.index + match[0].length,
        confidence: "high",
        reason: "Formato conhecido de chave de API ou token",
      }),
    );
    each(OPAQUE_TOKEN, (match) => {
      const value = match[0];
      if (/[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && entropy(value) >= 3.5)
        found.push({
          kind: "credential",
          start: match.index,
          end: match.index + value.length,
          confidence: "medium",
          reason: "Sequência longa e aleatória, parecida com uma chave",
        });
    });
  }
  if (kinds.has("phone"))
    each(PHONE, (match) => {
      const confidence = brazilianPhone(match[0]);
      if (confidence)
        found.push({
          kind: "phone",
          start: match.index,
          end: match.index + match[0].length,
          confidence,
          reason: "Telefone brasileiro",
        });
    });
  return found;
}

function union(boxes: readonly SensitiveBox[]): SensitiveBox {
  return {
    x0: Math.min(...boxes.map((box) => box.x0)),
    y0: Math.min(...boxes.map((box) => box.y0)),
    x1: Math.max(...boxes.map((box) => box.x1)),
    y1: Math.max(...boxes.map((box) => box.y1)),
  };
}

/**
 * Find e-mails, Brazilian phones, CPF/CNPJ (check digits validated) and credential-like
 * values in OCR words, line by line. Overlapping candidates keep the most specific kind,
 * in the order of `SENSITIVE_KINDS`. Results follow line and reading order.
 */
export function findSensitiveData(
  words: readonly SensitiveWord[],
  options: SensitiveOptions = {},
): SensitiveMatch[] {
  const kinds = new Set(options.kinds ?? SENSITIVE_KINDS);
  const maxMatches = options.maxMatches ?? 10_000;
  const lines = new Map<number, number[]>();
  words.forEach((word, index) => {
    if (!word.text.trim()) return;
    const line = lines.get(word.line);
    if (line) line.push(index);
    else lines.set(word.line, [index]);
  });
  const matches: SensitiveMatch[] = [];
  for (const [line, indices] of lines) {
    let text = "";
    const owners: number[] = [];
    for (const index of indices) {
      if (text) {
        text += " ";
        owners.push(-1);
      }
      const value = words[index]?.text ?? "";
      text += value;
      for (let i = 0; i < value.length; i++) owners.push(index);
    }
    const priority = (kind: SensitiveKind) => SENSITIVE_KINDS.indexOf(kind);
    const kept: Candidate[] = [];
    for (const candidate of candidates(text, kinds).sort(
      (a, b) => priority(a.kind) - priority(b.kind) || a.start - b.start,
    ))
      if (!kept.some((other) => candidate.start < other.end && other.start < candidate.end))
        kept.push(candidate);
    for (const candidate of kept.sort((a, b) => a.start - b.start)) {
      const touched = [
        ...new Set(owners.slice(candidate.start, candidate.end).filter((owner) => owner >= 0)),
      ];
      const boxes = touched.flatMap((index) => {
        const word = words[index];
        return word ? [{ x0: word.x0, y0: word.y0, x1: word.x1, y1: word.y1 }] : [];
      });
      if (!boxes.length) continue;
      matches.push({
        kind: candidate.kind,
        text: text.slice(candidate.start, candidate.end),
        line,
        words: touched,
        boxes,
        bounds: union(boxes),
        confidence: candidate.confidence,
        reason: candidate.reason,
      });
      if (matches.length >= maxMatches) return matches;
    }
  }
  return matches;
}
