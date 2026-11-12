import { type ClienteDeTeste, criarBancada } from "../test/apoio";

/**
 * Medida de bancada do custo de um mundo aberto: instâncias de verdade, a
 * plataforma em memória e robôs que jogam, tudo no mesmo processo e com o
 * tempo andando o mais rápido que der. Mede CPU de simulação, de codificação
 * dos quadros e de gravação (em memória), sem rede e sem banco.
 *
 * Serve para comparar cenários e achar regressões. O custo real por hora de
 * mundo é o medido no Railway, com rede, banco e o processo de verdade.
 *
 * uso: pnpm --filter @informach/morada-server carga [mundos] [minutos]
 */

const MUNDOS = Number(process.argv[2] ?? 20);
const MINUTOS = Number(process.argv[3] ?? 10);
const TICKS = MINUTOS * 600;
const JOGADORES = [1, 2, 4, 8];

/** Um robô: escolhe um morador e manda um comando de vez em quando. */
async function jogar(robo: ClienteDeTeste, indice: number, tick: number): Promise<void> {
  const visao = robo.visao;
  if (!visao || robo.fechamento !== null) return;
  const daFamilia = visao.moradores.ordem.filter((id) => visao.moradores.porId[id]?.familiaId);
  const meu = daFamilia[indice % daFamilia.length];
  if (!meu) return;
  const semente = (tick * 31 + indice * 17) % 97;
  if (tick === 5 + indice) return void (await robo.comando(meu, { t: "reservar" }));
  // Um comando a cada 5 a 15 segundos.
  if ((tick + indice * 13) % (50 + (semente % 100)) !== 0) return;
  const cx = 16 + (semente % 30);
  const cy = 6 + ((semente * 7) % 10);
  await robo.comando(meu, { t: "ir_para", pos: [cx * 250 + 125, cy * 250 + 125], andar: 0 });
}

type Linha = {
  jogadores: number;
  cpuPorMundoHoraS: number;
  msPorTick: number;
  piorPassoMs: number;
  kbPorMundoSegundo: number;
  heapPorMundoKb: number;
  fotografiaKb: number;
  mundosPorVcpu: number;
};

async function medir(jogadores: number): Promise<Linha> {
  const bancada = await criarBancada({ capacidade: MUNDOS + 1 });
  const { instancia } = await bancada.novaInstancia();
  const robos: ClienteDeTeste[][] = [];

  globalThis.gc?.();
  const heapAntes = process.memoryUsage().heapUsed;
  for (let m = 0; m < MUNDOS; m++) {
    const dono = bancada.jogador(`dono-${m}`);
    const mundoId = bancada.criarMundo(dono);
    await bancada.entrar(dono, mundoId);
    const doMundo = [dono];
    for (let j = 1; j < jogadores; j++) {
      const convidado = bancada.jogador(`robo-${m}-${j}`);
      bancada.convidar(mundoId, convidado);
      await bancada.entrar(convidado, mundoId);
      doMundo.push(convidado);
    }
    robos.push(doMundo);
  }
  const todos = robos.flat();
  // Aquecimento: os primeiros passos compilam o código e montam os caches de navegação.
  await bancada.andar(300, undefined, todos);
  globalThis.gc?.();
  const heapDepois = process.memoryUsage().heapUsed;

  const antes = instancia.medir().porMundo;
  const cpuAntes = process.cpuUsage();
  for (let tick = 0; tick < TICKS; tick++) {
    for (const doMundo of robos) {
      for (let j = 0; j < doMundo.length; j++) await jogar(doMundo[j] as ClienteDeTeste, j, tick);
    }
    await bancada.andar(1, undefined, todos);
  }
  const cpu = process.cpuUsage(cpuAntes);
  const depois = instancia.medir().porMundo;

  const cpuMs = (cpu.user + cpu.system) / 1000;
  const mundoTicks = MUNDOS * TICKS;
  const bytes =
    depois.reduce((s, m) => s + m.bytesEnviados, 0) -
    antes.reduce((s, m) => s + m.bytesEnviados, 0);
  const msPorTick = cpuMs / mundoTicks;
  return {
    jogadores,
    // Um mundo anda 36.000 passos por hora.
    cpuPorMundoHoraS: (msPorTick * 36_000) / 1000,
    msPorTick,
    piorPassoMs: Math.max(...depois.map((m) => m.piorPassoMs)),
    kbPorMundoSegundo: bytes / mundoTicks / 100,
    heapPorMundoKb: (heapDepois - heapAntes) / MUNDOS / 1024,
    fotografiaKb: Math.max(...depois.map((m) => m.bytesDaUltimaFotografia)) / 1024,
    // Quantos mundos cabem em um núcleo usando 60% dele, a 10 passos por segundo.
    mundosPorVcpu: Math.floor(60 / msPorTick),
  };
}

const linhas: Linha[] = [];
for (const jogadores of JOGADORES) linhas.push(await medir(jogadores));

console.log(`\n${MUNDOS} mundos, ${MINUTOS} min de jogo cada, Node ${process.version}\n`);
console.log(
  "| Jogadores por mundo | CPU por hora de mundo | CPU por passo | Pior passo | Tráfego por mundo | Memória por mundo | Fotografia | Mundos em 1 vCPU (60%) |",
);
console.log("| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const l of linhas) {
  console.log(
    `| ${l.jogadores} | ${l.cpuPorMundoHoraS.toFixed(1)} s | ${l.msPorTick.toFixed(3)} ms | ${l.piorPassoMs.toFixed(1)} ms | ${l.kbPorMundoSegundo.toFixed(2)} kB/s | ${l.heapPorMundoKb.toFixed(0)} kB | ${l.fotografiaKb.toFixed(1)} kB | ${l.mundosPorVcpu} |`,
  );
}
