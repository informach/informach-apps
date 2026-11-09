"use server";
import { cookies } from "next/headers";
import { runAction, verifiedUser } from "@/lib/action";
import { safeDestination } from "@/lib/destination";
import { CHILD_COOKIE, DEVICE_COOKIE, UNLOCK_COOKIE } from "./policy";
import { endDevice } from "./repository";

/**
 * Um adulto entrou com a conta neste navegador. Se ele era o aparelho de uma
 * criança, a conexão sai: o mesmo aparelho não fica com as duas identidades.
 */
export async function concluirEntradaAction(next: unknown) {
  return runAction(async () => {
    await verifiedUser();
    const jar = await cookies();
    const token = jar.get(DEVICE_COOKIE)?.value;
    if (token) await endDevice(token);
    jar.delete(DEVICE_COOKIE);
    jar.delete(CHILD_COOKIE);
    jar.delete(UNLOCK_COOKIE);
    return { destination: safeDestination(typeof next === "string" ? next : null) };
  });
}
