# Avisos internos de interesados por correo

Preparado el 26/10/2026. **Pendiente de conectar el correo remitente y desplegar en Firebase.** Publicar el código en GitHub Pages no activa los envíos.

## Destinatarios y contenido

Cada consulta nueva se envía a las dos direcciones autorizadas:

- info@helicopterospersonales.com
- flightschooldivision@helicopterospersonales.com

El correo contiene nombre, celular y correo disponibles, área (Escuela/Chárter), curso solicitado, consulta, origen, fecha y hora de Panamá y enlace a la app. «Responder» apunta al correo del interesado cuando es válido. Nunca se incluyen notas internas, permisos, pagos o expedientes. Ningún campo del formulario puede cambiar los destinatarios.

## Funcionamiento

La función `emailProspectInquiry` observa únicamente la **creación** de consultas privadas en `prospects/inquiries`. Recibe las consultas de Wix y las nuevas consultas manuales. Una nueva alta manual sin mensaje también genera un aviso; editar las notas o el seguimiento no genera otro. Una consulta nueva del mismo interesado sí genera otro aviso. Los registros históricos no se recorren ni se reenvían al instalar la función.

El guardado del interesado no depende del envío de correo. Los nuevos eventos conservan los datos de contacto originales; los productores anteriores siguen funcionando mediante la lectura del contacto existente. El historial de entrega se guarda por consulta y destinatario en `prospects/emailDeliveries`, inaccesible al cliente con las reglas actuales.

Los reintentos del evento omiten destinatarios ya confirmados por SMTP. Un rechazo temporal se reintenta como máximo ocho veces por destinatario. Rechazos definitivos quedan como `failed`; si se pierde la confirmación del servidor, quedan como `review`, sin reenvío automático que pueda duplicar correos. SMTP no garantiza entrega exactamente una vez. `sent` indica aceptación por el servidor, no llegada a la bandeja de entrada. Revisar rebotes y spam durante la activación.

## Conexión del remitente

Primero identificar el proveedor de la cuenta de la empresa: Google Workspace, Microsoft 365 o el alojamiento del correo. Comprobar qué método de envío admite antes de configurar. Esta implementación usa SMTP autenticado con contraseña de aplicación/credencial específica; si el proveedor requiere OAuth, hay que incorporar ese método antes de activarla. No solicitar ni compartir la contraseña principal por chat.

Crear el secreto **HP_PROSPECT_EMAIL_CONFIG** en Google Secret Manager/Firebase con un JSON que contenga:

| Campo | Valor |
| --- | --- |
| host | Servidor SMTP indicado por el proveedor |
| port | 465 (TLS) o 587 (STARTTLS obligatorio) |
| user | Usuario SMTP autorizado |
| password | Credencial de envío, guardada solo en el secreto |
| from | Dirección remitente verificada y autorizada por ese proveedor |

No guardar el JSON en el repositorio, en el navegador ni en capturas. La configuración no acepta servidores sin cifrado ni desactiva la validación de certificados. El secreto solo se vincula a esta función; no se reutiliza ni cambia `HP_WIX_INTERESTS_CONFIG`.

Una vez configurado el secreto, desde el checkout actualizado y con la sesión de Firebase del propietario:

```bash
npm --prefix functions install
firebase deploy --only functions:accounts --project helicopteros-personales
```

Ese despliegue actualiza el productor de consultas y añade el disparador. Comprobar en una consulta de prueba claramente identificada que ambas bandejas reciben un único correo, que «Responder» usa la dirección correcta y que reenviar el mismo evento no duplica avisos. No generar consultas ficticias en producción antes de conectar el correo.

Revisar Cloud Logging para `emailProspectInquiry` y sus códigos `smtp-rejected`, `smtp-configuration`, `smtp-unconfirmed`, `delivery-interrupted` o `retry-limit`. Los logs no incluyen nombres, direcciones del interesado, mensajes, contraseñas ni errores SMTP en bruto. Una entrega en `review` requiere verificar primero la bandeja y los registros del proveedor antes de un reenvío manual.

No se contrató un proveedor de mensajería ni un plan adicional. Los límites/precios dependen del servicio de correo elegido y del consumo de Firebase; no se promete gratuidad ilimitada.

## Validación local

```bash
node --test tests/prospect-email.cjs tests/prospects.cjs tests/wix-school.cjs tests/prospect-access.cjs
npm run test:privacy
```

Las pruebas simulan correo y base de datos; no envían mensajes ni modifican producción.

Referencias: [eventos de Realtime Database](https://firebase.google.com/docs/functions/database-events), [secretos de Firebase](https://firebase.google.com/docs/functions/config-env), [SMTP de Nodemailer](https://nodemailer.com/smtp).
