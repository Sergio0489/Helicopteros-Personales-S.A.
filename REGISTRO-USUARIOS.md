# Registro de usuarios y activación de permisos

## Estado del código y de producción

El repositorio implementa el registro y los permisos por cargo descritos en [PERMISOS.md](PERMISOS.md): 56 tipos de cuadro en 13 páginas del catálogo compartido `functions/boxes.js`. Usuarios y asignación de cargos siguen reservados a Directores; las 13 páginas del catálogo no son 13 páginas disponibles para cualquier cargo.

Los usuarios no Director pueden consultar y, cuando estén autorizados, editar mediante `accountRegistration`. **No hace falta separar el payload para habilitar estos permisos**: el servidor proyecta los datos autorizados y valida las diferencias antes de guardarlas. Asignar un cargo por sí solo no concede acceso; también deben existir permisos guardados para ese cargo.

Esto describe la implementación, no confirma su despliegue. Un PR fusionado o una publicación correcta de GitHub Pages solo acredita cambios en el repositorio o el frontend; no demuestra que Firebase tenga la función actualizada, las reglas esperadas ni pruebas con cuentas reales. El estado de producción queda pendiente de comprobar.

## Preparación y despliegue de Firebase

Desde una copia actualizada del repositorio y una sesión autorizada de Firebase CLI:

```sh
git pull --ff-only origin main
npm --prefix functions install
firebase deploy --only functions:accounts --project helicopteros-personales
```

- Ejecutar desde la raíz del repositorio. `accounts` es el codebase declarado en `firebase.json`; exporta la función HTTP `accountRegistration` en `us-central1`.
- Confirmar el proyecto antes de desplegar. La función usa Firebase Admin y su cuenta de servicio necesita acceso a Authentication y Realtime Database. La disponibilidad depende de la configuración y facturación; esta guía no despliega ni activa servicios por sí misma.
- En Authentication, comprobar Email/Password y el dominio autorizado `sergio0489.github.io` para las acciones por correo. El endpoint permite ese origen mediante CORS; CORS no sustituye la autorización del servidor.
- Mantener y verificar las restricciones de `database.rules.json`: el UID Director principal tiene acceso directo; en `dashboard` también se contempla un Director asignado con correo verificado. Los demás cargos utilizan la función, sin acceso directo al payload ni a solicitudes ajenas. No abrir lectura/escritura pública o para todos los autenticados. El comando anterior solo despliega funciones, no reglas.
- Publicar los archivos web correspondientes en GitHub Pages y comprobar que el navegador carga esa versión. Frontend y función se actualizan por separado.

## Flujo de registro y asignación

1. **Crear usuario** comprueba que el servicio responda `ready:true` antes de abrir el formulario y de crear la cuenta. Esa respuesta solo indica disponibilidad del registro, no la versión del sistema de permisos.
2. El usuario completa sus datos, correo y contraseña. Authentication administra la contraseña; el perfil de solicitud no la guarda. El navegador no consulta expedientes para registrarse.
3. El servicio guarda la solicitud en `accountRequests/<UID>` usando campos permitidos. Los datos declarados no permiten escoger cargo, marcarse verificado ni concederse acceso. El cargo inicial Estudiante, sin asignación del Director, no activa páginas.
4. Tras verificar el correo, abrir de nuevo la app o pulsar **Ya verifiqué mi correo**. El servidor consulta Firebase Auth y busca una coincidencia única del correo entre estudiantes, clientes y pilotos (`functions/record-link.js`). Si hay duplicados, no hay coincidencia o el expediente está vinculado a otro UID, no se vincula automáticamente. Los datos personales existentes tienen prioridad; sincronizar la solicitud no modifica cursos, abonos, horas ni saldos del expediente.
5. El Director revisa **Usuarios** y guarda el cargo de una cuenta verificada y habilitada. El código permite asignar Director además de Gerente, Administrativo, Piloto, Estudiante, Mecánico y Contabilidad; Director tiene acceso total y debe otorgarse solo de forma deliberada. El servidor impide cambiar el cargo propio y el del UID Director principal mediante esta operación.
6. En **Perfil → Roles y permisos**, el Director selecciona un cargo limitado y guarda los permisos de página y cuadro: **Sin acceso**, **Solo ver** o **Ver y editar**. La página limita sus cuadros; editar incluye ver. Los cuadros calculados de consulta se modifican desde sus registros de origen. Los permisos anteriores de consulta no conceden edición automáticamente.
7. El usuario cierra sesión y vuelve a entrar después de cambiar su cargo; actualiza la página después de cambiar permisos. Una cuenta verificada sin asignación o sin páginas autorizadas no obtiene acceso por el mero hecho de registrarse.

