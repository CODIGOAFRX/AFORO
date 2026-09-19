# Primera decisión: reservas transaccionales

19 de septiembre de 2026. Implementada para el primer incremento, no para todo el producto.

## Autoridad y estados

`event_seat` tiene una única fila por sesión, evento y asiento. Su referencia a
`reservation` determina quién lo retiene. La clave foránea compuesta impide
referenciar una reserva de otra sesión/evento. La reserva solo está activa si
`expires_at > clock_timestamp()`. AVAILABLE/HELD y ACTIVE/EXPIRED se calculan;
no hay columnas de estado duplicadas que necesiten sincronización.

`reservation_seat` conserva los asientos históricos incluso después de recuperar
el inventario vencido. Es una asociación histórica, no una fuente de disponibilidad.
La compra y SOLD aún no existen y requerirán nuevas restricciones y transiciones.

## Reserva de varios asientos

Una transacción READ COMMITTED adquiere `SELECT ... ORDER BY seat_id FOR UPDATE`
sobre todas las filas solicitadas. Solo después consulta las reservas asociadas,
usando una nueva lectura. Así evita decidir con datos leídos antes de esperar.
Se lee `clock_timestamp()` después del bloqueo, porque `CURRENT_TIMESTAMP` en
PostgreSQL refleja el inicio de la transacción, anterior a una posible espera.

Si una fila no existe o un asiento sigue retenido, no se crea nada. Si están
disponibles, se inserta la reserva, su asociación histórica y se actualiza todo
el inventario en esa misma transacción. El bloqueo termina al confirmar o revertir.
Un orden estable reduce interbloqueos. La espera de bloqueo está limitada a 5 s.

Alternativa considerada: actualizaciones condicionales y comprobación del número
de filas. El bloqueo explícito resulta más fácil de explicar y extender en este
incremento. No se han comparado rendimientos ni se afirma superioridad general.

Las restricciones impiden enlaces inválidos y múltiples filas para un mismo
asiento/ámbito. La exclusión temporal depende también del protocolo transaccional:
un escritor SQL que lo omita puede violar reglas de negocio. Todas las futuras
mutaciones (comprar, cancelar, limpiar) deben respetar el mismo orden de bloqueo.

## Sesiones y acceso

Token aleatorio de 256 bits en cookie HttpOnly, SameSite=Strict, duración de un día.
Solo se persiste SHA-256 del token. El UUID público no sirve como credencial.
Se filtra el acceso a reservas por la sesión autenticada y se devuelve 404 para
reservas ajenas. Las operaciones POST exigen JSON y rechazan Origin ajeno o
Sec-Fetch-Site cross-site. No se habilita CORS. `Secure` es configurable para HTTPS.
La configuración de proxy deberá probarse antes del despliegue.

## Límites actuales

- POST de reserva no es idempotente: tras un timeout, no reintentar a ciegas.
  GET /api/reservations recupera las últimas 30 reservas propias si se perdió su ID.
- El frontend React consulta inventario y reservas cada segundo y al volver
  a la pestaña. No hay canal SSE todavía. Los cambios visibles proceden de la API.
- La sesión inicial puede duplicarse si dos pestañas la crean a la vez sin cookie;
  iniciar una sesión antes de abrir la segunda pestaña para probar contención.
- No hay limpieza de datos, límites generales de la API pública, compra, cancelación ni QR.
  Los experimentos tienen límites propios y su protocolo está en [experiments.md](experiments.md).
- Sesión e inventario comparten identidad. Los compradores automáticos compiten
  dentro del inventario de su sesión; otras sesiones permanecen aisladas.
- La autenticación se comprueba al entrar en la operación; una sesión que venza
  durante una petición ya autorizada no cancela esa transacción.

## Uso de IA

La base fue generada por el asistente a partir del contexto de Pedro. La revisión
personal de Pedro está pendiente. Durante la implementación se detectó que Docker
no arrancaba; se usó un clúster nativo separado para verificar PostgreSQL real.
No se atribuye a Pedro revisión de código ni decisiones que aún no haya revisado.
