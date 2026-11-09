import { INFORMACH_CONTACT } from "@informach/config/contact";
import Link from "next/link";
import { PaginaDeTexto } from "@/components/pagina-publica";

export const metadata = { title: "Termos" };

export default function Termos() {
  return (
    <PaginaDeTexto>
      <p className="text-sm font-extrabold tracking-[0.12em] text-tinta-suave">
        ÚLTIMA ATUALIZAÇÃO · 06/11/2026
      </p>
      <h1>Termos do Dia de Estrela.</h1>
      <p>
        O Dia de Estrela é oferecido pela Informach Núcleo de Aprendizagem Ltda, CNPJ
        43.588.758/0001-03. O serviço é contratado por um titular maior de 18 anos. As crianças usam
        o app por um aparelho conectado pelo titular, que acompanha o uso adequado à idade de cada
        uma.
      </p>
      <h2>O serviço</h2>
      <p>
        Rotina visual com tarefas por horário, passo a passo lido em voz alta, lembretes no aparelho
        da criança, estrelas por tarefa feita, cofrinho, loja de recompensas e acompanhamento pelos
        pais. O plano gratuito inclui uma criança e todos os recursos que ajudam a criança no dia a
        dia.
      </p>
      <h2>O que o app não é</h2>
      <p>
        O Dia de Estrela é uma ferramenta de organização da rotina. Não é tratamento, terapia nem
        orientação de saúde, e não substitui o acompanhamento de profissionais. Os lembretes tocam
        quando o aparelho da criança está ligado e com o app aberto; avisos importantes não devem
        depender só dele.
      </p>
      <h2>Estrelas e recompensas</h2>
      <p>
        Estrelas não são dinheiro nem têm valor fora do app. A loja mostra o que a própria família
        combinou; pagamentos e entregas das recompensas são feitos pelos pais, fora do Dia de
        Estrela.
      </p>
      <h2>Assinatura</h2>
      <p>
        Família: R$ 24,90 mensais ou R$ 249 anuais, para até quatro crianças, com segundo
        responsável, alertas no celular, voz dos pais, itens próprios na loja e foto da meta. No
        anual, o total é cobrado de uma vez. O checkout apresenta o plano, o valor e a recorrência
        antes da confirmação. A assinatura se renova automaticamente até ser cancelada.
      </p>
      <p>
        O portal de cobrança permite consultar pagamentos, atualizar o meio de pagamento e cancelar.
        O cancelamento interrompe a próxima renovação e mantém o acesso até o fim do período pago.
        Ao voltar para o gratuito, o titular escolhe qual criança continua ativa; as demais ficam
        guardadas.
      </p>
      <h2>Uso adequado</h2>
      <p>
        Não é permitido tentar contornar controles de acesso, interromper o serviço ou automatizar
        consultas abusivas. Podemos limitar um acesso que comprometa a segurança ou a
        disponibilidade.
      </p>
      <h2>Suporte e direitos</h2>
      <p>
        Para suporte, cancelamento, reembolso ou exercício de direitos, mande uma mensagem no direct
        do Instagram, em{" "}
        <a href={INFORMACH_CONTACT.directMessageUrl}>@{INFORMACH_CONTACT.instagramHandle}</a>. Estes
        termos não afastam direitos assegurados ao consumidor. Pedidos de arrependimento dentro do
        prazo legal de sete dias podem ser enviados por esse canal.
      </p>
      <p>
        Leia a <Link href="/privacidade">política de privacidade do app</Link> e os{" "}
        <a href="https://informach.com.br/termos">termos gerais da Informach</a>.
      </p>
    </PaginaDeTexto>
  );
}
