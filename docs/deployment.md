# Publicación y actualizaciones

AFORO está publicado en **https://www.pedrogomez.dev/proyecto/aforo** y destacado en el inicio del portfolio con enlaces para probarlo y revisar su código.

## Arquitectura

El DNS está gestionado en Cloudflare, pero el portfolio está desplegado en **Vercel**, conectado a CODIGOAFRX/portfolio. Su vercel.json envía exclusivamente /proyecto/aforo y sus descendientes al Worker aforo.pedrojgomezperez.workers.dev, conservando la ruta completa.

El Worker sirve React y su API consulta una base D1 independiente, aforo-db. Las cookies tienen Path /proyecto/aforo/api, HttpOnly, SameSite=Strict y Secure en HTTPS. La API acepta el origen del portfolio. Java/PostgreSQL sigue disponible en Docker; no se ejecuta Java en Workers ni se ha contratado PostgreSQL externo.

## Actualizaciones

CODIGOAFRX/AFORO es un repositorio independiente. GitHub Actions comprueba PostgreSQL, D1 y React y publica las imágenes Docker. Cloudflare Builds está configurado para main, sin builds de otras ramas, con estas órdenes:

```sh
npm ci --prefix frontend && npm ci --prefix cloudflare && npm test --prefix cloudflare && node cloudflare/build.mjs
cd cloudflare && npx wrangler d1 migrations apply aforo-db --remote && npx wrangler deploy
```

La conexión Git exige completar la reautenticación de GitHub para verificar sus permisos sobre el repositorio nuevo. Hasta comprobar un build automático exitoso, la actualización desde GitHub no se considera verificada. La primera versión pública se ha desplegado mediante Wrangler.

El portfolio no necesita modificarse al actualizar AFORO: mantiene la misma ruta hacia el Worker.

## Consumo y recuperación

No se ha cambiado el plan de la cuenta. Máximo 1.500 admisiones de API y 20 sesiones nuevas al día, CPU de 10 ms por invocación y logs desactivados. Ver [presupuesto y limitaciones](cloudflare.md): la admisión no es un límite absoluto de facturación.

Se puede volver a una versión anterior del Worker desde Cloudflare. Las migraciones D1 son persistentes: un rollback del código no deshace el esquema. Mantener migraciones compatibles hacia atrás; no borrar la base al revertir. La ruta Vercel no necesita cambiar.
