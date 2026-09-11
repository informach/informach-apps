import { ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";

const QUESTIONS = [
  {
    q: "Preciso ter uma semana inteira planejada para começar?",
    a: "Você pode começar com uma receita e três refeições. Acrescente outras escolhas conforme sua rotina.",
  },
  {
    q: "Preciso de cartão para experimentar?",
    a: "Não. Após verificar seu e-mail, ative 14 dias de planejamento, com 3 créditos de IA para todo o período. O teste é oferecido uma vez e não vira uma assinatura automaticamente.",
  },
  {
    q: "O que acontece quando o teste termina?",
    a: "Seus dados continuam na conta. Você pode consultar seu acervo, usar o modo de preparo e acessar as listas já criadas. O Free permite novos cadastros dentro do limite de 15 receitas, sem apagar receitas que você já tenha acima desse limite. Novos planejamentos e o uso de IA ficam disponíveis com o Pro.",
  },
  {
    q: "A lista sabe o que já tenho em casa?",
    a: "Você marca os itens que já tem. O Cozya reúne ingredientes compatíveis das receitas planejadas; algumas medidas precisam de conferência. Depois de mudar refeições ou receitas, use a ação de atualizar a lista.",
  },
  {
    q: "A IA é obrigatória?",
    a: "Você pode cadastrar receitas manualmente. A IA ajuda quando quiser organizar uma foto, texto ou áudio, pesquisar uma receita ou fazer uma adaptação. Revise o resultado antes de salvar.",
  },
  {
    q: "E se os 50 créditos do mês acabarem?",
    a: "Você continua com suas receitas, planejamento, compras e preparo. Os recursos de IA aguardam a renovação mensal ou a compra de créditos extras enquanto seu Pro estiver ativo.",
  },
  {
    q: "Posso usar no celular?",
    a: "Sim. O Cozya funciona no navegador do celular e do computador, com conexão à internet. Em aparelhos compatíveis, você pode adicioná-lo à tela inicial.",
  },
  {
    q: "Posso cancelar a assinatura?",
    a: "Você pode cancelar a renovação pela sua conta. O Pro continua disponível até o fim do período já pago; depois, a conta volta ao Free e seu acervo continua acessível.",
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
        <p className="landing-eyebrow">Tudo às claras</p>
        <h2 className="landing-title" id="faq-title">
          Para começar
          <br />
          com tranquilidade.
        </h2>
        <p className="landing-description">
          As respostas que ajudam a escolher o seu próximo passo.
        </p>
        <Link href="/signup" className="landing-text-link">
          Experimentar o Cozya <ArrowUpRight size={18} aria-hidden />
        </Link>
      </div>
      <div className="faq-list">
        {QUESTIONS.map((item) => (
          <details key={item.q}>
            <summary>
              {item.q}
              <Plus size={20} aria-hidden />
            </summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
