import { useState } from "react";

export type Counts = {
  total: number;
  yours: number;
  automated: number;
  heldSeats: number;
};
export type Report = {
  run: {
    id: string;
    buyers: number;
    intervalSeconds: number;
    seatsPerBuyer: number;
    completed: number;
    status: string;
  } | null;
  attempts: {
    buyer: number;
    outcome: string;
    seatIds: number[];
    durationMs: number;
    createdAt: string;
  }[];
};
type Props = {
  browserDriven?: boolean;
  report?: Report;
  counts?: Counts;
  connected: boolean;
  api: <T>(path: string, body?: unknown) => Promise<T>;
  refresh: () => Promise<void>;
};
const seatLabel = (id: number) =>
  `${String.fromCharCode(65 + Math.floor((id - 1) / 10))}${((id - 1) % 10) + 1}`;
export function Experiment({ report, counts, connected, api, refresh, browserDriven }: Props) {
  const [buyers, setBuyers] = useState(30);
  const [interval, setInterval] = useState(2);
  const [group, setGroup] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = report?.run?.status === "RUNNING";
  async function act(stop: boolean) {
    setBusy(true);
    setError("");
    try {
      if (stop) await api(`/experiments/${report?.run?.id}/stop`, {});
      else
        await api("/experiments", {
          buyers,
          intervalSeconds: interval,
          seatsPerBuyer: group,
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar.");
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  return (
    <section className="experiment" aria-labelledby="experiment-title">
      <div className="experiment-head">
        <div>
          <p className="eyebrow">PRUEBA INTERACTIVA</p>
          <h3 id="experiment-title">Llena la sala.</h3>
          <p>
            Reserva tú mientras los compradores automáticos ocupan los asientos
            libres.
          </p>
          {browserDriven && <p className="small">Mantén esta pestaña visible. La prueba se pausa al ocultarla o tras dos minutos sin interacción; vuelve a tocar la página para continuar.</p>}
        </div>
        <span className={`run-state ${running ? "running" : ""}`}>
          {running
            ? "En curso"
            : report?.run
              ? {
                  COMPLETED: "Terminada",
                  STOPPED: "Detenida",
                  FAILED: "Error en la ejecución",
                }[report.run.status] || report.run.status
              : "Lista para empezar"}
        </span>
      </div>
      <div className="experiment-controls">
        <label>
          Compradores
          <input
            type="number"
            min="1"
            max="30"
            value={buyers}
            disabled={running || busy}
            onChange={(e) => setBuyers(Number(e.target.value))}
          />
        </label>
        <label>
          Ritmo
          <select
            value={interval}
            disabled={running || busy}
            onChange={(e) => setInterval(Number(e.target.value))}
          >
            <option value={1}>Uno cada segundo</option>
            <option value={2}>Uno cada 2 segundos</option>
            <option value={5}>Uno cada 5 segundos</option>
          </select>
        </label>
        <label>
          Asientos por comprador
          <select
            value={group}
            disabled={running || busy}
            onChange={(e) => setGroup(Number(e.target.value))}
          >
            <option value={1}>Un asiento</option>
            <option value={2}>Dos juntos</option>
          </select>
        </label>
        <button
          className="primary"
          disabled={
            busy ||
            !connected ||
            !Number.isInteger(buyers) ||
            buyers < 1 ||
            buyers > 30
          }
          onClick={() => void act(Boolean(running))}
        >
          {busy
            ? "Enviando…"
            : running
              ? "Detener compradores"
              : `Lanzar ${buyers} compradores`}
          <span>{running ? "Ⅱ" : "↗"}</span>
        </button>
      </div>
      <p className="small">
        Hacen reservas reales de cinco minutos en este plano.{" "}
        {!browserDriven && "La ejecución continúa si cierras la pestaña. "}
        Detenerla no cancela las reservas ya hechas.
      </p>
      {error && (
        <p className="message" role="alert">
          {error}
        </p>
      )}
      <div className="live-counts" aria-label="Reservas activas">
        <div>
          <strong key={`total-${counts?.total}`}>{counts?.total ?? "—"}</strong>
          <span>Reservas totales</span>
        </div>
        <div>
          <strong key={`you-${counts?.yours}`}>{counts?.yours ?? "—"}</strong>
          <span>Tus reservas</span>
        </div>
        <div>
          <strong key={`bots-${counts?.automated}`}>
            {counts?.automated ?? "—"}
          </strong>
          <span>Automáticas</span>
        </div>
        <div>
          <strong key={`seats-${counts?.heldSeats}`}>
            {counts?.heldSeats ?? "—"}
            <small> / 60</small>
          </strong>
          <span>Asientos ocupados</span>
        </div>
      </div>
      {report?.run && (
        <div className="experiment-results">
          <div className="progress-heading">
            <strong>
              {report.run.completed} / {report.run.buyers} intentos completados
            </strong>
            <span>
              {report.attempts.filter((a) => a.outcome === "RESERVED").length}{" "}
              reservas ·{" "}
              {
                report.attempts.filter((a) => a.outcome === "NO_AVAILABILITY")
                  .length
              }{" "}
              sin sitio ·{" "}
              {report.attempts.filter((a) => a.outcome === "CONFLICT").length}{" "}
              conflictos ·{" "}
              {report.attempts.filter((a) => a.outcome === "ERROR").length}{" "}
              errores
            </span>
          </div>
          <progress
            value={report.run.completed}
            max={report.run.buyers}
            aria-label="Intentos completados"
          />
          <ol className="activity" aria-label="Actividad de compradores">
            {report.attempts.map((a) => (
              <li key={`${report.run!.id}-${a.buyer}`}>
                <span className="activity-number">
                  {String(a.buyer).padStart(2, "0")}
                </span>
                <span>
                  <b>Comprador {a.buyer}</b>
                  <span>
                    {a.outcome === "RESERVED"
                      ? `Reservó ${a.seatIds.map(seatLabel).join(" y ")}`
                      : a.outcome === "NO_AVAILABILITY"
                        ? "No quedan asientos para este grupo"
                        : a.outcome === "CONFLICT"
                          ? "Otro comprador reservó antes"
                          : "Fallo inesperado; ejecución detenida"}
                  </span>
                </span>
                <time>{new Date(a.createdAt).toLocaleTimeString("es-ES")}</time>
              </li>
            ))}
          </ol>
          {report.attempts.length === 0 && (
            <p className="small">Esperando el primer intento…</p>
          )}
          <p className="small">
            Llegadas espaciadas, no 30 usuarios simultáneos. Resultados del
            servidor; esta prueba no mide la capacidad de producción.
          </p>
        </div>
      )}
    </section>
  );
}
