# Unificación de identidades

Jerarquía confirmada: Director, Gerente, Administrativo, Contabilidad, Mecánico, Piloto, Estudiante.

En **USUARIOS → Unificar coincidencias**, el Director revisa grupos por correo (sin distinguir mayúsculas/espacios exteriores) o cédula (sin guiones/espacios y sin distinguir mayúsculas). La coincidencia de una cédula declarada durante registro no concede acceso a otro expediente.

Se conserva la cuenta con el cargo confirmado más alto; en empate se usa el UID de forma estable. La cuenta del Director principal tiene prioridad. Todos los correos de las cuentas deben estar verificados y las cuentas habilitadas antes de fusionarlas. Las cuentas secundarias se bloquean en la aplicación de forma atómica y se intenta deshabilitarlas/revocar sus sesiones en Authentication. No se eliminan de Authentication; quedan como respaldo bloqueado y no aparecen como usuarios activos.

Una sola identidad puede conservar secciones de estudiante, piloto y personal vinculadas a su UID. Se consolidan los duplicados del mismo tipo y se remapean referencias de bitácoras, recibos y organigramas. Los cursos, pagos y verificaciones se combinan; valores operativos contradictorios bloquean la fusión hasta ser revisados. Los originales se conservan en `identityMergeArchive` (sin acceso directo de clientes), además del historial de cambios. No se suman permisos: se aplica el rol confirmado más alto con su configuración actual.

Las altas/ediciones de expedientes rechazan correos o cédulas de otras identidades. Los registros heredados sin cambios en esos campos no bloquean ediciones no relacionadas. La presentación de una nueva cédula desde registro se valida en una transacción contra cuentas y expedientes existentes.

## Activación

Frontend publicado mediante GitHub Pages. El backend requiere:

```bash
cd ~/hp-registro
git pull --ff-only origin main
firebase deploy --only functions:accounts --project helicopteros-personales
```

Después de publicar, actualizar la aplicación, abrir USUARIOS, pulsar Actualizar y luego Unificar coincidencias. Se revisa y confirma un grupo por consulta; volver a consultar después de cada cambio. No se han fusionado registros de producción desde el entorno de desarrollo.

## Expedientes sin usuario

También se pueden unificar coincidencias sin cuenta de Firebase, entre Pilotos, Personal, Estudiantes y Clientes. El Director selecciona el expediente principal para el nombre, correo y cédula; los campos vacíos se completan con los otros expedientes. Los originales siguen archivados. No se crea un UID ficticio, una cuenta ni un cargo.

Los duplicados del mismo tipo se consolidan; las secciones operativas de tipos distintos quedan asociadas a una sola identidad mediante `school.identityLinks`, sin volver a presentarse como coincidencias pendientes. Los cambios posteriores de correo y cédula se sincronizan en el servidor entre esas secciones. Los registros antiguos sin ID reciben uno estable. Si luego la persona registra y verifica su cuenta con el correo principal, se reutilizan y vinculan sus expedientes.

Esta ampliación requiere volver a desplegar `functions:accounts` con el mismo comando indicado arriba.

Los expedientes que ya comparten UID o identidad unificada también aparecen para revisión si sus nombres, correos o cédulas difieren. El selector de expediente principal se ofrece igualmente para cuentas existentes: define el nombre y datos personales a conservar, sin cambiar el correo verificado ni la prioridad del cargo de la cuenta principal.
