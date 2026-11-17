import { inteiroParaHex } from "@informach/morada-arte/cores";
import { type CatalogoDeAparencias, FASES, TRACOS_DA_FUNDACAO } from "@informach/morada-sim";
import {
  aplicarOpcaoDeAparencia,
  type MoradorDoRascunho,
  NOMES_DAS_FASES,
  NOMES_DAS_PARTES,
  NOMES_DOS_TRACOS,
} from "../modelo/criacao";

function CampoCor({
  nome,
  valor,
  mudar,
}: {
  nome: string;
  valor: number;
  mudar(cor: number): void;
}) {
  return (
    <label className="morada-criacao-cor">
      <span>{nome}</span>
      <input
        type="color"
        value={inteiroParaHex(valor)}
        onChange={(e) => mudar(Number.parseInt(e.target.value.slice(1), 16))}
      />
    </label>
  );
}

/** Mesma superfície e tipografia do HUD; campos concretos de um morador por vez. */
export function EditarMorador({
  dados,
  catalogo,
  mudar,
}: {
  dados: MoradorDoRascunho;
  catalogo: CatalogoDeAparencias | null;
  mudar(dados: MoradorDoRascunho): void;
}) {
  const opcoes = catalogo?.opcoes ?? [];
  const destaFase = opcoes.filter((o) => o.fase === dados.fase && o.linha === dados.linha);
  const cabelos = [...new Map(destaFase.map((o) => [o.cabelo, o])).values()];
  const roupas = destaFase.filter((o) => o.cabelo === dados.cabelo);
  const escolher = (fase: string, linha: string, cabelo = dados.cabelo, roupa = dados.roupa) => {
    const opcao =
      opcoes.find(
        (o) => o.fase === fase && o.linha === linha && o.cabelo === cabelo && o.roupa === roupa,
      ) ??
      opcoes.find((o) => o.fase === fase && o.linha === linha && o.cabelo === cabelo) ??
      opcoes.find((o) => o.fase === fase && o.linha === linha);
    if (opcao) mudar(aplicarOpcaoDeAparencia(dados, opcao));
  };
  return (
    <div className="morada-criacao-campos">
      <label>
        Nome no jogo
        <input
          required
          maxLength={24}
          autoComplete="off"
          value={dados.nome}
          onChange={(e) => mudar({ ...dados, nome: e.target.value })}
        />
      </label>
      {catalogo ? (
        <>
          <div className="morada-criacao-dupla">
            <label>
              Fase da vida
              <select value={dados.fase} onChange={(e) => escolher(e.target.value, dados.linha)}>
                {FASES.map((fase) => (
                  <option key={fase} value={fase}>
                    {NOMES_DAS_FASES[fase]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo de corpo
              <select value={dados.linha} onChange={(e) => escolher(dados.fase, e.target.value)}>
                <option value="f">Feminino</option>
                <option value="m">Masculino</option>
              </select>
            </label>
          </div>
          <div className="morada-criacao-dupla">
            <label>
              Cabelo
              <select
                value={dados.cabelo}
                onChange={(e) => escolher(dados.fase, dados.linha, e.target.value)}
              >
                {cabelos.map((o) => (
                  <option key={o.cabelo} value={o.cabelo}>
                    {o.rotuloDoCabelo}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Roupa
              <select
                value={dados.roupa}
                onChange={(e) => escolher(dados.fase, dados.linha, dados.cabelo, e.target.value)}
              >
                {roupas.map((o) => (
                  <option key={o.roupa} value={o.roupa}>
                    {o.rotuloDaRoupa}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="morada-criacao-cores">
            <CampoCor
              nome="Tom de pele"
              valor={dados.pele}
              mudar={(pele) => mudar({ ...dados, pele })}
            />
            {dados.edicao ? (
              <>
                {dados.cabelo !== "careca" ? (
                  <CampoCor
                    nome="Cor do cabelo"
                    valor={dados.edicao.corDoCabelo}
                    mudar={(corDoCabelo) => {
                      if (dados.edicao)
                        mudar({ ...dados, edicao: { ...dados.edicao, corDoCabelo } });
                    }}
                  />
                ) : null}
                {Object.entries(dados.edicao.coresDaRoupa).map(([parte, valor]) => (
                  <CampoCor
                    key={parte}
                    nome={NOMES_DAS_PARTES[parte] ?? "Roupa"}
                    valor={valor}
                    mudar={(cor) => {
                      if (dados.edicao)
                        mudar({
                          ...dados,
                          edicao: {
                            ...dados.edicao,
                            coresDaRoupa: { ...dados.edicao.coresDaRoupa, [parte]: cor },
                          },
                        });
                    }}
                  />
                ))}
              </>
            ) : null}
          </div>
        </>
      ) : (
        <p className="morada-criacao-ajuda">
          {NOMES_DAS_FASES[dados.fase]} · aparência da família de exemplo
        </p>
      )}
      <fieldset className="morada-criacao-tracos">
        <legend>
          Jeito de ser <small>até três traços</small>
        </legend>
        {TRACOS_DA_FUNDACAO.map((traco) => (
          <label key={traco}>
            <input
              type="checkbox"
              checked={dados.tracos.includes(traco)}
              disabled={!dados.tracos.includes(traco) && dados.tracos.length >= 3}
              onChange={(e) =>
                mudar({
                  ...dados,
                  tracos: e.target.checked
                    ? [...dados.tracos, traco]
                    : dados.tracos.filter((t) => t !== traco),
                })
              }
            />
            {NOMES_DOS_TRACOS[traco]}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
