import { Check, Send } from "lucide-react";

const ROWS = [
  { name: "Batata", amount: "800 g", done: true },
  { name: "Alho", note: "amassado e picado", amount: "9 dentes" },
  { name: "Abobrinha pequena", amount: "2" },
];

export function Market() {
  return (
    <section id="mercado" className="market-section" aria-labelledby="market-title">
      <div className="landing-shell landing-section market-grid">
        <div className="market-copy">
          <p className="landing-eyebrow">No mercado</p>
          <h2 className="landing-title" id="market-title">
            A lista que funciona com uma mão.
          </h2>
          <p className="landing-description">
            Antes de sair, toque no que já tem. No mercado, toque no que pegou. O mesmo ingrediente
            de receitas diferentes vira uma linha só, e o que é de despensa vem numa pergunta: tem
            tudo?
          </p>
          <p className="landing-description">
            O Cozya só soma o que dá para somar com segurança: gramas com gramas, litros com
            mililitros. O resto ele mostra para você conferir.
          </p>
          <p className="market-share">Vai outra pessoa ao mercado? Mande a lista pelo WhatsApp.</p>
        </div>
        <figure className="market-phone" aria-label="Exemplo da lista do mercado no Cozya">
          <p className="market-phone-title">Lista do mercado</p>
          <p className="market-phone-sub">16 itens para 5 refeições</p>
          <p className="market-phase" aria-hidden>
            <span>Antes de sair</span>
            <span className="on">No mercado</span>
          </p>
          <p className="market-group">HORTIFRUTI</p>
          <ul>
            {ROWS.map((row) => (
              <li key={row.name} className={row.done ? "done" : ""}>
                <span className="market-check">
                  {row.done && <Check size={13} strokeWidth={3} aria-hidden />}
                </span>
                <span className="market-name">
                  {row.name}
                  {row.note && <small>{row.note}</small>}
                </span>
                <b>{row.amount}</b>
              </li>
            ))}
          </ul>
          <p className="market-group">CARNES E OVOS</p>
          <ul>
            <li>
              <span className="market-check" />
              <span className="market-name">Sobrecoxa de frango</span>
              <b>1 kg</b>
            </li>
          </ul>
          <p className="market-pantry">
            <b>Na despensa:</b> sal, azeite, óleo, louro, páprica, ketchup e mostarda
          </p>
          <span className="market-whatsapp">
            <Send size={15} aria-hidden /> Mandar pelo WhatsApp
          </span>
        </figure>
      </div>
    </section>
  );
}
