# AFORO en Workers y D1

## Estado

Demo publicada en **https://www.pedrogomez.dev/proyecto/aforo**. El portfolio está servido por Vercel, aunque el dominio está en Cloudflare. Dos rewrites de Vercel envían exclusivamente `/proyecto/aforo` y sus descendientes al Worker `aforo.pedrojgomezperez.workers.dev`. El Worker sirve React y consulta su base independiente `aforo-db`; el resto del portfolio conserva su despliegue.

El propietario exige cero coste adicional y como máximo el 10 % de sus cuotas de Workers Paid. La admisión de la aplicación limita trabajo aceptado, pero **no impone un techo de facturación**: Workers contabiliza también las peticiones rechazadas y D1 contabiliza la consulta de admisión. No activar públicamente bajo la afirmación de que este código garantiza ese 10 %.

Cloudflare publica 10 millones de peticiones y 30 millones de ms de CPU incluidos al mes en Workers Paid; D1 incluye 25.000 millones de filas leídas, 50 millones escritas y 5 GB. Estas bolsas se comparten con las otras aplicaciones de la cuenta. El uso que exceda lo incluido se factura. Fuentes: [Workers](https://developers.cloudflare.com/workers/platform/pricing/) y [D1](https://developers.cloudflare.com/d1/platform/pricing/).

## Presupuesto operativo de la demo

- Máximo 1.500 admisiones de API al día UTC; 20 sesiones nuevas al día.
- Por sesión de 24 horas: 10 reservas manuales y 5 pruebas de hasta 30 compradores. Las cinco pruebas se renuevan cinco horas después de iniciar la primera, sin abrir otra ventana. Las sesiones anteriores sin ventana de cuota empiezan con cinco pruebas disponibles tras esta actualización.
- Una sola sala por sesión, hasta 64 KiB de JSON, borrado de sesiones caducadas al crear otra.
- Una respuesta `/api/state` contiene plano, reservas propias, prueba y contadores.
- Consultas cada segundo con actividad de reservas; cada 10 segundos en reposo. Se pausan en pestañas ocultas y después de dos minutos sin interacción. Un 429 suspende las consultas durante una hora; otros errores esperan 15 segundos.
- CPU por invocación configurada en 10 ms; logs desactivados. Los archivos estáticos se sirven directamente.

Con 31 días se admiten como máximo 46.500 operaciones de API, el 0,465 % de la bolsa mensual de peticiones de Workers Paid. **Esto no incluye tráfico rechazado, peticiones sin sesión, archivos inexistentes ni otras aplicaciones.** No es una estimación garantizada de consumo D1: cada operación puede ejecutar varias sentencias. La consulta de presupuesto también consume D1. No se confunde una admisión con una fila leída o escrita.

No existe aquí un corte de facturación previo al Worker. El propietario ha pedido continuar con la publicación tras explicar esta limitación. No se ha activado un plan adicional ni contratado otra base de datos. El presupuesto operativo reduce el consumo normal, pero no garantiza un máximo absoluto frente a tráfico ilimitado. El panel de Cloudflare mostraba 0 USD de sobreconsumo de la cuenta al publicar.

## Consistencia

La versión Java conserva PostgreSQL y sus bloqueos de filas. La versión D1 guarda la sala como un agregado acotado y usa control optimista: lee revisión y estado, aplica las reglas, y ejecuta `UPDATE ... WHERE revision = ?`. Si otro escritor ganó, vuelve a leer y recalcula, hasta tres intentos. Nunca reutiliza un resultado calculado sobre una revisión vieja. Una reserva completa se confirma en una sola escritura; no hay asientos parcialmente asignados.

Las sesiones se autentican por cookie HttpOnly, SameSite=Strict, Secure en HTTPS. Solo se almacena SHA-256 del token aleatorio de 256 bits. El origen se comprueba en escrituras. Las salas de distintos visitantes son independientes; dos pestañas del mismo navegador comparten sala.

## Compradores automáticos

Por defecto cada comprador elige aleatoriamente un tamaño de 1 a 3 asientos y
una posición entre los grupos disponibles del tamaño elegido. No cruza filas.
También hay modos de tamaño fijo individual o pareja, con posición aleatoria.

En D1, la pestaña visible envía `POST /api/experiments/{id}/advance`. El servidor elige asientos, comprueba el intervalo y confirma el estado con la misma revisión que la reserva. Dos pestañas no duplican compradores. Al ocultar todas las pestañas se pausa; la prueba se detiene si han pasado cinco minutos desde su inicio. No se usan cron, colas ni procesos de pago. Java conserva su ejecutor en servidor.

## Desarrollo local

Desde la raíz, instalar frontend con `npm ci --prefix frontend` y ejecutar `node cloudflare/build.mjs`. Dentro de `cloudflare`:

```sh
npm ci
npm test
npm run migrate:local
npm run dev -- --var DEMO_ENABLED:true
```

Abrir http://localhost:8787/proyecto/aforo. No se conecta a una base remota. Docker y Java siguen disponibles en http://localhost:8088.

Las pruebas usan Miniflare 4 con las dependencias sharp y undici actualizadas mediante overrides (la API de Miniflare 5 cambia); las pruebas de CAS ejecutan SQL sobre el emulador D1, no un mock. Verifican conflicto de asiento, escrituras disjuntas, aislamiento y admisión concurrente en el límite del presupuesto.
