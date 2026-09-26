import { LinkChapa } from "@/components/ui/botao-chapa";
import { Chapa } from "@/components/ui/chapa";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { skillNames } from "@/features/content/catalog";
import { deepChallengeFor } from "@/features/content/desafios-profundos";
import { BarsLab, GridLab, GroupsLab } from "@/features/labs/components/labs";
import { getExperiments } from "@/features/labs/repository";
import { requirePageUser } from "@/lib/auth";
import { currentDashboard } from "@/lib/view";

const nomeDoLab = {
  bars: "as barras de referência",
  grid: "a malha de descobertas",
  groups: "o organizador de casos",
} as const;

export const metadata = { title: "Laboratório" };

export default async function Laboratory() {
  const data = await currentDashboard();
  const user = await requirePageUser();
  const saved = data.profile ? await getExperiments(user.id, data.profile.id) : {};

  /* O desafio profundo acompanha a habilidade que está sendo construída — a
     mesma escolha que o relatório da família chama de próximo passo. Antes era
     um único desafio escrito à mão na página, igual para as doze habilidades e
     para todas as missões do catálogo. */
  const course = data.course ?? undefined;
  const emConstrucao = course?.skills.find(
    (skillId) => data.states.find((state) => state.skillId === skillId)?.level !== "independent",
  );
  const desafio = deepChallengeFor(emConstrucao ?? course?.skills[0] ?? "medidas");

  return (
    <>
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="ceu">Experimente uma ideia</Etiqueta>}
        titulo="Pensar com as mãos."
        apoio="Faça uma previsão, mude uma coisa e observe. Aqui, a curiosidade guia o caminho."
      />
      {data.profile && data.profile.grade <= 4 && (
        <p className="mb-5 rounded-card border-2 border-sombra bg-creme px-4 py-3 text-sm text-tinta">
          Estas ferramentas usam descontos, áreas e organização de casos, ideias que aparecem a
          partir do 5º ano. Vale explorar junto com um adulto, sem pressa.
        </p>
      )}
      <div className="grid gap-5">
        <BarsLab key={`bars-${data.profile?.id}`} profileId={data.profile?.id} saved={saved.bars} />
        <GridLab key={`grid-${data.profile?.id}`} profileId={data.profile?.id} saved={saved.grid} />
        <GroupsLab
          key={`groups-${data.profile?.id}`}
          profileId={data.profile?.id}
          saved={saved.groups}
        />
      </div>

      {desafio && (
        <Chapa tom="uva" className="mt-8">
          <Etiqueta tom="uva">Desafio profundo · 20–30 min · pode pausar</Etiqueta>
          <h2 className="mt-3 font-display text-2xl font-semibold text-tinta">{desafio.title}</h2>
          <p className="mt-1.5 text-sm font-semibold text-tinta-suave">
            {skillNames[desafio.skillId] ?? desafio.skillId}
          </p>
          <p className="mt-2.5 text-tinta">{desafio.prompt}</p>
          <p className="mt-2.5 text-sm text-tinta-suave">
            Para pausar, use “Salvar experimento” antes de sair. Ao voltar com o mesmo perfil, a
            montagem salva reaparece, inclusive em outro aparelho. O caderno guarda suas
            explicações.
          </p>
          <ol className="mt-4 grid gap-2 pl-5 text-tinta [&>li]:list-decimal">
            {desafio.steps.map((passo) => (
              <li key={passo}>{passo}</li>
            ))}
          </ol>
          {/* Aponta a ferramenta em vez de montar outra cópia dela: as três já
              estão nesta mesma página, logo acima. Duplicar o laboratório
              duplicaria também os controles e o botão de salvar. */}
          {desafio.lab && (
            <p className="mt-4 font-display font-semibold text-tinta">
              Ferramenta que ajuda: {nomeDoLab[desafio.lab]}, aqui em cima.
            </p>
          )}
          <p className="mt-4 text-sm text-tinta-suave">
            Autoavaliação: {desafio.rubric.join(", ")}. É uma rubrica formativa, sem nota
            automática.
          </p>
          <LinkChapa href="/caderno" tom="contorno" className="mt-5">
            Guardar minha investigação
          </LinkChapa>
        </Chapa>
      )}
    </>
  );
}
