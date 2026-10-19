# Permisos por página y cuadro

El Director abre **Perfil → Roles y permisos**, selecciona el cargo y configura cada página y sus cuadros con nombre: Sin acceso, Solo ver, Ver y editar. Editar incluye ver y las operaciones de modificación del cuadro, conservando las confirmaciones existentes. La página limita el permiso de sus cuadros. Usuarios y asignación de cargos siguen reservados a Directores.

El catálogo compartido (`functions/boxes.js`) identifica 56 tipos de cuadro en 13 páginas. Se aplica a todas las aeronaves y expedientes del cargo; Estudiante conserva acceso exclusivamente a su propio expediente vinculado. Los informes calculados son de consulta: se modifican sus registros de origen. Los permisos anteriores conservan la consulta, pero no conceden edición automáticamente.

Un guardado que afecta varios cuadros requiere permiso para todos los datos modificados. Ejemplos:

- Registro de bitácora: formulario/historial, inspecciones y bitácoras de la aeronave, horas del expediente y sus cargos.
- Pago: Crear abono, estado de cuenta del expediente; información personal si cambia su etapa o matrícula; comprobantes si se adjunta una imagen; tarifas si se crea un servicio.
- Cursos: Cursos y licencias y Estado de cuenta para sus presupuestos; cursos eliminados para el archivo.

## Activación

El código implementa estos permisos; su disponibilidad en producción debe comprobarse por separado. Una publicación de GitHub Pages no despliega Firebase. La guía de [registro de usuarios](REGISTRO-USUARIOS.md) detalla la asignación de cargos, las restricciones de seguridad y las pruebas pendientes con cuentas de ensayo.

Primero publicar los archivos web en GitHub Pages y actualizar la función existente:

```sh
cd ~/hp-registro
git pull --ff-only origin main
firebase deploy --only functions:accounts --project helicopteros-personales
```

No hay cambios en las reglas de la base de datos. La nueva pantalla comprueba la capacidad del servidor antes de permitir guardar permisos. Si aún no se ha desplegado la función, muestra el aviso de actualización y conserva la configuración actual. Después del despliegue, actualizar la página, guardar los permisos deseados y actualizar la sesión de prueba.

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
