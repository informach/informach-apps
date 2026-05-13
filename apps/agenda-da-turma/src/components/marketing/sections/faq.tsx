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
    a: "Não. O plano Free cabe 1 filho e 20 atividades, sem cartão e sem prazo. Você só assina quando quiser cadastrar mais filhos, usar a IA ou compartilhar atividades com outros pais da turma.",
  },
  {
    q: "Como funciona o cadastro por IA?",
    a: "Você fala no microfone, manda foto do quadro ou envia o PDF da escola. A IA entende data, matéria, tipo (prova, trabalho, lição) e qual filho é. Antes de salvar, mostra a lista pra você confirmar. Voz custa 2 créditos (transcrição e parse), foto e PDF custam 1 cada. O Pro vem com 70 créditos por mês.",
  },
  {
    q: "Cabe quantos filhos?",
    a: "Free: 1 perfil de estudante. Pro: até 3 perfis. Cada perfil tem cor própria, suas próprias turmas e matérias, e o calendário pode filtrar por filho ou ver tudo junto.",
  },
  {
    q: "Outros pais da turma vão ver minhas tarefas?",
    a: "Só se você marcar a atividade como compartilhada (recurso Pro). O resto fica privado. Quando você compartilha, todos os pais da mesma turma do seu filho recebem aquela atividade no calendário deles. Sem chain de WhatsApp, sem repetir foto da agenda 12 vezes no grupo.",
  },
  {
    q: "E se eu errar a foto ou a IA entender errado?",
    a: "Antes de salvar, a IA mostra a lista de atividades pra você revisar. Datas, matérias, títulos, qual filho. Você ajusta o que estiver errado e confirma só o que faz sentido. Nada vai pro calendário sem a sua aprovação.",
  },
  {
    q: "Funciona em celular?",
    a: "Sim, abre direto no navegador do celular (Android e iPhone). Sem app pra baixar na loja, sem espaço ocupado, sem login complicado. Você acessa a mesma agenda em qualquer aparelho.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim, sem fidelidade. Cancela direto nas configurações. Você mantém o Pro até o fim do ciclo já pago e depois volta automaticamente pro Free, sem perder as atividades que já tinha.",
  },
  {
    q: "O que acontece se meus créditos acabarem antes do fim do mês?",
    a: "Os recursos de IA pausam até a renovação ou até você comprar um pacote avulso. O cadastro manual continua liberado, e tudo que já estava no calendário fica lá normalmente. Pacotes extras existem pra meses puxados (início de bimestre, semana de prova).",
  },
  {
    q: "Funciona em escola pública e particular?",
    a: "Funciona nas duas. A base de escolas vem do INEP/MEC, então tem todas as escolas do Brasil, da rede pública à privada. Você escolhe estado, cidade e a escola direto da lista, sem digitar nome no chute.",
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
          Tudo que vem antes da assinatura.
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
