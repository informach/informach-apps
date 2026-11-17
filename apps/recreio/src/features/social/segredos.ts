import "server-only";
import { createHash, randomInt } from "node:crypto";

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Doze caracteres base32, sem viés modular; só o resumo é persistido. */
export function novoCodigoDeAmigo(): string {
  return Array.from({ length: 12 }, () => ALFABETO.charAt(randomInt(ALFABETO.length))).join("");
}
export function hashDoCodigoDeAmigo(codigo: string): string {
  return createHash("sha256").update("recreio:friend-code:v1:").update(codigo).digest("hex");
}
