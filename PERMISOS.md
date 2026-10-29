# Permisos por página y cuadro

El Director abre **Perfil → Roles y permisos**, selecciona el cargo y configura cada página y sus cuadros con nombre: Sin acceso, Solo ver, Ver y editar. Editar incluye ver y las operaciones de modificación del cuadro, conservando las confirmaciones existentes. La página limita el permiso de sus cuadros. Usuarios y asignación de cargos siguen reservados a Directores.

El catálogo compartido (`functions/boxes.js`) identifica 64 tipos de cuadro en 14 páginas. Se aplica a todas las aeronaves y expedientes del cargo; Estudiante conserva acceso exclusivamente a su propio expediente vinculado. Los informes calculados son de consulta: se modifican sus registros de origen. Los permisos anteriores conservan la consulta, pero no conceden edición automáticamente.

Un guardado que afecta varios cuadros requiere permiso para todos los datos modificados. Ejemplos:

- Registro de bitácora: formulario/historial, inspecciones y bitácoras de la aeronave, horas del expediente y sus cargos.
- Pago: Crear abono, estado de cuenta del expediente; información personal si cambia su etapa o matrícula; comprobantes si se adjunta una imagen; tarifas si se crea un servicio.
- Cursos: Cursos y licencias y Estado de cuenta para sus presupuestos; cursos eliminados para el archivo.

## Activación

El código implementa estos permisos; su disponibilidad en producción debe comprobarse por separado. Una publicación de GitHub Pages no despliega Firebase. La guía de [registro de usuarios](REGISTRO-USUARIOS.md) detalla la asignación de cargos, las restricciones de seguridad y las pruebas pendientes con cuentas de ensayo.

Primero publicar los archivos web en GitHub Pages y actualizar la función existente:

```sh
git pull --ff-only origin main
npm --prefix functions install
firebase deploy --only functions:accounts:accountRegistration --project helicopteros-personales
```

Ejecutar desde la raíz de una copia actualizada del repositorio. Este comando actualiza únicamente `accountRegistration`; no despliega las demás funciones del codebase ni las reglas de la base de datos. La pantalla comprueba la capacidad del servidor antes de permitir guardar permisos. Si aún no se ha desplegado la función compatible, muestra el aviso de actualización y conserva la configuración actual. Después del despliegue, actualizar la página, guardar los permisos deseados y actualizar la sesión de prueba.

## Implementación

- `boxes.js`: IDs, nombres, grupos anteriores y permisos normalizados.
- `box-permissions-ui.js`: configuración exclusiva del Director.
- `box-ui.js`: identificación de los cuadros de las plantillas existentes.
- `box-view.js`: proyección de datos autorizados; no incluye roles, perfiles de autenticación, vínculos privados ni respaldos.
- `box-write.js`: aplica únicamente diferencias autorizadas sobre los datos actuales; conserva campos ocultos y rechaza intentos de sustituir contenedores con datos protegidos.
- `accountRegistration`, acción `box-save`: autentica, comprueba cargo y permisos vigentes y guarda todos los cambios juntos mediante una transacción. Un cambio concurrente exige actualizar. Cambiar un cargo invalida las versiones abiertas.
- El visor utiliza las mismas plantillas sin credenciales en el iframe. La comunicación de guardado verifica origen de ventana y canal; el servidor vuelve a comprobar los permisos. Un guardado cuyo resultado no se confirma bloquea más envíos hasta actualizar.

Al añadir un cuadro nuevo se debe registrar su ID, selector y campos de datos en el catálogo y los validadores. Los campos desconocidos no se pueden modificar desde un cargo limitado.

## Verificación

```sh
node tests/permissions.cjs
node tests/permissions-endpoint.cjs
```

Las pruebas del endpoint usan Firebase simulado, sin modificar cuentas ni datos reales. Verifican autenticación, transacción con caché inicialmente vacía, conflicto de versión y denegación de escritura. Las pruebas de permisos cubren campos ocultos, solo consulta, alcance del estudiante, intentos de alterar roles y uso indebido del permiso de crear para modificar un vuelo existente.

Con Playwright y Chromium disponibles:

```sh
node tests/permissions-browser.cjs
node tests/permissions-browser-writes.cjs
node tests/permissions-editor-mobile.cjs
```

Puede indicarse `CHROME_BIN` para usar Chromium instalado. Se comprobaron también el guardado de una aeronave con un único cuadro editable, controles de solo lectura, el selector de aeronave y calendario en móvil, y registros vinculados con TAC de aeronave física. La validación contra Firebase real requiere desplegar la función e iniciar sesión con una cuenta de prueba.

## Interesados y consultas por cargo

