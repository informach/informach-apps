import { INFORMACH_CONTACT } from "@informach/config/contact";
import { ArrowUpRight, Plus } from "lucide-react";
import { TRIAL_CREDITS, TRIAL_DAYS } from "@/features/kitchen/trial";
import { FREE_RECIPE_LIMIT } from "@/features/recipes/limits";

const QUESTIONS = [
  {
    q: "Preciso planejar a semana inteira?",
    a: "Não. Três jantares já são um começo. Os outros dias podem ficar livres, com sobras ou com comida de fora.",
  },
  {
    q: "Preciso de cartão para experimentar?",
    a: `Não. Você ativa o teste do Compasso na Minha conta. São ${TRIAL_DAYS} dias e ${TRIAL_CREDITS} créditos de IA compartilhados entre os apps da família. Abrir outro app não inicia outro teste. Ele não vira assinatura sozinho.`,
  },
  {
    q: `O que acontece depois dos ${TRIAL_DAYS} dias?`,
    a: `Se você não assinar, o Cozya fica no Free. Suas receitas, o modo cozinha e as listas existentes continuam, inclusive as receitas acima de ${FREE_RECIPE_LIMIT}. Para planejar novas semanas com receitas, é preciso o Compasso. Recargas de IA continuam disponíveis, respeitando os limites gratuitos.`,
  },
  {
    q: "A lista sabe o que já tenho em casa?",
    a: "Você conta para ela: antes de sair, toque no que já tem. Temperos e básicos vêm numa pergunta só, para conferir de uma vez. Quando a semana muda, a lista avisa e você atualiza.",
  },
  {
    q: "A IA é obrigatória?",
    a: "Não. Você pode escrever todas as receitas do seu jeito. A IA ajuda quando você quer trazer uma foto, um texto ou um áudio, encontrar ou adaptar uma receita. Você sempre confere antes de guardar.",
  },
  {
    q: "E se os créditos do mês acabarem?",
    a: "Você pode usar recargas compartilhadas sem vencimento, inclusive depois de cancelar a assinatura. A franquia mensal é renovada a cada mês da assinatura e não acumula. O custo de cada operação aparece antes do uso.",
  },
  {
    q: "Dá para mandar a lista para quem vai ao mercado?",
    a: "Sim, pelo WhatsApp, como mensagem de texto. A conta do Cozya é de uma pessoa; a lista vai para quem você quiser.",
  },
  {
    q: "Funciona no celular?",
    a: "Sim, no navegador do celular e do computador, com internet. Em aparelhos compatíveis, dá para colocar o Cozya na tela inicial.",
  },
  {
    q: "Posso cancelar?",
    a: "O responsável pela assinatura pode cancelar na Minha conta, quando quiser. O Compasso continua até o fim do período pago e depois o Cozya volta ao Free, com suas receitas. O cancelamento vale para todo o pacote.",
  },
];

export function Faq() {
  return (
    <section
      id="perguntas"
      className="landing-shell landing-section landing-faq"
      aria-labelledby="faq-title"
    >
      <div className="faq-heading">
        <p className="landing-eyebrow">Perguntas</p>
        <h2 className="landing-title" id="faq-title">
          Antes de começar.
        </h2>
        <p className="landing-description">Ficou alguma dúvida? Mande no direct do Instagram.</p>
        <a
          href={INFORMACH_CONTACT.directMessageUrl}
          className="landing-text-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          @{INFORMACH_CONTACT.instagramHandle} <ArrowUpRight size={18} aria-hidden />
        </a>
      </div>
      <div className="faq-list">
        {QUESTIONS.map((item) => (
          <details key={item.q}>
            <summary>
              {item.q}
              <Plus size={20} aria-hidden />
            </summary>
            <p className="faq-answer">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
