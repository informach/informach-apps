import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { MundoIdSchema } from "@informach/recreio";
import { z } from "zod";
import { prepararRestauracaoDoMorada, restaurarMorada } from "../src/features/recuperacao/morada";
import { fotografiasRetidas, RecusaDeRecuperacao } from "../src/features/recuperacao/repository";

const USO = `Uso: pnpm --filter @informach/recreio-app restaurar-morada --mundo UUID [--antes REVISAO]
Preparar: --mundo UUID --revisao FONTE --revisao-atual ATUAL [--operacao UUID] [--motivo CODIGO]
Aplicar: os mesmos argumentos, com --aplicar, --operacao UUID e --motivo CODIGO explícitos.
DATABASE_URL deve vir do ambiente. O comando nunca exibe conteúdo do mundo.`;
const Numero = z.coerce.number().int().nonnegative();

async function main() {
  const { values } = parseArgs({
    options: {
      mundo: { type: "string" },
      revisao: { type: "string" },
      "revisao-atual": { type: "string" },
      antes: { type: "string" },
      operacao: { type: "string" },
      motivo: { type: "string" },
      aplicar: { type: "boolean", default: false },
    },
  });
  const mundoId = MundoIdSchema.parse(values.mundo);
  if (values.revisao === undefined && !values.aplicar) {
    console.log(
      JSON.stringify(
        {
          fotografias: await fotografiasRetidas(
            mundoId,
            "morada",
            values.antes === undefined ? undefined : Numero.parse(values.antes),
          ),
          limite: 100,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (values.aplicar && (!values.operacao || !values.motivo)) throw new ErrorDeUso();
  const pedido = {
    mundoId,
    revisaoFonte: Numero.parse(values.revisao),
    revisaoEsperada: Numero.parse(values["revisao-atual"]),
    operacaoId: values.operacao ?? randomUUID(),
    motivo: values.motivo ?? "ensaio",
  };
  if (values.aplicar)
    console.log(
      JSON.stringify({ estado: "aplicada", recibo: await restaurarMorada(pedido) }, null, 2),
    );
  else {
    const preparada = await prepararRestauracaoDoMorada(pedido);
    console.log(
      JSON.stringify(
        {
          estado: "preparada_sem_gravacao",
          ...preparada.resumo,
          motivo: pedido.motivo,
          aviso:
            "Confirme a janela de deriva recuperada; os fatos críticos disponíveis foram reaplicados. Para aplicar, mantenha os mesmos argumentos e acrescente --aplicar.",
        },
        null,
        2,
      ),
    );
  }
}

class ErrorDeUso extends Error {}
main()
  .then(() => process.exit(0))
  .catch((erro: unknown) => {
    if (
      erro instanceof z.ZodError ||
      erro instanceof ErrorDeUso ||
      (erro instanceof TypeError && "code" in erro)
    ) {
      console.error(USO);
      process.exit(2);
    }
    if (erro instanceof RecusaDeRecuperacao) {
      console.error(
        `Recuperação recusada: ${erro.codigo}. Nenhuma nova revisão foi confirmada por esta tentativa.`,
      );
      process.exit(1);
    }
    console.error(
      "Operação não confirmada. Consulte o recibo repetindo a mesma operação UUID; não altere os argumentos. Nenhum detalhe de banco/conteúdo será exibido.",
    );
    process.exit(3);
  });
