# Historial de cambios

## Activar esta versión

Actualizar el repositorio en Cloud Shell y publicar primero las funciones, después las reglas:

```sh
cd ~/hp-registro
git pull --ff-only origin main
firebase deploy --only functions:accounts --project helicopteros-personales
firebase deploy --only database --project helicopteros-personales
```

Finalmente recargar la aplicación en todos los equipos. La versión anterior del backend continúa usando su guardado habitual hasta que se activen las funciones. Las reglas nuevas rechazan los guardados directos de versiones antiguas: hay que recargar, no reabrir el acceso a la raíz.

## Uso

- **Historial de cambios**, en el menú izquierdo, solo para Directores.
- Fecha y hora DD/MM/AAAA HH:mm:ss de Panamá, autor, cargo, sección, registros afectados y motivo.
- Ver cambios muestra los campos anteriores y nuevos, incluidos datos eliminados.
- Consultar permite filtrar fechas; búsqueda por usuario, matrícula, expediente, sección o motivo y por acción sobre las páginas cargadas. Cargar anteriores incorpora más guardados.
- Motivo del cambio: opción del menú de conexión para Directores y botón en la barra de las sesiones limitadas. Es opcional, se conserva si falla el guardado y se consume al confirmarse uno. Los motivos propios de correcciones también quedan reflejados como campos del detalle.
- No permite alterar, eliminar ni restaurar registros desde el historial. No reconstruye modificaciones anteriores a la activación. Cambios internos de Firebase Authentication, como una contraseña, no se copian al historial; las sincronizaciones verificadas de expedientes se identifican como Sistema.

## Persistencia y seguridad

Los guardados de Director pasan por `director-save`, con comprobación de cargo y de la operación anterior. Se conserva el bloqueo ante conflictos y guardados sin confirmar. Las sesiones limitadas siguen usando las validaciones existentes de `box-save`.

El cambio y sus diferencias se escriben en una misma transacción. Las diferencias quedan pendientes en `auditPending`. Una función se activa únicamente por el pequeño nodo `meta`; no se dispara por todo el payload del dashboard. `auditDashboard` y `auditAccounts` entregan el índice y los detalles y eliminan el pendiente en una actualización atómica, con reintentos e identificadores estables. No se repiten registros por reintentar la entrega. Los pendientes se conservan si falla; revisar los registros de Cloud Functions si el historial tarda en aparecer.

Las reglas no conceden acceso directo al historial ni permiten a los clientes escribir en dashboard o accountRequests. Solo el servidor escribe esos nodos. Los Directores leen dashboard como antes y consultan el historial mediante un endpoint autenticado. Las herramientas administrativas de Firebase siguen teniendo sus privilegios de proyecto; esta protección no pretende restringir a su propietario.

Se omiten contraseñas y tokens, las copias para Deshacer y los metadatos de sincronización sin cambios de contenido. Las imágenes y adjuntos se representan mediante una huella SHA-256, sin duplicar su contenido. Los textos mayores a 2,000 caracteres se marcan como recortados y conservan su longitud y huella. El historial es una constancia de cambios, no un respaldo completo para restauración.

Se consultan 50 resúmenes por página y 20 campos por bloque de detalle. No hay consultas periódicas ni borrado automático del historial. Al crecer su uso habrá almacenamiento adicional; se evitan fotografías duplicadas y copias completas en cada guardado.

## Verificación

Pruebas sintéticas para diferencias por ID, eliminaciones, adjuntos, no-op, conflictos, autor autenticado, bloqueo a otros cargos, entrega idempotente, consultas acotadas, fechas de Panamá, búsquedas, motivo y diseño móvil. No se modificaron expedientes de producción durante las pruebas.

Después de desplegar: guardar un cambio pequeño con una cuenta de prueba; consultar el historial como Director; comprobar antes/después y motivo. Probar también una sesión limitada con permiso de edición y comprobar que no pueda consultar el historial.
