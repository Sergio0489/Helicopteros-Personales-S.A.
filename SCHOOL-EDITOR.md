# Edición de la información de Escuela

El Director puede editar nombres y cargos, cursos y fechas de aprobación, datos institucionales, la nota y nombres de certificados. Puede agregar integrantes, cursos, campos institucionales y certificados. Los integrantes nuevos dependen del Director, al mismo nivel; el Gerente General sigue arriba del Director. No se agregan campos de identificación ni teléfonos personales al organigrama.

Los cambios se guardan en `school.information` dentro del payload autenticado del dashboard mediante el mecanismo existente del Director. No se escriben en los archivos públicos ni en almacenamiento local. El primer guardado conserva los registros iniciales. Los demás módulos mantienen los nuevos datos al guardar sus propios registros.

El guardado conserva el control de concurrencia ETag de cloud.js y muestra un error sin cambiar la vista cuando falla. Las entradas se validan y se escapan al mostrarse. Los certificados agregados usan las mismas fechas y alertas de Pendientes que los iniciales.

La función del servidor devuelve la información según los permisos de lectura de Escuela. Los nombres de certificados también llegan a Pendientes cuando existe permiso para alertas de Escuela. La escritura del contenido institucional por `box-save` se deniega incluso si un cargo recibe permisos de edición del cuadro; la edición usa exclusivamente el flujo existente de Director protegido por las reglas del dashboard. Los permisos existentes para cambiar fechas de certificados se conservan.

## Publicación

El propietario autorizó y ejecutó el 19 de octubre de 2026 el despliegue de `accounts:accountRegistration` en `helicopteros-personales` desde Cloud Shell. La salida confirmó `Successful update operation` y `Deploy complete`. El PR #9 se fusionó después del despliegue.

El endpoint respondió `ready:true` y rechazó las consultas sin sesión tras la actualización. Las 29 pruebas automatizadas pasaron en GitHub Actions (39338100179), incluyendo Escuela, Pendientes, Usuarios y privacidad. La validación por cargo y de guardado utiliza datos y autenticación simulados; no se hicieron escrituras de prueba en datos reales de producción.

Para instalar dependencias de funciones se utilizó `npm --prefix functions install`: este directorio no incluía un package-lock.json. El despliegue se limitó con `--only functions:accounts:accountRegistration`. No se desplegaron reglas de base de datos ni se solicitaron cambios de roles.
