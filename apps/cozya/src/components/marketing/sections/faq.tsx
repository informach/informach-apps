"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@informach/ui/components/accordion";

const QUESTIONS = [
  {
    q: "Preciso pagar pra começar?",
    a: "Não. O plano Free salva receitas manualmente sem custo, sem cartão e sem prazo. Você só paga quando quiser usar IA pra importar de imagem, ditar por voz ou gerar receita por prompt.",
  },
  {
    q: "Como funciona a busca por voz?",
    a: "Aperta o ícone de microfone e fala o nome ou descrição da receita ('bolo de cenoura', 'massa pra nhoque sem batata'). A IA transcreve, busca na web se precisar e estrutura uma receita pronta pra cozinhar. Cada busca por voz consome 1 crédito do seu plano.",
  },
  {
    q: "Como funcionam os créditos de IA?",
    a: "Toda assinatura Pro renova 50 créditos todo mês. Cada chamada à IA (importar foto, gerar por prompt, ditar por voz) consome 1 crédito. Acabou antes da renovação? Compra um pacote avulso ou espera o próximo ciclo. O cadastro manual continua liberado.",
  },
  {
    q: "O que acontece se meus créditos acabarem?",
    a: "Você continua salvando receitas manualmente, normalmente. Só os recursos de IA pausam até a renovação do mês ou até você comprar créditos extras avulsos.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. Cancela direto na sua conta, sem fidelidade. Você mantém acesso ao plano Pro até o fim do ciclo já pago e depois volta automaticamente pro Free.",
  },
  {
    q: "Preciso instalar pela loja de apps?",
    a: "Não. O Cozya abre direto no navegador do celular. Quando a versão instalável estiver pronta, a gente avisa no produto.",
  },
  {
    q: "Minhas receitas ficam privadas?",
    a: "Sim. Cada conta tem suas próprias receitas. Compartilhamento só acontece quando você decide, pelo WhatsApp, com 1 toque.",
  },
  {
    q: "Posso importar print de receita do WhatsApp?",
    a: "Pode. Cola a foto, faz upload ou tira foto direto do print na tela. A IA extrai o nome, ingredientes e preparo, e você revisa antes de salvar.",
  },
  {
    q: "Tem app pra Android e iPhone?",
    a: "O Cozya abre no navegador em iPhone e Android. Você não precisa passar por loja de apps pra começar a organizar receitas.",
  },
] as const;

export function Faq() {
  return (
    <section id="perguntas" className="container mx-auto px-4 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">
          Perguntas frequentes
        </p>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Perguntas que aparecem direto.
        </h2>
      </div>

      <div className="mx-auto mt-10 max-w-3xl">
        <Accordion type="single" collapsible className="w-full">
          {QUESTIONS.map((item, index) => (
            <AccordionItem key={item.q} value={`item-${index}`}>
              <AccordionTrigger className="text-left text-base">{item.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
