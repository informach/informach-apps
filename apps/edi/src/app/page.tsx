import { PRODUCTS } from "@informach/config";
import { EDI_TOOLS } from "@informach/config/edi-tools";
import Link from "next/link";
export default function Home() {
  return (
    <>
      <section className="intro">
        <div>
          <span className="eyebrow">Sua bancada criativa</span>
          <h1>
            Uma conta.
            <br />
            Cinco maneiras de criar.
          </h1>
          <p className="lede">
            Prepare uma aula, capture uma ideia, dê acabamento a uma imagem. Suas ferramentas
            juntas, seus arquivos no seu computador.
          </p>
        </div>
        <div className="stamp">
          WINDOWS x64
          <br />
          <strong>Suíte em desenvolvimento</strong>
        </div>
      </section>
      <section aria-label="Ferramentas da suíte" className="tools">
        {EDI_TOOLS.map((tool) => (
          <article key={tool.id} className="tool">
            <span className="tool-symbol" aria-hidden="true">
              {tool.name.slice(3, 5)}
            </span>
            <div>
              <h2 className="text-xl">{tool.name}</h2>
              <p>{tool.description}</p>
            </div>
            <span className="availability">Em desenvolvimento · veja os recursos disponíveis</span>
          </article>
        ))}
      </section>
      <section className="plans" aria-labelledby="planos">
        <div>
          <span className="eyebrow">Uma assinatura para a suíte</span>
          <h2 id="planos">Seu espaço para criar.</h2>
          <p className="muted">
            As mesmas cinco ferramentas em até dois computadores. Atualizações incluídas enquanto a
            assinatura estiver ativa.
          </p>
          <p className="small muted">
            Consumo pago de IA não incluído. Funcionalidades ainda em desenvolvimento não são
            apresentadas como concluídas.
          </p>
        </div>
        {PRODUCTS.filter((product) => product.app === "edi").map((product) => (
          <article className="plan" key={product.id}>
            <h3>{product.interval === "month" ? "Mensal" : "Anual"}</h3>
            <p className="price">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                (product.listPrice?.amountCents ?? 0) / 100,
              )}{" "}
              <small>/{product.interval === "month" ? "mês" : "ano"}</small>
            </p>
            <p className="small muted">
              {product.interval === "year"
                ? "Equivale a 10 mensalidades por ano."
                : "Cobrança mensal recorrente."}
            </p>
            <Link className="button full" href="/conta">
              Ver minha assinatura
            </Link>
          </article>
        ))}
      </section>
      <p className="small muted section">
        A venda e os instaladores comerciais só serão disponibilizados após a homologação. Você verá
        os recursos e limitações da versão antes de assinar.
      </p>
    </>
  );
}
