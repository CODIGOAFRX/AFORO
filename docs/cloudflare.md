# AFORO en Workers y D1

## Estado

Adaptación implementada y probada **en local**. No hay despliegue público, nueva base remota ni conexión de despliegue automático activa. `DEMO_ENABLED=false`, sin rutas y sin URL workers.dev. El identificador D1 del fichero de configuración es un marcador local.

El propietario exige cero coste adicional y como máximo el 10 % de sus cuotas de Workers Paid. La admisión de la aplicación limita trabajo aceptado, pero **no impone un techo de facturación**: Workers contabiliza también las peticiones rechazadas y D1 contabiliza la consulta de admisión. No activar públicamente bajo la afirmación de que este código garantiza ese 10 %.

Cloudflare publica 10 millones de peticiones y 30 millones de ms de CPU incluidos al mes en Workers Paid; D1 incluye 25.000 millones de filas leídas, 50 millones escritas y 5 GB. Estas bolsas se comparten con las otras aplicaciones de la cuenta. El uso que exceda lo incluido se factura. Fuentes: [Workers](https://developers.cloudflare.com/workers/platform/pricing/) y [D1](https://developers.cloudflare.com/d1/platform/pricing/).

## Presupuesto operativo de la demo

- Máximo 1.500 admisiones de API al día UTC; 20 sesiones nuevas al día.
- Por sesión de 24 horas: 10 reservas manuales y 3 pruebas de hasta 30 compradores.
- Una sola sala por sesión, hasta 64 KiB de JSON, borrado de sesiones caducadas al crear otra.
- Una respuesta `/api/state` contiene plano, reservas propias, prueba y contadores.
- Consultas cada segundo con actividad de reservas; cada 10 segundos en reposo. Se pausan en pestañas ocultas y después de dos minutos sin interacción. Un 429 suspende las consultas durante una hora; otros errores esperan 15 segundos.
- CPU por invocación configurada en 10 ms; logs desactivados. Los archivos estáticos se sirven directamente.

Con 31 días se admiten como máximo 46.500 operaciones de API, el 0,465 % de la bolsa mensual de peticiones de Workers Paid. **Esto no incluye tráfico rechazado, peticiones sin sesión, archivos inexistentes ni otras aplicaciones.** No es una estimación garantizada de consumo D1: cada operación puede ejecutar varias sentencias. La consulta de presupuesto también consume D1. No se confunde una admisión con una fila leída o escrita.

Para publicar respetando un tope absoluto falta un mecanismo de corte previo a la facturación que se pueda verificar en el plan de la cuenta. No existe aquí ninguna automatización que lo sustituya ni se ha activado un plan adicional.

## Consistencia

La versión Java conserva PostgreSQL y sus bloqueos de filas. La versión D1 guarda la sala como un agregado acotado y usa control optimista: lee revisión y estado, aplica las reglas, y ejecuta `UPDATE ... WHERE revision = ?`. Si otro escritor ganó, vuelve a leer y recalcula, hasta tres intentos. Nunca reutiliza un resultado calculado sobre una revisión vieja. Una reserva completa se confirma en una sola escritura; no hay asientos parcialmente asignados.

Las sesiones se autentican por cookie HttpOnly, SameSite=Strict, Secure en HTTPS. Solo se almacena SHA-256 del token aleatorio de 256 bits. El origen se comprueba en escrituras. Las salas de distintos visitantes son independientes; dos pestañas del mismo navegador comparten sala.

## Compradores automáticos

En D1, la pestaña visible envía `POST /api/experiments/{id}/advance`. El servidor elige asientos, comprueba el intervalo y confirma el estado con la misma revisión que la reserva. Dos pestañas no duplican compradores. Al ocultar todas las pestañas se pausa; la prueba se detiene si han pasado cinco minutos desde su inicio. No se usan cron, colas ni procesos de pago. Java conserva su ejecutor en servidor.

## Desarrollo local

Desde la raíz, compilar `frontend` con `npm ci` y `npm run build`. Dentro de `cloudflare`:

```sh
npm ci
npm test
npm run migrate:local
npm run dev -- --var DEMO_ENABLED:true
```

Abrir http://localhost:8787. No se conecta a una base remota. Docker y Java siguen disponibles en http://localhost:8088.

Las pruebas usan Miniflare 4 con las dependencias sharp y undici actualizadas mediante overrides (la API de Miniflare 5 cambia); las pruebas de CAS ejecutan SQL sobre el emulador D1, no un mock. Verifican conflicto de asiento, escrituras disjuntas, aislamiento y admisión concurrente en el límite del presupuesto.
