import { createHmac, timingSafeEqual } from "node:crypto";

const SEPARATOR = "|";

function hmac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Build a deterministic HMAC token for the unsubscribe link.
 *
 * The identifier is typically an email (stable across signup/auth) so that
 * the same email link always works. No expiration: List-Unsubscribe tokens
 * should remain valid as long as the recipient has access to the email.
 */
export function buildUnsubscribeToken(
  secret: string,
  identifier: string,
  category: string,
): string {
  if (!secret) throw new Error("buildUnsubscribeToken: secret is required");
  if (!identifier) throw new Error("buildUnsubscribeToken: identifier is required");
  if (!category) throw new Error("buildUnsubscribeToken: category is required");
  if (identifier.includes(SEPARATOR) || category.includes(SEPARATOR)) {
    throw new Error(
      `buildUnsubscribeToken: identifier and category must not contain '${SEPARATOR}'`,
    );
  }

  const signature = hmac(secret, `${identifier}:${category}`);
  return base64UrlEncode(`${identifier}${SEPARATOR}${category}${SEPARATOR}${signature}`);
}

export function verifyUnsubscribeToken(
  secret: string,
  token: string,
): { identifier: string; category: string } | null {
  if (!secret || !token) return null;

  const decoded = base64UrlDecode(token);
  if (!decoded) return null;

  const parts = decoded.split(SEPARATOR);
  if (parts.length !== 3) return null;

  const [identifier, category, providedSignature] = parts;
  if (!identifier || !category || !providedSignature) return null;

  const expected = hmac(secret, `${identifier}:${category}`);

  const a = Buffer.from(providedSignature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;

  if (!timingSafeEqual(a, b)) return null;

  return { identifier, category };
}
