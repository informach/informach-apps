import "server-only";
import { createHash } from "node:crypto";
import { type Transacao, travar } from "@/lib/repository";

/** Before native identities, groups or profiles. Issuance and closing consent
 * share this fence even when the recipient had no account at issuance.
 * Callers recheck the normalized address after acquiring identity locks. */
export function serializarConvitesPorEmail(tx: Transacao, email: string) {
  return travar(
    tx,
    `recreio:convite-grupo:email:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`,
  );
}
