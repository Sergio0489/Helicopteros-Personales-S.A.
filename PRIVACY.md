# Privacidad de los recursos públicos

GitHub Pages y este repositorio son públicos. Ocultar una página mediante permisos de interfaz no protege sus archivos. El organigrama contiene únicamente los nombres y cargos institucionales. Los identificadores personales y teléfonos de sus integrantes se retiraron, sin trasladarlos a otro archivo, variable, codificación, fixture o almacenamiento del navegador.

La corrección conserva las relaciones del organigrama, las especificaciones, los certificados, las alertas de Pendientes y la impresión de estudiantes. No cambia el código del servidor, las reglas, los cargos, los datos ni los servicios de Firebase en producción. Los datos del directorio Usuarios siguen procediendo de su endpoint autenticado, que comprueba el cargo Director en el servidor y responde con `Cache-Control: no-store`.

No se habilita una nueva consulta de los datos retirados. Si se necesitan más adelante, se debe acordar quién puede leerlos y validar un almacenamiento privado y un endpoint que verifique el token vigente, el estado de la cuenta y los permisos del servidor. Las respuestas deben usar `no-store`, sin incluir estos datos en paquetes estáticos, registros de diagnóstico, respuestas de usuarios no autorizados ni caché persistente del cliente. Requiere validación y autorización de Firebase antes de activarse.

## Prevención y pruebas

`npm run test:privacy` examina todos los archivos de texto versionados, incluidos HTML, JavaScript, JSON, mapas de fuentes, documentación y fixtures. Detecta los formatos de identificación panameña, celulares y literales numéricos en campos personales, también con escapes Unicode, hexadecimales y entidades HTML. Solo informa ruta, línea y regla: nunca imprime el valor. La metadata del organigrama se limita a nombre y cargo. Los fixtures usan marcadores sintéticos en lugar de contactos con apariencia real.

El escaneo detectó los cinco identificadores y los cinco teléfonos en la versión anterior. Se ejecuta antes de instalar dependencias en GitHub Actions y forma parte de `npm run test:records`. Las pruebas incluyen organigrama y jerarquía, límites de alertas, guardados aislados, errores de guardado, Pendientes, permisos por cargo, vistas móviles, cargas anónimas y Usuarios (autenticación, denegación por cargo, sesión revocada, cuenta deshabilitada, carga paginada, filtros y asignación de cargo). Todas las pruebas de datos usan simulaciones; no modifican producción.

El detector no acredita ausencia universal de datos personales: imágenes, PDFs, cifrados/codificaciones arbitrarias y formatos no reconocidos necesitan revisión específica. El teléfono institucional publicado en la información comercial no es un contacto individual del organigrama.

## Historial y cachés: revisión del 19 de octubre de 2026

- Introducción localizada: commit `2d9aaec58fc93e61fd5b97e2bb1533f3f4b3aa24`, archivo `school-info.js`, incorporado a `main` por el PR #7 y el merge `226da3cff89d09e68b0d24d7f5cf9941aa5a939d`.
- Antes de la reescritura descrita abajo, la rama `feat/school-information-certificates` también conservaba el contenido anterior. En la revisión del 19 de octubre, los commits y referencias/diffs antiguos de los PR requerían purga adicional de GitHub; un commit correctivo por sí solo no los borra. El resultado de la comprobación posterior se registra abajo.
- La API informó cero forks al revisar. Esto no permite saber si existen clones, descargas, capturas o copias externas.
- El despliegue de Pages `39317283766` generó el artefacto `github-pages`, ID `12218587154`, asociado al commit anterior. La API lo indicó disponible, con vencimiento el 20/10/2026 a las 20:11:57 UTC. Posteriormente se eliminó con autorización específica del propietario; GitHub confirmó el borrado y la API del workflow devolvió una lista de artefactos vacía. No se descargó ni republicó su contenido.
- La respuesta pública observada para el script anterior usa `Cache-Control: max-age=600`. Las nuevas URLs de carga de Director y de las vistas por cargo cambian de versión. El archivo en su ruta original también se reemplaza para que las URLs antiguas reciban el contenido corregido al revalidar.
- No se encontró registro de service worker ni escritura en Cache Storage en el código versionado. Existe un mensaje `SKIP_WAITING` en el botón de actualizar, que por sí solo no registra un worker. No se inspeccionaron los navegadores de los usuarios. Las pestañas ya abiertas o copias guardadas pueden conservar el contenido anterior; cambiar la URL no las elimina remotamente.

