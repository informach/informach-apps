"use server";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { pedirRevisaoDaRestricao } from "./recurso-service";

export async function pedirRevisaoDaRestricaoAction(entrada: unknown) {
  return runAction(async () => pedirRevisaoDaRestricao(await autorDaFamilia(), entrada));
}
