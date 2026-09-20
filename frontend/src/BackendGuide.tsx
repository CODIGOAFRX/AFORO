import { useState } from "react";
import "./backend-guide.css";

const repository = "https://github.com/CODIGOAFRX/AFORO/blob/main/";
const label = (id: number) =>
  `${String.fromCharCode(65 + Math.floor((id - 1) / 10))}${((id - 1) % 10) + 1}`;
function Source({
  path,
  children,
}: {
  path: string;
  children: React.ReactNode;
}) {
  return (
    <a
      className="guide-source"
      href={repository + path}
      target="_blank"
      rel="noreferrer"
    >
      {children} ↗
    </a>
  );
}

export function BackendGuide() {
  const [selected, setSelected] = useState(24);
  const [size, setSize] = useState(3);
  const [filled, setFilled] = useState<number[]>([8, 9, 35]);
  const [matrixNotice, setMatrixNotice] = useState(
    "Selecciona una posición y prueba un grupo.",
  );
  const [engine, setEngine] = useState<"java" | "d1">("java");
  const [step, setStep] = useState(0);
  const [expired, setExpired] = useState(false);
  const [requestStep, setRequestStep] = useState(0);
  const group = Array.from({ length: size }, (_, i) => selected + i);
  const fits = ((selected - 1) % 10) + size <= 10;
  const free = group.every((id) => !filled.includes(id));
  const row = Math.floor((selected - 1) / 10);
  const column = (selected - 1) % 10;
  const race =
    engine === "java"
      ? [
          [
            "Dos solicitudes, un asiento",
            "A y B piden C4. Que el navegador lo muestre libre no garantiza que siga disponible al confirmar.",
          ],
          [
            "A bloquea; B espera",
            "La transacción A obtiene el bloqueo de la fila de inventario. B no puede modificar esa fila mientras A la tenga bloqueada.",
          ],
          [
            "A comprueba y confirma",
            "Después de obtener los bloqueos, A consulta la disponibilidad y la hora de PostgreSQL. Inserta la reserva, asigna todos sus asientos y hace commit.",
          ],
          [
            "B vuelve a comprobar",
            "Al liberarse el bloqueo, B continúa y lee la reserva vigente. Recibe un conflicto 409. No se crea una segunda reserva para C4.",
          ],
        ]
      : [
          [
            "Dos lecturas de la revisión 7",
            "A y B leen la misma sala libre. Cada petición calcula su nueva reserva sobre una copia del estado.",
          ],
          [
            "A escribe la revisión 8",
            "A guarda su sala solo si la revisión almacenada sigue siendo 7. La escritura modifica una fila y aumenta la revisión.",
          ],
          [
            "La escritura de B no encaja",
            "B también exige la revisión 7, pero ahora es 8. Su UPDATE modifica cero filas: no confirma una copia antigua.",
          ],
          [
            "B lee de nuevo y detecta el conflicto",
            "B recalcula con el estado actualizado. C4 ya está ocupado y devuelve 409. Si fueran asientos distintos, podría reintentar; hay un máximo de tres intentos.",
          ],
        ];
  const journey = [
    {
      title: "Seleccionar",
      detail:
        "React mantiene los IDs elegidos en memoria. Todavía no hay reserva en la base de datos.",
      code: "selected = [24, 25, 26]",
    },
    {
      title: "Enviar",
      detail:
        "El navegador envía los IDs y su cookie de sesión. No decide la disponibilidad ni el vencimiento.",
      code: 'POST /api/reservations\n{ "seatIds": [24, 25, 26] }',
    },
    {
      title: "Validar y guardar",
      detail:
        "El backend autentica la sesión, valida de uno a seis IDs distintos y comprueba el inventario. Los tres asientos se guardan juntos o no se guarda ninguno.",
      code: "sesión válida → asientos libres → escritura atómica",
    },
    {
      title: "Mostrar",
      detail:
        "La respuesta incluye el ID de reserva, el vencimiento y la hora del servidor. React actualiza el plano y los contadores.",
      code: '201 Created\nstate: "ACTIVE"\nseatIds: [24, 25, 26]',
    },
  ];
  function tryGroup() {
    if (!fits) {
      setMatrixNotice("Ese grupo cruza de fila. No se reserva ningún asiento.");
      return;
    }
    if (!free) {
      setMatrixNotice("Hay un asiento ocupado. Se rechaza el grupo completo.");
      return;
    }
    setFilled((previous) => [...previous, ...group]);
    setMatrixNotice(
      `Grupo completo reservado: ${group.map(label).join(", ")}.`,
    );
  }
  function randomGroup() {
    const count = 1 + Math.floor(Math.random() * 3);
    const candidates = Array.from({ length: 60 }, (_, i) => i + 1).filter(
      (id) =>
        ((id - 1) % 10) + count <= 10 &&
        Array.from({ length: count }, (_, k) => id + k).every(
          (id) => !filled.includes(id),
        ),
    );
    setSize(count);
    if (!candidates.length) {
      setMatrixNotice(
        `No queda un grupo de ${count} asientos contiguos. El comprador termina sin reserva.`,
      );
      return;
    }
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    setSelected(chosen);
    setMatrixNotice(
      `El comprador pide ${count} y elige ${label(chosen)} entre ${candidates.length} posiciones válidas. Pulsa «Intentar reserva».`,
    );
  }
  return (
    <section
      id="documentacion"
      className="backend-guide"
      aria-labelledby="guide-title"
    >
      <div className="guide-intro reveal">
        <p className="eyebrow">03 / DOCUMENTACIÓN INTERACTIVA</p>
        <h2 id="guide-title">
          Lo que ocurre
          <br />
          <em>detrás del plano.</em>
        </h2>
        <p className="guide-lead">
          Seleccionar tres asientos es sencillo. Garantizar que nadie los
          reserve dos veces requiere decidir dónde se comprueba el estado y cómo
          se guarda.
        </p>
        <div className="guide-stack">
          <span>
            <b>Backend de referencia</b>Java 21 · Spring Boot · PostgreSQL
          </span>
          <span>
            <b>Esta demo publicada</b>JavaScript · Workers · D1
          </span>
        </div>
        <p className="guide-muted">
          Misma regla de negocio, dos formas de protegerla. Java se ejecuta con
          Docker; la versión D1 adapta la demo a Cloudflare. Los ejemplos de
          esta sección funcionan en tu navegador: no consumen reservas ni
          consultan el servidor.
        </p>
      </div>
      <nav className="guide-nav" aria-label="Capítulos del backend">
        <a href="#modelo">01 · Datos</a>
        <a href="#peticion">02 · Petición</a>
        <a href="#concurrencia">03 · Concurrencia</a>
        <a href="#tiempo">04 · Tiempo</a>
        <a href="#entrevista">05 · Decisiones</a>
      </nav>

      <article id="modelo" className="guide-chapter reveal">
        <div className="guide-copy">
          <p className="eyebrow">01 / REPRESENTAR LA SALA</p>
          <h3>
            Seis filas.
            <br />
            <em>Sesenta posiciones.</em>
          </h3>
          <p>
            El plano se puede entender como una matriz de 6 × 10. El código
            trabaja con una lista de 60 asientos, identificados del 1 al 60. La
            fila y la columna se calculan a partir del ID.
          </p>
          <p>
            La matriz describe la distribución visual. La disponibilidad procede
            de las reservas vigentes; no basta con cambiar el color de un botón.
          </p>
          <Source path="cloudflare/src/domain.js">
            Ver selección de grupos en D1
          </Source>
          <details>
            <summary>Cómo elige un comprador automático</summary>
            <p>
              Primero sortea el tamaño: uno, dos o tres. Después enumera los
              grupos de ese tamaño que estén libres y quepan horizontalmente en
              una fila, y elige uno al azar. Si no hay ninguno, registra «sin
              disponibilidad». No promete llenar los 60 asientos: pueden quedar
              huecos sueltos.
            </p>
            <p>
              Los grupos se construyen hacia la derecha. Por eso el ID 60 es
              válido para una persona, pero no para una pareja. La comprobación
              también impide juntar A10 con B1.
            </p>
          </details>
        </div>
        <div className="guide-panel">
          <div className="guide-panel-heading">
            <span>PLANO EXPLICATIVO</span>
            <span>6 × 10</span>
          </div>
          <div
            className="guide-matrix"
            aria-label="Matriz interactiva de sesenta asientos"
          >
            {Array.from({ length: 60 }, (_, i) => i + 1).map((id) => (
              <button
                key={id}
                aria-label={`${label(id)}, ID ${id}${filled.includes(id) ? ", ocupado" : ""}`}
                aria-pressed={selected === id}
                className={`${filled.includes(id) ? "occupied" : ""} ${group.includes(id) ? "candidate" : ""} ${!fits && group.includes(id) ? "invalid" : ""}`}
                onClick={() => {
                  setSelected(id);
                  setMatrixNotice(
                    `Posición ${label(id)} seleccionada. Comprueba el grupo antes de reservar.`,
                  );
                }}
              >
                {label(id)}
              </button>
            ))}
          </div>
          <div className="guide-formula">
            <span>
              ID <b>{selected}</b> · {label(selected)}
            </span>
            <code>
              fila = floor(({selected} − 1) / 10) = {row}
              <br />
              columna = ({selected} − 1) % 10 = {column}
            </code>
            <small>
              Índices desde cero: fila {row} = {String.fromCharCode(65 + row)}.
            </small>
          </div>
          <div className="guide-controls">
            <label>
              Personas
              <select
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
            <button onClick={randomGroup}>Elegir al azar ↗</button>
            <button className="guide-dark" onClick={tryGroup}>
              Intentar reserva
            </button>
            <button
              onClick={() => {
                setFilled([8, 9, 35]);
                setMatrixNotice("Plano reiniciado.");
              }}
            >
              Reiniciar
            </button>
          </div>
          <p className="guide-feedback" role="status">
            {matrixNotice}
          </p>
          <p className="guide-muted">
            Verde: ocupado · borde: grupo candidato. Prueba a elegir A10 con
            tres personas.
          </p>
        </div>
      </article>

      <article id="peticion" className="guide-flow reveal">
        <p className="eyebrow">02 / DEL CLIC A LA RESERVA</p>
        <h3>
          Una petición,
          <br />
          <em>cuatro pasos.</em>
        </h3>
        <div className="guide-steps" aria-label="Recorrido de una reserva">
          {journey.map((item, i) => (
            <button
              key={item.title}
              aria-pressed={requestStep === i}
              onClick={() => setRequestStep(i)}
            >
              <span>0{i + 1}</span>
              {item.title}
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </div>
        <div className="guide-flow-detail" key={requestStep}>
          <div>
            <h4>{journey[requestStep].title}</h4>
            <p>{journey[requestStep].detail}</p>
          </div>
          <pre>
            <code>{journey[requestStep].code}</code>
          </pre>
        </div>
        <p className="guide-muted">
          En producción, las rutas llevan el prefijo{" "}
          <code>/proyecto/aforo</code>. Un conflicto devuelve 409; una selección
          inválida, 400. Una reserva manual puede contener hasta seis asientos.
        </p>
      </article>

      <article id="concurrencia" className="guide-chapter reveal">
        <div className="guide-copy">
          <p className="eyebrow">03 / EL PROBLEMA CENTRAL</p>
          <h3>
            Dos solicitudes.
            <br />
            <em>Un solo C4.</em>
          </h3>
          <p>
            Desactivar un botón no evita una carrera: otra pestaña puede tener
            información anterior. La garantía tiene que estar en la escritura
            del backend.
          </p>
          <div className="guide-engine" aria-label="Implementación explicada">
            <button
              aria-pressed={engine === "java"}
              onClick={() => {
                setEngine("java");
                setStep(0);
              }}
            >
              Java / PostgreSQL
            </button>
            <button
              aria-pressed={engine === "d1"}
              onClick={() => {
                setEngine("d1");
                setStep(0);
              }}
            >
              Workers / D1
            </button>
          </div>
          <p>
            {engine === "java"
              ? "Java usa una transacción y bloqueos de filas. Los IDs se ordenan antes de bloquear para reducir el riesgo de interbloqueos. La disponibilidad se vuelve a leer después de obtener todos los bloqueos."
              : "D1 guarda cada sala como un documento JSON acotado, con una revisión. Una escritura solo se acepta si nadie ha cambiado esa revisión desde la lectura. Es control de concurrencia optimista."}
          </p>
          <Source
            path={
              engine === "java"
                ? "backend/src/main/java/dev/pedrogomez/aforo/InventoryService.java"
                : "cloudflare/src/store.js"
            }
          >
            Leer la implementación real
          </Source>
        </div>
        <div className="guide-panel guide-race">
          <div className="guide-panel-heading">
            <span>SIMULACIÓN PASO A PASO</span>
            <span>{step + 1} / 4</span>
          </div>
          <div className="guide-race-lanes">
            <div>
              <b>Petición A</b>
              <span>
                {step === 0
                  ? "Solicita C4"
                  : engine === "java" && step === 1
                    ? "Bloqueo obtenido"
                    : "Reserva guardada"}
              </span>
            </div>
            <div className={`guide-race-seat ${step > 0 ? "taken" : ""}`}>
              C4
              <small>
                {step === 0
                  ? "LIBRE"
                  : engine === "java" && step === 1
                    ? "BLOQUEADO"
                    : "RESERVADO"}
              </small>
            </div>
            <div>
              <b>Petición B</b>
              <span>
                {step === 0
                  ? "Solicita C4"
                  : step === 3
                    ? "409 · Conflicto"
                    : engine === "java"
                      ? "Espera el bloqueo"
                      : "Revisión antigua"}
              </span>
            </div>
          </div>
          <div className="guide-race-story" aria-live="polite">
            <h4>{race[step][0]}</h4>
            <p>{race[step][1]}</p>
          </div>
          <div className="guide-controls">
            <button disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              ← Anterior
            </button>
            <button
              className="guide-dark"
              onClick={() => setStep((s) => (s + 1) % 4)}
            >
              {step === 3 ? "Repetir" : "Siguiente paso →"}
            </button>
          </div>
          <pre>
            <code>
              {engine === "java"
                ? "// Extracto simplificado · dentro de @Transactional\nSELECT seat_id FROM event_seat\nWHERE session_id = :session\n  AND seat_id IN (:seats)\nORDER BY seat_id FOR UPDATE;\n// Comprobar disponibilidad DESPUÉS del bloqueo."
                : "-- Escritura condicional de la sala\nUPDATE room\nSET data = ?, revision = revision + 1\nWHERE token_hash = ? AND revision = ?\n  AND expires_at > unixepoch();\n-- 0 filas: releer y recalcular, nunca confirmar."}
            </code>
          </pre>
        </div>
      </article>

      <article id="tiempo" className="guide-chapter reveal">
        <div className="guide-copy">
          <p className="eyebrow">04 / ESTADO, SESIÓN Y TIEMPO</p>
          <h3>
            El contador
            <br />
            <em>no libera el asiento.</em>
          </h3>
          <p>
            El backend compara la hora actual con el vencimiento. Aunque cierres
            la pestaña, una retención deja de ocupar el asiento después de cinco
            minutos. La reserva histórica puede seguir existiendo.
          </p>
          <p>
            Java toma la hora de PostgreSQL después de esperar los bloqueos. D1
            calcula el vencimiento en el Worker; React ajusta su contador con la
            hora que devuelve el servidor.
          </p>
          <Source path="cloudflare/src/domain.js">
            Ver disponibilidad y vencimiento
          </Source>
        </div>
        <div className="guide-panel">
          <div className="guide-panel-heading">
            <span>RELOJ ILUSTRATIVO</span>
            <span>SIN ESPERAR CINCO MINUTOS</span>
          </div>
          <div className={`guide-clock ${expired ? "expired" : ""}`}>
            <span>{expired ? "05:00" : "00:00"}</span>
            <div className="guide-clock-track">
              <i />
            </div>
            <b>
              {expired
                ? "Disponible de nuevo"
                : "Retenido durante 300 segundos"}
            </b>
          </div>
          <button className="guide-dark" onClick={() => setExpired((v) => !v)}>
            {expired ? "Volver al inicio" : "Avanzar al vencimiento →"}
          </button>
          <p className="guide-muted">
            No hay compra implementada. Esto demuestra retenciones temporales,
            no venta de entradas.
          </p>
        </div>
      </article>

      <div className="guide-facts reveal">
        <article>
          <span>01 / AISLAMIENTO</span>
          <h4>Tu navegador, tu sala.</h4>
          <p>
            Dos pestañas comparten la cookie y el inventario. Otro navegador
            recibe una sala independiente. No es un único concierto compartido
            por todos los visitantes.
          </p>
          <p>
            El token es aleatorio, la cookie es HttpOnly y la base solo guarda
            su hash SHA-256. Las escrituras comprueban el origen.
          </p>
        </article>
        <article>
          <span>02 / ACTUALIZACIÓN</span>
          <h4>Consultas periódicas.</h4>
          <p>
            La demo usa polling, no WebSockets. D1 devuelve plano, reservas y
            contadores juntos. React consulta cada segundo con reservas activas
            y cada diez en reposo.
          </p>
          <p>
            Las consultas se pausan al ocultar la pestaña o tras dos minutos sin
            interacción. En D1, los compradores avanzan con peticiones de la
            pestaña visible; en Java los ejecuta el servidor.
          </p>
        </article>
        <article>
          <span>03 / COSTE</span>
          <h4>Una demo acotada.</h4>
          <p>
            D1 admite hasta 20 sesiones nuevas y 1.500 operaciones al día. Cada
            sesión permite diez reservas manuales y tres pruebas. Los datos
            caducados se limpian al crear nuevas sesiones.
          </p>
          <p>
            Son límites operativos. Rechazar peticiones también consume
            recursos: no equivalen a un límite absoluto de facturación.
          </p>
        </article>
      </div>

      <article id="entrevista" className="guide-interview reveal">
        <p className="eyebrow">05 / DECISIONES QUE PUEDES EXPLICAR</p>
        <h3>
          Del ejemplo
          <br />
          <em>a la entrevista.</em>
        </h3>
        <p>
          No hace falta memorizar el código. Lo importante es poder razonar
          sobre estas decisiones y sus límites.
        </p>
        {[
          [
            "¿Por qué una transacción?",
            "Una selección de tres asientos debe confirmarse completa o fallar completa. En Java, la transacción agrupa comprobación, reserva, historial y asignación. En D1, la sala se modifica con una única escritura condicional.",
          ],
          [
            "¿Por qué no basta con comprobar que está libre?",
            "Entre una lectura y una escritura puede entrar otra petición. Java protege ese intervalo con bloqueos. D1 detecta una revisión antigua y recalcula antes de confirmar.",
          ],
          [
            "¿Por qué conservar dos backends?",
            "Java/PostgreSQL permite estudiar transacciones relacionales y bloqueos explícitos. Workers/D1 permite publicar la demo con la infraestructura disponible. No son intercambiables sin rediseñar la persistencia.",
          ],
          [
            "¿Qué comprueban las pruebas?",
            "PostgreSQL prueba peticiones concurrentes que esperan un bloqueo real, conflictos parciales, caducidad y aislamiento de sesiones. D1 prueba escrituras concurrentes sobre el emulador, admisión en el límite diario y grupos aleatorios sin duplicados ni cruces de fila. Esto no sustituye una prueba de carga de producción.",
          ],
          [
            "¿Qué cambiaría para vender entradas de verdad?",
            "Haría falta un inventario global por evento, confirmación de compra, pagos e idempotencia, autenticación según el producto, recuperación ante fallos y límites contra abuso. Los compradores espaciados de esta demo no representan 30 usuarios concurrentes ni demuestran una capacidad de carga.",
          ],
        ].map(([title, body]) => (
          <details key={title}>
            <summary>
              {title}
              <span aria-hidden="true">+</span>
            </summary>
            <p>{body}</p>
          </details>
        ))}
        <div className="guide-links">
          <Source path="backend/src/test/java/dev/pedrogomez/aforo/ReservationIntegrationTest.java">
            Pruebas Java
          </Source>
          <Source path="cloudflare/test/d1.test.js">Pruebas D1</Source>
          <Source path="docs/architecture.md">Arquitectura completa</Source>
        </div>
      </article>
      <div className="guide-end">
        <span>
          La interfaz muestra el estado.
          <br />
          <b>El backend garantiza la reserva.</b>
        </span>
        <a href="#asientos">Volver a probar ↗</a>
      </div>
    </section>
  );
}
