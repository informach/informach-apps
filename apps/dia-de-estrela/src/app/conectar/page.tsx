import { Lumi } from "@/components/desenhos";
import { FormConectar } from "@/features/aparelho/components/conectar";

export const metadata = { title: "Conectar aparelho" };

export default async function Conectar({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string; conexao?: string }>;
}) {
  const { codigo, conexao } = await searchParams;
  return (
    <main
      id="conteudo"
      data-area="crianca"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10 text-center"
    >
      <Lumi tamanho={120} />
      <h1 className="font-display text-4xl leading-none font-extrabold sm:text-5xl">
        Conectar este aparelho
      </h1>
      <p className="max-w-md text-lg font-bold text-tinta-suave">
        {conexao === "encerrada"
          ? "Este aparelho foi desconectado. Peça um código novo para os pais."
          : "Peça para um adulto gerar o código em Ajustes, no celular dele, e digite aqui."}
      </p>
      <FormConectar inicial={codigo ?? ""} />
    </main>
  );
}
