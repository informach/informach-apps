"use client";
import { Lock, Pencil, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { useConfirmar } from "@/components/confirmar";
import { Cadeado, usePlanos } from "@/features/billing/planos";
import {
  createProfileAction,
  deleteProfileAction,
  selectProfileAction,
  updateProfileAction,
} from "@/features/familia/actions";
import { CamposDoTreino, type JeitoDeTreinar } from "@/features/perfil/campos";
import { useServerAction } from "@/lib/use-server-action";
import { unlockAudio } from "../engine/voice";

export type PerfilNaPorta = {
  id: string;
  name: string;
  color: string;
  allowed: boolean;
  /** fez o primeiro acesso (ritmo, tempo e dias) */
  pronto: boolean;
  jeito: JeitoDeTreinar;
  /** "2 de 3 dias nesta semana", "Treinou hoje": calculado no servidor, no fuso da família */
  status: string | null;
};

/**
 * "Quem vai treinar?": a porta do app, como na Netflix. Cada pessoa entra no seu perfil; em
 * "Gerenciar" se muda apelido, cor e o jeito de treinar, ou se apaga. Treinar junto é a opção a
 * mais, embaixo.
 */
export function ProfilesScreen({
  profiles,
  limit,
  colors,
  podeTreinarJunto,
}: {
  profiles: PerfilNaPorta[];
  limit: number;
  colors: string[];
  podeTreinarJunto: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [editando, setEditando] = useState<PerfilNaPorta | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(colors[0] ?? "#3D7BFF");
  const [jeito, setJeito] = useState<JeitoDeTreinar>({ ritmo: "comecando", minutos: 20, dias: 3 });
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
  const [dialogo, confirmar] = useConfirmar();
  const abrirPlanos = usePlanos();
  const showForm = creating || profiles.length === 0;
  const full = profiles.length >= limit;

  const enter = (p: PerfilNaPorta) =>
    start(async () => {
      unlockAudio();
      const result = await selectProfileAction(p.id);
      if (!result.ok) return setMessage(result.error);
      router.push(p.pronto ? "/inicio" : `/perfis/${p.id}/comecar`);
    });

  const save = () =>
    start(async () => {
      if (!name.trim()) return;
      unlockAudio();
      const result = await createProfileAction(
        name,
        color,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
      if (!result.ok) return setMessage(result.error);
      setName("");
      setCreating(false);
      router.push(`/perfis/${result.data.id}/comecar`);
    });

  const abrirEdicao = (p: PerfilNaPorta) => {
    setEditando(p);
    setName(p.name);
    setColor(p.color);
    setJeito(p.jeito);
    setMessage("");
  };

  const salvarEdicao = () =>
    start(async () => {
      if (!editando || !name.trim()) return;
      const result = await updateProfileAction(editando.id, { name, color, ...jeito });
      if (!result.ok) return setMessage(result.error);
      setEditando(null);
      router.refresh();
    });

  const remove = async (p: PerfilNaPorta) => {
    const sim = await confirmar({
      titulo: `Apagar o perfil ${p.name}?`,
      texto: "O histórico de treinos, os níveis e as conquistas desse perfil saem junto.",
      confirmar: "Apagar perfil",
      perigo: true,
    });
    if (!sim) return;
    start(async () => {
      const result = await deleteProfileAction(p.id);
      setMessage(result.ok ? "" : result.error);
      setEditando(null);
      router.refresh();
    });
  };

  const corEApelido = (
    <>
      <Avatar profile={{ name: name || "?", color }} size="7rem" />
      <input
        className="field"
        placeholder="Nome ou apelido"
        aria-label="Nome ou apelido"
        value={name}
        maxLength={24}
        onChange={(e) => setName(e.target.value)}
        data-autofocus
      />
      <fieldset className="swatches" aria-label="Cor">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            className="swatch"
            style={{ background: c }}
            aria-pressed={c === color}
            onClick={() => setColor(c)}
            aria-label={`Cor ${c}`}
          />
        ))}
      </fieldset>
    </>
  );

  if (editando)
    return (
      <main className="profiles" id="conteudo">
        {dialogo}
        <h1>Editar {editando.name}</h1>
        <form
          className="new-profile"
          onSubmit={(e) => {
            e.preventDefault();
            salvarEdicao();
          }}
        >
          {corEApelido}
          <CamposDoTreino valor={jeito} aoMudar={setJeito} nome={name || editando.name} />
          <p className="muted small">
            Mudar o jeito de treinar não mexe nos níveis que já foram conquistados.
          </p>
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn primary" disabled={!name.trim() || pending}>
              Salvar
            </button>
          </div>
          <button type="button" className="btn ghost perigo" onClick={() => remove(editando)}>
            Apagar perfil
          </button>
          <p role="status" className="form-message">
            {message}
          </p>
        </form>
      </main>
    );

  if (showForm)
    return (
      <main className="profiles" id="conteudo">
        <div className="brand">
          <i />
          Bora Treinar
        </div>
        <h1>{profiles.length ? "Novo perfil" : "Quem vai treinar?"}</h1>
        <form
          className="new-profile"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {corEApelido}
          <p className="muted small">
            Só o apelido e a cor. Nenhum outro dado de quem treina é pedido.
          </p>
          <div className="row">
            {profiles.length > 0 && (
              <button type="button" className="btn ghost" onClick={() => setCreating(false)}>
                Cancelar
              </button>
            )}
            <button type="submit" className="btn primary" disabled={!name.trim() || pending}>
              Criar perfil
            </button>
          </div>
          <p role="status" className="form-message">
            {message}
          </p>
        </form>
      </main>
    );

  return (
    <main className="profiles" id="conteudo">
      {dialogo}
      <div className="brand">
        <i />
        Bora Treinar
      </div>
      <h1>{managing ? "Gerenciar perfis" : "Quem vai treinar?"}</h1>
      <div className="profile-row">
        {profiles.map((p, i) => (
          <button
            type="button"
            key={p.id}
            className={`profile-tile ${p.allowed ? "" : "locked"}`}
            data-autofocus={i === 0 ? true : undefined}
            disabled={pending}
            onClick={() =>
              managing ? abrirEdicao(p) : p.allowed ? enter(p) : abrirPlanos("perfis")
            }
            title={p.allowed ? undefined : "Perfil guardado: o plano atual libera menos perfis"}
          >
            <Avatar profile={p} />
            {managing && (
              <span className="icon-btn remove" aria-hidden>
                <Pencil size={16} />
              </span>
            )}
            {!managing && !p.allowed && (
              <span className="icon-btn remove lock">
                <Lock size={16} />
              </span>
            )}
            <strong>{p.name}</strong>
            {!managing && (
              <span className="muted small perfil-status">
                {!p.allowed ? "Guardado" : !p.pronto ? "Novo" : (p.status ?? "")}
              </span>
            )}
          </button>
        ))}
        {!managing &&
          (full ? (
            <Cadeado motivo="perfis" className="profile-tile">
              <span className="avatar add">
                <Lock size={34} />
              </span>
              <span className="muted">
                {limit > 1 ? `Até ${limit} perfis` : "Mais perfis no plano Família"}
              </span>
            </Cadeado>
          ) : (
            <button type="button" className="profile-tile" onClick={() => setCreating(true)}>
              <span className="avatar add">
                <Plus size={40} />
              </span>
              <span className="muted">
                Adicionar · {profiles.length} de {limit}
              </span>
            </button>
          ))}
      </div>
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => setManaging(!managing)}>
          {managing ? "Pronto" : "Gerenciar perfis"}
        </button>
        {!managing && podeTreinarJunto && (
          <Link href="/junto" className="btn ghost">
            <Users size={18} /> Treinar junto
          </Link>
        )}
        <Link href="/conta" className="btn ghost">
          Conta e plano
        </Link>
      </div>
      <p role="status" className="form-message">
        {message}
      </p>
    </main>
  );
}
