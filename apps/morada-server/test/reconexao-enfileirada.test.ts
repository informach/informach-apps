import { expect, it } from "vitest";
import { criarBancada, mundoDe } from "./apoio";

it.each([1, 3])("%i quedas antigas na fila não derrubam a sessão que já voltou", async (quedas) => {
  const bancada = await criarBancada();
  await bancada.novaInstancia();
  const lia = bancada.jogador("Lia");
  const mundoId = bancada.criarMundo(lia);
  await bancada.entrar(lia, mundoId);
  const moradora = lia.moradorDeNome("Lia").id;
  const reservar = await lia.comando(moradora, { t: "reservar" });
  await bancada.andar(1);
  expect(lia.resultados.get(reservar)).toMatchObject({ ok: true });
  for (let i = 0; i < quedas; i++) {
    lia.cair();
    // A reentrada é admitida antes do próximo passo processar o aviso antigo.
    await bancada.entrar(lia, mundoId);
    expect(lia.fechamento).toBeNull();
  }
  expect(lia.visao?.presenca.jogadores).toContainEqual({
    perfilId: lia.jogadorId,
    apelido: "Lia",
    estado: "presente",
  });
  const votar = await lia.comando(null, { t: "votar_velocidade", velocidade: 1 });
  await bancada.andar(1);
  expect(lia.visao?.presenca.jogadores).toContainEqual({
    perfilId: lia.jogadorId,
    apelido: "Lia",
    estado: "presente",
  });
  expect(lia.resultados.get(votar)).toMatchObject({ ok: true });
  // O prazo de graça antigo também não deve remover quem está conectado.
  await bancada.andar(310);
  expect(lia.fechamento).toBeNull();
  expect(lia.visao?.presenca.reservas).toContainEqual({
    moradorId: moradora,
    perfilId: lia.jogadorId,
  });
  expect(lia.visao?.presenca.jogadores).toContainEqual({
    perfilId: lia.jogadorId,
    apelido: "Lia",
    estado: "presente",
  });
});

it("queda sem conexão sucessora continua entrando em graça e liberando a reserva", async () => {
  const bancada = await criarBancada();
  const { instancia } = await bancada.novaInstancia();
  const lia = bancada.jogador("Lia");
  const bruno = bancada.jogador("Bruno");
  const mundoId = bancada.criarMundo(lia);
  await bancada.entrar(lia, mundoId);
  bancada.convidar(mundoId, bruno, "familia:fam_000001");
  await bancada.entrar(bruno, mundoId);
  const moradora = lia.moradorDeNome("Lia").id;
  const reservar = await lia.comando(moradora, { t: "reservar" });
  await bancada.andar(1);
  expect(lia.resultados.get(reservar)).toMatchObject({ ok: true });
  const sid = bancada.sessaoDe(lia);
  lia.cair();
  await bancada.andar(1);
  expect(mundoDe(instancia, mundoId).presenca.sessoes.find((s) => s.sessaoId === sid)?.estado).toBe(
    "em_graca",
  );
  await bancada.andar(310);
  expect(mundoDe(instancia, mundoId).presenca.sessoes.some((s) => s.sessaoId === sid)).toBe(false);
  expect(bruno.visao?.presenca.reservas).not.toContainEqual({
    moradorId: moradora,
    perfilId: lia.jogadorId,
  });
});
