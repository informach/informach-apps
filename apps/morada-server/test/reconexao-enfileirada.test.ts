import { expect, it } from "vitest";
import { criarBancada } from "./apoio";

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
  expect(lia.resultados.get(votar)).toMatchObject({ ok: true });
  expect(lia.visao?.presenca.jogadores).toContainEqual({
    perfilId: lia.jogadorId,
    apelido: "Lia",
    estado: "presente",
  });
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
