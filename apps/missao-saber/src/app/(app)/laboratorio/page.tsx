import { LinkChapa } from "@/components/ui/botao-chapa";
import { Chapa } from "@/components/ui/chapa";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { BarsLab, GridLab, GroupsLab } from "@/features/labs/components/labs";
import { getExperiments } from "@/features/labs/repository";
import { requirePageUser } from "@/lib/auth";
import { currentDashboard } from "@/lib/view";

export default async function Laboratory() {
  const data = await currentDashboard();
  const user = await requirePageUser();
  const saved = data.profile ? await getExperiments(user.id, data.profile.id) : {};
  return (
    <>
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="ceu">Experimente uma ideia</Etiqueta>}
        titulo="Pensar com as mãos."
        apoio="Faça uma previsão, mude uma coisa e observe. Aqui, a curiosidade guia o caminho."
      />
      <div className="grid gap-5">
        <BarsLab key={`bars-${data.profile?.id}`} profileId={data.profile?.id} saved={saved.bars} />
        <GridLab key={`grid-${data.profile?.id}`} profileId={data.profile?.id} saved={saved.grid} />
        <GroupsLab
          key={`groups-${data.profile?.id}`}
          profileId={data.profile?.id}
          saved={saved.groups}
        />
      </div>

      <Chapa tom="uva" className="mt-8">
        <Etiqueta tom="uva">Desafio profundo · 20–30 min · pode pausar</Etiqueta>
        <h2 className="mt-3 font-display text-2xl font-semibold text-tinta">
          Uma borda, muitas possibilidades
        </h2>
        <p className="mt-2.5 text-tinta">
          Na malha, construa duas figuras de mesma área e perímetros diferentes. Agora tente manter
          o perímetro e mudar a área. Que regra você suspeita que exista?
        </p>
        <p className="mt-2.5 text-sm text-tinta-suave">
          Para pausar, use “Salvar experimento” antes de sair. Ao voltar com o mesmo perfil, a
          montagem salva reaparece, inclusive em outro aparelho. O caderno guarda suas explicações.
        </p>
        <ol className="mt-4 grid gap-2 pl-5 text-tinta [&>li]:list-decimal">
          <li>Registre dois exemplos e suas medidas.</li>
          <li>Explique por que lados compartilhados mudam o resultado.</li>
          <li>Procure um exemplo que contrarie sua primeira ideia.</li>
        </ol>
        <p className="mt-4 text-sm text-tinta-suave">
          Autoavaliação: exemplos válidos (0–2), contagem verificável (0–3), explicação dos lados
          (0–3), tentativa de generalização (0–2). É uma rubrica formativa, sem nota automática.
        </p>
        <LinkChapa href="/caderno" tom="contorno" className="mt-5">
          Guardar minha investigação
        </LinkChapa>
      </Chapa>
    </>
  );
}
