# Itinerario por bloques

La página utiliza los expedientes y estados existentes. No importa datos del borrador ni crea pilotos de ejemplo. Las reservas confirmadas siguen en `dashboard.payload.itinerarios`, de modo que Horario del día, búsquedas y consultas existentes usan el mismo horario. Las horas realizadas, bitácoras y cargos continúan registrándose en Registro de bitácora: una reserva no factura ni incrementa horas por sí sola.

## Datos al agendar

Aeronave, piloto, fecha, horas de inicio y culminación, tipo de vuelo, **Ruta o destino** y observaciones son obligatorios. Estudiante / Cliente es opcional; el nombre del socio se exige únicamente para ese tipo de vuelo. Si no hay comentarios, se puede escribir «Sin observaciones». El servidor valida los campos al crear o modificar vuelos y solicitudes; no exige completar reservas históricas que no se están editando.

Ruta o destino es una referencia de planificación. Se conserva al aprobar, publicar, modificar o reubicar el vuelo, y no crea entradas, horas ni cargos en la bitácora real.

## Reglas

- Los pilotos con cargo confirmado, correo verificado, expediente vinculado y permiso de edición de **Solicitudes de vuelos** pueden solicitar solo para mañana, de 12:01 a 20:00 de Panamá. La identidad del piloto se determina en el servidor.
- Monomotores y HP880BL están disponibles para solicitudes. Pueden coincidir solicitudes pendientes de distintos pilotos; los vuelos confirmados bloquean los cruces de aeronave y piloto.
- El cierre de las 20:15 distribuye únicamente monomotores por tipo de vuelo, orden de aeronaves y prioridad de pilotos. Los cruces de HP880BL quedan para revisión manual; nunca se reasigna un multimotor o helicóptero automáticamente.
- Las aprobaciones previas del director conservan matrícula, piloto y horas. El director puede agendar todas las aeronaves, cualquier hora o fecha futura; debe confirmar las aeronaves no operativas. Administrativo puede agendar multimotores y helicópteros según sus permisos, sin chárter.
- Nocturnos se habilita por fecha. Se publican solo con dos aeronaves distintas elegibles; los demás quedan retenidos, visibles en el itinerario pero ausentes de Horario del día.
- Al guardar un cambio de operativo a mantenimiento/grounded, el servidor reubica vuelos futuros de monomotores ya publicados cuando puede. Respeta horas, restricciones, piloto y estudiante; los casos sin solución y vuelos iniciados quedan señalados para revisión. El piloto puede cancelar su vuelo reubicado antes de su inicio.
- Las fechas vencidas del piloto se validan en el servidor. Esto es un control administrativo de los vencimientos registrados, no una certificación de habilitación operacional o autorización de despacho.

### Disponibilidad prevista y nuevas restricciones

Una previsión habilitada permite una asignación **condicional** únicamente en su fecha y desde la hora indicada; no cambia el estado de mantenimiento/grounded ni autoriza el retorno al servicio. Para vuelos solos se intenta HP1819, HP1907 y HP1784, salvo configuración explícita del director.

Cuando se guarda un cambio de estado hacia una nueva condición no operativa (por ejemplo, operativo → grounded o mantenimiento → grounded), se deshabilitan las previsiones anteriores de esa aeronave para hoy y fechas futuras, incluso en días todavía sin publicar. Los días históricos y las previsiones de otras aeronaves se conservan. Una nueva previsión debe registrarse expresamente con base en la confirmación del responsable de mantenimiento autorizado. Una restricción sin cambio de estado conserva su previsión: el sistema no detecta por sí solo nuevas discrepancias mecánicas.

Antes del cierre, revisar el estado real en `fleet` y las previsiones en `itinerary.days[YYYY-MM-DD].releases.HP1907`. Una previsión válida puede seguir publicando un vuelo condicional; la alerta de aeronave no operativa permanece activa.

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

El backend quedó activado el 29/10/2026: `accountRegistration` y `publishDailyItinerary` están activos, y Cloud Scheduler tiene habilitado el cierre a las 20:15 en `America/Panama`. La página usa únicamente Itinerario por bloques; elimina el contenido del calendario anterior al instalarse y muestra un estado de carga mientras consulta Firebase. Si falla la consulta inicial, ofrece Reintentar sin regresar al calendario anterior. Los registros de vuelos existentes se conservan.

Para desactivar el cierre temporalmente se puede pausar la tarea en Cloud Scheduler; no borrar solicitudes ni restaurar un respaldo antiguo sobre datos nuevos.

Pruebas: `node --test tests/itinerary-engine.cjs tests/itinerary-production.cjs tests/itinerary-service.cjs`, además de los controles existentes de permisos, historial y privacidad. Los datos de prueba están exclusivamente en `tests/fixtures`.

## Calendario anual y detalle del director

Solo Director dispone del calendario anual de doce meses, con navegación entre años. Los días verdes muestran el número de vuelos agendados; las solicitudes pendientes no se cuentan. Seleccionar una fecha abre su programación. Los cambios, cancelaciones y traslados de fecha actualizan el resumen. Los otros cargos conservan la vista diaria según sus permisos.

`itinerary-calendar` es una consulta de solo lectura reservada al director; recibe `year` y devuelve únicamente fechas y cantidades. Las lecturas y guardados diarios del director incluyen el resumen del año.

En Vuelos confirmados, Director ve aeronave, hora inicial y final, ruta o destino, cliente/estudiante, piloto, tipo y observaciones. Los vuelos anteriores sin destino muestran «Sin registrar».
