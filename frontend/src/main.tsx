import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { Experiment, type Report, type Counts } from "./Experiment";
import { useReveal } from "./useReveal";

type Seat = {
  id: number;
  row: string;
  number: number;
  state: "AVAILABLE" | "HELD";
};
type Hold = {
  id: string;
  expiresAt: string;
  serverTime: string;
  seatIds: number[];
  state: "ACTIVE" | "EXPIRED";
};
type Event = {
  name: string;
  venue: string;
  startsAt: string;
  priceCents: number;
};
type Inventory = { serverTime: string; seats: Seat[] };
const money = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
const label = (id: number) =>
  `${String.fromCharCode(65 + Math.floor((id - 1) / 10))}${((id - 1) % 10) + 1}`;
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.detail || `No se pudo completar la petición (${response.status}).`,
    );
  return data;
}
function App() {
  const [event, setEvent] = useState<Event>();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const [report, setReport] = useState<Report>();
  const [counts, setCounts] = useState<Counts>();
  useReveal(ready);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const refreshing = useRef(false);
  const [listMode, setListMode] = useState(false);
  async function refresh() {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const [inventory, reservations, experiment, totals] = await Promise.all([
        api<Inventory>("/inventory"),
        api<Hold[]>("/reservations"),
        api<Report>("/experiments/latest"),
        api<Counts>("/reservation-counts"),
      ]);
      setSeats(inventory.seats);
      setHolds(reservations);
      setReport(experiment);
      setCounts(totals);
      offset.current = Date.parse(inventory.serverTime) - Date.now();
      setNow(Date.now() + offset.current);
      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      refreshing.current = false;
    }
  }
  async function initialize() {
    setError("");
    try {
      await api("/session", {});
      const info = await api<Event>("/event");
      setEvent(info);
      await refresh();
      setReady(true);
    } catch {
      setError(
        "No podemos conectar con AFORO. Comprueba que los contenedores están arrancados y vuelve a intentar.",
      );
    }
  }
  useEffect(() => {
    void initialize();
  }, []);
  useEffect(() => {
    if (!ready) return;
    const poll = setInterval(() => {
      void refresh();
    }, 1000);
    const tick = setInterval(() => setNow(Date.now() + offset.current), 1000);
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("focus", focus);
    };
  }, [ready]);
  function toggle(id: number) {
    setNotice("");
    setError("");
    if (selected.includes(id)) setSelected(selected.filter((s) => s !== id));
    else if (selected.length < 6) setSelected([...selected, id]);
    else setError("Puedes seleccionar hasta seis asientos por reserva.");
  }
  async function reserve() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const hold = await api<Hold>("/reservations", { seatIds: selected });
      setSelected([]);
      setHolds((previous) => [
        hold,
        ...previous.filter((h) => h.id !== hold.id),
      ]);
      setNotice(
        "Reserva confirmada. Tus asientos están retenidos durante cinco minutos.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error && failure.name !== "TimeoutError"
          ? failure.message
          : "No llegó la respuesta. Revisa «Tus reservas» antes de volver a reservar.",
      );
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  const active = holds.filter((h) => h.state === "ACTIVE");
  const stale = selected.some(
    (id) => seats.find((s) => s.id === id)?.state !== "AVAILABLE",
  );
  return (
    <>
      <a className="skip" href="#asientos">
        Saltar a los asientos
      </a>
      <header>
        <a className="brand" href="#">
          AFORO<span>·</span>
        </a>
        <nav aria-label="Principal">
          <a href="#asientos">Elige tu lugar</a>
          <a href="#proyecto">
            El proyecto <span>↗</span>
          </a>
        </nav>
        <span className="edition">DEMO / 001</span>
      </header>
      <main>
        <section className="hero" aria-labelledby="title">
          <div className="hero-copy">
            <p className="eyebrow">RESERVAS DE CONCIERTO / DEMO INTERACTIVA</p>
            <h1 id="title">
              Elige asiento.
              <br />
              <em>Ponlo a prueba.</em>
            </h1>
            <p className="intro">
              Reserva en el plano o lanza compradores automáticos y observa cómo
              se ocupa la sala.
            </p>
            <a className="primary" href="#asientos">
              Probar reservas <span>↗</span>
            </a>
            <p className="disclaimer">
              Experiencia de demostración · Sin pagos reales
            </p>
          </div>
          <div
            className="poster"
            aria-label="Cartel del concierto ficticio Nocturna"
          >
            <div className="poster-top">
              <span>AFORO PRESENTA</span>
              <span>MADRID / 2027</span>
            </div>
            <div className="orbit-art" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} className={`orbit orbit-${i}`} />
              ))}
              <b>N</b>
            </div>
            <div className="poster-bottom">
              <p>CONCIERTO FICTICIO — DEMOSTRACIÓN</p>
              <h2>
                Nocturna
                <span className="poster-subtitle">
                  Nombre del concierto de prueba
                </span>
              </h2>
              <div>
                <span>ELECTRÓNICA · AMBIENT · LIVE</span>
                <span>19 JUN ↗</span>
              </div>
            </div>
          </div>
        </section>
        <section
          className="event-strip reveal"
          aria-label="Datos del concierto"
        >
          <div>
            <span>01 / CUÁNDO</span>
            <strong>
              19 junio 2027 <small>21:00 h</small>
            </strong>
          </div>
          <div>
            <span>02 / DÓNDE</span>
            <strong>{event?.venue || "Sala Horizonte · Madrid"}</strong>
          </div>
          <div>
            <span>03 / TU ENTRADA</span>
            <strong>
              {event ? money(event.priceCents) : "24,00 €"}{" "}
              <small>Precio ficticio</small>
            </strong>
          </div>
        </section>
        <section
          id="asientos"
          className="booking reveal"
          aria-labelledby="booking-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">01 / PLANO DE LA SALA</p>
              <h2 id="booking-title">Selecciona tus asientos.</h2>
            </div>
            <p>Máximo seis por reserva. Se liberan a los cinco minutos.</p>
          </div>
          {!ready && (
            <div className="message" role="status">
              {error || "Preparando tu sesión y consultando los asientos…"}
              {error && (
                <button onClick={() => void initialize()}>
                  Volver a intentar
                </button>
              )}
            </div>
          )}
          {ready && (
            <>
              <Experiment
                report={report}
                counts={counts}
                connected={connected}
                api={api}
                refresh={refresh}
              />
              <div className="booking-grid">
                <div className="venue">
                  <div className="venue-toolbar">
                    <span
                      className={`connection ${connected ? "" : "offline"}`}
                    >
                      {connected
                        ? "Conectado · actualiza cada segundo"
                        : "Sin conexión · reintentando"}
                    </span>
                    <button
                      className="text-button"
                      onClick={() => setListMode(!listMode)}
                    >
                      {listMode ? "Ver plano" : "Ver lista"}
                    </button>
                  </div>
                  <div className="stage">
                    ESCENARIO<span>NOCTURNA / LIVE SESSION</span>
                  </div>
                  <div
                    className={listMode ? "seat-list" : "seat-map"}
                    aria-label="Asientos numerados"
                  >
                    {["A", "B", "C", "D", "E", "F"].map((row) => (
                      <div className="seat-row" key={row}>
                        <span className="row-label">{row}</span>
                        {seats
                          .filter((s) => s.row === row)
                          .map((seat) => (
                            <button
                              key={seat.id}
                              className={`seat ${selected.includes(seat.id) ? "selected" : ""} ${seat.state === "HELD" ? "held" : ""}`}
                              aria-label={`Fila ${seat.row}, asiento ${seat.number}, ${seat.state === "HELD" ? "reservado" : selected.includes(seat.id) ? "seleccionado" : "disponible"}`}
                              aria-pressed={selected.includes(seat.id)}
                              disabled={
                                busy ||
                                (seat.state === "HELD" &&
                                  !selected.includes(seat.id))
                              }
                              onClick={() => toggle(seat.id)}
                            >
                              {listMode
                                ? `${seat.row}${seat.number} · ${seat.state === "HELD" ? "Reservado" : selected.includes(seat.id) ? "Seleccionado" : "Libre"}`
                                : seat.state === "HELD"
                                  ? "×"
                                  : seat.number}
                            </button>
                          ))}
                      </div>
                    ))}
                  </div>
                  <div className="legend">
                    <span>
                      <i />
                      Disponible
                    </span>
                    <span>
                      <i className="black" />
                      Tu selección
                    </span>
                    <span>
                      <i className="striped" />× Reservado
                    </span>
                  </div>
                  <p className="venue-caption">
                    Sala íntima · 6 filas · 60 asientos numerados
                  </p>
                </div>
                <aside className="summary">
                  <p className="eyebrow">TU SELECCIÓN</p>
                  <h3>
                    {selected.length
                      ? `${selected.length} ${selected.length === 1 ? "lugar elegido" : "lugares elegidos"}`
                      : "Sin asientos seleccionados"}
                  </h3>
                  <p className="muted">
                    Seleccionar no reserva. Confirmaremos la disponibilidad al
                    continuar.
                  </p>
                  <div className="selection">
                    {selected.length ? (
                      selected.map((id) => (
                        <button
                          disabled={busy}
                          onClick={() => toggle(id)}
                          key={id}
                          aria-label={`Quitar asiento ${label(id)}`}
                        >
                          {label(id)} <span>×</span>
                        </button>
                      ))
                    ) : (
                      <span>Aún no has seleccionado asientos.</span>
                    )}
                  </div>
                  <div className="total">
                    <span>Total de demostración</span>
                    <strong>
                      {money(selected.length * (event?.priceCents || 0))}
                    </strong>
                  </div>
                  <button
                    className="primary"
                    disabled={!selected.length || busy || !connected || stale}
                    onClick={() => void reserve()}
                  >
                    {busy ? "Confirmando…" : "Reservar 5 minutos"}
                    <span>↗</span>
                  </button>
                  {stale && (
                    <p role="alert">
                      Un asiento seleccionado ya está reservado. Quítalo de tu
                      selección para continuar.
                    </p>
                  )}
                  <p className="small">
                    Reserva temporal: se libera si no se compra. La compra aún
                    no está disponible en esta versión.
                  </p>
                  <div className="availability">
                    <strong>
                      {seats.filter((s) => s.state === "AVAILABLE").length}
                      <span> / 60</span>
                    </strong>
                    <p>
                      asientos disponibles
                      <br />
                      en tu sesión de demo
                    </p>
                  </div>
                </aside>
              </div>
              <div
                aria-live="polite"
                className={error || notice ? "message" : ""}
              >
                {error || notice}
                {error && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setError("");
                      void refresh();
                    }}
                  >
                    Consultar de nuevo
                  </button>
                )}
              </div>
              {holds.length > 0 && (
                <section className="reservations" aria-labelledby="holds-title">
                  <div className="section-heading">
                    <h3 id="holds-title">Tus reservas</h3>
                    <span>
                      {active.length} activas · guardadas en el servidor
                    </span>
                  </div>
                  {holds.map((hold) => {
                    const seconds = Math.max(
                      0,
                      Math.ceil((Date.parse(hold.expiresAt) - now) / 1000),
                    );
                    return (
                      <article className="ticket" key={hold.id}>
                        <div className="ticket-icon" aria-hidden="true">
                          A.
                        </div>
                        <div>
                          <p className="eyebrow">TU RESERVA / NOCTURNA</p>
                          <h4>{hold.seatIds.map(label).join(" · ")}</h4>
                          <p className="reference">Ref. {hold.id}</p>
                        </div>
                        <div className="ticket-time">
                          <strong>
                            {hold.state === "EXPIRED"
                              ? "Caducada"
                              : seconds
                                ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
                                : "Verificando…"}
                          </strong>
                          <span>
                            {hold.state === "EXPIRED"
                              ? "Asientos liberados"
                              : "Tiempo restante estimado"}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                  <p className="small">
                    La compra y las entradas QR todavía no están implementadas.
                    El servidor decide el vencimiento; esta cuenta atrás es
                    orientativa.
                  </p>
                </section>
              )}
            </>
          )}
        </section>
        <section id="proyecto" className="project reveal">
          <div>
            <p className="eyebrow">02 / CÓMO PROBARLO</p>
            <h2>
              Comprueba
              <br />
              <em>qué ocurre.</em>
            </h2>
            <p>
              Reserva mientras entran compradores automáticos o abre dos
              pestañas para intentar ocupar el mismo asiento.
            </p>
            <a
              className="underlined"
              href="https://www.pedrogomez.dev/"
              target="_blank"
              rel="noreferrer"
            >
              Conoce mi trabajo ↗
            </a>
          </div>
          <div className="project-notes">
            <article>
              <span>01</span>
              <div>
                <h3>Pruébalo en dos pestañas</h3>
                <p>
                  Selecciona el mismo asiento en ambas y confirma. Si una
                  reserva llega primero, la otra se rechaza o el plano marca el
                  asiento como ocupado. Las pestañas comparten tus reservas.
                </p>
                <a
                  className="underlined"
                  href="/#asientos"
                  target="_blank"
                  rel="noopener"
                >
                  Abrir segunda pestaña ↗
                </a>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>Lanza compradores automáticos</h3>
                <p>
                  Elige cuántos entran, el intervalo y si necesitan uno o dos
                  asientos juntos. Su actividad aparece en la lista y sus
                  reservas ocupan este mismo plano.
                </p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>Por qué caducan las reservas</h3>
                <p>
                  Una reserva retiene el asiento mientras se completa una
                  compra. Si no se termina, vuelve a estar libre. Esta versión
                  permite probar la retención y la caducidad; la compra y los QR
                  siguen pendientes.
                </p>
              </div>
            </article>
          </div>
        </section>
      </main>
      <footer>
        <a className="brand" href="#">
          AFORO<span>·</span>
        </a>
        <span>Una experiencia de Pedro Gómez</span>
        <span>PROYECTO EN DESARROLLO · 2026</span>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
