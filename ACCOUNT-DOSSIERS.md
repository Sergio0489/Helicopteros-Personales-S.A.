# Expedientes automáticos por cargo

## Comportamiento

- Al enviar el registro de usuario se crea su expediente inicial de estudiante si no existe un expediente con ese correo. Sin correo verificado no se consulta ni modifica un expediente existente, ni se concede acceso.
- Tras verificar el correo se reutiliza el expediente coincidente y se establece su vínculo por UID. Los correos repetidos dentro de un mismo directorio o vinculados a otra cuenta requieren revisión; no se fusionan por nombre.
- Cargo Estudiante: expediente principal de estudiante. Cargo Piloto: expediente de piloto, sin inventar licencias ni vigencias. Director, Gerente, Administrativo, Mecánico y Contabilidad: expediente en Personal de HP CHARTER.
- Al cambiar de cargo, la clasificación se actualiza en la misma solicitud. Cursos, pagos, vuelos y otras referencias conservan sus IDs. El registro académico subyacente se conserva para el estado de cuenta y desaparece del directorio principal de estudiantes mientras la persona esté clasificada como personal o piloto. Volver a Estudiante reutiliza ese registro.
- Los registros operativos de pilotos y sus credenciales no se eliminan al cambiar el cargo de acceso.
- Los nombres, teléfonos y cambios de correo verificado del perfil se sincronizan con los registros propios vinculados.
- La página USUARIOS muestra el tipo de expediente vinculado. Actualizar el directorio repara las cuentas verificadas anteriores sin expediente, usando sus datos existentes y su cargo actual. No se necesita volver a registrarlas.

## Datos y garantías

`functions/account-dossiers.js` realiza la creación/clasificación idempotente. Usa transacciones del dashboard y el historial de cambios existente. `school.userProfiles[uid].dossier` conserva el vínculo principal y `directoryKind` controla la clasificación del directorio sin borrar las referencias financieras. Solo el servidor puede cambiar esta clasificación mediante el cargo confirmado por un Director.

`syncVersion: 4` fuerza una revisión de los vínculos anteriores; `syncedOperation` y `syncedRole` evitan escrituras repetidas en el dashboard. El directorio procesa las reparaciones secuencialmente para no enfrentar múltiples transacciones sobre el mismo payload. La interfaz actualiza los expedientes cargados solo cuando no hay cambios pendientes ni datos de flota/vuelos externos que puedan quedar obsoletos; en ese caso pide recargar.

## Activación

```bash
cd ~/hp-registro
git pull --ff-only origin main
firebase deploy --only functions:accounts --project helicopteros-personales
```

Después, recargar la aplicación y entrar en **USUARIOS → Actualizar**. La reparación se aplica a las cuentas del directorio cargado. Revisar “Expediente” y “Sincronización” en Detalles cuando haya un conflicto de correo.

## Pruebas

`tests/account-dossiers.cjs` cubre alta, verificación, cambio y reversión de cargo, conservación de pagos/horas, reparación de cuentas anteriores, idempotencia, perfil/correo, duplicados y permisos. Las pruebas de registro, perfiles, pilotos, Personal y Usuarios verifican los flujos existentes con datos ficticios.
