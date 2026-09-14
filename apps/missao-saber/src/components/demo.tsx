"use client";
import { useState } from "react";
import { BarsLab } from "@/features/labs/components/labs";
import { Mascote } from "./mascote";
import { Alternativa } from "./ui/alternativa";
import { BotaoChapa, LinkChapa } from "./ui/botao-chapa";
import { Chapa } from "./ui/chapa";
import { Etiqueta } from "./ui/pagina";

export function Demo() {
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [help, setHelp] = useState(false);
  const acertou = answer === "R$ 144";
  return (
    <div className="mx-auto max-w-3xl">
      <Etiqueta tom="lima">Missão demonstrativa · 3 minutos</Etiqueta>
      <h1 className="mt-3 font-display text-3xl leading-tight font-semibold text-tinta sm:text-4xl">
        Um desconto pode esconder uma surpresa.
      </h1>
      <p className="mt-3 text-lg text-tinta">
        Uma peça custa R$ 200. A loja dá 20% de desconto e, depois, mais 10% sobre o preço reduzido.
        Qual é o preço final?
      </p>

      <fieldset className="mt-7 border-0 p-0" disabled={checked}>
        <legend className="mb-4 font-display text-lg font-semibold text-tinta">
          Faça uma previsão antes de experimentar.
        </legend>
        <div className="grid gap-3">
          {/* Sem letra: aqui o nome acessível do radio precisa ser só o valor. */}
          {["R$ 140", "R$ 144", "R$ 160"].map((option) => (
            <Alternativa
              key={option}
              name="demo"
              valor={option}
              marcada={answer === option}
              desabilitada={checked}
              onEscolher={() => setAnswer(option)}
            />
          ))}
        </div>
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <BotaoChapa
          type="button"
          medida="g"
          disabled={!answer || checked}
          onClick={() => setChecked(true)}
        >
          Conferir minha ideia
        </BotaoChapa>
        <BotaoChapa type="button" tom="sol" onClick={() => setHelp(true)}>
          Quero uma pista
        </BotaoChapa>
      </div>

      {help && (
        <p
          className="mt-4 rounded-card border-2 border-sol/45 bg-sol-claro p-4 text-tinta motion-safe:animate-pop-in"
          role="status"
        >
          Após o primeiro desconto, qual valor passa a ser o novo inteiro de referência?
        </p>
      )}

      {checked && (
        <div
          role="status"
          className={`mt-5 flex flex-col gap-4 rounded-card border-2 p-5 sm:flex-row sm:items-center motion-safe:animate-pop-in ${
            acertou ? "border-verde/40 bg-verde-claro" : "border-coral/40 bg-coral-claro"
          }`}
        >
          <Mascote
            humor={acertou ? "comemorando" : "encorajando"}
            tamanho="p"
            flutua={false}
            className="max-sm:hidden"
          />
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold text-tinta">
              {acertou ? "Isso! A referência muda." : "Vamos olhar para a segunda etapa."}
            </h2>
            <p className="mt-2 text-tinta">
              {answer === "R$ 140"
                ? "Somar 20% e 10% usa os R$ 200 como base duas vezes. Mas o segundo desconto usa R$ 160."
                : answer === "R$ 160"
                  ? "R$ 160 é o valor depois do primeiro desconto. Ainda falta aplicar 10% sobre esse novo valor."
                  : "O primeiro desconto retira R$ 40 e deixa R$ 160."}{" "}
              Dez por cento de R$ 160 são R$ 16. O preço final é R$ 144.
            </p>
          </div>
        </div>
      )}

      {(checked || help) && (
        <div className="mt-6">
          <BarsLab />
        </div>
      )}

      <Chapa tom="uva" className="mt-9">
        <h2 className="font-display text-2xl font-semibold text-tinta">
          Uma pequena ideia. Muitas aplicações.
        </h2>
        <p className="mt-2 mb-5 text-tinta">
          Crie uma conta do responsável para explorar a unidade gratuita e guardar o progresso. Esta
          demonstração não salva dados nem atribui domínio.
        </p>
        <LinkChapa href="/entrar" medida="g">
          Abrir minha jornada →
        </LinkChapa>
      </Chapa>
    </div>
  );
}
