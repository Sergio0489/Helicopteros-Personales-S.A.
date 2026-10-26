# Registro de usuarios y activación de permisos

## Estado del código y de producción

El repositorio implementa el registro y los permisos por cargo descritos en [PERMISOS.md](PERMISOS.md): 64 tipos de cuadro en 14 páginas del catálogo compartido `functions/boxes.js`. Usuarios y asignación de cargos siguen reservados a Directores; pertenecer al catálogo no significa que una página esté disponible para cualquier cargo.

Los usuarios no Director pueden consultar y, cuando estén autorizados, editar mediante `accountRegistration`. **No hace falta separar el payload para habilitar estos permisos**: el servidor proyecta los datos autorizados y valida las diferencias antes de guardarlas. Asignar un cargo por sí solo no concede acceso; también deben existir permisos guardados para ese cargo.

Esto describe la implementación, no confirma su despliegue. Un PR fusionado o una publicación correcta de GitHub Pages solo acredita cambios en el repositorio o el frontend; no demuestra que Firebase tenga la función actualizada, las reglas esperadas ni pruebas con cuentas reales. El estado de producción queda pendiente de comprobar.

## Preparación y despliegue de Firebase

Desde una copia actualizada del repositorio y una sesión autorizada de Firebase CLI:

```sh
git pull --ff-only origin main
npm --prefix functions install
firebase deploy --only functions:accounts:accountRegistration --project helicopteros-personales
```

- Ejecutar desde la raíz del repositorio con Node.js 22, la versión declarada para Firebase. `accounts` es el codebase de `firebase.json`; `functions/main.js` exporta la función HTTP `accountRegistration` en `us-central1` y otras funciones. El comando actualiza solo `accountRegistration`; las funciones de auditoría e integración con Wix requieren su propio despliegue. Consultar [AUDIT-HISTORY.md](AUDIT-HISTORY.md) e [INTERESADOS_WIX.md](INTERESADOS_WIX.md).
- Confirmar el proyecto antes de desplegar. La función usa Firebase Admin y su cuenta de servicio necesita acceso a Authentication y Realtime Database. La disponibilidad depende de la configuración y facturación; esta guía no despliega ni activa servicios por sí misma.
- En Authentication, comprobar Email/Password y el dominio autorizado `sergio0489.github.io` para las acciones por correo. El endpoint permite ese origen mediante CORS; CORS no sustituye la autorización del servidor.
- Mantener y verificar las restricciones de `database.rules.json`: `dashboard` permite lectura directa al UID Director principal o a un Director asignado con correo verificado, pero deniega toda escritura directa del cliente, también para Directores. Las modificaciones pasan por las funciones autorizadas y su auditoría. Los demás cargos no tienen lectura directa del payload; `accountRequests`, `auditIndex` y `auditDetails` tampoco admiten lectura o escritura directa del cliente. No abrir lectura/escritura pública o para todos los autenticados. El comando anterior no despliega reglas.
- Publicar los archivos web correspondientes en GitHub Pages y comprobar que el navegador carga esa versión. Frontend y función se actualizan por separado.

## Flujo de registro y asignación

