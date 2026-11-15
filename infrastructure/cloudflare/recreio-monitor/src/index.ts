import { executarMonitoramento, FalhaDaSonda } from "../../../../scripts/recreio/sonda.mjs";

export default {
  async scheduled(_controller, env) {
    try {
      const ok = await executarMonitoramento(env, {
        prova: env.MONITOR_PROVA_TRANSPORTE === "true",
        origem: "cloudflare-worker",
      });
      if (!ok) throw new Error("SONDA_OU_TRANSPORTE_FALHOU");
    } catch (erro) {
      console.error(
        JSON.stringify({
          ok: false,
          codigo: erro instanceof FalhaDaSonda ? erro.codigo : "SONDA_OU_TRANSPORTE_FALHOU",
        }),
      );
      // A plataforma também registra falha, sem expor exceções da rede ou segredos.
      throw new Error("RECREIO_MONITOR_FALHOU");
    }
  },
  fetch() {
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
