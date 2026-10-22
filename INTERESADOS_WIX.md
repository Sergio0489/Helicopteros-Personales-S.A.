# Interesados de Wix y consultas de WhatsApp

Estado: código preparado para revisión. No desplegado y ninguna automatización de Wix activada.

## Comportamiento

- En Apps HP, el Director dispone de **Interesados y consultas**. Un contacto por correo normalizado, con interés en **Charters**, **Cursos de pilotos** o ambos.
- Filtros por área, curso, estado, texto y autorización para avisos. Registro manual de WhatsApp, teléfono, correo o consulta presencial; seguimiento, responsable y próxima fecha. Antonio corresponde a Charters y Fernando Alvarado a cursos.
- Las consultas web se deduplican por formulario + identificador de envío. Se conservan por separado y se consultan por páginas de 20. El directorio carga páginas de 100 y exige completar la carga antes de exportar CSV filtrado.
- No crea usuarios, contraseñas, matrículas ni registros operativos. Compara el correo con estudiantes actuales; cuando hay matrícula, pagos o etapa de estudiante, queda fuera del filtro de captación de nuevos cursos. Las coincidencias ambiguas también quedan excluidas hasta revisión.
- Consultar no equivale a aceptar publicidad. El consentimiento de cursos requiere respuesta expresa y evidencia. Un reintento antiguo no revierte un retiro posterior. Los formularios antiguos sin autorización permanecen sin suscripción.
- El acceso de Antonio/Fernando no se amplía automáticamente. Inicialmente el Director registra sus consultas; delegar requiere una decisión posterior de permisos.
- El CSV contiene contactos según filtros. Para campañas debe usarse **Solo autorizados para nuevos cursos**. Esta versión no envía mensajes ni correos masivos.

## Archivos y datos

`functions/prospects.js`: validación, deduplicación, consultas y seguimiento.
`functions/wix-interests.js`: receptor HTTP privado mediante secreto.
`prospects-ui.js`: pantalla del Director.
Los datos viven en `prospects/contacts`, `prospects/inquiries` y `prospects/receipts` de la base existente. Las reglas actuales deniegan acceso directo por defecto; el acceso pasa por el servidor con los permisos actuales. No ampliar reglas públicas.

## Borrador nativo de Wix preparado

El 22/10/2026 se guardó **Apps HP - Consultas Charters (pendiente de activar)**. Estado BORRADOR comprobado. Disparador de Wix Formularios con condición de ID exacto del formulario de Charters; acción POST con nueve parámetros. `siteId` y `formId` son literales; `submissionId`, `submittedAt`, `name`, `email`, `phone` e `interest` están vinculados a las propiedades nativas correspondientes. `token` contiene el marcador NO válido `PENDIENTE_DE_CONFIGURAR_NO_ACTIVAR`. Se omitieron cursos y avisos porque el formulario de Charters no los solicita. No se pulsó Probar ni Activar.

Antes de activar, revisar el cuerpo real y sustituir el marcador únicamente por el secreto autorizado. El borrador de escuela aún no se ha creado.

## Activación pendiente

1. Revisar y publicar los cambios en la rama principal sin sustituir otros cambios de Apps HP. Publicar después las funciones del codebase `accounts` en el proyecto **helicopteros-personales**. No crear otro proyecto ni habilitar facturación adicional sin autorización.
2. Antes de activar, confirmar la transferencia continua: nombre, correo, teléfono, interés y permiso de avisos desde los formularios de Wix a la base de Apps HP en Firebase, bajo acceso del Director.
3. Crear en Secret Manager `HP_WIX_INTERESTS_CONFIG`, JSON con un token aleatorio de al menos 32 bytes codificado base64url, el identificador del sitio y mapa de formularios. No incluir su valor en GitHub, JavaScript del navegador, URLs o el chat. El token se guarda únicamente en Secret Manager y en la acción HTTP privada de Wix. No guardar el CCLW de PagueloFacil en este secreto.
4. Configuración sin credenciales reales:

```json
{
  "token": "REEMPLAZAR_POR_SECRETO_ALEATORIO_DE_32_BYTES_O_MAS",
  "siteId": "73a23bed-92b8-4e59-bfa8-7ccad2ada1e4",
  "forms": {
    "e879de85-805f-44e8-a53a-40737cdc75ac": {"area": "charters"}
  }
}
```

