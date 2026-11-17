"use server";
import {
  apagarCookiesDoAparelho,
  lerCredencialPareada,
  temContextoPareado,
} from "@/features/protecao/http";
import { confirmarRetornoNativo, sairDoAparelhoPareado } from "@/features/protecao/service";
import { resolverAtor } from "@/features/sessao/service";
import { runAction, verifiedUser } from "@/lib/action";
import { getSession } from "@/lib/auth";
import { safeDestination } from "@/lib/destination";
import { assertAllowed } from "@/lib/errors";

/**
 * Depois de entrar, o formulário pergunta ao servidor para onde ir: a sessão
 * é conferida de novo aqui, e o destino pedido só vale se for um caminho
 * interno do portal.
 */
export async function concluirEntradaAction(next: unknown) {
  return runAction(async () => {
    await verifiedUser();
    if (await temContextoPareado()) {
      const login = await getSession();
      assertAllowed(login, "AUTH", "Entre novamente para continuar.");
      const contexto = await resolverAtor({
        authSessionId: login.session.id,
        contaId: login.user.id,
        expiraEm: new Date(login.session.expiresAt),
      });
      assertAllowed(contexto, "AUTH", "Entre novamente para continuar.");
      await confirmarRetornoNativo({
        ...contexto.ator,
        login: {
          authSessionId: login.session.id,
          criadoEm: new Date(login.session.createdAt),
          expiraEm: new Date(login.session.expiresAt),
        },
      });
      const credencial = await lerCredencialPareada();
      if (credencial) await sairDoAparelhoPareado(credencial);
      await apagarCookiesDoAparelho();
    }
    return { destination: safeDestination(typeof next === "string" ? next : null) };
  });
}
