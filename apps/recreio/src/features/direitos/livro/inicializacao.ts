import type { criarArmazenamentoDoLivro } from "./armazenamento";
import type { criarAssinaturaDoLivro } from "./assinatura";
import { FalhaDoLivroDeDireitos, IdDoLivroSchema, RAIZ_VAZIA } from "./contrato";

type Composicao = {
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
  storage: ReturnType<typeof criarArmazenamentoDoLivro>;
  livroEsperado: string;
};
function conferir(config: Composicao) {
  if (
    !IdDoLivroSchema.safeParse(config.livroEsperado).success ||
    config.livroEsperado !== config.assinatura.livroId
  )
    throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
}
/** Read-only, including absence. This never supplies an implicit bootstrap to
 * browser consent, ordinary jobs or the recovery coordinator. */
export async function inspecionarLivroDeDireitos(config: Composicao) {
  conferir(config);
  try {
    const head = await config.storage.lerCabecalho();
    if (head.documento.livroId !== config.livroEsperado)
      throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
    return head;
  } catch (e) {
    if (e instanceof FalhaDoLivroDeDireitos && e.codigo === "AUSENTE") return null;
    throw e;
  }
}
/** Explicit operator composition only. Existing authenticated books, including
 * frozen/populated ones, are returned without any PUT or key/epoch change. */
export async function inicializarLivroDeDireitos(config: Composicao) {
  const existente = await inspecionarLivroDeDireitos(config);
  if (existente) return { jaInicializado: true, cabecalho: existente };
  const bytes = config.assinatura.assinarCabecalho({
    formato: "recreio-livro-direitos-v1",
    livroId: config.livroEsperado,
    estado: "aberto",
    epoca: 0,
    chavesUtilizadas: [config.assinatura.chaveAtiva],
    retomada: null,
    geracao: 0,
    entradas: 0,
    raizSha256: RAIZ_VAZIA,
    anteriorSha256: null,
    ultimaIntencao: null,
    atualizadoEm: new Date().toISOString(),
  });
  try {
    const cabecalho = await config.storage.iniciarCabecalho(bytes);
    return { jaInicializado: false, cabecalho };
  } finally {
    bytes.fill(0);
  }
}
