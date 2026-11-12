import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

/**
 * O que o banco guarda de um código de convite: um HMAC com a chave do app.
 * O código em si só existe na tela de quem convidou; com o banco em mãos não
 * dá para recuperar nem testar códigos sem a chave.
 */
export function resumoDoConvite(codigo: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`recreio-convite:${codigo}`)
    .digest("hex");
}
