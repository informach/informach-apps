import "server-only";
import {
  ErroDoRecreio,
  formatarCodigoDeConvite,
  gerarCodigoDeConvite,
  type MundoId,
  MundoIdSchema,
  normalizarCodigoDeConvite,
  type PerfilId,
  VALIDADE_DO_CONVITE_MS,
} from "@informach/recreio";
import {
  AceiteDeConviteSchema,
  type ConviteCriado,
  type MundoRef,
  NovoConviteSchema,
  NovoMundoSchema,
  type ResumoDeMundo,
  ResumoDoMundoSchema,
} from "@informach/recreio/contrato";
import {
  type AutorDeMundos,
  comAutorDaPreparacaoDeMundo,
  comAutorDeMundos,
} from "@/features/autoridade-de-jogo/mundos-repository";
import { jogoDoCatalogo, jogoQueAbre, politicaDeMundo } from "@/features/jogos/config";
import { limitarTentativas } from "@/lib/rate-limit";
import { type Transacao, travar } from "@/lib/repository";
import { resumoDoConvite } from "./codigo";
import { mundoCompativel } from "./politica";
import {
  aceitarConviteDoMundo,
  criarConviteDoMundo,
  criarMundoDoPerfil,
  jogoDoMundo,
  lerMundoDoMembro,
  lerPoliticaDeConteudoDoMundo,
  listarMundosDoPerfil,
  type MundoDoMembro,
  mundoDoCodigo,
  travarMundoDaOperacao,
} from "./repository";

/**
 * Mundos, membros e convites. As rotas do SDK (sessão de jogo) e as ações do
 * portal (cookie) chamam as mesmas funções; quem chama entrega o perfil já
 * conferido no servidor, nunca um id vindo do pedido.
 */

/** Tentativas de aceitar convite por perfil: dez a cada dez minutos. */
const TENTATIVAS_DE_CONVITE = { max: 10, janelaEmSegundos: 600 };
const EMISSOES_DE_CONVITE = { max: 20, janelaEmSegundos: 600 };

/** Os mundos do jogo em que o perfil é membro ativo, como o SDK e o portal mostram. */
export async function mundosDoPerfil(
  perfilId: PerfilId,
  jogo: string,
  transacao?: Transacao,
): Promise<ResumoDeMundo[]> {
  jogoDoCatalogo(jogo);
  const mundos = await listarMundosDoPerfil(perfilId, jogo, transacao);
  return mundos.map((mundo) => {
    const resumo = ResumoDoMundoSchema.safeParse(mundo.resumo);
    return {
      id: mundo.id,
      nome: mundo.nome,
      papel: mundo.papel,
      estado: mundo.estado,
      membros: mundo.membros,
      politicaDeConteudo: mundo.politicaDeConteudo,
      abertoAgora: mundo.abertoAgora,
      resumo: resumo.success ? resumo.data : null,
      criadoEm: mundo.criadoEm.toISOString(),
    };
  });
}

/** O SDK exige gameplay; a prévia nativa pode preparar um teste ainda não iniciado. */
export async function listarMundos(
  quem: AutorDeMundos & { jogo: string },
): Promise<ResumoDeMundo[]> {
  return comAutorDaPreparacaoDeMundo(
    quem,
    quem.jogo,
    async () => {},
    async (tx, admissao) =>
      (await mundosDoPerfil(quem.perfilId, quem.jogo, tx)).filter((mundo) =>
        mundoCompativel(jogoDoCatalogo(quem.jogo), admissao.politica?.politica ?? null, mundo),
      ),
  );
}

/** Cria um mundo do jogo; quem cria vira o responsável. */
export async function criarMundo(
  quem: AutorDeMundos & { jogo: string },
  entrada: unknown,
): Promise<MundoRef> {
  const novo = NovoMundoSchema.parse(entrada);
  const manifesto = jogoQueAbre(quem.jogo);
  if (!manifesto.capacidades.mundos) throw new ErroDoRecreio("SEM_PERMISSAO");
  const politica = politicaDeMundo(manifesto, novo.politicaDeConteudo);
  const mundo = await comAutorDaPreparacaoDeMundo(
    quem,
    manifesto.id,
    (tx) => travar(tx, `recreio:spaces:criador:${quem.perfilId}`),
    (tx, admissao) => {
      if (
        !mundoCompativel(manifesto, admissao.politica?.politica ?? null, {
          politicaDeConteudo: politica,
          membros: 1,
        })
      )
        throw new ErroDoRecreio("POLITICA_INCOMPATIVEL");
      return criarMundoDoPerfil(
        {
          perfilId: quem.perfilId,
          jogo: manifesto.id,
          nome: novo.nome,
          politicaDeConteudo: politica,
          limite: manifesto.limites.mundosCriadosPorPerfil,
        },
        tx,
      );
    },
  );
  return { id: mundo.id, nome: mundo.nome };
}

