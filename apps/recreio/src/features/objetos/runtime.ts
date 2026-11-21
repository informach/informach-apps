import "server-only";
import type { LeitorDeFotografiasPrivadas } from "@/features/posse/armazenamento";
import { configuracaoDosObjetosDoProcesso } from "@/lib/object-environment";
import { criarLeitorDeFotografiasDoProcesso } from "./runtime-factory";

let leitor: LeitorDeFotografiasPrivadas | null | undefined;
/** Singleton servidor, desligado por padrão. Não expõe escrita nem credenciais. */
export function leitorDeFotografias(): LeitorDeFotografiasPrivadas | null {
  if (leitor !== undefined) return leitor;
  const config = configuracaoDosObjetosDoProcesso(process.env);
  if (!config) {
    leitor = null;
    return leitor;
  }
  leitor = criarLeitorDeFotografiasDoProcesso(config).leitor;
  return leitor;
}
