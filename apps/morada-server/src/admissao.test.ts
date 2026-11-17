import { expect, it } from "vitest";
import { criarAdmissao } from "./admissao";

it("limita conexões antes da sessão e libera cada vaga uma vez", () => {
  const admissao = criarAdmissao({ conexoes: 1, pedidosEmCurso: 1, quadrosPorSegundo: 2 });
  const liberar = admissao.conectar();
  expect(liberar).not.toBeNull();
  expect(admissao.conectar()).toBeNull();
  liberar?.();
  liberar?.();
  expect(admissao.medir().conexoes).toBe(0);
  expect(admissao.conectar()).not.toBeNull();
  expect(admissao.conectar()).toBeNull();
});

it("limita verificação em curso e recarrega a vazão pelo relógio monotônico", () => {
  let agora = 0;
  const admissao = criarAdmissao(
    { conexoes: 2, pedidosEmCurso: 1, quadrosPorSegundo: 2 },
    () => agora,
  );
  const liberar = admissao.pedir();
  expect(liberar).not.toBeNull();
  expect(admissao.pedir()).toBeNull();
  liberar?.();
  liberar?.();
  expect(admissao.medir().pedidosEmCurso).toBe(0);
  admissao.pedir()?.();
  expect(admissao.pedir()).toBeNull();
  agora = 499;
  expect(admissao.pedir()).toBeNull();
  agora = 500;
  expect(admissao.pedir()).not.toBeNull();
});
