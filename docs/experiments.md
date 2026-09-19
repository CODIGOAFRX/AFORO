# Compradores automáticos: escenario de llegadas espaciadas

El visitante y los compradores automáticos compiten por el inventario de la misma
sesión. Otras sesiones permanecen aisladas. Las pestañas de una sesión comparten
ejecución, contadores y reservas propias. Un comprador automático no es una persona.

## Ejecución

POST `/api/experiments` recibe `buyers` (1–30), `intervalSeconds` (1, 2, 5) y
`seatsPerBuyer` (1 o 2). Se guarda una ejecución y el scheduler del backend procesa
un intento cuando llega su fecha. El ritmo es un intervalo mínimo tras completar
el intento anterior, no una garantía de temporización exacta.

Selecciona el primer asiento libre por orden de fila/número o la primera pareja
contigua de la misma fila. Llama a la misma lógica transaccional de reservas que
la API del visitante. Si alguien ocupa el asiento entre consulta y reserva, el
resultado es CONFLICT; no reintenta ni inventa un éxito. Si no encuentra un grupo,
registra NO_AVAILABILITY. Fallos inesperados se registran como ERROR y detienen
la ejecución. Un fallo de conexión que impide persistir el resultado se registra
en logs, revierte el tick y puede reintentarse; no se muestra un éxito ficticio.

El tick bloquea la fila de ejecución con SKIP LOCKED para evitar duplicación entre
instancias. Reserva y resultado se confirman juntos. Un savepoint NESTED permite
revertir un conflicto sin perder el registro del intento. Hay una restricción
única por ejecución/comprador. El scheduler puede retomar trabajo tras reinicio;
detiene ejecuciones de más de cinco minutos. El intervalo continúa desde los
datos persistidos, no depende de temporizadores del navegador.

## Límites y observación

- Una ejecución activa por sesión, cuatro globales, cinco inicios por sesión/hora.
- Máximo 30 intentos y dos asientos por intento; sin destinos HTTP configurables.
- Admisión serializada con advisory lock PostgreSQL y restricciones de tabla.
- `AFORO_EXPERIMENTS_ENABLED=false` rechaza nuevos inicios y detiene ejecuciones.
- POST `/api/experiments/{id}/stop` exige sesión propietaria. Conserva reservas ya
  confirmadas, que caducan normalmente a los cinco minutos.
- GET `/api/experiments/latest` devuelve la última ejecución y sus intentos.
- GET `/api/reservation-counts` cuenta todas las reservas activas desde PostgreSQL,
  separando propias y automáticas, además de asientos retenidos.
- GET `/api/reservations` lista únicamente reservas manuales de la sesión.
- La interfaz consulta cada segundo. La animación acompaña cambios confirmados;
  el canal no es SSE y puede haber un segundo o más de retraso por red/carga.

`durationMs` mide dentro del proceso desde selección hasta el resultado de la
reserva, antes del commit externo. No es latencia HTTP ni tiempo hasta confirmación
durable. No se muestra como benchmark ni se calculan percentiles de producción.

Este escenario prueba llegadas graduales. La contención simultánea está en las
pruebas de integración, que observan dos solicitudes esperando bloqueos reales.
Una prueba de carga simultánea en la interfaz es una ampliación distinta.
