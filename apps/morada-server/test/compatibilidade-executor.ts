/** Processo descartável do gate de versões: roda também no checkout publicado. */
import { VERSAO_DO_PROTOCOLO } from "@informach/morada-sim/protocolo";
import { criarEmissorDeTeste, criarPlataformaFalsa } from "@informach/recreio/testing";
import { criarInstancia } from "../src/instancia";
import { criarServidor } from "../src/servidor";

if (!process.send) throw new Error("O executor exige IPC do gate");
const plataforma = criarPlataformaFalsa({ inicio: Date.now() });
const emissor = await criarEmissorDeTeste();
const inicio = performance.now();
const base = plataforma.agora();
const agora = () => {
  const alvo = base + Math.floor(performance.now() - inicio);
  if (alvo > plataforma.agora()) plataforma.avancar(alvo - plataforma.agora());
  return plataforma.agora();
};
const instancia = criarInstancia({
  host: plataforma.cliente(),
  verificador: emissor.verificador("morada", () => new Date(agora())),
  agora,
  urlPublica: "ws://localhost",
  versao: "compatibilidade",
  capacidade: 1,
});
const servidor = criarServidor({
  instancia,
  origens: ["http://localhost:3009"],
  commit: null,
  tokenDeMetricas: null,
});
const porta = await servidor.iniciar(0, "127.0.0.1");
const perfilId = plataforma.criarPerfil({ apelido: "Prova de versão" });
const mundoId = plataforma.criarMundo({ criador: perfilId });
plataforma.abrirMundo(mundoId, perfilId);
const sid = plataforma.abrirSessao(perfilId);
const sessao = await emissor.sessao({ perfilId, sid, agora: new Date(agora()) });
process.send({
  t: "pronto",
  endereco: `ws://127.0.0.1:${porta}`,
  mundoId,
  sessao,
  protocolo: VERSAO_DO_PROTOCOLO,
});
process.on("message", (mensagem) => {
  if (mensagem === "medir") process.send?.({ t: "medidas", mundos: instancia.medir().mundos });
});
process.once("SIGTERM", () => {
  void servidor.encerrar().then(
    () => process.exit(0),
    () => process.exit(1),
  );
});
