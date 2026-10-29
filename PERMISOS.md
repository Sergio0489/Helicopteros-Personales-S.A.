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

### Compatibilidad del despliegue confirmada por código — 29/10/2026

Sergio ejecutó las consultas de solo lectura en su sesión de Cloud Shell y
compartió su salida. `accountRegistration` está `ACTIVE`, usa `nodejs22`, tiene
revisión `accountregistration-00036-dih` y fecha de actualización
`2026-10-26T19:34:22.272210317Z`. Su URI es
`https://accountregistration-wwcyznuvsa-uc.a.run.app`.

Se descargó exactamente la generación `1793043244513197` de
`gs://gcf-v2-sources-264872896947-us-central1/accountRegistration/function-source.zip`,
indicada por `buildConfig.sourceProvenance.resolvedStorageSource`. Los SHA-256 de
estos cinco archivos coinciden con los del commit probado
`503ece6de315ee8c0e679a6876528c2d9694ae5c` del PR #21:

| Archivo desplegado | SHA-256 |
| --- | --- |
| `main.js` | `96c0359a25d35e539b382272dada078b6909434cea410fe52d23cab8d96231a9` |
| `index.js` | `d98cf5fbaf52858d89b96c6395df04bfdc74ba75c7369e25b70488180fd77bdb` |
| `prospect-access.js` | `77c821ffaabbaeb190e6acf64315fa50a181b6bc32e32625c847a0d4b12c205a` |
| `prospects.js` | `4ac60449540eb0944549bedbb11db007b254abc8383aa677a0b8e4a33146280f` |
| `boxes.js` | `f2ab9977bca1b7e8b04fa67acd9201f2d22ac2737fc6f2e3eb373f1ba3cd2201` |

El manejador desplegado de `permission-capabilities` contiene `version:7`,
`prospectRolePermissions:true`, `outputPermissions:true`, `boxEditing:true` y
`aircraftSchedule:true`. Queda confirmada la compatibilidad del código desplegado;
este PR solo requiere integrar y publicar los archivos web, sin redesplegar
`accountRegistration` ni las reglas de la base de datos.

GitHub Actions confirmó las 135 pruebas del commit anterior el 29/10/2026
(ejecución `40866462770`), además de privacidad y configuración del correo.
Auth y Database se simulan en las pruebas. La comparación del código fuente no
sustituye una consulta autenticada con Director ni pruebas de cuentas en Firebase
real: esas comprobaciones siguen sin ejecutarse. Las consultas HTTP realizadas
sin sesión devolvieron `200 {"ready":true}` y `401 {"error":"Inicia sesión."}`,
respectivamente para disponibilidad y capacidades.

Durante esta revisión no se efectuaron despliegues ni cambios de permisos o
contactos reales. Las pruebas con cambios globales de roles deben realizarse en
un proyecto aislado; no modificar la matriz real sin confirmar su alcance con el Director.
