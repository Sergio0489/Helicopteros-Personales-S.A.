# Regresiones de ordenación y expedientes

Requiere Node.js 22 o superior:

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:records
```

Si Chromium ya está instalado, se puede indicar su ejecutable con `CHROME_BIN`.
La misma suite se ejecuta en GitHub Actions para cada pull request y cada push a `main`.

`alphabetical-records-browser.cjs` carga los archivos locales de la aplicación con
registros sintéticos. Omite los scripts de autenticación y nube, bloquea todas las
solicitudes de red y sustituye `cloudWrite` por una captura en memoria. No necesita
credenciales y no lee ni modifica datos reales. Fija el reloj al 19/10/2026.

Cubre:

- Tres pilotos almacenados como Zulu, álvaro y Beatriz, presentados en otro orden
  en el expediente y la tabla de vigencias, tanto a 1440 px como a 390 px.
- Edición de los tres expedientes: licencias, instructor de vuelo/RPA, certificado
  médico, datos personales y verificaciones. Las verificaciones compartidas entre
  instrucción y chárter se actualizan desde ambas columnas.
- Cambios de nombre que mueven filas y búsquedas que dejan una sola coincidencia.
  Los selectores vinculados se refrescan sin borrar un borrador de bitácora.
- Tres estudiantes y tres clientes desordenados: expedientes, credenciales,
  cursos, estados de cuenta y recibos de pago asociados por su identidad original.
- Correcciones de horas enlazadas a estudiantes, cursos y clientes, con sus cargos
  sincronizados. Los registros no seleccionados se comparan completos antes y
  después de cada guardado.
- Fechas opcionales vacías que deben seguir vacías al editar.

La suite también ejecuta las pruebas existentes de referencias y permisos de
pilotos, sincronización de cuentas y vigencias. Las otras pruebas de navegador
existentes permanecen disponibles para ejecución individual.

## Escuela y certificados

Las pruebas de Escuela usan datos sintéticos y comprueban los límites de 90 y 60 días, el día de vencimiento y el cambio de fecha en Panamá. Verifican las siete especificaciones, el organigrama, el diseño móvil, la persistencia de cada certificado sin alterar otros registros, la recuperación ante un error de guardado, la sincronización con Pendientes y los permisos de consulta y edición.

## Privacidad y Usuarios

`npm run test:privacy` escanea todos los archivos de texto versionados y comprueba que el organigrama solo publique nombre y cargo. Ejecutar después de agregar los archivos nuevos con `git add`; CI revisa el árbol completo del commit. Usa candidatos sintéticos para probar detección de identificadores, teléfonos, campos personales y escapes, sin conservar datos retirados ni sus hashes.

`users-privacy.cjs` verifica con Firebase simulado que Usuarios rechace sesiones ausentes/revocadas y cuentas sin autorización vigente de Director, y que las respuestas no se almacenen en caché. También comprueba la carga paginada, filtros y asignación de cargo en el navegador con solicitudes interceptadas. Las pruebas de Escuela incluyen la jerarquía de los cinco cargos y solicitudes anónimas a la ruta pública con las versiones de caché anteriores y nuevas. Alcance y límites del escaneo e historial pendiente en `PRIVACY.md`.


## Revisión integral del 20/10/2026

`npm run test:all` ejecuta todas las pruebas, incluidas navegación de páginas y aeronaves en escritorio/móvil, calendarios, autorización del nuevo usuario Estudiante y conservación de borradores al volver a la pestaña. GitHub Actions usa esta suite completa. Las pruebas de usuarios comprueban que Guardar/Confirmar cargo active una cuenta nueva sin exigir cambiarla a un cargo distinto.

Los calendarios se comprueban con entrada manual, selección de día, ancho de pantalla y formularios dinámicos. La navegación se prueba con edición en escritorio y consulta en móvil, y exige que cambiar de página no escriba datos.

## Permisos del CRM de interesados

```sh
node --test tests/prospect-permissions-browser.cjs tests/prospect-access.cjs tests/prospects.cjs
npm run test:all
```

`prospect-permissions-browser.cjs` abre Chromium contra un servidor HTTP en
`127.0.0.1`. Ejecuta `prospects-ui.js`, `role-portal.js` y el manejador real de
`functions/index.js`. Solo Auth y Realtime Database se sustituyen por objetos
ficticios en memoria; no se inicializa el SDK de Firebase ni se cargan credenciales.
Toda petición del navegador fuera de ese origen se bloquea y hace fallar la prueba.

Las cinco cuentas usan `example.test`: Director, administrativo de Charters,
administrativo de Escuela, administrativo sin concesión y cuenta sin verificar.
Los contactos son exclusivos de cada área o compartidos. Se comprueban lecturas,
ediciones por formulario, historial, notas, responsables, estados, consentimiento,
rechazo de solicitudes manipuladas, revocación de concesión/cargo/verificación,
expedientes de estudiantes protegidos y ausencia de cambios en los otros módulos.
El acceso al CRM se comprueba sin conceder páginas adicionales al administrativo.
La suite completa incluye esta prueba automáticamente mediante `tests/*.cjs` en CI.
Esto valida la aplicación con servicios simulados, no un despliegue de Firebase.