La matriz incluye **Interesados y consultas → Contactos y consultas de Charters y Escuela**. El Director conserva acceso completo. Para Administrativo, el Director elige el permiso de página y cuadro: sin acceso, solo ver, o ver y editar. Exportar CSV (compatible con Excel) requiere habilitar exportación en ambos niveles. La concesión por cargo permite ambas áreas a los administrativos confirmados con correo verificado; no concede gestión de usuarios ni permisos.

Antes de configurar por primera vez esta página se conservan las concesiones individuales por área. Una configuración explícita de la página sustituye esas concesiones: «Sin acceso» revoca también el acceso anterior. Guardar otra página sin modificar Interesados no migra ni revoca concesiones individuales. La interfaz no habilita este ajuste hasta que `accountRegistration` anuncie `prospectRolePermissions`.

Publicar la web y desplegar `functions:accounts:accountRegistration`. Después, el Director configura el cargo Administrativo; los usuarios actualizan su página. No se concede acceso de producción automáticamente. El servidor consulta los permisos vigentes en cada solicitud y rechaza escrituras o exportaciones no autorizadas.

### Revisión del CRM — 28/10/2026

Se reprodujeron y corrigieron dos problemas de la interfaz con cuentas y datos
ficticios, sin escribir en Firebase:

- Cuando el servidor no anunciaba `prospectRolePermissions`, guardar otra página
  eliminaba una configuración CRM existente. Eliminar un «Sin acceso» explícito
  podía reactivar la concesión individual anterior. Ahora se conserva exactamente
  la configuración CRM que no se está editando, también con un servidor anterior.
- Exportar comprobaba el permiso actual, pero construía el CSV con los contactos
  cargados anteriormente. Un contacto retirado del área podía aparecer todavía en
  ese archivo. Ahora se consultan nuevamente todas las páginas con `export:true`
  y se comprueba el alcance antes y después; un cambio de permisos cancela la
  exportación y descarta los datos en pantalla. Actualizar o cargar otra página de
  contactos también comprueba el alcance y descarta la vista anterior si falla.

Las concesiones individuales siguen permitiendo consultar, editar y exportar su
área. No ofrecen selectores independientes de edición/exportación; estos corresponden
a la matriz por cargo. La política explícita de Administrativo abarca ambas áreas
para todos los usuarios de ese cargo que cumplan los requisitos. No se deben usar
cuentas ficticias en producción para probar una modificación global de esa política,
pues también afectaría a administrativos reales.

Las pruebas de navegador usan el manejador HTTP real y Auth/Database simulados.
Comprueban Director, Administrativo general, concesiones de Charters y Escuela,
Administrativo sin concesión, Piloto sin autorización y correo sin verificar;
incluyen descargas CSV, guardados, revocaciones en sesiones abiertas y conservación
de expedientes y cuentas. La matriz cubre además las 64 combinaciones de ver,
editar y exportar en página/cuadro.

Resultado local: **135 pruebas JavaScript aprobadas, 0 fallos y 0 omitidas**, con
Node.js 22.23.4, Playwright 1.62.1 y Chromium 153; también pasaron las 3 pruebas
Python de configuración del correo. `git diff --check` y la validación de sintaxis
de los archivos web modificados pasaron. Esta ejecución es local; no constituye
una nueva ejecución de GitHub Actions ni una validación de Firebase real.

**Estado del despliegue:** se obtuvo `200 {"ready":true}` del endpoint publicado
`accountregistration-wwcyznuvsa-uc.a.run.app`; la consulta anónima de capacidades
respondió `401 {"error":"Inicia sesión."}`. Esto no acredita la capacidad CRM.
Falta consultar `permission-capabilities` con una sesión vigente de Director y
comprobar `version >= 7`, `prospectRolePermissions === true`, `outputPermissions`,
`boxEditing` y `aircraftSchedule`. La consola de Google Cloud no estuvo accesible
en el entorno de esta revisión; no se efectuó ningún despliegue ni se alteraron
permisos o contactos reales.

Estos arreglos solo cambian archivos web. Si la consulta autenticada confirma que
Firebase ya es compatible, basta publicar la web. Si falta la capacidad, comprobar
primero el proyecto activo `helicopteros-personales`, acceso de despliegue vigente,
Node.js 22, dependencias de `functions/package.json` y una copia actualizada de
`main`; después actualizar únicamente `functions:accounts:accountRegistration`
con el comando de Activación. No desplegar reglas ni otras funciones para esta
corrección. Las pruebas con cambios globales de roles deben realizarse en un
proyecto aislado; no modificar la matriz real sin confirmar su alcance con el Director.
