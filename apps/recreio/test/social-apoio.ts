import { db, eq } from "@informach/db";
import { sessions } from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { consultarSupervisao, salvarSupervisao } from "@/features/politicas/service";
import {
  aprovarPareamento,
  consultarPareamento,
  prepararPareamento,
} from "@/features/protecao/service";
import { resolverAtor } from "@/features/sessao/service";
import { type Jogador, loginReal, novaConta } from "./apoio";

export const referenciaSocial = (p: Jogador) => ({
  perfilId: p.perfil.id,
  sessaoDeAparelhoId: p.ator.sessaoDeAparelhoId,
});
let ip = 1;
export async function familiaSocial(idade = 8) {
  const conta = await novaConta();
  const login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Login ausente");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  const intencao = await prepararPerfilMenor(autor);
  const { perfil } = await cadastrarPerfilMenor(autor, {
    intencaoId: intencao.id,
    perfil: { apelido: "Protegido", avatar: "padrao" },
    nascimento: { ano: new Date().getUTCFullYear() - idade, mes: 1 },
    assumoResponsabilidade: true,
    versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
  });
  const supervisao = await consultarSupervisao(autor, perfil.id);
  await salvarSupervisao(autor, {
    perfilId: perfil.id,
    versao: supervisao.versao,
    configuracao: supervisao.configuracao,
    reconheco: true,
  });
  const pedido = await prepararPareamento(`198.18.2.${ip++}`);
  const aprovado = await aprovarPareamento(autor, { perfilId: perfil.id, codigo: pedido.codigo });
  await consultarPareamento(pedido.segredo);
  return {
    conta,
    autor,
    perfil,
    referencia: { perfilId: perfil.id, sessaoDeAparelhoId: aprovado.aparelhoId },
  };
}
