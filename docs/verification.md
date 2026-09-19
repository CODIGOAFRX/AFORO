# Verificación del primer incremento

19/09/2026. Ejecutado localmente por el asistente; revisión de Pedro pendiente.

Entorno real: Windows 11, Java 21.0.8, Maven 3.9.9, Spring Boot 4.0.8 y
PostgreSQL **17.0 nativo**, en un clúster exclusivo dentro de `.local/postgres`.
Base de pruebas `aforo_test`, separada de `aforo`. Migración Flyway V1 aplicada.

Comando:

```powershell
$env:AFORO_TEST_DATABASE_URL = 'jdbc:postgresql://127.0.0.1:54329/aforo_test'
mvn -B -f backend/pom.xml verify
```

Resultado final: **BUILD SUCCESS. 7 pruebas, 0 fallos, 0 errores, 0 omitidas.**
JAR ejecutable generado. Informe regenerable en
`backend/target/surefire-reports/dev.pedrogomez.aforo.ReservationIntegrationTest.txt`.

| Caso | Evidencia comprobada |
| --- | --- |
| Dos peticiones HTTP, mismo asiento | 201 + 409; una reserva persistida y un asiento retenido |
| Grupos solapados [3,2] y [4,3] | 201 + 409; una reserva, dos asociaciones, dos asientos retenidos |
| Reserva vencida | Inventario disponible y nueva reserva aceptada sin limpiador; historial conservado |
| Dos sesiones | Reserva ajena devuelve 404; mismo asiento reservable en ámbitos diferentes |
| Entrada inválida | Listas vacías, repetidas, nulas, inexistentes o de más de seis rechazadas sin escritura parcial |
| Autenticación | Cookies ausentes, falsas o caducadas rechazadas |
| Origen ajeno | Creación de sesión rechazada con 403 |

Las pruebas concurrentes retienen temporalmente el asiento desde una tercera
conexión, coordinan dos clientes HTTP y consultan `pg_stat_activity` hasta observar
**dos consultas esperando bloqueos**. Entonces liberan el bloqueo y comprueban
respuestas y persistencia. Esto prueba contención real; no mide capacidad ni latencia
de producción. No prueba todas las intercalaciones posibles.

Docker Desktop falló al iniciar por un error de acceso a su socket
`dockerInference`. El primer intento de pruebas con Testcontainers falló por falta
de motor Docker. Se documentó y usó PostgreSQL nativo; no se sustituyó por H2 ni mocks.

## Segundo incremento: web local y Docker operativo

Después de reinstalar Docker Desktop, versión 4.91.0, se ejecutó `mvn verify`
con Testcontainers y PostgreSQL 17.6-alpine: **7 pruebas, 0 fallos, 0 errores**.
Se amplió la prueba de aislamiento para comprobar la recuperación de reservas
propias mediante GET /api/reservations. BUILD SUCCESS y empaquetado correcto.

Compose construyó y arrancó web, backend y postgres; los tres healthchecks pasan.
Frontend React 19.3 + Vite 8.3: TypeScript y compilación de producción correctos.

Comprobaciones manuales reales en navegador contra http://localhost:8088:

- Selección A1/A2, reserva confirmada y disponibilidad de 60 a 58.
- Recarga conserva el identificador de reserva y su cuenta atrás.
- Segunda pestaña ve la misma reserva y bloquea esos asientos.
- Vista de 390 px sin desbordamiento visible del plano; lista alternativa operativa.
- Selección de A3 con Enter y reserva desde la segunda pestaña.

No se presentan estas comprobaciones como auditoría completa de accesibilidad ni
como prueba de carga. Pendientes: CI remota, compra/caducidad, idempotencia y QR.

## Compradores automáticos y publicación del código

19/09/2026: `mvn verify` sobre PostgreSQL 17.6/Testcontainers: **10 pruebas,
0 fallos, 0 errores, 0 omitidas**. Se añadieron llenado de 60 asientos con 30
compradores, separación de reservas propias/automáticas, acceso cruzado, ritmo,
detención y parejas que no cruzan filas. TypeScript y build Vite correctos.

La primera ejecución encontró un error real: `List.of(...).contains(null)` lanza
NullPointerException. Se cambió la validación por `stream().anyMatch(Objects::isNull)`.
La prueba de los 30 compradores falló antes de esa corrección y pasó después.
