# Recuperación de borradores y confirmación de guardado

Los formularios de aeronaves, Registro de bitácora, expedientes personales de estudiantes/clientes y pilotos, licencias/certificado médico de pilotos y Crear abono conservan borradores locales. Se ofrecen al volver a la misma aeronave o abrir el mismo formulario del mismo expediente.

- Recuperar no guarda en Firebase ni registra horas, cargos o pagos. Hay que revisar y guardar con los controles habituales.
- Registro y abonos conservan el identificador original de la operación. Los abonos recuperan sus distintas líneas de servicio/curso; se debe adjuntar de nuevo la foto del comprobante.
- Los borradores caducan a las 24 horas y se limpian al cerrar sesión explícitamente. Se guardan por usuario en el navegador/dispositivo, sin contraseñas ni archivos. No son una copia de seguridad ni se sincronizan entre dispositivos. La limpieza del navegador también los elimina.
- Cancelar un formulario o Limpiar registro descarta su borrador. Un guardado confirmado elimina el borrador correspondiente.
- Una revisión de servidor diferente impide aplicar un borrador antiguo. El Director puede consultarlo sin aplicarlo. En los portales por cargos se exige además la misma política de permisos y se excluyen por completo los borradores incompatibles del iframe.
- Antes de un envío, el borrador se marca como no confirmado. Si la página se interrumpe durante el envío, no se ofrece recuperarlo directamente: hay que comprobar primero los datos del servidor. No se reintentan operaciones automáticamente.
- La franja superior distingue Sin cambios pendientes, Cambios pendientes, Guardando, Guardado con hora de Panamá y Error. Los avisos locales indican que el borrador no equivale a un guardado en Firebase. Un fallo de almacenamiento local muestra aviso explícito.

Los otros editores conservan sus validaciones/avisos existentes; esta versión no promete recuperación universal de todos los diálogos (por ejemplo, permisos, perfil/contraseña, eliminaciones o programación de itinerario).

## Implementación

`draft-recovery.js` ofrece adaptadores explícitos y almacenamiento limitado a 750 KB por borrador. El iframe de cargos no tiene acceso a almacenamiento o credenciales: usa mensajes verificados por ventana y canal al padre, con confirmación del almacenamiento. Los datos solo se restauran sobre controles editables y siguen pasando por las validaciones y permisos del guardado normal. Los snapshots de aeronave nunca sustituyen `previewData` ni todo el dashboard.

## Validación

`tests/draft-recovery-browser.cjs`: aplicación real en viewport móvil, recuperación de aeronave, bitácora con ruta extra e identificador estable, expediente y abono multilínea; guardado normal sin duplicados; revisión de servidor modificada.

`tests/draft-safety.cjs`: aislamiento por usuario, caducidad, exclusión de contraseñas/archivos, guardado interrumpido, revisión incompatible, limpieza al salir y error de cuota local.

No necesita cambios de reglas ni despliegue de funciones Firebase.
