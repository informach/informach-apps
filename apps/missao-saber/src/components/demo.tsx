"use client";
import { useState } from "react";
import { BarsLab } from "@/features/labs/components/labs";
import { Alternativa } from "./ui/alternativa";
import { BotaoChapa, LinkChapa } from "./ui/botao-chapa";
import { Chapa } from "./ui/chapa";
import { FalaFaisca } from "./ui/fala-faisca";
import { LerEmVoz } from "./ui/ler-em-voz";
import { Etiqueta } from "./ui/pagina";

const ENUNCIADO =
  "Uma peça custa R$ 200. A loja dá 20% de desconto e, depois, mais 10% sobre o preço reduzido. Qual é o preço final?";

const PASSOS = ["Prever", "Conferir", "Nomear a estratégia"] as const;

/**
 * Missão demonstrativa pública.
 *
 * É a tela que decide a assinatura, então ela precisa entregar o ciclo
 * completo do produto em três minutos: prever antes de calcular, conferir com
 * a devolutiva da Faísca, manipular a representação e — o passo que faltava —
 * **nomear a estratégia** aprendida. Terminar sabendo o nome do que se
 * aprendeu é o que diferencia uma questão solta de uma missão.
 *
 * Continua sem cadastro, sem cartão, sem salvar dados e sem atribuir domínio.
 */
export function Demo() {
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [help, setHelp] = useState(false);
  const acertou = answer === "R$ 144";
  const passo = checked ? 3 : answer ? 2 : 1;
  return (
    <div className="mx-auto max-w-3xl">
      <Etiqueta tom="lima">
        Missão demonstrativa · passo {passo} de 3 · {PASSOS[passo - 1]}
      </Etiqueta>
      <p className="mt-2 text-sm text-tinta-suave">
        Exemplo de uma missão do 7º ano. Cada trilha tem problemas do tamanho do ano escolar, do 2º
        ano ao ensino médio.
      </p>

      <FalaFaisca humor="acolhendo" tom="verde" titulo="Oi! Sou a Faísca." className="mt-4">
        <p>
          Vou te acompanhar nesta missão de três minutos. Aqui não existe vida para perder: a gente
          prevê, experimenta e no fim dá nome ao que descobriu.
        </p>
      </FalaFaisca>

      <h1 className="mt-7 font-display text-3xl leading-tight font-semibold text-tinta sm:text-4xl">
        Um desconto pode esconder uma surpresa.
      </h1>
      <div className="mt-3 flex items-start gap-3">
        <p className="min-w-0 flex-1 text-lg text-tinta">{ENUNCIADO}</p>
        <LerEmVoz texto={ENUNCIADO} />
      </div>

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
        <div role="status" className="mt-5 motion-safe:animate-pop-in">
          <FalaFaisca
            humor={acertou ? "comemorando" : "encorajando"}
            tom={acertou ? "verde" : "coral"}
            titulo={acertou ? "Isso! A referência muda." : "Vamos olhar para a segunda etapa."}
            tituloComo="h2"
          >
            <p>
              {answer === "R$ 140"
                ? "Somar 20% e 10% usa os R$ 200 como base duas vezes. Mas o segundo desconto usa R$ 160."
                : answer === "R$ 160"
                  ? "R$ 160 é o valor depois do primeiro desconto. Ainda falta aplicar 10% sobre esse novo valor."
                  : "O primeiro desconto retira R$ 40 e deixa R$ 160."}{" "}
              Dez por cento de R$ 160 são R$ 16. O preço final é R$ 144.
            </p>
          </FalaFaisca>
        </div>
      )}

      {(checked || help) && (
        <div className="mt-6">
          <BarsLab />
        </div>
      )}

      {checked && (
        <FalaFaisca
          humor="comemorando"
          tom="lima"
          titulo="Você acabou de usar uma estratégia."
          tituloComo="h2"
          className="mt-7"
        >
          <p>
            <strong className="font-display">Porcentagem sobre o valor já alterado.</strong> Quando
            duas mudanças vêm em sequência, a segunda se aplica ao valor novo, não ao original. A
            mesma estratégia reaparece em aumento de preço, juros e comparação de ofertas, e é por
            isso que ela vale mais do que a resposta desta questão.
          </p>
        </FalaFaisca>
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
