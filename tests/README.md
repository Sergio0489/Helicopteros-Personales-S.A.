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
