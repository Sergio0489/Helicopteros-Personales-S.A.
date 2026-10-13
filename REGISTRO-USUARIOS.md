# Activación del registro de usuarios

El frontend está preparado, pero Crear usuario comprueba primero que exista el servicio privado. Si no está desplegado, no crea cuentas ni recopila solicitudes.

## Despliegue pendiente en el proyecto helicopteros-personales

1. Desde una sesión autorizada en Firebase CLI, seleccionar el proyecto `helicopteros-personales`.
2. Instalar las dependencias en `functions` con `npm install`.
3. Desplegar con `firebase deploy --only functions:accounts --project helicopteros-personales`.
4. Mantener las reglas de base de datos actuales: únicamente el UID Director puede leer y escribir directamente. No habilitar lectura pública ni para todos los usuarios autenticados.
5. En Authentication, confirmar que Email/Password está habilitado y que `sergio0489.github.io` está autorizado para las acciones por correo.

La función se ejecuta con Firebase Admin y su cuenta de servicio necesita acceso a Authentication y Realtime Database. La disponibilidad del despliegue depende de la configuración y facturación del proyecto; esta guía no activa servicios ni cargos.

## Flujo

- Cuenta nueva: formulario personal, contraseña y correo. El navegador no consulta estudiantes.
- El servicio guarda la solicitud asociada al UID autenticado. Los datos declarados no permiten asignarse cargos, marcarse verificado ni acceder al dashboard.
- Tras verificar el correo, abrir de nuevo la app o pulsar Ya verifiqué. La función consulta el estado real en Firebase Auth y busca coincidencia única del correo en el expediente.
- Los datos personales existentes tienen prioridad. Se copia únicamente la información personal al perfil de solicitud; cursos, abonos, horas y saldos no se devuelven ni se alteran.
- El Director revisa solicitudes y asigna uno de los cargos no Director. Ningún solicitante puede elevar sus privilegios.

## Limitación aún pendiente

La asignación de cargo **no activa las páginas**: el modelo actual contiene todos los datos en un único payload. La autorización por página/sección requiere una migración a datos separados y reglas o funciones que filtren y validen cada acción. Hasta esa migración todos los usuarios no Director permanecen en espera, aunque tengan cargo. No eliminar este bloqueo para simular permisos mediante menús ocultos.

## Validación antes de anunciar la activación

Probar dos cuentas de ensayo verificadas distintas: nadie puede leer solicitudes ajenas, escoger su cargo, leer el dashboard o consultar un estudiante con correo no verificado. Confirmar que contraseñas nunca se guardan en solicitudes. Probar duplicados de correo de estudiantes y cuenta sin coincidencia. No usar datos reales en las pruebas.
