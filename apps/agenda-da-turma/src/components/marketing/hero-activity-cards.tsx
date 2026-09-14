import { CornerDownRight } from "lucide-react";
import styles from "./sales.module.css";

export function HeroActivityCards() {
  return (
    <figure className={styles.heroStage} aria-label="Exemplo de recado transformado em atividades">
      <p className={styles.stageLabel}>O MESMO RECADO. UM PRÓXIMO PASSO MAIS CLARO.</p>
      <div className={styles.note}>
        <div className={styles.noteHeading}>
          <span>Publicação da escola</span>
          <span>Clara · 3º ano</span>
        </div>
        <p>
          Nosso passeio ao museu será em <strong>18/09, às 8h.</strong> Enviem a autorização até{" "}
          <strong>16/09.</strong> Os itens para levar estão no PDF.
        </p>
        <div className={styles.attachment}>
          <span className={styles.pdf}>PDF</span>
          <span>
            Orientações do passeio
            <br />
            <small>Levar boné e garrafa de água.</small>
          </span>
        </div>
      </div>
      <div className={styles.flowCaption}>
        <CornerDownRight size={20} aria-hidden="true" /> Você confere. A rotina ganha forma.
      </div>
      <div className={styles.routine}>
        <div className={styles.routineTop}>
          <div>
            <h3>Já dá para se organizar.</h3>
            <p className={styles.routineSub}>Clara · Setembro de 2026</p>
          </div>
          <span className={styles.miniAvatar}>CL</span>
        </div>
        <div className={styles.task}>
          <div className={styles.dateTile}>
            <b>16</b>SET
          </div>
          <div>
            <p className={styles.taskTitle}>Enviar autorização</p>
            <p className={styles.taskDetail}>Prazo informado pela escola</p>
            <span className={[styles.pill, styles.blue].join(" ")}>Ana cuida · Pro</span>
          </div>
        </div>
        <div className={styles.task}>
          <div className={styles.dateTile}>
            <b>17</b>SET
          </div>
          <div>
            <p className={styles.taskTitle}>Separar boné e garrafa</p>
            <p className={styles.taskDetail}>Preparar para o passeio de amanhã</p>
            <span className={[styles.pill, styles.amber].join(" ")}>Planejado pela família</span>
          </div>
        </div>
        <div className={styles.task}>
          <div className={styles.dateTile}>
            <b>18</b>SET
          </div>
          <div>
            <p className={styles.taskTitle}>Passeio ao museu · 8h</p>
            <p className={styles.taskDetail}>Saída no portão principal</p>
          </div>
        </div>
      </div>
      <p className={styles.fine}>
        Exemplo fictício · Preparação escolhida pela família · Responsáveis no Pro
      </p>
    </figure>
  );
}
