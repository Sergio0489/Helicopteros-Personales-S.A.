# Edición de la información de Escuela

El Director puede editar nombres y cargos, cursos y fechas de aprobación, datos institucionales, la nota y nombres de certificados. Puede agregar integrantes, cursos, campos institucionales y certificados. Los integrantes nuevos dependen del Director, al mismo nivel; el Gerente General sigue arriba del Director. No se agregan campos de identificación ni teléfonos personales al organigrama.

Los cambios se guardan en `school.information` dentro del payload autenticado del dashboard mediante el mecanismo existente del Director. No se escriben en los archivos públicos ni en almacenamiento local. El primer guardado conserva los registros iniciales. Los demás módulos mantienen los nuevos datos al guardar sus propios registros.

El guardado conserva el control de concurrencia ETag de cloud.js y muestra un error sin cambiar la vista cuando falla. Las entradas se validan y se escapan al mostrarse. Los certificados agregados usan las mismas fechas y alertas de Pendientes que los iniciales.

La función del servidor devuelve la información según los permisos de lectura de Escuela. Los nombres de certificados también llegan a Pendientes cuando existe permiso para alertas de Escuela. La escritura del contenido institucional por `box-save` se deniega incluso si un cargo recibe permisos de edición del cuadro; la edición usa exclusivamente el flujo existente de Director protegido por las reglas del dashboard. Los permisos existentes para cambiar fechas de certificados se conservan.

## Publicación pendiente de autorización de Firebase

Este cambio requiere actualizar únicamente la función existente `accountRegistration` del codebase `accounts`, para que los demás cargos reciban los datos nuevos. No cambia reglas de base de datos, asignaciones de cargos, CORS, secretos ni configuración de servicios. No se debe publicar la interfaz sin publicar también la proyección de lectura del servidor: una función antigua no devolvería el contenido actualizado.

1. Autorizar expresamente y desplegar la función en el proyecto Firebase correcto, usando el proceso de despliegue habitual del propietario.
2. Verificar con sesiones de prueba autorizadas que Escuela respeta los permisos de lectura y que las escrituras de contenido institucional de otros cargos se rechazan. No crear ni modificar registros reales para la prueba.
3. Fusionar el PR de interfaz y publicar Pages; comprobar la nueva versión de los recursos.

Las pruebas automatizadas simulan datos, autenticación y guardados; no modifican Firebase en producción. La corrección previa de la jerarquía ya está publicada por separado.