1. **Crear usuario** comprueba que el servicio responda `ready:true` antes de abrir el formulario y de crear la cuenta. Esa respuesta solo indica disponibilidad del registro, no la versión del sistema de permisos.
2. El usuario completa sus datos, correo y contraseña. Authentication administra la contraseña; el perfil de solicitud no la guarda. El navegador no consulta expedientes para registrarse.
3. El servicio guarda la solicitud en `accountRequests/<UID>` usando campos permitidos. Los datos declarados no permiten escoger cargo, marcarse verificado ni concederse acceso. El cargo inicial Estudiante, sin asignación del Director, no activa páginas. Si no existe un expediente coincidente ni conflicto de identidad, el registro crea un expediente inicial de estudiante en etapa **Interesado**, sin cursos; una cuenta sin verificar no puede consultar, reclamar ni sobrescribir expedientes existentes.
4. Tras verificar el correo, abrir de nuevo la app o pulsar **Ya verifiqué mi correo**. El servidor consulta Firebase Auth y sincroniza los expedientes de estudiantes, pilotos, personal y clientes (`functions/account-dossiers.js` y `functions/record-link.js`). Reutiliza el expediente compatible por UID o correo y, cuando corresponde, crea el que falta según el cargo. Los datos personales existentes tienen prioridad; no se sustituyen cursos, abonos, horas ni saldos. Los duplicados del mismo tipo, conflictos de identidad o vínculos a otro UID requieren revisión; varias secciones pertenecientes al mismo UID pueden conservar un vínculo principal válido. Ver [ACCOUNT-DOSSIERS.md](ACCOUNT-DOSSIERS.md).
5. El Director revisa **Usuarios** y pulsa **Confirmar cargo** para una cuenta nueva verificada y habilitada, incluso si conserva **Estudiante**. Los cargos siguen el orden Director, Gerente, Administrativo, Contabilidad, Mecánico, Piloto y Estudiante; su jerarquía no sustituye los permisos configurados. Director tiene acceso total y debe otorgarse solo de forma deliberada. El servidor impide cambiar el cargo propio y el del UID Director principal mediante esta operación. **Unificar coincidencias** es una revisión explícita del Director, no una fusión automática por nombre; consultar [IDENTITY-MERGE.md](IDENTITY-MERGE.md).
6. En **Perfil → Roles y permisos**, el Director selecciona un cargo limitado y guarda los permisos de página y cuadro: **Sin acceso**, **Solo ver** o **Ver y editar**. La página limita sus cuadros; editar incluye ver. Imprimir y exportar se autorizan por separado en ambos niveles. Los cuadros calculados de consulta se modifican desde sus registros de origen. Los permisos anteriores de consulta no conceden edición automáticamente. **Interesados y consultas** tiene además las condiciones y compatibilidad descritas en [PERMISOS.md](PERMISOS.md#interesados-y-consultas-por-cargo).
7. El usuario cierra sesión y vuelve a entrar después de cambiar su cargo; actualiza la página después de cambiar permisos. Una cuenta verificada sin asignación o sin páginas autorizadas no obtiene acceso por el mero hecho de registrarse.

## Autorización implementada

- Para cargos limitados, `access` exige cuenta habilitada y correo verificado; calcula las páginas desde el cargo asignado y los permisos guardados. `box-view.js` filtra los datos enviados y excluye configuración de roles, perfiles de autenticación, vínculos privados y respaldos.
- Estudiante conserva el alcance de su propio expediente vinculado, incluso si se amplían los permisos del cargo. El estado de cuenta propio es de consulta. No resolver un vínculo ambiguo dando acceso global.
- `box-save` exige cuenta habilitada, correo verificado y cargo asignado. `box-write.js` comprueba los permisos de todos los cuadros afectados, rechaza campos desconocidos o protegidos y conserva los datos ocultos. El guardado usa una transacción y una versión de operación; los conflictos requieren actualizar. Asignar un cargo invalida las versiones abiertas.
- El editor comprueba `permission-capabilities`: actualmente requiere `version >= 7`, `outputPermissions:true`, `boxEditing:true` y `aircraftSchedule:true`. Si falta alguna de estas capacidades o falla la consulta, bloquea el guardado de permisos y conserva la configuración. La página **Interesados y consultas** exige además `prospectRolePermissions:true`; si falta solo esa capacidad, se bloquea ese ajuste sin impedir configurar las otras páginas. El visor alternativo es solo de consulta y también usa filtrado del servidor; no es un modo de saltarse permisos.

## Validación pendiente antes de anunciar la activación

Registrar proyecto, fecha, commit desplegado y resultados sin contraseñas ni tokens. Usar cuentas y expedientes de ensayo, sin datos personales reales.

- [ ] Confirmar la versión desplegada de `accountRegistration` en Firebase y, con sesión Director, comprobar las capacidades anteriores. Un `GET ready:true` no basta.
- [ ] Confirmar reglas efectivas y configuración de Authentication; comprobar que un cargo limitado no lee ni escribe directamente `dashboard` o `accountRequests`, y que un Director tampoco puede escribir directamente en `dashboard`.
- [ ] Probar creación, verificación de correo, reingreso y recuperación del flujo si la cuenta existe pero falta completar el formulario. Comprobar el expediente inicial sin cursos cuando corresponda; un correo no verificado no puede consultar ni reclamar expedientes existentes.
- [ ] Probar coincidencias de estudiante, cliente, piloto y personal; duplicados del mismo tipo; varias secciones del mismo UID; ausencia de expediente; conflicto de cédula y vínculo a otro UID. Confirmar que no se revela información de terceros ni se alteran historiales o saldos. Probar la revisión explícita de identidades con los casos de [IDENTITY-MERGE.md](IDENTITY-MERGE.md).
- [ ] Confirmar un usuario nuevo conservando Estudiante; comprobar que la confirmación se guarda y que el cargo sigue sin acceso si no tiene permisos. Cambiar de cargo y verificar el expediente correspondiente sin eliminar el historial anterior.
- [ ] Usar al menos dos cuentas limitadas verificadas con distintos permisos: Sin acceso deniega la página; Solo ver permite consulta pero deniega escritura enviada directamente; Ver y editar permite solo los campos y cuadros concedidos. Confirmar que los datos ocultos se conservan.
- [ ] Probar Estudiante con su propio expediente y otro ajeno; no debe acceder al ajeno ni ampliar su alcance manipulando solicitudes.
- [ ] Probar intentos de consultar solicitudes ajenas, autoasignarse cargo, alterar roles o campos protegidos y editar sin correo verificado, sin asignación o con cuenta deshabilitada. Deben denegarse.
- [ ] Probar revocación de permisos, cambio de cargo, conflicto de versión y guardados que afectan varios cuadros. Confirmar rechazo de versiones anteriores y ausencia de cambios parciales.
- [ ] Probar impresión y exportación concedidas y denegadas en página y cuadro. Para Interesados, comprobar los permisos por cargo, la conservación de concesiones individuales al guardar otra página y su sustitución al configurar Interesados explícitamente.
- [ ] Comprobar que una función antigua o inaccesible bloquea la configuración incompatible y no habilita edición por ocultar o mostrar menús.

Comprobaciones locales existentes, sin Firebase real:

```sh
node tests/permissions.cjs
node tests/permissions-endpoint.cjs
node --test tests/registration-lifecycle.cjs tests/account-dossiers.cjs tests/identity-merge.cjs
```

Las pruebas del endpoint simulan Firebase. Con Playwright y Chromium disponibles, `node --test tests/prospect-role-matrix.cjs` comprueba también la configuración de Interesados desde el navegador. Para las demás pruebas de navegador y sus requisitos, consultar [PERMISOS.md](PERMISOS.md). Ni estas pruebas ni GitHub Pages sustituyen la validación anterior contra Firebase desplegado.
