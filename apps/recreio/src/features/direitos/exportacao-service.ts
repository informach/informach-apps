import "server-only";
import { PerfilIdSchema } from "@informach/recreio";
import { z } from "zod";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import type { criarCifradorDeObjetos } from "@/features/objetos/criptografia";
import { limitarTentativas } from "@/lib/rate-limit";
import { capturarDadosPessoaisDaConta } from "./captura-conta-repository";
import { capturarDadosPessoaisDoPerfil } from "./captura-perfil-repository";
import {
  type AlvoDaCopia,
  admitirDownloadPessoalNoBanco,
  carregarCopiaPessoalNoBanco,
  consultarCopiaPessoalNoBanco,
  publicarCopiaPessoalNoBanco,
  revogarCopiaPessoalNoBanco,
} from "./exportacao-repository";

const Id = z.uuid().transform((id) => id.toLowerCase());
const Pedido = z.union([
  z.strictObject({ copiaId: Id, perfilId: PerfilIdSchema }),
  z.strictObject({ copiaId: Id, escopo: z.literal("account") }),
]);
const Referencia = z.strictObject({ copiaId: Id });
type Cifrador = ReturnType<typeof criarCifradorDeObjetos>;

export async function prepararArquivoPessoal(
  autor: AutorNativoRecente,
  entrada: unknown,
  cifrador: Cifrador,
) {
  const pedido = Pedido.parse(entrada);
  await limitarTentativas({
    chave: `exportacao-pessoal:${autor.contaId}`,
    max: 6,
    janelaEmSegundos: 3600,
  });
  const alvo: AlvoDaCopia =
    "perfilId" in pedido ? { escopo: "profile", perfilId: pedido.perfilId } : { escopo: "account" };
  const anterior = await consultarCopiaPessoalNoBanco(autor, pedido.copiaId, alvo);
  if (anterior) {
    // A consulta confere autoridade, mas uma repetição também precisa conservar
    // o alvo original. Não confiar no UUID escolhido pelo navegador.
    return anterior;
  }
  const captura =
    "perfilId" in pedido
      ? await capturarDadosPessoaisDoPerfil(autor, pedido.perfilId)
      : await capturarDadosPessoaisDaConta(autor);
  let cifrada: ReturnType<Cifrador["cifrar"]> | undefined;
  try {
    cifrada = cifrador.cifrar({ tipo: "exportacao", id: pedido.copiaId }, captura.bytes);
    return await publicarCopiaPessoalNoBanco(autor, pedido.copiaId, captura, cifrada);
  } finally {
    captura.bytes.fill(0);
    cifrada?.bytes.fill(0);
  }
}

export async function abrirArquivoPessoal(
  autor: AutorNativoRecente,
  entrada: unknown,
  cifrador: Cifrador,
) {
  const pedido = Referencia.parse(entrada);
  await limitarTentativas({
    chave: `download-pessoal:${autor.contaId}`,
    max: 20,
    janelaEmSegundos: 600,
  });
  const envelope = await carregarCopiaPessoalNoBanco(autor, pedido.copiaId);
  let bytes: Buffer | undefined,
    entregue = false;
  try {
    bytes = cifrador.abrir(envelope.referencia, envelope.bytes);
    await admitirDownloadPessoalNoBanco(autor, pedido.copiaId, envelope.referencia);
    entregue = true;
    return bytes;
  } finally {
    envelope.bytes.fill(0);
    if (!entregue) bytes?.fill(0);
  }
}

export async function revogarArquivoPessoal(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = Referencia.parse(entrada);
  await limitarTentativas({
    chave: `revogar-exportacao-pessoal:${autor.contaId}`,
    max: 20,
    janelaEmSegundos: 600,
  });
  return revogarCopiaPessoalNoBanco(autor, pedido.copiaId);
}