El formulario de Charters ya existe; los identificadores de los formularios de escuela se deben verificar en Wix antes de agregarlos. No suscribir automáticamente a consultas antiguas. Para un formulario con casilla opcional de avisos se agregan a su configuración `consentVersion` y `consentStatement`, con el texto exacto presentado al usuario.

5. Wix Automations: disparador de envío de Wix Forms. Los formularios antiguos y nuevos usan aplicaciones/disparadores distintos. Acción **Send HTTP request**, POST, URL de `wixInterests` desplegada. Cuerpo plano, desactivar anidación bajo `data` si está seleccionada. Mantener borrador hasta revisar **Preview request body**.

| Campo | Valor |
| --- | --- |
| token | Secreto de integración, literal, nunca en la URL |
| siteId | ID del sitio verificado |
| formId | ID del formulario, literal verificado |
| submissionId | Identificador único del envío, valor dinámico estable |
| submittedAt | Fecha original del envío ISO 8601, estable para reintentos |
| name | Campo Nombre |
| email | Campo Correo electrónico |
| phone | Teléfono/WhatsApp opcional |
| interest | Consulta o programa de interés |
| courses | Opcional: array de privado, comercial, ifr, multimotor, rpa, instructor |
| courseUpdates | Booleano de la casilla opcional de autorización; omitir si no existe |

No usar la fecha de ejecución de la automatización como `submittedAt`: cambia con los reintentos. No mandar `courses` como texto; omitirlo si Wix no ofrece un array compatible. No deducir autorización por un campo presente o por el contenido del mensaje.

6. Una sola consulta de prueba identificada como prueba, con correo controlado por la empresa, después de autorizar la activación. Verificar contacto, clasificación, reintento sin duplicado y exclusión de avisos sin consentimiento; no usar correos de clientes en pruebas. Revisar notificaciones existentes de Wix antes de enviar el formulario de prueba.
7. Confirmar funcionamiento del registro manual y de ambas clases de formulario antes de declarar completa la sincronización. Los registros históricos no se importan ni suscriben automáticamente.

## Cobros online: trabajo separado

Se eligieron enlaces por cotización confirmada o abono. La empresa tiene cuenta antigua de PagueloFacil, pero Wix muestra PagueloFacil desconectado y solo pagos manuales activos. El titular debe recuperar el acceso/CCLW y revisar estado de cuenta, moneda, tarifas actuales, liquidaciones y eventuales retenciones antes de conectar. Ningún cobro o conexión financiera se ejecutó durante esta preparación.

La integración futura debe usar checkout alojado: la app solicita el importe autorizado al servidor, recibe la URL de pago y verifica el resultado con la API/notificación de la pasarela. Nunca marcar un abono como pagado por el simple retorno del navegador; nunca guardar tarjetas o CCLW en la web pública. Registrar pagos parciales por separado con referencia, importe y conciliación. Esta entrega aún no implementa generación o conciliación de pagos.

Opciones revisadas el 22/10/2026: PagueloFacil para tarjetas y enlaces; Yappy Comercial como complemento para clientes locales; Tilopay como alternativa nativa de Wix. Las tarifas públicas no sustituyen el contrato de la cuenta de la empresa.

## Validación

- `node tests/prospects.cjs`: autenticación/autorización, cuenta deshabilitada/unificada, secreto obligatorio, formato, deduplicación concurrente, recuperación tras interrupción, varios intereses, retiro/reautorización, matrícula, paginación y ausencia de escrituras en Auth/estudiantes.
- `node tests/permissions-endpoint.cjs`, `node tests/registration-lifecycle.cjs`, `node tests/identity-merge.cjs`: regresiones existentes.
- `node --check prospects-ui.js` y fuentes del servidor.
- Pantalla revisada en navegador con datos ficticios: carga, filtro Ambos, filtro de autorizados y registro manual.
- La prueba existente `users-privacy.cjs` pasó su caso de servidor; sus tres casos de navegador no pudieron ejecutarse por faltar el binario de Chromium. No se instalaron navegadores adicionales.

Referencias oficiales:
- https://support.wix.com/en/article/the-new-automation-builder-sending-data-via-webhook
- https://firebase.google.com/docs/functions/config-env
- https://support.wix.com/en/article/connecting-paguelofacil-as-a-payment-provider
- https://developers.paguelofacil.com/guias/enlace-de-pago
- https://soporte.paguelofacil.com/portal/es/kb/articles/costos-por-servicio-por-transaccion
- https://www.yappy.com.pa/faq-items/cuanto-cuesta-cobrar-por-yappy-comercial/
- https://tilopay.com/start?country=PA
