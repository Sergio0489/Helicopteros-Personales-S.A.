# Itinerario por bloques

La página utiliza los expedientes y estados existentes. No importa datos del borrador ni crea pilotos de ejemplo. Las reservas confirmadas siguen en `dashboard.payload.itinerarios`, de modo que Horario del día, búsquedas y consultas existentes usan el mismo horario. Las horas realizadas, bitácoras y cargos continúan registrándose en Registro de bitácora: una reserva no factura ni incrementa horas por sí sola.

## Reglas

- Los pilotos con cargo confirmado, correo verificado, expediente vinculado y permiso de edición de **Solicitudes de vuelos** pueden solicitar solo para mañana, de 12:01 a 20:00 de Panamá. La identidad del piloto se determina en el servidor.
- Monomotores y HP880BL están disponibles para solicitudes. Pueden coincidir solicitudes pendientes de distintos pilotos; los vuelos confirmados bloquean los cruces de aeronave y piloto.
- El cierre de las 20:15 distribuye únicamente monomotores por tipo de vuelo, orden de aeronaves y prioridad de pilotos. Los cruces de HP880BL quedan para revisión manual; nunca se reasigna un multimotor o helicóptero automáticamente.
- Las aprobaciones previas del director conservan matrícula, piloto y horas. El director puede agendar todas las aeronaves, cualquier hora o fecha futura; debe confirmar las aeronaves no operativas. Administrativo puede agendar multimotores y helicópteros según sus permisos, sin chárter.
- Nocturnos se habilita por fecha. Se publican solo con dos aeronaves distintas elegibles; los demás quedan retenidos, visibles en el itinerario pero ausentes de Horario del día.
- Al guardar un cambio de operativo a mantenimiento/grounded, el servidor reubica vuelos futuros de monomotores ya publicados cuando puede. Respeta horas, restricciones, piloto y estudiante; los casos sin solución y vuelos iniciados quedan señalados para revisión. El piloto puede cancelar su vuelo reubicado antes de su inicio.
- Las fechas vencidas del piloto se validan en el servidor. Esto es un control administrativo de los vencimientos registrados, no una certificación de habilitación operacional o autorización de despacho.

## Acceso y avisos

`itinerary-read`, `itinerary-command` e `itinerary-notices` usan el endpoint autenticado existente `accountRegistration`. No se abre acceso directo a Realtime Database. El servidor valida cargo, página, cuadro e identidad en cada operación.

En la primera apertura por un director se inicializa `itinerary.version=1`. Si Piloto ya tiene acceso al itinerario, se habilita únicamente el cuadro de sus propias solicitudes; no se amplía la edición de vuelos confirmados ni otros cuadros. El director puede retirar ese permiso desde Roles y permisos.

Los avisos son **internos en la app**, mediante «Avisos de vuelos». No se envían WhatsApp, SMS ni correos. La publicación avisa a todos; modificaciones manuales incluyen piloto/estudiante anteriores y nuevos y mecánicos; reubicaciones avisan a todos. Los destinatarios sin acceso al detalle reciben solo el aviso general. La consulta conserva los últimos 500 avisos y muestra hasta 100 al usuario. El historial de cambios conserva el detalle administrativo.

Las alertas de aeronaves no operativas aparecen al director desde el día anterior y durante el día del vuelo, y se recalculan al abrir/actualizar la app. Se consulta como máximo cada 90 segundos mientras la página está visible; no se mantiene un listener completo de la base de datos.

## Persistencia y concurrencia

`itinerary.config` almacena prioridades globales. `itinerary.days[YYYY-MM-DD]` conserva solicitudes, revisiones, horarios por fecha, previsiones, vuelos retenidos y cancelaciones. Las transacciones sobre `/dashboard` coordinan estos datos con `itinerarios` y el historial. Las revisiones impiden sobrescribir cambios y los identificadores de acción permiten reintentar un mismo guardado sin duplicarlo. El cierre es idempotente por fecha.

Los guardados generales no pueden alterar el itinerario una vez activado; deben utilizar su endpoint específico. Un cliente desactualizado recibirá un aviso para actualizar en lugar de borrar solicitudes. Los vuelos anteriores se mantienen, incluyendo campos desconocidos.

## Publicación

1. Integrar los cambios en GitHub Pages y actualizar la página.
2. Desde Cloud Shell, en una copia de este commit y con Firebase autenticado:

```sh
npm --prefix functions install
npx -y firebase-tools@latest deploy --only functions:accounts:accountRegistration,functions:accounts:publishDailyItinerary --project helicopteros-personales
```

El CLI crea la tarea de Cloud Scheduler `publishDailyItinerary`, con `15 20 * * *` y `America/Panama`. El proyecto debe permanecer en Blaze. Este despliegue no modifica `wixInterests`, `emailProspectInquiry` ni sus secretos, y no cambia las reglas de la base de datos.

3. Abrir Itinerario con un director y revisar prioridades, aeronaves por tipo y listas de pilotos antes del primer cierre.
4. Comprobar en Cloud Scheduler que la tarea está habilitada; verificar un piloto de pruebas y su permiso **Solicitudes de vuelos → Ver y editar**. Una reserva de prueba debe cancelarse desde la aplicación, manteniendo el historial.

Antes de activar el backend, el frontend conserva el calendario anterior y explica el despliegue pendiente. Para desactivar el cierre temporalmente se puede pausar la tarea en Cloud Scheduler; no borrar solicitudes ni restaurar un respaldo antiguo sobre datos nuevos.

Pruebas: `node --test tests/itinerary-engine.cjs tests/itinerary-production.cjs tests/itinerary-service.cjs`, además de los controles existentes de permisos, historial y privacidad. Los datos de prueba están exclusivamente en `tests/fixtures`.
