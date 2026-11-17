"use server";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import {
  aceitarConviteDeAdulto,
  convidarAdulto,
  recusarConviteDeAdulto,
  revogarConviteDeAdulto,
} from "./convites-service";

export async function convidarAdultoAction(entrada: unknown) {
  return runAction(async () => {
    await convidarAdulto(await autorDaFamilia(), entrada);
    return { destination: "/conta/grupo?convite=criado" };
  });
}
export async function aceitarAdultoAction(entrada: unknown) {
  return runAction(async () => {
    await aceitarConviteDeAdulto(await autorDaFamilia(), entrada);
    return { destination: "/conta/grupo?convite=aceito" };
  });
}
export async function recusarAdultoAction(conviteId: unknown) {
  return runAction(async () => {
    await recusarConviteDeAdulto(await autorDaFamilia(), conviteId);
    return { destination: "/conta/grupo?convite=encerrado" };
  });
}
export async function revogarAdultoAction(conviteId: unknown) {
  return runAction(async () => {
    await revogarConviteDeAdulto(await autorDaFamilia(), conviteId);
    return { destination: "/conta/grupo?convite=encerrado" };
  });
}
