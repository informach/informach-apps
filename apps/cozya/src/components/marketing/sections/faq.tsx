import { INFORMACH_CONTACT } from "@informach/config/contact";
import { ArrowUpRight, Plus } from "lucide-react";

const QUESTIONS = [
  {
    q: "Preciso planejar a semana inteira?",
    a: "Não. Três jantares já são um começo. Os outros dias podem ficar livres, com sobras ou com comida de fora.",
  },
  {
    q: "Preciso de cartão para experimentar?",
    a: "Não. Depois de confirmar o e-mail, seus 14 dias começam quando você colocar a primeira receita na semana, com 3 créditos de IA para o período. O teste é um por e-mail e não vira assinatura sozinho.",
  },
  {
    q: "O que acontece depois dos 14 dias?",
    a: "Se você não assinar, a conta fica no Free. Suas receitas, o modo cozinha e as listas que já existem continuam. Novas semanas e a IA ficam no Pro. Nada é apagado.",
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
    a: "Semana, lista e modo cozinha continuam. A ajuda da IA volta na renovação do mês, ou com créditos extras enquanto o Pro estiver ativo.",
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
    a: "Pela sua conta, quando quiser. O Pro continua até o fim do período pago e depois a conta volta ao Free, com suas receitas.",
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
