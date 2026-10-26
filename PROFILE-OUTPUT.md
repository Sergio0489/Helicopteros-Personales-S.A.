# Perfil propio, impresión y exportación

## Activación

Esta versión incorpora código del navegador y cambios en Cloud Functions. Después de publicar GitHub Pages, actualizar Firebase desde el checkout autorizado de Cloud Shell:

```sh
cd ~/hp-registro
git pull --ff-only origin main
firebase deploy --only functions:accounts --project helicopteros-personales
```

No requiere modificar reglas de Realtime Database. El endpoint `permission-capabilities` devuelve versión 7, `selfProfile: true` y `outputPermissions: true` después del despliegue. Mientras siga en una versión anterior, la nueva configuración de permisos no permite guardar y explica que falta actualizar Firebase.

## Perfil

- Todos los cargos tienen Mi perfil. Director lo abre desde el menú existente; los otros cargos desde la barra superior y los usuarios pendientes desde la pantalla de espera.
- Nombre, celular y foto editables. Cargo y correo actual protegidos en el formulario.
- El cargo solo se cambia desde Usuarios por un Director autorizado.
- Cambiar contraseña o correo exige volver a verificar la contraseña actual mediante Firebase Authentication. El correo nuevo no se aplica antes de su verificación. Los mensajes se solicitan en español.
- El servidor identifica al usuario exclusivamente por el token verificado, no por un UID proporcionado en el formulario.
- Nombre y celular se sincronizan con el expediente único de estudiante, cliente o piloto cuyo correo coincide. Las modificaciones de perfil no cambian cursos, saldos, horas, certificados ni licencias.
- Un correo duplicado o un expediente vinculado a otra cuenta detiene la sincronización. No se crea un expediente nuevo ni se elige uno arbitrariamente.
- Al verificar un nuevo correo se conserva el expediente previamente vinculado cuando se puede comprobar su asociación; las colisiones requieren revisión del Director.
- Los guardados comprueban la versión de datos para evitar sobrescribir cambios concurrentes. Después de guardar el perfil, actualizar los datos antes de continuar editando registros operativos.

## Permisos de salida

En Roles y permisos, habilitar la acción en la página y marcar los cuadros correspondientes:

- Pilotos: imprimir expediente y, opcionalmente, sus licencias/habilitaciones.
- Estudiantes: imprimir información personal/formulario en blanco o estado de cuenta.
- Registro de pago: imprimir las dos copias del recibo.
- Alerta de saldos: imprimir estados de cuenta de estudiantes o clientes por separado.
- Estadísticas: exportar Excel de AAC o de Helicópteros Personales por separado, respetando los filtros activos.

Las acciones son independientes de Editar y requieren permiso Ver. Los permisos anteriores no conceden automáticamente impresión o exportación; el Director debe habilitarlos. Los Directores conservan acceso completo.

La salida se genera con los datos que el servidor ya autorizó para esa sesión. Estos controles habilitan los botones de la aplicación; no son protección contra capturas o copias manuales de información que el usuario ya puede ver.

El cuadro de impresión/PDF y sus encabezados/pies dependen del navegador. El usuario puede desactivar encabezados y pies desde ese cuadro. No se abren ventanas externas ni se dan credenciales de Firebase al visor aislado.

## Pruebas

`npm run test:all` incluye:

- Perfil propio en escritorio y móvil, cargo bloqueado, errores conservando el borrador, cambio de contraseña y solicitud de verificación de correo con Firebase simulado.
- Endpoint autenticado, campos permitidos, usuarios deshabilitados, conflictos de versión y aislamiento entre expedientes.
- Vinculación de estudiantes, clientes y pilotos; conservación de datos operativos; cambio de correo verificado y rechazo de colisiones.
- Persistencia de permisos por página/cuadro, ausencia de concesiones implícitas y editor móvil.
- Impresión desde sesiones limitadas, licencias excluidas cuando no están autorizadas, estado de cuenta propio sin otros expedientes, copias del recibo y descarga real de Excel en un navegador de prueba.

No se envían correos, se cambian contraseñas ni se alteran registros de producción durante las pruebas. Tras desplegar, comprobar el proceso con una cuenta de prueba real.