## Limpieza histórica autorizada: estado al 19 de octubre de 2026

El propietario autorizó la limpieza histórica. Se validó una reescritura limitada con git-filter-repo 2.47.0 y se publicaron cuatro commits saneados conservando la topología y los mensajes. Se actualizaron las tres ramas con comprobación del SHA previo; no se cambiaron las demás ramas ni las protecciones. La interfaz y los archivos ejecutables de la versión vigente permanecen idénticos a los que aprobaron las 27 pruebas. GitHub Pages y CI volvieron a terminar correctamente tras la reescritura.

| Rama | Nueva referencia tras la reescritura |
| --- | --- |
| feat/school-information-certificates | 7ed621289a28bbd187cad431c6104b6ca86d611f |
| fix/school-public-privacy | 358665dbc7aa86972abc3e1fa88bc6dfab53f695 |
| main | d5a90486aa9cca41e16696843d5472bb2250131d |

La actualización de este documento agrega posteriormente un commit de seguimiento en main. Se inspeccionaron 1.219 objetos alcanzables desde las ramas remotas, sin coincidencias con los diez datos retirados; la prueba aislada que incluyó las referencias de los PR inspeccionó 1.220 objetos.

## Verificación histórica: 28 de octubre de 2026

Se realizaron consultas de lectura a la API de GitHub del repositorio, usando únicamente identificadores y metadatos. No se descargaron archivos históricos, diffs, parches ni artefactos, ni se reprodujeron los datos personales retirados. El repositorio y las ramas saneadas fueron accesibles en la misma revisión; los 404 siguientes no corresponden a una indisponibilidad general del repositorio.

Los endpoints de esta tabla son relativos a `https://api.github.com/repos/Sergio0489/Helicopteros-Personales-S.A.`.

| Comprobación | Endpoint GET | Resultado verificado |
| --- | --- | --- |
| Referencia del PR #7 | `/git/ref/pull/7/head` | HTTP 404, Not Found. |
| Referencia del PR #8 | `/git/ref/pull/8/head` | HTTP 404, Not Found. |
| Lista de referencias de PR | `/git/matching-refs/pull/` | La respuesta contiene 18 referencias; no incluye referencias de los PR #7 ni #8. |
| PR #7 | `/pulls/7` | HTTP 404, Not Found. |
| PR #8 | `/pulls/8` | HTTP 404, Not Found. |
| Objeto histórico de introducción | `/git/commits/2d9aaec58fc93e61fd5b97e2bb1533f3f4b3aa24` | HTTP 404; no recuperable mediante esta consulta. |
| Objeto histórico del merge | `/git/commits/226da3cff89d09e68b0d24d7f5cf9941aa5a939d` | HTTP 404; no recuperable mediante esta consulta. |
| Rama saneada de privacidad | `/git/ref/heads/fix/school-public-privacy` | Disponible; SHA `358665dbc7aa86972abc3e1fa88bc6dfab53f695`, coincide con el documentado. |
| Rama saneada de información escolar | `/git/ref/heads/feat/school-information-certificates` | Disponible; SHA `7ed621289a28bbd187cad431c6104b6ca86d611f`, coincide con el documentado. |
| Rama principal antes de esta actualización documental | `/git/ref/heads/main` | Disponible; SHA `489f7ae61d36550dff9b26cba5ac18177f162cc8`. El SHA de main del 19 de octubre es un registro histórico, no su punta actual. |
| Artefactos del workflow antiguo | `/actions/runs/39317283766/artifacts` | `total_count: 0`, `artifacts: []`; confirma nuevamente la ausencia del artefacto en la lista de ese workflow. |

