import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { env } from "@/lib/env";
import { conferirCredencialPareada } from "./service";

const seguro = new URL(env.NEXT_PUBLIC_APP_URL).protocol === "https:";
const prefixo = seguro ? "__Host-" : "";
const CONSULTA = `${prefixo}recreio-pareamento`;
const CREDENCIAL = `${prefixo}recreio-pareado`;
const opcoes = { httpOnly: true, secure: seguro, sameSite: "strict", path: "/" } as const;

export async function guardarConsultaDePareamento(segredo: string, expiraEm: string) {
  (await cookies()).set(CONSULTA, segredo, { ...opcoes, expires: new Date(expiraEm) });
}
export async function lerConsultaDePareamento() {
  return (await cookies()).get(CONSULTA)?.value;
}
export async function lerCredencialPareada() {
  return (await cookies()).get(CREDENCIAL)?.value;
}
export async function guardarCredencialPareada(credencial: string, expiraEm: string) {
  const jar = await cookies();
  jar.set(CREDENCIAL, credencial, { ...opcoes, expires: new Date(expiraEm) });
  jar.delete(CONSULTA);
}
export async function apagarCookiesDoAparelho() {
  const jar = await cookies();
  jar.delete(CREDENCIAL);
  jar.delete(CONSULTA);
}
/** Presença de cookie inválido também bloqueia o retorno silencioso à conta nativa. */
export const temContextoPareado = cache(async () => (await cookies()).has(CREDENCIAL));
export const aparelhoPareadoAtual = cache(async () => {
  const valor = await lerCredencialPareada();
  return valor ? conferirCredencialPareada(valor) : null;
});
