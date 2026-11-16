import { doCatalogo } from "../conteudo";
import { listar, obter } from "../dominio/tabela";
import type { EstadoDoMundo, Lote, PontoMm } from "../dominio/tipos";
import { pegadaNoLote } from "./colocacao";
import { CELULA, type Navegador, trechosSolidos } from "./navegador";
import { ondeEsta } from "./posicoes";

const RAIO_DE_BUSCA_MM = 6000;
const SEPARACAO_MM = 1000;
const RAIO_DO_CORPO_MM = 300;

function pertoDaParede(
  [x, y]: PontoMm,
  [ax, ay, bx, by]: readonly [number, number, number, number],
): boolean {
  const dx = bx - ax,
    dy = by - ay;
  const comprimento = dx * dx + dy * dy;
  const produto = (x - ax) * dx + (y - ay) * dy;
  if (produto <= 0) return (x - ax) ** 2 + (y - ay) ** 2 < RAIO_DO_CORPO_MM ** 2;
  if (produto >= comprimento) return (x - bx) ** 2 + (y - by) ** 2 < RAIO_DO_CORPO_MM ** 2;
  const cruzado = BigInt((x - ax) * dy - (y - ay) * dx);
  return cruzado * cruzado < BigInt(RAIO_DO_CORPO_MM ** 2) * BigInt(comprimento);
}

/** Busca limitada antes de alocar IDs. Sem deslocar ninguém de um mundo salvo. */
export function chegadaDaFamilia(
  estado: EstadoDoMundo,
  lote: Lote,
  navegador: Navegador,
  quantidade: number,
): PontoMm[] | null {
  if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 32)
    throw new Error("Quantidade de moradores inválida na chegada");
  const imovel = lote.imovelId ? obter(estado.imoveis, lote.imovelId) : null;
  const paredes = imovel ? trechosSolidos(imovel, 0) : [];
  const presentes = listar(estado.moradores).flatMap((morador) => {
    const onde = ondeEsta(estado, morador, estado.relogio.tick);
    return onde?.loteId === lote.id && onde.andar === 0 ? [onde.pos] : [];
  });
  const volumes = listar(estado.objetos)
    .filter((objeto) => objeto.loteId === lote.id && objeto.andar === 0)
    .flatMap((objeto) => {
      const catalogo = doCatalogo(objeto.catalogo);
      const area = pegadaNoLote(objeto);
      if (!catalogo || !area) throw new Error("Catálogo ausente na chegada");
      return catalogo.camadaDeColisao === "piso" || catalogo.fixacao !== "chao" ? [] : [area];
    });
  const candidatos: { ponto: PontoMm; distancia: number }[] = [];
  const centro: PontoMm = [
    Math.floor(lote.entrada[0] / CELULA) * CELULA + CELULA / 2,
    Math.floor(lote.entrada[1] / CELULA) * CELULA + CELULA / 2,
  ];
  for (let dy = -RAIO_DE_BUSCA_MM; dy <= RAIO_DE_BUSCA_MM; dy += CELULA)
    for (let dx = -RAIO_DE_BUSCA_MM; dx <= RAIO_DE_BUSCA_MM; dx += CELULA) {
      const ponto: PontoMm = [centro[0] + dx, centro[1] + dy];
      const [x, y] = ponto;
      if (dx * dx + dy * dy > RAIO_DE_BUSCA_MM ** 2) continue;
      if (
        x < RAIO_DO_CORPO_MM ||
        y < RAIO_DO_CORPO_MM ||
        x > lote.tamanho[0] - RAIO_DO_CORPO_MM ||
        y > lote.tamanho[1] - RAIO_DO_CORPO_MM
      )
        continue;
      if (!navegador.alcancavel(ponto)) continue;
      if (paredes.some((parede) => pertoDaParede(ponto, parede))) continue;
      if (presentes.some((outro) => (x - outro[0]) ** 2 + (y - outro[1]) ** 2 < SEPARACAO_MM ** 2))
        continue;
      if (
        volumes.some(
          ([x0, y0, x1, y1]) =>
            x + RAIO_DO_CORPO_MM > x0 &&
            x - RAIO_DO_CORPO_MM < x1 &&
            y + RAIO_DO_CORPO_MM > y0 &&
            y - RAIO_DO_CORPO_MM < y1,
        )
      )
        continue;
      candidatos.push({
        ponto,
        distancia: (x - lote.entrada[0]) ** 2 + (y - lote.entrada[1]) ** 2,
      });
    }
  candidatos.sort(
    (a, b) => a.distancia - b.distancia || a.ponto[1] - b.ponto[1] || a.ponto[0] - b.ponto[0],
  );
  const escolhidos: PontoMm[] = [];
  for (const { ponto } of candidatos) {
    if (
      escolhidos.some(
        (outro) => (ponto[0] - outro[0]) ** 2 + (ponto[1] - outro[1]) ** 2 < SEPARACAO_MM ** 2,
      )
    )
      continue;
    escolhidos.push(ponto);
    if (escolhidos.length === quantidade) return escolhidos;
  }
  return null;
}