**Comprobaciones completas:** la ausencia observable de las referencias y de los PR #7 y #8 en los endpoints consultados, la no recuperabilidad de los dos objetos identificados por la API Git, la coincidencia de las dos ramas saneadas y la lista vacía de artefactos del workflow antiguo. Las referencias de PR y el borrado directo del artefacto ya no se presentan como tareas pendientes. Los recuentos de objetos y las pruebas descritos en la sección del 19 de octubre corresponden a aquella revisión; no se repitió aquí un escaneo de todos los objetos.

**Alcance de la conclusión:** estos resultados son compatibles con una limpieza posterior por GitHub, pero no identifican quién la ejecutó ni prueban una purga física completa. Un HTTP 404 acredita únicamente que el recurso no fue recuperable mediante la consulta realizada. No acredita la eliminación de todos los objetos derivados, referencias internas no expuestas, vistas en caché, réplicas, copias externas o cachés de dispositivos.

**Sin confirmación de GitHub Support:** el registro del 19 de octubre indica que la solicitud de purga se envió correctamente después de completar la verificación de GitHub Mobile; entonces no se mostró un número de ticket. Esta revisión no accedió al portal de soporte ni a una respuesta del caso. Por tanto, no confirma su número, estado, resolución ni cierre, y tampoco supone que el caso siga abierto.

Para cerrar la parte que depende de Support falta obtener o revisar su respuesta y confirmar el alcance de las acciones sobre referencias internas y vistas/diffs de los PR #7 y #8, recolección de los objetos sensibles y cachés internas asociadas al contenido y despliegue antiguos. Debe distinguirse esa confirmación del estado observable ya verificado: no se solicita de nuevo el borrado directo del artefacto ni se afirma que las referencias consultadas sigan presentes. Las copias de terceros y cachés de dispositivos ajenos no pueden darse por eliminadas mediante esa respuesta.

Los colaboradores deben volver a clonar el repositorio o trasladar únicamente sus cambios revisados a una copia limpia. No deben fusionar ni volver a publicar ramas basadas en el historial anterior.

Procedimiento de la limpieza del 19 de octubre (registro histórico; no es una lista de tareas aún pendientes):

1. Coordinar una pausa de escrituras y revisar todas las ramas, tags y referencias de PR, incluido el PR de esta corrección, cuyo diff de eliminación también referencia la versión anterior.
2. Preparar una copia de trabajo aislada y un reemplazo del contenido afectado con `git-filter-repo --sensitive-data-removal`, conservando el organigrama corregido en la versión vigente. Validar alcance, referencias cambiadas y regresiones antes de publicar. No guardar listas de valores sensibles en el repositorio.
3. Obtener autorización explícita para reescribir las referencias afectadas con comprobación de sus SHA actuales. Los commits cambiarán de identificador y los clones/PR pueden requerir reparación. No desactivar protecciones de rama ni forzar cambios concurrentes sin autorización.
4. Revisar y retirar los artefactos afectados que sigan disponibles. Coordinar la limpieza de clones. Solicitar a GitHub Support la eliminación de vistas en caché y referencias internas de PR que no se pueden purgar mediante un push normal.
5. Verificar de nuevo el despliegue, las rutas públicas antiguas y nuevas, y el estado de la solicitud a soporte. La revisión del 28 de octubre se limita a los endpoints de la tabla: no repite la validación de Pages, las rutas públicas ni CI, y no confirma el estado del caso de soporte. No declarar borradas las copias de terceros ni las cachés de dispositivos ajenos.

Referencia oficial: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
