# Avisos internos de interesados por correo

Preparado el 26/10/2026; estado documental revisado el 29/10/2026 contra los PR [#18](https://github.com/Sergio0489/Helicopteros-Personales-S.A./pull/18) y [#19](https://github.com/Sergio0489/Helicopteros-Personales-S.A./pull/19), ambos fusionados en `main`, y el código actual.

| Comprobación | Evidencia y estado |
| --- | --- |
| Configuración inicial del remitente | **Confirmada por el propietario en el PR #18:** conexión TLS y autenticación SMTP verificadas, y configuración privada guardada en Secret Manager, sin compartir credenciales. La configuración inicial utiliza el puerto **465**, con **SSL/TLS**. |
| Código y pruebas | PR #18 (avisos) y PR #19 (corrección de comprobantes) fusionados; sus comprobaciones automatizadas fueron satisfactorias. Las pruebas usan servicios simulados y no acreditan producción. |
| Despliegue actual en Firebase | **Requiere verificación independiente:** las fuentes consultadas no confirman qué versiones están desplegadas ni si la corrección del PR #19 está activa. |
| Recepción en ambas bandejas | **Requiere verificación independiente** con los destinatarios. La autenticación SMTP y un comprobante `sent` no demuestran llegada a la bandeja. |

La autenticación ya confirmada no debe repetirse como paso pendiente por esta corrección documental. La descripción del PR #18 dejaba el despliegue pendiente en aquel momento; eso no determina su estado actual. Publicar o fusionar código en GitHub, incluido GitHub Pages, no activa los envíos en Firebase.

## Destinatarios y contenido

Cada consulta nueva se envía a las dos direcciones autorizadas:

- Correo de información indicado por el propietario.
- Correo de la escuela indicado por el propietario.

El correo contiene nombre, celular y correo disponibles, área (Escuela/Chárter), curso solicitado, consulta, origen, fecha y hora de Panamá y enlace a la app. «Responder» apunta al correo del interesado cuando es válido. Nunca se incluyen notas internas, permisos, pagos o expedientes. Ningún campo del formulario puede cambiar los destinatarios.

## Funcionamiento

La función `emailProspectInquiry` observa únicamente la **creación** de consultas privadas en `prospects/inquiries`. Recibe las consultas de Wix y las nuevas consultas manuales. Una nueva alta manual sin mensaje también genera un aviso; editar las notas o el seguimiento no genera otro. Una consulta nueva del mismo interesado sí genera otro aviso. Los registros históricos no se recorren ni se reenvían al instalar la función.

El guardado del interesado no depende del envío de correo. Los nuevos eventos conservan los datos de contacto originales; los productores anteriores siguen funcionando mediante la lectura del contacto existente. El historial de entrega se guarda por consulta y destinatario en `prospects/emailDeliveries`, inaccesible al cliente con las reglas actuales.

Los reintentos del evento omiten destinatarios ya confirmados por SMTP. Los fallos temporales permiten hasta ocho intentos totales por destinatario, incluido el inicial. Rechazos definitivos quedan como `failed`; si se pierde la confirmación del servidor, quedan como `review`, sin reenvío automático que pueda duplicar correos. SMTP no garantiza entrega exactamente una vez. `sent` indica aceptación por el servidor, no llegada a la bandeja de entrada. Revisar rebotes y spam durante la activación.

El PR #19 corrige el guardado del comprobante cuando Realtime Database inicia una transacción con caché local vacía. Comprueba que el resultado quedó persistido y señala `delivery-receipt-conflict` si no puede confirmarlo, sin reenviar una entrega incierta. No convierte comprobantes anteriores en `sent` ni los reenvía automáticamente: un `sending` interrumpido pasa a `review` con `delivery-interrupted` cuando otro intento del evento encuentra el bloqueo vencido (cuatro minutos). No borrar ni reiniciar comprobantes para forzar reenvíos.

## Conexión del remitente

El remitente configurado es el correo de información autorizado por el propietario. Los nombres del servidor y las direcciones se guardan solo en el secreto, nunca en el código público. La autenticación SMTP y el almacenamiento de la configuración privada fueron confirmados durante la configuración inicial del PR #18; esta confirmación histórica no comprueba la vigencia actual de la credencial ni la recepción de mensajes. Esta implementación usa SMTP autenticado; si el proveedor ofrece una credencial específica de aplicación, preferirla. Si exige OAuth, incorporar ese método antes de activar. No solicitar ni compartir contraseñas por chat.

### Asistente de configuración: solo alta inicial o cambio autorizado

No ejecutar de nuevo el asistente ni recrear el secreto para actualizar documentación, comprobar un despliegue o aplicar el PR #19. El procedimiento siguiente se conserva para una instalación nueva sin configuración o un cambio de credencial/configuración expresamente autorizado.

El asistente `scripts/configure-prospect-email.py` pide el remitente (también primer destinatario), el correo de escuela, el servidor SMTP y la clave en la terminal sin mostrarla, verifica TLS y autenticación sin enviar mensajes, y guarda la configuración en Secret Manager. El usuario SMTP predeterminado es la dirección completa; permite corregirlo si el proveedor utiliza otro identificador. El secreto y los diagnósticos temporales de la CLI se guardan fuera del repositorio y se eliminan al terminar. La clave no se pasa como argumento ni se imprime.

Solo en esos casos, desde el checkout actualizado en Cloud Shell, con la sesión autorizada del propietario:

```bash
npm --prefix functions install
npx -y firebase-tools@latest login --no-localhost
python3 scripts/configure-prospect-email.py
```

Si la sesión ya está iniciada, el comando de login lo indica. El asistente solo confirma el acceso SMTP y almacena la configuración; no despliega ni envía pruebas. Si la validación falla, no actualiza el secreto. Una verificación correcta no confirma todavía que los mensajes lleguen a las dos bandejas; la prueba de entrega se hace después del despliegue.

El asistente guarda el secreto **HP_PROSPECT_EMAIL_CONFIG** en Google Secret Manager/Firebase con el siguiente esquema JSON; esta tabla documenta su formato, no indica que deba recrearse:

| Campo | Valor |
| --- | --- |
| host | Servidor SMTP indicado por el proveedor |
| port | 465 (TLS) o 587 (STARTTLS obligatorio) |
| user | Usuario SMTP autorizado |
| password | Credencial de envío, guardada solo en el secreto |
| from | Dirección remitente verificada y autorizada por ese proveedor |
| recipients | Array con las dos direcciones internas autorizadas por el propietario |

No guardar el JSON en el repositorio, en el navegador ni en capturas. La configuración no acepta servidores sin cifrado ni desactiva la validación de certificados. El secreto solo se vincula a esta función; no se reutiliza ni cambia `HP_WIX_INTERESTS_CONFIG`.

## Alcance del despliegue

Estos comandos documentan una operación de despliegue separada; la corrección de este documento no requiere ejecutarlos. Antes de elegir uno, verificar en Firebase/Google Cloud las funciones existentes, su versión o fuente desplegada y el resultado del último despliegue. No deducir ese estado de un PR fusionado o de pruebas satisfactorias. Si ya está desplegada la versión necesaria, no repetir el despliegue.

[`firebase.json`](firebase.json) define el codebase `accounts`, con origen `functions` y Node.js 22. [`functions/main.js`](functions/main.js) exporta estas tres funciones relacionadas:

| Función | Papel en la activación inicial del PR #18 |
| --- | --- |
| `accountRegistration` | Atiende las altas y consultas manuales mediante `functions/prospects.js`; conserva el contacto original en la consulta y genera el evento también para altas nuevas sin mensaje. |
| `wixInterests` | Recibe las consultas web y usa `functions/prospects.js` para guardar sus datos de contacto originales. |
| `emailProspectInquiry` | Disparador de creación en `/prospects/inquiries/{contactId}/{inquiryId}`, región `us-central1`; usa el secreto de correo y `functions/prospect-email.js` para enviar y registrar los resultados. |

### Activación inicial de los avisos

Si aún no se ha desplegado la implementación del PR #18, completar la activación con las tres funciones relacionadas, incorporando también la corrección del PR #19 desde el checkout actualizado de `main`. Con el secreto ya configurado y la sesión autorizada de Firebase del propietario, el alcance explícito es:

```bash
npm --prefix functions install
npx -y firebase-tools@latest deploy --only functions:accounts:accountRegistration,functions:accounts:wixInterests,functions:accounts:emailProspectInquiry --project helicopteros-personales
```

Si la activación fue parcial, reducir la lista a las funciones que aún falten o necesiten actualización. El disparador admite consultas de productores anteriores leyendo el contacto existente, pero esa compatibilidad no sustituye las mejoras de los productores del PR #18. No es necesario incluir `auditDashboard`, `auditAccounts` ni otras funciones para activar estos avisos.

### Actualización específica del PR #19

Si la activación inicial ya está completa y únicamente falta corregir los comprobantes de entrega, basta actualizar **`emailProspectInquiry`**, tal como indica el PR #19:

```bash
npm --prefix functions install
npx -y firebase-tools@latest deploy --only functions:accounts:emailProspectInquiry --project helicopteros-personales
```

El cambio del PR #19 está en `functions/prospect-email.js`, cargado por `functions/prospect-email-trigger.js`; no exige actualizar `accountRegistration` ni `wixInterests`, ni repetir la configuración SMTP. Un despliegue con `--only functions:accounts` selecciona todo el codebase y debe reservarse para una actualización deliberada que realmente abarque todas sus funciones. No es el paso habitual para esta corrección ni es necesario para una activación limitada a las tres funciones indicadas.

## Verificación independiente de despliegue y recepción

1. Confirmar en Firebase/Google Cloud la existencia y versión de las funciones necesarias, el disparador de `emailProspectInquiry` y el resultado del despliegue que corresponda. Registrar fecha y evidencia operativa sin exponer secretos ni datos de contactos.
2. Tras confirmar el despliegue, realizar una prueba de recepción expresamente autorizada con consultas nuevas claramente identificadas de Charters y de Escuela. Confirmar con los destinatarios que cada consulta llega una sola vez a **ambas** bandejas, revisar spam y rebotes, y comprobar que «Responder» usa la dirección correcta. No generar consultas ficticias en producción antes de conectar el correo.
3. Contrastar los comprobantes por destinatario en `prospects/emailDeliveries` con Cloud Logging y la confirmación de las bandejas. Mantener cualquier resultado sin evidencia como pendiente de verificación; ni `sent` ni la ausencia de errores bastan para acreditar recepción. La repetición del mismo evento sin duplicar avisos se verifica en pruebas locales/simuladas, sin forzar reenvíos ni alterar comprobantes de producción.

Revisar Cloud Logging para `emailProspectInquiry` y sus códigos `smtp-rejected`, `smtp-configuration`, `smtp-unconfirmed`, `delivery-interrupted`, `delivery-receipt-conflict` o `retry-limit`. Los logs no incluyen nombres, direcciones del interesado, mensajes, contraseñas ni errores SMTP en bruto. Una entrega en `review` o un comprobante incierto requiere verificar primero la bandeja y los registros del proveedor antes de considerar un reenvío manual autorizado.

No se contrató un proveedor de mensajería ni un plan adicional. Los límites/precios dependen del servicio de correo elegido y del consumo de Firebase; no se promete gratuidad ilimitada.

## Validación local

```bash
node --test tests/prospect-email.cjs tests/prospects.cjs tests/wix-school.cjs tests/prospect-access.cjs
npm run test:privacy
python3 tests/prospect-email-setup.py
```

Las pruebas simulan correo y base de datos; no envían mensajes ni modifican producción.

Fuentes del estado documentado: [PR #18](https://github.com/Sergio0489/Helicopteros-Personales-S.A./pull/18), [PR #19](https://github.com/Sergio0489/Helicopteros-Personales-S.A./pull/19), [disparador de correo](functions/prospect-email-trigger.js), [envío y comprobantes](functions/prospect-email.js) y [productores de consultas](functions/prospects.js).

Referencias técnicas: [despliegue de funciones específicas](https://firebase.google.com/docs/functions/manage-functions), [organización por codebase](https://firebase.google.com/docs/functions/organize-functions), [eventos de Realtime Database](https://firebase.google.com/docs/functions/database-events), [secretos de Firebase](https://firebase.google.com/docs/functions/config-env), [SMTP de Nodemailer](https://nodemailer.com/smtp).
