import { env } from "./env";

function domainFromEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) {
    throw new Error("SENDGRID_FROM must include a domain");
  }
  return email.slice(at + 1);
}

export const unsubscribeMailto = `unsubscribe@${domainFromEmail(env.SENDGRID_FROM)}`;
