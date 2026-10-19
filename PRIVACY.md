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
- La rama `feat/school-information-certificates`, los commits anteriores y las referencias/diffs del PR #7 conservan el contenido anterior. Un commit correctivo no lo borra del historial.
- La API informó cero forks al revisar. Esto no permite saber si existen clones, descargas, capturas o copias externas.
- El despliegue de Pages `39317283766` generó el artefacto `github-pages`, ID `12218587154`, asociado al commit anterior. La API lo indicó disponible, con vencimiento el 20/10/2026 a las 20:11:57 UTC. Debe considerarse una posible copia hasta su eliminación o expiración; no se descarga ni republica su contenido en esta corrección.
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

**Pendiente en GitHub:** las referencias internas refs/pull/7/head y refs/pull/8/head todavía apuntan a los commits anteriores. El artefacto github-pages ID 12218587154 sigue disponible. La solicitud de purga está preparada, pero no se ha enviado: el acceso al navegador requiere completar la verificación de GitHub Mobile. No se declara completada la eliminación de esas copias ni de las cachés internas.

Los colaboradores deben volver a clonar el repositorio o trasladar únicamente sus cambios revisados a una copia limpia. No deben fusionar ni volver a publicar ramas basadas en el historial anterior.

Procedimiento aplicado y pasos de purga pendientes:

1. Coordinar una pausa de escrituras y revisar todas las ramas, tags y referencias de PR, incluido el PR de esta corrección, cuyo diff de eliminación también referencia la versión anterior.
2. Preparar una copia de trabajo aislada y un reemplazo del contenido afectado con `git-filter-repo --sensitive-data-removal`, conservando el organigrama corregido en la versión vigente. Validar alcance, referencias cambiadas y regresiones antes de publicar. No guardar listas de valores sensibles en el repositorio.
3. Obtener autorización explícita para reescribir las referencias afectadas con comprobación de sus SHA actuales. Los commits cambiarán de identificador y los clones/PR pueden requerir reparación. No desactivar protecciones de rama ni forzar cambios concurrentes sin autorización.
4. Revisar y retirar los artefactos afectados que sigan disponibles. Coordinar la limpieza de clones. Solicitar a GitHub Support la eliminación de vistas en caché y referencias internas de PR que no se pueden purgar mediante un push normal.
5. Verificar de nuevo el despliegue, las rutas públicas antiguas y nuevas, y el estado de la solicitud a soporte. No declarar borradas las copias de terceros ni las cachés de dispositivos ajenos.

Referencia oficial: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