/**
 * Gera um convite para o mundo. O código é mostrado uma vez, aqui; o banco
 * guarda só o resumo. `jogo` vem da sessão de jogo (SDK) ou é `null` no
 * portal, onde a pessoa convida a partir da página do próprio mundo.
 */
export async function criarConvite(
  quem: AutorDeMundos & { jogo: string | null },
  mundoId: unknown,
  entrada: unknown,
): Promise<ConviteCriado> {
  await limitarTentativas({ chave: `emitir-convite:${quem.perfilId}`, ...EMISSOES_DE_CONVITE });
  const id = MundoIdSchema.parse(mundoId);
  const pedido = NovoConviteSchema.parse(entrada);
  // Convite de visita ainda não existe nesta etapa.
  if (pedido.forma !== "member") throw new ErroDoRecreio("SEM_PERMISSAO");
  const jogo = await jogoDoMundo(id);
  if (!jogo || (quem.jogo !== null && quem.jogo !== jogo)) throw new ErroDoRecreio("NAO_MEMBRO");
  const codigo = gerarCodigoDeConvite();
  const { expiraEm } = await comAutorDeMundos(
    quem,
    jogo,
    (tx) => travarMundoDaOperacao(tx, id, jogo),
    (tx, admissao) => {
      // Convites por código sem destinatário são do fluxo adulto. F4 terá aprovação explícita.
      if (admissao.politica) throw new ErroDoRecreio("POLITICA_INCOMPATIVEL");
      return criarConviteDoMundo(
        {
          mundoId: id,
          perfilId: quem.perfilId,
          jogo: quem.jogo,
          participacao: pedido.participacao ?? null,
          codeHash: resumoDoConvite(codigo),
          validadeMs: VALIDADE_DO_CONVITE_MS,
          tetoDeConvites: (jogo) => jogoDoCatalogo(jogo).capacidades.mundos?.membrosMax ?? 0,
        },
        tx,
      );
    },
  );
  return { codigo: formatarCodigoDeConvite(codigo), expiraEm: expiraEm.toISOString() };
}

/**
 * Aceita um convite para o perfil de quem pede. As tentativas são contadas por
 * perfil, antes de olhar o código, para ninguém testar códigos em série.
 */
export async function aceitarConvite(
  quem: AutorDeMundos,
  entrada: unknown,
): Promise<{ mundoId: MundoId; nome: string; jogo: string }> {
  const pedido = AceiteDeConviteSchema.parse(entrada);
  await limitarTentativas({ chave: `convite:${quem.perfilId}`, ...TENTATIVAS_DE_CONVITE });
  const codigo = normalizarCodigoDeConvite(pedido.codigo);
  if (codigo === null) throw new ErroDoRecreio("CONVITE_INVALIDO");
  const hash = resumoDoConvite(codigo);
  const mundo = await mundoDoCodigo(hash);
  if (!mundo || ("sid" in quem && quem.jogo !== mundo.jogo))
    throw new ErroDoRecreio("CONVITE_INVALIDO");
  const aceito = await comAutorDeMundos(
    quem,
    mundo.jogo,
    (tx) => travarMundoDaOperacao(tx, mundo.id, mundo.jogo),
    (tx, admissao) => {
      if (admissao.politica) throw new ErroDoRecreio("POLITICA_INCOMPATIVEL");
      return aceitarConviteDoMundo(
        {
          codeHash: hash,
          perfilId: quem.perfilId,
          tetoDeMembros: (jogo) => jogoDoCatalogo(jogo).capacidades.mundos?.membrosMax ?? 0,
        },
        tx,
      );
    },
  );
  return { mundoId: aceito.mundoId, nome: aceito.nome, jogo: aceito.jogo };
}

/** O mundo como um membro ativo o vê no portal, ou `null` para quem não é membro. */
export async function detalheDoMundo(
  perfilId: PerfilId,
  mundoId: unknown,
): Promise<MundoDoMembro | null> {
  const id = MundoIdSchema.safeParse(mundoId);
  return id.success ? lerMundoDoMembro(id.data, perfilId) : null;
}

/** Página de jogo: só devolve o conteúdo dentro da autoridade atual do aparelho. */
export function detalheAtualDoMundo(autor: AutorDeMundos, jogo: string, mundoId: MundoId) {
  return comAutorDaPreparacaoDeMundo(
    autor,
    jogo,
    (tx) => travarMundoDaOperacao(tx, mundoId, jogo),
    async (tx, admissao) => {
      const mundo = await lerMundoDoMembro(mundoId, autor.perfilId, tx);
      if (!mundo) return null;
      if (
        !mundoCompativel(jogoDoCatalogo(jogo), admissao.politica?.politica ?? null, {
          politicaDeConteudo: await lerPoliticaDeConteudoDoMundo(tx, mundoId),
          membros: mundo.membros.filter((item) => item.estado === "active").length,
        })
      )
        throw new ErroDoRecreio("POLITICA_INCOMPATIVEL");
      return mundo;
    },
  );
}
