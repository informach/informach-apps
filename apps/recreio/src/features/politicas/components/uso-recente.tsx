function duracao(ms: number) {
  const segundos = Math.ceil(ms / 1000);
  return segundos < 60 ? `${segundos} s` : `${Math.floor(segundos / 60)} min ${segundos % 60} s`;
}

export function UsoRecenteDoPerfil({
  dias,
}: {
  dias: readonly { dia: string; jogandoMs: number; salvandoMs: number }[];
}) {
  return (
    <section className="painel mt-6 p-5" aria-labelledby="uso-recente">
      <h2 id="uso-recente" className="font-display text-xl font-extrabold">
        Tempo recente
      </h2>
      <p className="mt-2 text-sm text-tinta-suave">
        A margem para salvar aparece separada e não aumenta o tempo permitido para jogar. O conteúdo
        das partidas continua privado.
      </p>
      {dias.length === 0 ? (
        <p className="mt-4 text-tinta-suave">
          Nenhum tempo de jogo registrado nos últimos sete dias.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Tempo agregado dos últimos sete dias, por data de Brasília
            </caption>
            <thead>
              <tr className="border-b border-linha-forte">
                <th scope="col" className="py-2 pr-3">
                  Dia
                </th>
                <th scope="col" className="py-2 pr-3">
                  Jogo
                </th>
                <th scope="col" className="py-2">
                  Para salvar
                </th>
              </tr>
            </thead>
            <tbody>
              {dias.map((dia) => (
                <tr key={dia.dia} className="border-b border-linha">
                  <th scope="row" className="py-2 pr-3 font-normal">
                    <time dateTime={dia.dia}>
                      {dia.dia.slice(8, 10)}/{dia.dia.slice(5, 7)}
                    </time>
                  </th>
                  <td className="py-2 pr-3 tabular-nums">{duracao(dia.jogandoMs)}</td>
                  <td className="py-2 tabular-nums">{duracao(dia.salvandoMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
