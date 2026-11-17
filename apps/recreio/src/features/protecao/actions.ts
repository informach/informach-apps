"use server";
import { clientIpFromHeaders } from "@informach/auth/client-ip";
import { headers } from "next/headers";
import { autorDaFamilia } from "@/features/familia/autor";
import { dedicarAparelhoAMenor, encerrarSessaoDeAparelho } from "@/features/sessao/service";
import { runAction } from "@/lib/action";
import { getSession } from "@/lib/auth";
import { assertAllowed } from "@/lib/errors";
import {
  apagarCookiesDoAparelho,
  aparelhoPareadoAtual,
  guardarConsultaDePareamento,
  guardarCredencialPareada,
  lerConsultaDePareamento,
  lerCredencialPareada,
} from "./http";
import { identidadeNativaDoAparelho } from "./nativo";
import {
  aprovarPareamento,
  consultarPareamento,
  definirPinDaConta,
  definirPinDoMenor,
  desconectarUmDoMenor,
  prepararPareamento,
  sairDoAparelhoPareado,
  trocarPerfilComPin,
} from "./service";

export async function trocarPerfilComPinAction(entrada: unknown) {
  return runAction(async () => {
    const identidade = await identidadeNativaDoAparelho();
    assertAllowed(identidade, "AUTH", "Entre novamente para continuar.");
    const resultado = await trocarPerfilComPin(identidade, entrada);
    return {
      destination:
        resultado.tipo === "minor"
          ? "/aparelho"
          : resultado.tipo === "adult"
            ? "/estante"
            : "/conta",
    };
  });
}
export async function sairDoCompartilhadoAction() {
  return runAction(async () => {
    const identidade = await identidadeNativaDoAparelho();
    const login = await getSession();
    assertAllowed(
      identidade && login && login.user.id === identidade.contaId,
      "AUTH",
      "Entre novamente para continuar.",
    );
    await encerrarSessaoDeAparelho({ authSessionId: login.session.id, contaId: login.user.id });
    return { destination: "/entrar?encerrada=1" };
  });
}

export async function definirPinNativoAction(entrada: unknown) {
  return runAction(async () => {
    await definirPinDaConta(await autorDaFamilia(), entrada);
    return { salvo: true };
  });
}
export async function definirPinMenorAction(entrada: unknown) {
  return runAction(async () => {
    await definirPinDoMenor(await autorDaFamilia(), entrada);
    return { salvo: true };
  });
}

export async function prepararPareamentoAction() {
  return runAction(async () => {
    const pedido = await prepararPareamento(clientIpFromHeaders(await headers()));
    // Dedicá-lo a um menor retira a autoridade nativa antiga deste mesmo navegador.
    const login = await getSession();
    if (login)
      await dedicarAparelhoAMenor({
        authSessionId: login.session.id,
        contaId: login.user.id,
        expiraEm: new Date(login.session.expiresAt),
      });
    const anterior = await lerCredencialPareada();
    if (anterior) await sairDoAparelhoPareado(anterior);
    await apagarCookiesDoAparelho();
    await guardarConsultaDePareamento(pedido.segredo, pedido.expiraEm);
    return { codigo: pedido.codigo, expiraEm: pedido.expiraEm };
  });
}
export async function consultarPareamentoAction() {
  return runAction(async () => {
    if (await aparelhoPareadoAtual())
      return { estado: "pareado" as const, destination: "/aparelho" };
    const segredo = await lerConsultaDePareamento();
    assertAllowed(segredo, "PAREAMENTO", "Abra um novo código para continuar.");
    const resultado = await consultarPareamento(segredo);
    if (resultado.estado === "aguardando") return { estado: resultado.estado };
    await guardarCredencialPareada(resultado.credencial, resultado.expiraEm);
    return { estado: "pareado" as const, destination: "/aparelho" };
  });
}
export async function aprovarPareamentoAction(entrada: unknown) {
  return runAction(async () => {
    await aprovarPareamento(await autorDaFamilia(), entrada);
    return { aprovado: true };
  });
}
export async function desconectarPareadoAction(entrada: unknown) {
  return runAction(async () => {
    await desconectarUmDoMenor(await autorDaFamilia(), entrada);
    return { encerrado: true };
  });
}
export async function sairDoPareadoAction() {
  return runAction(async () => {
    const credencial = await lerCredencialPareada();
    if (credencial) await sairDoAparelhoPareado(credencial);
    await apagarCookiesDoAparelho();
    return { destination: "/parear" };
  });
}