## Autorización implementada

- `access` exige cuenta habilitada y correo verificado; calcula las páginas desde el cargo asignado y los permisos guardados. `box-view.js` filtra los datos enviados y excluye configuración de roles, perfiles de autenticación, vínculos privados y respaldos.
- Estudiante conserva el alcance de su propio expediente vinculado, incluso si se amplían los permisos del cargo. El estado de cuenta propio es de consulta. No resolver un vínculo ambiguo dando acceso global.
- `box-save` exige cuenta habilitada, correo verificado y cargo asignado. `box-write.js` comprueba los permisos de todos los cuadros afectados, rechaza campos desconocidos o protegidos y conserva los datos ocultos. El guardado usa una transacción y una versión de operación; los conflictos requieren actualizar. Asignar un cargo invalida las versiones abiertas.
- El editor comprueba `permission-capabilities`: actualmente requiere `version >= 5`, `boxEditing:true` y `aircraftSchedule:true`. Si falta esa capacidad o falla la consulta, bloquea el guardado de permisos y conserva la configuración. El visor alternativo es solo de consulta y también usa filtrado del servidor; no es un modo de saltarse permisos.

## Validación pendiente antes de anunciar la activación

Registrar proyecto, fecha, commit desplegado y resultados sin contraseñas ni tokens. Usar cuentas y expedientes de ensayo, sin datos personales reales.

- [ ] Confirmar la versión desplegada de `accountRegistration` en Firebase y, con sesión Director, comprobar las capacidades anteriores. Un `GET ready:true` no basta.
- [ ] Confirmar reglas efectivas y configuración de Authentication; comprobar que un cargo limitado no lee ni escribe directamente `dashboard` o `accountRequests`.
- [ ] Probar creación, verificación de correo, reingreso y recuperación del flujo si la cuenta existe pero falta completar el formulario. Un correo no verificado no puede consultar expedientes.
- [ ] Probar coincidencia única de estudiante, cliente y piloto; duplicados entre tipos de expediente; sin coincidencia y vínculo a otro UID. Confirmar que no se revela información de terceros ni se alteran los registros de origen.
- [ ] Usar al menos dos cuentas limitadas verificadas con distintos permisos: Sin acceso deniega la página; Solo ver permite consulta pero deniega escritura enviada directamente; Ver y editar permite solo los campos y cuadros concedidos. Confirmar que los datos ocultos se conservan.
- [ ] Probar Estudiante con su propio expediente y otro ajeno; no debe acceder al ajeno ni ampliar su alcance manipulando solicitudes.
- [ ] Probar intentos de consultar solicitudes ajenas, autoasignarse cargo, alterar roles o campos protegidos y editar sin correo verificado, sin asignación o con cuenta deshabilitada. Deben denegarse.
- [ ] Probar revocación de permisos, cambio de cargo, conflicto de versión y guardados que afectan varios cuadros. Confirmar rechazo de versiones anteriores y ausencia de cambios parciales.
- [ ] Comprobar que una función antigua o inaccesible bloquea la configuración incompatible y no habilita edición por ocultar o mostrar menús.

Comprobaciones locales existentes, sin Firebase real:

```sh
node tests/permissions.cjs
node tests/permissions-endpoint.cjs
```

Las pruebas del endpoint simulan Firebase. Para las pruebas de navegador y sus requisitos, consultar [PERMISOS.md](PERMISOS.md). Ni estas pruebas ni GitHub Pages sustituyen la validación anterior contra Firebase desplegado.
