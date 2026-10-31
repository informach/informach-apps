"use client";
import { Lock, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import {
  createProfileAction,
  deleteProfileAction,
  selectProfileAction,
} from "@/features/familia/actions";
import { useServerAction } from "@/lib/use-server-action";
import { unlockAudio } from "../engine/voice";

type Perfil = { id: string; name: string; color: string; allowed: boolean };

export function ProfilesScreen({
  profiles,
  limit,
  colors,
}: {
  profiles: Perfil[];
  limit: number;
  colors: string[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(colors[0] ?? "#3D7BFF");
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
  const showForm = creating || profiles.length === 0;
  const full = profiles.length >= limit;

  const enter = (id: string) =>
    start(async () => {
      unlockAudio();
      const result = await selectProfileAction(id);
      if (!result.ok) return setMessage(result.error);
      router.push("/inicio");
    });

  const save = () =>
    start(async () => {
      if (!name.trim()) return;
      unlockAudio();
      const result = await createProfileAction(name, color);
      if (!result.ok) return setMessage(result.error);
      setName("");
      setCreating(false);
      router.push("/inicio");
    });

  const remove = (p: Perfil) =>
    start(async () => {
      if (!window.confirm(`Apagar o perfil ${p.name} e todo o histórico de treinos?`)) return;
      const result = await deleteProfileAction(p.id);
      setMessage(result.ok ? "" : result.error);
      router.refresh();
    });

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
            onClick={() => (managing ? remove(p) : p.allowed ? enter(p.id) : router.push("/conta"))}
            title={p.allowed ? undefined : "Perfil guardado: o plano atual libera menos perfis"}
          >
            <Avatar profile={p} />
            {managing && (
              <span className="icon-btn remove">
                <X size={18} />
              </span>
            )}
            {!managing && !p.allowed && (
              <span className="icon-btn remove lock">
                <Lock size={16} />
              </span>
            )}
            <strong>{p.name}</strong>
          </button>
        ))}
        {!managing &&
          (full ? (
            <Link href="/conta" className="profile-tile">
              <span className="avatar add">
                <Lock size={34} />
              </span>
              <span className="muted">
                {limit > 1 ? `Até ${limit} perfis` : "Mais perfis no plano Família"}
              </span>
            </Link>
          ) : (
            <button type="button" className="profile-tile" onClick={() => setCreating(true)}>
              <span className="avatar add">
                <Plus size={40} />
              </span>
              <span className="muted">Adicionar</span>
            </button>
          ))}
      </div>
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => setManaging(!managing)}>
          {managing ? "Pronto" : "Gerenciar perfis"}
        </button>
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
