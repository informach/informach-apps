import { randomBytes, randomUUID } from "node:crypto";
import type { CabecalhoLido } from "../src/features/direitos/livro/armazenamento";
import {
  criarAssinaturaDoLivro,
  resumoDoRegistro,
} from "../src/features/direitos/livro/assinatura";
import { type CabecalhoDeDireitos, RAIZ_VAZIA } from "../src/features/direitos/livro/contrato";
export function fixtureDoLivro() {
  const livroId = randomUUID(),
    segredo = randomBytes(32),
    chaves = new Map([["v1", segredo]]),
    assinatura = criarAssinaturaDoLivro({ livroId, chaveAtiva: "v1", chaves });
  const inicial: CabecalhoDeDireitos = {
    formato: "recreio-livro-direitos-v1",
    estado: "aberto",
    livroId,
    geracao: 0,
    entradas: 0,
    raizSha256: RAIZ_VAZIA,
    anteriorSha256: null,
    ultimaIntencao: null,
    atualizadoEm: "2026-11-19T10:00:00.000Z",
  };
  const intencao = () => ({
    formato: "recreio-intencao-direitos-v1" as const,
    livroId,
    operacaoId: randomUUID(),
    revisao: 1,
    tipo: "retirar_perfil" as const,
    contaId: "fixture-account",
    perfilIds: [randomUUID()],
    planoSha256: "a".repeat(64),
    consentidaEm: "2026-11-19T10:00:00.000Z",
    autenticadaEm: "2026-11-19T09:59:00.000Z",
    fonte: "b".repeat(40),
  });
  function proximo(anterior: CabecalhoLido, bytes: Buffer): CabecalhoDeDireitos {
    const i = assinatura.lerIntencao(bytes),
      sha256 = resumoDoRegistro(bytes);
    return {
      formato: "recreio-livro-direitos-v1",
      estado: "aberto",
      livroId,
      geracao: anterior.documento.geracao + 1,
      entradas: anterior.documento.entradas + 1,
      raizSha256: resumoDoRegistro(
        Buffer.from(JSON.stringify([anterior.documento.raizSha256, sha256])),
      ),
      anteriorSha256: anterior.sha256,
      ultimaIntencao: { operacaoId: i.operacaoId, revisao: i.revisao, sha256 },
      atualizadoEm: "2026-11-19T10:01:00.000Z",
    };
  }
  return {
    livroId,
    segredo,
    chaves,
    assinatura,
    inicial,
    intencao,
    proximo,
    encerrar() {
      assinatura.encerrar();
      segredo.fill(0);
    },
  };
}
