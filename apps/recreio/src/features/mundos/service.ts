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
import { avaliarAcesso } from "@/features/acesso/service";
import { jogoDoCatalogo, jogoQueAbre, politicaDeMundo } from "@/features/jogos/config";
import { limitarTentativas } from "@/lib/rate-limit";
import { resumoDoConvite } from "./codigo";
import {
  aceitarConviteDoMundo,
  criarConviteDoMundo,
  criarMundoDoPerfil,
  lerMundoDoMembro,
  listarMundosDoPerfil,
  type MundoDoMembro,
} from "./repository";

/**
 * Mundos, membros e convites. As rotas do SDK (sessão de jogo) e as ações do
 * portal (cookie) chamam as mesmas funções; quem chama entrega o perfil já
 * conferido no servidor, nunca um id vindo do pedido.
 */

/** Tentativas de aceitar convite por perfil: dez a cada dez minutos. */
const TENTATIVAS_DE_CONVITE = { max: 10, janelaEmSegundos: 600 };

/** O direito de jogar do perfil, sem olhar um jogo em particular. */
async function exigirAcesso(perfilId: PerfilId, jogo?: string): Promise<void> {
  const decisao = await avaliarAcesso({ profileId: perfilId, gameId: jogo });
  if (!decisao.podeJogar)
    throw new ErroDoRecreio("ACESSO_NEGADO", { estado: decisao.estado, motivo: decisao.motivo });
}

/** Os mundos do jogo em que o perfil é membro ativo, como o SDK e o portal mostram. */
export async function mundosDoPerfil(perfilId: PerfilId, jogo: string): Promise<ResumoDeMundo[]> {
  jogoDoCatalogo(jogo);
  const mundos = await listarMundosDoPerfil(perfilId, jogo);
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

/** A lista do SDK: exige o direito de jogar. */
export async function listarMundos(quem: {
  perfilId: PerfilId;
  jogo: string;
}): Promise<ResumoDeMundo[]> {
  await exigirAcesso(quem.perfilId, quem.jogo);
  return mundosDoPerfil(quem.perfilId, quem.jogo);
}

/** Cria um mundo do jogo; quem cria vira o responsável. */
export async function criarMundo(
  quem: { perfilId: PerfilId; jogo: string },
  entrada: unknown,
): Promise<MundoRef> {
  const novo = NovoMundoSchema.parse(entrada);
  await exigirAcesso(quem.perfilId, quem.jogo);
  const manifesto = jogoQueAbre(quem.jogo);
  const mundo = await criarMundoDoPerfil({
    perfilId: quem.perfilId,
    jogo: manifesto.id,
    nome: novo.nome,
    politicaDeConteudo: politicaDeMundo(manifesto, novo.politicaDeConteudo),
    limite: manifesto.limites.mundosCriadosPorPerfil,
  });
  return { id: mundo.id, nome: mundo.nome };
}

/**
 * Gera um convite para o mundo. O código é mostrado uma vez, aqui; o banco
 * guarda só o resumo. `jogo` vem da sessão de jogo (SDK) ou é `null` no
 * portal, onde a pessoa convida a partir da página do próprio mundo.
 */
export async function criarConvite(
  quem: { perfilId: PerfilId; jogo: string | null },
  mundoId: unknown,
  entrada: unknown,
): Promise<ConviteCriado> {
  const id = MundoIdSchema.parse(mundoId);
  const pedido = NovoConviteSchema.parse(entrada);
  await exigirAcesso(quem.perfilId, quem.jogo ?? undefined);
  // Convite de visita ainda não existe nesta etapa.
  if (pedido.forma !== "member") throw new ErroDoRecreio("SEM_PERMISSAO");
  const codigo = gerarCodigoDeConvite();
  const { expiraEm } = await criarConviteDoMundo({
    mundoId: id,
    perfilId: quem.perfilId,
    jogo: quem.jogo,
    participacao: pedido.participacao ?? null,
    codeHash: resumoDoConvite(codigo),
    validadeMs: VALIDADE_DO_CONVITE_MS,
  });
  return { codigo: formatarCodigoDeConvite(codigo), expiraEm: expiraEm.toISOString() };
}

/**
 * Aceita um convite para o perfil de quem pede. As tentativas são contadas por
 * perfil, antes de olhar o código, para ninguém testar códigos em série.
 */
export async function aceitarConvite(
  quem: { perfilId: PerfilId },
  entrada: unknown,
): Promise<{ mundoId: MundoId; nome: string; jogo: string }> {
  const pedido = AceiteDeConviteSchema.parse(entrada);
  await limitarTentativas({ chave: `convite:${quem.perfilId}`, ...TENTATIVAS_DE_CONVITE });
  await exigirAcesso(quem.perfilId);
  const codigo = normalizarCodigoDeConvite(pedido.codigo);
  if (codigo === null) throw new ErroDoRecreio("CONVITE_INVALIDO");
  const aceito = await aceitarConviteDoMundo({
    codeHash: resumoDoConvite(codigo),
    perfilId: quem.perfilId,
    tetoDeMembros: (jogo) => jogoDoCatalogo(jogo).capacidades.mundos.membrosMax,
  });
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
