"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
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
  canWrite: boolean;
  canManage: boolean;
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
  people,
  accountUrl,
  groupName,
  podeTreinarJunto,
}: {
  profiles: PerfilNaPorta[];
  limit: number;
  people: { id: string; displayName: string }[];
  accountUrl: string;
  groupName: string;
  podeTreinarJunto: boolean;
}) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [editando, setEditando] = useState<PerfilNaPorta | null>(null);
  const [personId, setPersonId] = useState("");
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
      router.push(!p.canWrite ? "/progresso" : p.pronto ? "/inicio" : `/perfis/${p.id}/comecar`);
    });

  const save = () =>
    start(async () => {
      if (!personId) return;
      unlockAudio();
      const result = await createProfileAction(
        personId,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
      if (!result.ok) return setMessage(result.error);
      setPersonId("");
      setCreating(false);
      router.push(`/perfis/${result.data.id}/comecar`);
    });

  const abrirEdicao = (p: PerfilNaPorta) => {
    setEditando(p);
    setJeito(p.jeito);
    setMessage("");
  };

  const salvarEdicao = () =>
    start(async () => {
      if (!editando) return;
      const result = await updateProfileAction(editando.id, jeito);
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
          <Avatar profile={editando} size="7rem" />
          <a href={accountUrl} className="muted small">
            Nome, cor e acesso são gerenciados na Minha conta.
          </a>
          <fieldset disabled={!editando.canWrite}>
            <CamposDoTreino valor={jeito} aoMudar={setJeito} nome={editando.name} />
          </fieldset>
          <p className="muted small">
            Mudar o jeito de treinar não mexe nos níveis que já foram conquistados.
          </p>
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn primary" disabled={pending || !editando.canWrite}>
              Salvar
            </button>
          </div>
          <button
            type="button"
            className="btn ghost perigo"
            disabled={!editando.canManage}
            onClick={() => remove(editando)}
          >
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
          <p className="muted small">
            {groupName}. Escolha uma pessoa já cadastrada na Minha conta.
          </p>
          {people.length > 0 ? (
            <label>
              Pessoa
              <select
                className="field"
                disabled={!hydrated || pending}
                value={personId}
                onChange={(event) => setPersonId(event.target.value)}
                required
              >
                <option value="" disabled>
                  Quem vai treinar?
                </option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>
              Nenhuma pessoa está disponível para ativar. Cadastre alguém ou confira suas permissões
              na Minha conta.
            </p>
          )}
          <a className="btn ghost" href={accountUrl}>
            Gerenciar pessoas na Minha conta
          </a>
          <Link className="btn ghost" href="/contexto">
            Trocar família
          </Link>
          <div className="row">
            {profiles.length > 0 && (
              <button type="button" className="btn ghost" onClick={() => setCreating(false)}>
                Cancelar
              </button>
            )}
            <button
              type="submit"
              className="btn primary"
              disabled={!hydrated || !personId || pending}
            >
              Ativar no Bora Treinar
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
            disabled={!hydrated || pending}
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
                {limit > 1 ? `Até ${limit} perfis` : "Mais perfis no Compasso"}
              </span>
            </Cadeado>
          ) : (
            <button
              type="button"
              className="profile-tile"
              disabled={!hydrated}
              onClick={() => setCreating(true)}
            >
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
        <button
          type="button"
          className="btn ghost"
          disabled={!hydrated}
          onClick={() => setManaging(!managing)}
        >
          {managing ? "Pronto" : "Gerenciar perfis"}
        </button>
        {!managing && podeTreinarJunto && (
          <Link href="/junto" className="btn ghost">
            <Users size={18} /> Treinar junto
          </Link>
        )}
        <Link href="/contexto" className="btn ghost">
          {groupName} · trocar família
        </Link>
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
