# GitHub, Cloudflare y el portfolio

## Estado

El repositorio es independiente del portfolio. Cada push a `main` ejecuta las
pruebas PostgreSQL y compila React. Solo si ambos pasos pasan, publica dos imágenes
en GitHub Container Registry con el SHA del commit como etiqueta. No cambia el
dominio ni despliega una versión pública por sí solo.

El destino de producción y PostgreSQL persistente todavía no están configurados.
No hay un despliegue automático activo en pedrogomez.dev. La visibilidad inicial
de los paquetes GHCR puede ser privada: el servidor necesitará acceso de lectura
o el propietario tendrá que hacer públicos los paquetes.

## Direcciones posibles

- `aforo.pedrogomez.dev`: aplicación independiente y enlace permanente desde el
  portfolio. Es la opción con menos configuración compartida.
- `pedrogomez.dev/proyectos/aforo/`: un Worker puede enrutar esa ruta a AFORO,
  manteniendo los repositorios separados. Requiere adaptar la base de assets,
  rutas API y Path de la cookie al prefijo, y verificar las rutas ya existentes.
  Esa adaptación aún no se ha implementado; la aplicación actual se sirve desde `/`.

En ambos casos se modifica el portfolio **una sola vez** para añadir la tarjeta
destacada con «Visitar» y «Código». Después AFORO se actualiza desde su repositorio.

## Cloudflare no es solo alojamiento estático

Cloudflare Workers/Pages pueden servir React; Spring Boot necesita un runtime
Java. Cloudflare Containers permite ejecutar una imagen Java en Workers Paid.
Pero su disco es efímero: el PostgreSQL actual necesita almacenamiento persistente
fuera de ese disco. No trasladar el volumen Docker a un Container suponiendo que
conservará los datos, ni sustituir PostgreSQL por D1 sin rediseñar las transacciones.

Opciones por decidir con presupuesto y cuentas concretas:

1. Frontend/entrada en Cloudflare, Java en Cloudflare Containers y PostgreSQL
   gestionado externo. Requiere Workers Paid, secretos y límites de gasto.
2. Un servidor Docker con volumen PostgreSQL y HTTPS, con el DNS en Cloudflare.
   Permite mantener una arquitectura próxima al Compose local.

La carpeta del portfolio se inspeccionó en modo lectura. Incluye un Worker con D1
para una funcionalidad diferente; ni su base ni sus secretos se reutilizan aquí.

## Activación pendiente

1. Confirmar plan, presupuesto, proveedor Java/PostgreSQL y dominio final.
2. Configurar HTTPS, cookie Secure, origen permitido y conexión PostgreSQL con TLS
   cuando atraviese una red no privada. No usar la contraseña local en producción.
3. Añadir límites públicos para sesiones/peticiones y limpieza de datos, copia de
   seguridad y recuperación. Los experimentos ya están acotados, pero esto no
   sustituye la protección de toda la API.
4. Conectar el destino a las imágenes del SHA aprobado en CI; aplicar Flyway y
   comprobar salud antes de cambiar tráfico. Guardar el SHA anterior para rollback;
   el esquema debe seguir compatible o requerirá restauración/avance correctivo.
5. Probar actualización de un commit y recuperación ante un despliegue fallido.
6. Añadir la tarjeta del portfolio con enlaces reales; no marcar como publicado
   un destino que todavía no sirve el producto completo.

No se han contratado servicios, creado bases externas ni conectado el PC local
al dominio público. El pipeline actual automatiza pruebas y publicación de
imágenes; la promoción a producción sigue pendiente.

Fuentes oficiales consultadas el 19/09/2026:

- [Cloudflare Containers](https://developers.cloudflare.com/containers/)
- [Disco efímero y ciclo de vida](https://developers.cloudflare.com/containers/faq/)
- [Enrutamiento por ruta](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [Workers Builds y Git](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Publicación de imágenes en GitHub Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
